"use client";

import React, { useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import { HEBREW_CLASSES, MODEL_INPUT, preprocessCanvasForInference, preprocessCanvasToVector, lettersEquivalent } from "@/lib/handwriting/engine";
import { CalibState, computePrototypes, floatToU8, loadCalibration, saveCalibration } from "@/lib/handwriting/storage";
import { scoreCandidates } from "@/lib/handwriting/scoring";

type Props = {
  expected?: string; // expected next letter (glyph as in lemma)
  onAccept: (letter: string, vec: Float32Array) => void; // called only when accepted
  onWrong?: (predicted: string) => void; // notify parent for slot shake
  compact?: boolean;
  allowServerCollect?: boolean; // if true, POST sample png to /api/letters/collect
};

const MODEL_CLASSES = [
  "stop",
  ...HEBREW_CLASSES,
];

export default function HandwritingLetterInput({ expected, onAccept, onWrong, compact, allowServerCollect }: Props) {
  const CANVAS = 180;
  const strokeWidth = 10;
  const SETTLE_MS = 800;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const settleTimer = useRef<number | null>(null);
  const [pending, setPending] = useState(false);
  const [calib, setCalib] = useState<CalibState>(() => loadCalibration());
  const [protos, setProtos] = useState(() => computePrototypes(loadCalibration()));
  const [model, setModel] = useState<tf.LayersModel | null>(null);
  const [choices, setChoices] = useState<string[] | null>(null);
  const [shaking, setShaking] = useState(false);

  useEffect(() => { resetCanvas(); }, []);
  useEffect(() => {
    return () => {
      if (settleTimer.current !== null) {
        window.clearTimeout(settleTimer.current);
        settleTimer.current = null;
      }
    };
  }, []);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Prefer tuned model if present
        let m: tf.LayersModel | null = null;
        try { m = await tf.loadLayersModel("/models/hebrew_letter_model_tuned/model.json"); } catch {}
        if (!m) m = await tf.loadLayersModel("/models/hebrew_letter_model/model.json");
        if (mounted) setModel(m);
      } catch (e) {
        console.warn("Failed to load TFJS model", e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  function resetCanvas() {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, CANVAS, CANVAS);
  }

  function getXY(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS / rect.width;
    const scaleY = CANVAS / rect.height;
    if ('touches' in e) {
      const touch = e.touches[0];
      return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function start(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (settleTimer.current !== null) {
      window.clearTimeout(settleTimer.current);
      settleTimer.current = null;
      setPending(false);
    }
    drawing.current = true;
    const ctx = canvasRef.current?.getContext('2d'); if (!ctx) return;
    const { x, y } = getXY(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = 'black';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }
  function move(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return; e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d'); if (!ctx) return;
    const { x, y } = getXY(e);
    ctx.lineTo(x, y); ctx.stroke();
  }
  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    setPending(true);
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null;
      setPending(false);
      recognizeAndAct();
    }, SETTLE_MS);
  }

  function recognizeNow() {
    if (settleTimer.current !== null) {
      window.clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
    setPending(false);
    recognizeAndAct();
  }

  async function recognizeAndAct() {
    const c = canvasRef.current; if (!c) return;
    const { cnnInput, knnVec: vec } = preprocessCanvasForInference(c);
    const inkSum = vec.reduce((a,b)=>a+b, 0);
    if (inkSum < 1e-3) return; // empty stroke

    // CNN probs if model loaded
    const cnnProbs: Record<string, number> = {};
    if (model && cnnInput) {
      const tensor = tf.tensor(cnnInput, [1, MODEL_INPUT, MODEL_INPUT, 3]);
      try {
        const out = model.predict(tensor) as tf.Tensor;
        const data = await out.data();
        for (let i = 1; i < data.length; i++) {
          cnnProbs[MODEL_CLASSES[i]] = data[i];
        }
        out.dispose();
      } finally {
        tensor.dispose();
      }
    }

    const calibCounts: Record<string, number> = {};
    for (const L of HEBREW_CLASSES) calibCounts[L] = calib.samples[L]?.length || 0;

    const { ranked, top, topProb, margin } = scoreCandidates({
      cnnProbs,
      protos,
      calibCounts,
      knnVec: vec,
      expectedLetter: expected,
    });

    const HIGH_PROB = 0.80;
    const HIGH_MARGIN = 0.15;
    const LOW_PROB = 0.50;
    const LOW_MARGIN = 0.08;

    if (topProb >= HIGH_PROB && margin >= HIGH_MARGIN) {
      if (expected && lettersEquivalent(top, expected)) {
        await acceptAndLearn(expected, vec);
      } else {
        wrongFeedback(top);
      }
      return;
    }

    if (topProb <= LOW_PROB || margin <= LOW_MARGIN) {
      // Show disambiguation overlay. Always include expected if provided.
      let picks: string[];
      if (expected) {
        const withoutExpected = ranked.filter(r => !lettersEquivalent(r.letter, expected));
        picks = [expected, ...withoutExpected.slice(0, 2).map(r => r.letter)];
      } else {
        picks = ranked.slice(0, 3).map(r => r.letter);
      }
      setChoices(picks);
      return;
    }

    // Mid-confidence: if top matches expected and prob is decent, accept; else wrong
    if (expected && lettersEquivalent(top, expected)) {
      await acceptAndLearn(expected, vec);
    } else {
      wrongFeedback(top);
    }
  }

  async function acceptAndLearn(letter: string, vec: Float32Array) {
    const q = floatToU8(vec);
    const next = { ...calib, samples: { ...calib.samples } };
    next.samples[letter] = (next.samples[letter] || []).concat([q]);
    saveCalibration(next);
    setCalib(next);
    setProtos(computePrototypes(next));
    // Optional server collection
    if (allowServerCollect) {
      try {
        const off = vectorToCanvas(vec);
        const dataUrl = off.toDataURL('image/png');
        fetch('/api/letters/collect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: letter, imageData: dataUrl }) }).catch(()=>{});
      } catch {}
    }
    onAccept(letter, vec);
    setChoices(null);
    resetCanvas();
  }

  function wrongFeedback(predicted: string) {
    setChoices(null);
    setShaking(true);
    onWrong?.(predicted);
    setTimeout(() => setShaking(false), 400);
    resetCanvas();
  }

  function vectorToCanvas(vec: Float32Array): HTMLCanvasElement {
    const c = document.createElement('canvas'); c.width = MODEL_INPUT; c.height = MODEL_INPUT;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(MODEL_INPUT, MODEL_INPUT);
    for (let i = 0; i < MODEL_INPUT*MODEL_INPUT; i++) {
      const v = Math.max(0, Math.min(255, Math.round(vec[i] * 255)));
      const gray = 255 - v; // display ink as black
      img.data[i*4] = gray; img.data[i*4+1] = gray; img.data[i*4+2] = gray; img.data[i*4+3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  return (
    <div className={compact ? "flex flex-col items-center gap-2" : "flex flex-col items-center gap-3"}>
      <div className={shaking ? "animate-shake" : ""}>
        <canvas
          ref={canvasRef}
          width={CANVAS}
          height={CANVAS}
          className="rounded-xl border-2 border-gray-700 bg-white touch-none"
          style={{ width: compact ? CANVAS : Math.min(300, CANVAS), height: 'auto', maxWidth: '100%' }}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={recognizeNow}
          disabled={!pending}
          className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-500 transition disabled:opacity-30"
        >
          Done
        </button>
        <button
          onClick={() => {
            if (settleTimer.current !== null) { window.clearTimeout(settleTimer.current); settleTimer.current = null; }
            setPending(false);
            resetCanvas();
          }}
          className="rounded bg-gray-800 px-3 py-1 text-xs hover:bg-gray-700 transition"
        >
          Clear
        </button>
        {pending && <span className="text-xs text-gray-500">keep drawing…</span>}
      </div>

      {/* Low-confidence disambiguation */}
      {choices && (
        <div className="flex gap-2 flex-wrap justify-center">
          {choices.map((L) => (
            <button key={L} onClick={() => expected && lettersEquivalent(L, expected) ? acceptAndLearn(expected!, preprocessCanvasToVector(canvasRef.current!)) : wrongFeedback(L)} className="rounded-lg bg-gray-800 px-3 py-2 text-sm hover:bg-gray-700">
              <span dir="rtl" className="font-bold text-lg">{L}</span>
            </button>
          ))}
          <button onClick={() => { setChoices(null); resetCanvas(); }} className="rounded bg-gray-800 px-3 py-1 text-sm hover:bg-gray-700">Cancel</button>
        </div>
      )}
    </div>
  );
}
