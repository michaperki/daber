"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import {
  HEBREW_CLASSES,
  MODEL_INPUT,
  preprocessCanvasForInference,
} from "@/lib/handwriting/engine";
import {
  CalibState,
  computePrototypes,
  exportCalibration,
  floatToU8,
  importCalibration,
  loadCalibration,
  saveCalibration,
} from "@/lib/handwriting/storage";
import { scoreCandidates } from "@/lib/handwriting/scoring";

// 28 classes matching the model output (index 0 = stop symbol)
const CLASS_NAMES = ["stop", ...HEBREW_CLASSES];

const CANVAS_SIZE = 280;

type Mode = "practice" | "calibrate";

export default function WritePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);

  const [mode, setMode] = useState<Mode>("calibrate");
  const [model, setModel] = useState<tf.LayersModel | null>(null);
  const [loading, setLoading] = useState(true);

  // Practice state
  const [prediction, setPrediction] = useState<{
    letter: string;
    confidence: number;
    cnnTop?: string;
    cnnProb?: number;
    top3: { letter: string; prob: number }[];
  } | null>(null);
  const [practiceTarget, setPracticeTarget] = useState("");

  // Calibrate state
  const [calib, setCalib] = useState<CalibState>(() => loadCalibration());
  const protos = useMemo(() => computePrototypes(calib), [calib]);
  const [targetIdx, setTargetIdx] = useState(0);
  const [perLetter, setPerLetter] = useState(5);
  const [serverCollect, setServerCollect] = useState(false);
  const [saving, setSaving] = useState(false);

  const calibTarget = HEBREW_CLASSES[targetIdx];

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const L of HEBREW_CLASSES) out[L] = calib.samples[L]?.length || 0;
    return out;
  }, [calib]);

  const totalSamples = useMemo(
    () => HEBREW_CLASSES.reduce((s, L) => s + counts[L], 0),
    [counts]
  );
  const lettersComplete = useMemo(
    () => HEBREW_CLASSES.filter((L) => counts[L] >= perLetter).length,
    [counts, perLetter]
  );
  const totalTarget = HEBREW_CLASSES.length * perLetter;
  const pct = Math.min(100, Math.round((totalSamples / totalTarget) * 100));

  const pickPracticeTarget = useCallback(() => {
    const pool = HEBREW_CLASSES;
    setPracticeTarget(pool[Math.floor(Math.random() * pool.length)]);
    setPrediction(null);
  }, []);

  // Load model on mount
  useEffect(() => {
    async function loadModel() {
      try {
        try {
          const tuned = await tf.loadLayersModel(
            "/models/hebrew_letter_model_tuned/model.json"
          );
          setModel(tuned);
        } catch {
          const base = await tf.loadLayersModel(
            "/models/hebrew_letter_model/model.json"
          );
          setModel(base);
        }
      } catch (err) {
        console.error("Failed to load model:", err);
      } finally {
        setLoading(false);
      }
    }
    loadModel();
    pickPracticeTarget();
  }, [pickPracticeTarget]);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  }, []);

  function getXY(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_SIZE / rect.width;
    const scaleY = CANVAS_SIZE / rect.height;
    if ("touches" in e) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function handleStart(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    isDrawing.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getXY(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineWidth = 12;
    ctx.strokeStyle = "black";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }

  function handleMove(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getXY(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function handleEnd() {
    isDrawing.current = false;
  }

  function handleClear() {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    setPrediction(null);
  }

  async function handleCheck() {
    if (!canvasRef.current) return;
    const { cnnInput, knnVec } = preprocessCanvasForInference(canvasRef.current);
    if (knnVec.reduce((a, b) => a + b, 0) < 1e-3) return;

    // CNN probs
    const cnnProbs: Record<string, number> = {};
    let cnnTop: string | undefined;
    let cnnProb: number | undefined;
    if (model && cnnInput) {
      const tensor = tf.tensor(cnnInput, [1, MODEL_INPUT, MODEL_INPUT, 3]);
      try {
        const output = model.predict(tensor) as tf.Tensor;
        const data = await output.data();
        for (let i = 1; i < data.length; i++) {
          cnnProbs[CLASS_NAMES[i]] = data[i];
        }
        // Top CNN-only prediction (skip stop at index 0)
        let maxConf = -1;
        let maxIdx = -1;
        for (let i = 1; i < data.length; i++) {
          if (data[i] > maxConf) {
            maxConf = data[i];
            maxIdx = i;
          }
        }
        if (maxIdx >= 0) {
          cnnTop = CLASS_NAMES[maxIdx];
          cnnProb = maxConf;
        }
        output.dispose();
      } finally {
        tensor.dispose();
      }
    }

    // Combine with on-device KNN using the same scorer as flashcards
    const calibCounts: Record<string, number> = {};
    for (const L of HEBREW_CLASSES) calibCounts[L] = calib.samples[L]?.length || 0;

    const { ranked, top, topProb } = scoreCandidates({
      cnnProbs,
      protos,
      calibCounts,
      knnVec,
      // No expected letter: Practice is a blind test so calibration doesn't cheat
    });

    setPrediction({
      letter: top,
      confidence: topProb,
      cnnTop,
      cnnProb,
      top3: ranked.slice(0, 3),
    });
  }

  function handleNextPractice() {
    handleClear();
    pickPracticeTarget();
  }

  function nextLetter() {
    setTargetIdx((i) => (i + 1) % HEBREW_CLASSES.length);
    handleClear();
  }
  function prevLetter() {
    setTargetIdx((i) => (i - 1 + HEBREW_CLASSES.length) % HEBREW_CLASSES.length);
    handleClear();
  }

  // Jump to the first letter under target; if all are at target, stay put
  function jumpToFirstIncomplete() {
    for (let i = 0; i < HEBREW_CLASSES.length; i++) {
      const L = HEBREW_CLASSES[i];
      if ((counts[L] || 0) < perLetter) {
        setTargetIdx(i);
        handleClear();
        return;
      }
    }
  }

  async function handleSaveSample() {
    if (!canvasRef.current) return;
    setSaving(true);
    try {
      const { knnVec, cnnInput } = preprocessCanvasForInference(canvasRef.current);
      const sum = knnVec.reduce((a, b) => a + b, 0);
      if (sum < 1e-3) return;

      // 1) On-device KNN calibration (used by flashcards writing mode too)
      const q = floatToU8(knnVec);
      const next = {
        ...calib,
        samples: { ...calib.samples },
      };
      next.samples[calibTarget] = (next.samples[calibTarget] || []).concat([q]);
      saveCalibration(next);
      setCalib(next);

      // 2) Optional server collection for offline model fine-tuning
      if (serverCollect && cnnInput) {
        try {
          // Render the processed 64x64 back to a canvas → PNG → POST
          const off = document.createElement("canvas");
          off.width = MODEL_INPUT;
          off.height = MODEL_INPUT;
          const octx = off.getContext("2d")!;
          const img = octx.createImageData(MODEL_INPUT, MODEL_INPUT);
          for (let i = 0; i < MODEL_INPUT * MODEL_INPUT; i++) {
            const gray = Math.round(cnnInput[i * 3] * 255);
            img.data[i * 4] = gray;
            img.data[i * 4 + 1] = gray;
            img.data[i * 4 + 2] = gray;
            img.data[i * 4 + 3] = 255;
          }
          octx.putImageData(img, 0, 0);
          const dataUrl = off.toDataURL("image/png");
          fetch("/api/letters/collect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ label: calibTarget, imageData: dataUrl }),
          }).catch(() => {});
        } catch {}
      }

      handleClear();
      // Auto-advance when target count reached
      if ((next.samples[calibTarget]?.length || 0) >= perLetter) {
        // Move to the next letter that is still under target
        const order = [
          ...HEBREW_CLASSES.slice(targetIdx + 1),
          ...HEBREW_CLASSES.slice(0, targetIdx + 1),
        ];
        const nextL = order.find(
          (L) => (next.samples[L]?.length || 0) < perLetter
        );
        if (nextL) {
          setTargetIdx(HEBREW_CLASSES.indexOf(nextL));
        }
      }
    } finally {
      setSaving(false);
    }
  }

  function doExport() {
    const blob = exportCalibration(calib);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "calibration.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function doImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const state = await importCalibration(file);
    saveCalibration(state);
    setCalib(state);
    e.target.value = "";
  }

  function doReset() {
    if (!confirm("Erase all calibration samples? This cannot be undone.")) return;
    const empty: CalibState = { version: 1, samples: {} };
    saveCalibration(empty);
    setCalib(empty);
    setTargetIdx(0);
  }

  if (loading) return <p className="text-gray-400">Loading model...</p>;

  const practiceCorrect = prediction?.letter === practiceTarget;

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Mode toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode("practice")}
          className={`rounded-lg px-3 py-1 text-sm transition ${
            mode === "practice"
              ? "bg-emerald-600 text-white"
              : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          }`}
        >
          Practice
        </button>
        <button
          onClick={() => setMode("calibrate")}
          className={`rounded-lg px-3 py-1 text-sm transition ${
            mode === "calibrate"
              ? "bg-emerald-600 text-white"
              : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          }`}
        >
          Calibrate
        </button>
      </div>

      {mode === "calibrate" && (
        <div className="w-full flex flex-col items-center gap-2">
          <div className="w-full max-w-sm">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>
                {lettersComplete}/{HEBREW_CLASSES.length} letters complete
              </span>
              <span>
                {totalSamples}/{totalTarget} samples ({pct}%)
              </span>
            </div>
            <div className="h-2 w-full rounded bg-gray-800 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <button
            onClick={jumpToFirstIncomplete}
            className="text-xs text-blue-400 hover:text-blue-300 underline"
          >
            Jump to next incomplete letter
          </button>
        </div>
      )}

      {/* Target letter */}
      <div className="text-center">
        <p className="text-sm text-gray-400">
          {mode === "practice" ? "Draw the letter:" : "Calibrate:"}
        </p>
        <p className="text-6xl font-bold" dir="rtl">
          {mode === "practice" ? practiceTarget : calibTarget}
        </p>
        {mode === "calibrate" && (
          <p className="text-xs text-gray-500 mt-1">
            {counts[calibTarget] || 0}/{perLetter} samples for this letter
          </p>
        )}
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        className="rounded-xl border-2 border-gray-700 bg-white touch-none"
        style={{ maxWidth: "100%", aspectRatio: "1" }}
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
      />

      {/* Practice result */}
      {mode === "practice" && prediction && (
        <div className="text-center flex flex-col items-center gap-1">
          <p className="text-xl">
            Prediction:{" "}
            <span className="font-bold text-2xl" dir="rtl">
              {prediction.letter}
            </span>
          </p>
          <p className="text-sm text-gray-400">
            Confidence: {(prediction.confidence * 100).toFixed(1)}%
          </p>
          <p
            className={`text-2xl font-bold ${
              practiceCorrect ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {practiceCorrect ? "Correct!" : "Try Again"}
          </p>
          {/* Top-3 breakdown */}
          <div className="flex gap-2 mt-1 text-xs text-gray-400">
            {prediction.top3.map((r, i) => (
              <span
                key={r.letter}
                className={i === 0 ? "text-emerald-400" : ""}
              >
                <span dir="rtl" className="font-bold text-sm mr-1">
                  {r.letter}
                </span>
                {(r.prob * 100).toFixed(0)}%
              </span>
            ))}
          </div>
          {/* CNN-only comparison shows calibration effect */}
          {prediction.cnnTop && prediction.cnnTop !== prediction.letter && (
            <p className="text-[11px] text-gray-500 mt-1">
              CNN alone:{" "}
              <span dir="rtl" className="font-bold">
                {prediction.cnnTop}
              </span>{" "}
              ({((prediction.cnnProb ?? 0) * 100).toFixed(0)}%) — calibration
              overrode
            </p>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-4 flex-wrap justify-center">
        <button
          onClick={handleClear}
          className="rounded-lg bg-gray-800 px-4 py-2 text-sm hover:bg-gray-700 transition"
        >
          Clear
        </button>
        {mode === "practice" && (
          <button
            onClick={handleCheck}
            disabled={!model}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm hover:bg-blue-500 transition disabled:opacity-30"
          >
            Check
          </button>
        )}
        {mode === "calibrate" && (
          <>
            <button
              onClick={prevLetter}
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm hover:bg-gray-700 transition"
            >
              Prev
            </button>
            <button
              onClick={handleSaveSample}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm hover:bg-blue-500 transition disabled:opacity-30"
            >
              {saving ? "Saving..." : "Save Sample"}
            </button>
            <button
              onClick={nextLetter}
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm hover:bg-gray-700 transition"
            >
              Next
            </button>
          </>
        )}
        {mode === "practice" && (
          <button
            onClick={handleNextPractice}
            className="rounded-lg bg-gray-800 px-4 py-2 text-sm hover:bg-gray-700 transition"
          >
            Next
          </button>
        )}
      </div>

      {/* Calibrate extras */}
      {mode === "calibrate" && (
        <>
          <div className="flex items-center gap-3 flex-wrap justify-center text-sm text-gray-300">
            <label className="flex items-center gap-2">
              Samples/letter
              <input
                type="number"
                value={perLetter}
                min={1}
                max={20}
                onChange={(e) =>
                  setPerLetter(
                    Math.max(1, Math.min(20, Number(e.target.value) || 5))
                  )
                }
                className="bg-gray-900 border border-gray-700 rounded px-2 py-1 w-16"
              />
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={serverCollect}
                onChange={(e) => setServerCollect(e.target.checked)}
              />
              Send to server dataset
            </label>
          </div>

          <div className="flex gap-2 flex-wrap justify-center">
            <button
              onClick={doExport}
              className="rounded bg-gray-800 px-3 py-1 text-xs hover:bg-gray-700"
            >
              Export
            </button>
            <label className="rounded bg-gray-800 px-3 py-1 text-xs hover:bg-gray-700 cursor-pointer">
              Import
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={doImport}
              />
            </label>
            <button
              onClick={doReset}
              className="rounded bg-red-900 px-3 py-1 text-xs hover:bg-red-800"
            >
              Reset
            </button>
          </div>

          {/* Per-letter grid */}
          <div className="grid grid-cols-9 gap-1 w-full max-w-md">
            {HEBREW_CLASSES.map((L, i) => {
              const c = counts[L] || 0;
              const done = c >= perLetter;
              const active = i === targetIdx;
              return (
                <button
                  key={L}
                  onClick={() => {
                    setTargetIdx(i);
                    handleClear();
                  }}
                  className={`rounded-md border px-1 py-1 ${
                    active
                      ? "border-emerald-500"
                      : done
                      ? "border-emerald-800"
                      : "border-gray-700"
                  } ${done ? "bg-emerald-950" : "bg-gray-900"}`}
                >
                  <div className="text-lg font-semibold" dir="rtl">
                    {L}
                  </div>
                  <div
                    className={`text-[10px] text-center ${
                      done ? "text-emerald-400" : "text-gray-500"
                    }`}
                  >
                    {c}/{perLetter}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
