import { useMemo, useRef, useState } from 'preact/hooks';
import { DrawCanvas, type DrawCanvasHandle } from '../canvas/DrawCanvas';
import { predictTop, topMargin, type Ranked } from '../recognizer';
import { calibration, progress } from '../state/signals';
import { toPrototypes } from '../storage/calibration';
import { updatePrefs } from '../storage/mutations';
import panels from './panels.module.css';

// Debug / feel-check surface. Draw something, see the top-5 predictions
// update in real time. All recognizer knobs live here.
export function RecognizeTab() {
  const canvasRef = useRef<DrawCanvasHandle | null>(null);
  const [predictions, setPredictions] = useState<Ranked[]>([]);
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
  }

  function onStroke(vec: Float32Array) {
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
      <DrawCanvas ref={canvasRef} onStrokeComplete={onStroke} />
      <div class={panels.row}>
        <button
          onClick={() => {
            canvasRef.current?.clear();
            setPredictions([]);
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
          <label class="inline">
            Mode
            <select
              value={prefs.mode}
              onChange={(e) => updatePrefs({ mode: (e.target as HTMLSelectElement).value as 'knn' | 'centroid' | 'hybrid' })}
              title="Centroid = average per class; KNN = vote over k most similar samples; Hybrid = CNN+KNN if model present"
            >
              <option value="knn">KNN</option>
              <option value="centroid">Centroid</option>
              <option value="hybrid">Hybrid (CNN + KNN)</option>
            </select>
          </label>
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
        <div class={panels.shortcuts}>
          Enter = predict · Space = clear · Ctrl+Z = undo
        </div>
      </div>
    </>
  );
}
