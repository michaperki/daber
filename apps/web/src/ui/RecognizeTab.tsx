import { useMemo, useRef, useState } from 'preact/hooks';
import { DrawCanvas, type DrawCanvasHandle } from '../canvas/DrawCanvas';
import { predictTop, topMargin, getRawCnnProbs, type Ranked } from '../recognizer';
import { calibration, progress } from '../state/signals';
import { toPrototypes } from '../storage/calibration';
import { updatePrefs } from '../storage/mutations';
import panels from './panels.module.css';

// Debug / feel-check surface. Draw something, see the top-5 predictions
// update in real time. All recognizer knobs live here.
export function RecognizeTab() {
  const canvasRef = useRef<DrawCanvasHandle | null>(null);
  const [predictions, setPredictions] = useState<Ranked[]>([]);
  const [cnnRaw, setCnnRaw] = useState<{ letter: string; prob: number }[]>([]);
  const [live, setLive] = useState(true);

  const prefs = progress.value.prefs;
  const cal = calibration.value;

  // Reactive prototype map; rebuilt only when calibration mutates.
  const prototypes = useMemo(() => toPrototypes(cal), [cal]);

  function runPrediction(vec?: Float32Array) {
    const v = vec ?? canvasRef.current?.extract();
    if (!v) return;
    let sum = 0;
    for (let i = 0; i < v.length; i++) sum += v[i];
    if (sum < 1e-3) {
      setPredictions([]);
      return;
    }
    const top = predictTop(v, {
      mode: prefs.mode,
      k: prefs.k,
      augment: prefs.augment,
      prototypes,
      topN: 5,
    });
    setPredictions(top);
    // CNN diagnostics: show raw CNN output when in hybrid mode
    if (prefs.mode === 'hybrid' && hasCnn) {
      setCnnRaw(getRawCnnProbs(v.subarray(0, 64 * 64)).slice(0, 3));
    } else {
      setCnnRaw([]);
    }
  }

  function onStroke(vec: Float32Array) {
    if (!live) return;
    runPrediction(vec);
  }
  function onLive(vec: Float32Array) {
    if (!live) return;
    runPrediction(vec);
  }

  const margin = topMargin(predictions);
  const hasCalibration = Object.keys(prototypes).length > 0;
  // Allow Hybrid mode with a loaded CNN model even without calibration samples.
  const hasCnn = typeof window !== 'undefined' && !!(window as any).daberCnnModel;
  const hasRecognizer = hasCalibration || (prefs.mode === 'hybrid' && hasCnn);

  return (
    <>
      <DrawCanvas ref={canvasRef} onStrokeComplete={onStroke} onLiveVector={onLive} />
      <div class={panels.row}>
        <button
          onClick={() => {
            canvasRef.current?.clear();
            setPredictions([]);
            setCnnRaw([]);
          }}
        >
          Clear
        </button>
        <button onClick={() => canvasRef.current?.undo()}>Undo</button>
      </div>

      <div class={panels.panel}>
        <div class={panels.row}>
          <label class="inline">
            Live
            <input
              type="checkbox"
              checked={live}
              onChange={(e) => setLive((e.target as HTMLInputElement).checked)}
            />
          </label>
          <button onClick={() => runPrediction()}>Predict Once</button>
        </div>
        <div class={panels.row}>
          <span style={{ fontSize: '12px', opacity: 0.8 }}>
            {hasCnn ? 'Hybrid: CNN loaded' : 'Hybrid: no CNN (centroid/KNN only)'}
          </span>
        </div>
        <div class={panels.row}>
          <label class="inline">
            k
            <input
              type="number"
              min={1}
              max={25}
              value={prefs.k}
              onChange={(e) => {
                const v = Math.max(1, Math.min(25, Number((e.target as HTMLInputElement).value) || 5));
                updatePrefs({ k: v });
              }}
            />
          </label>
          <label class="inline" title="Shift-augment each stored sample">
            Augment
            <input
              type="checkbox"
              checked={prefs.augment}
              onChange={(e) => updatePrefs({ augment: (e.target as HTMLInputElement).checked })}
            />
          </label>
        </div>

        {!hasRecognizer ? (
          <div class={panels.feedback}>
            {prefs.mode === 'hybrid'
              ? 'Waiting for CNN model. Ensure model files are under /models/. Or calibrate first.'
              : 'Calibrate first to enable recognition.'}
          </div>
        ) : predictions.length === 0 ? (
          <div class={panels.feedback}>Draw something to see predictions.</div>
        ) : (
          <>
            <div class={panels.margin}>
              {predictions.length >= 2
                ? `Top-1 margin: ${(margin * 100).toFixed(1)}%  ·  raw gap: ${(predictions[0].raw - predictions[1].raw).toFixed(3)}`
                : 'Only one class in calibration.'}
            </div>
            <div class={panels.predictions}>
              {predictions.map((p) => (
                <div class={panels.predItem} key={p.letter}>
                  <div class={panels.predLetter}>{p.letter}</div>
                  <div class={panels.predBar}>
                    <span style={{ width: `${Math.round(p.prob * 100)}%` }} />
                  </div>
                  <div class={panels.predPct}>{(p.prob * 100).toFixed(1)}%</div>
                </div>
              ))}
            </div>
          </>
        )}
        {cnnRaw.length > 0 && (
          <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '4px' }}>
            CNN raw: {cnnRaw.map((c) => `${c.letter} ${(c.prob * 100).toFixed(1)}%`).join('  ·  ')}
          </div>
        )}
        <div class={panels.shortcuts}>
          Enter = predict · Space = clear · Ctrl+Z = undo
        </div>
      </div>
    </>
  );
}
