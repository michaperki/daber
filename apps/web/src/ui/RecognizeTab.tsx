import { useMemo, useRef, useState } from 'preact/hooks';
import { DrawCanvas, type DrawCanvasHandle } from '../canvas/DrawCanvas';
import { predictTop, topMargin, getRawCnnProbs, debugHybridContribs, type Ranked } from '../recognizer';
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
  const [debug, setDebug] = useState(false);
  const [lastVec, setLastVec] = useState<Float32Array | null>(null);
  const [hybridContribs, setHybridContribs] = useState<ReturnType<typeof debugHybridContribs> | null>(null);
  const [allModes, setAllModes] = useState<{ knn: Ranked[]; centroid: Ranked[]; cnn: Ranked[]; hybrid: Ranked[] } | null>(null);
  const [modelInfo, setModelInfo] = useState<{ inShape?: number[]; outLen?: number; labels?: string[] } | null>(null);

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
    setLastVec(v);
    const top = predictTop(v, {
      mode: prefs.mode,
      k: prefs.k,
      augment: prefs.augment,
      prototypes,
      topN: 5,
    });
    setPredictions(top);
    // CNN diagnostics: show raw CNN output when in hybrid/cnn mode
    if ((prefs.mode === 'hybrid' || prefs.mode === 'cnn') && hasCnn) {
      setCnnRaw(getRawCnnProbs(v.subarray(0, 64 * 64)).slice(0, 3));
    } else {
      setCnnRaw([]);
    }
    if (debug) {
      // Collect breakdowns across modes and hybrid contributions
      const knn = predictTop(v, { mode: 'knn', k: prefs.k, augment: prefs.augment, prototypes, topN: 5 });
      const centroid = predictTop(v, { mode: 'centroid', augment: prefs.augment, prototypes, topN: 5 });
      const cnn = predictTop(v, { mode: 'cnn', prototypes, topN: 5 });
      const hybrid = predictTop(v, { mode: 'hybrid', augment: prefs.augment, prototypes, topN: 5 });
      setAllModes({ knn, centroid, cnn, hybrid });
      if (prefs.mode === 'hybrid' || prefs.mode === 'cnn') {
        setHybridContribs(debugHybridContribs(v, prototypes, {}));
      } else {
        setHybridContribs(null);
      }
      // Model info snapshot
      try {
        const win: any = window as any;
        const m = win.daberCnnModel;
        const info = m ? {
          inShape: (m?.inputs?.[0]?.shape as number[] | undefined),
          outLen: (m?.outputs?.[0]?.shape?.slice(-1)?.[0] as number | undefined),
          labels: Array.isArray(win.daberCnnLabels) ? (win.daberCnnLabels as string[]) : undefined,
        } : null;
        setModelInfo(info);
      } catch { setModelInfo(null); }
    } else {
      setAllModes(null);
      setHybridContribs(null);
      setModelInfo(null);
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
  // Allow Hybrid/CNN modes with a loaded CNN model even without calibration samples.
  const hasCnn = typeof window !== 'undefined' && !!(window as any).daberCnnModel;
  const hasRecognizer = hasCalibration || ((prefs.mode === 'hybrid' || prefs.mode === 'cnn') && hasCnn);

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
          <label class="inline" title="Show internal scores and 64×64 preview">
            Debug
            <input
              type="checkbox"
              checked={debug}
              onChange={(e) => setDebug((e.target as HTMLInputElement).checked)}
            />
          </label>
        </div>
        <div class={panels.row}>
          <span style={{ fontSize: '12px', opacity: 0.8 }}>
            {prefs.mode === 'cnn'
              ? hasCnn
                ? 'CNN: model loaded'
                : 'CNN: no model loaded'
              : hasCnn
                ? 'Hybrid: CNN loaded'
                : 'Hybrid: no CNN (centroid/KNN only)'}
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
            {prefs.mode === 'hybrid' || prefs.mode === 'cnn'
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
        {debug && lastVec && (
          <div style={{ marginTop: '8px' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {modelInfo && (
                <div style={{ fontSize: '11px', opacity: 0.7, minWidth: '220px' }}>
                  <div style={{ marginBottom: '6px' }}>Model info</div>
                  <div>in: {JSON.stringify(modelInfo.inShape || [])}</div>
                  <div>out: {modelInfo.outLen ?? '?'}</div>
                  <div>labels: {modelInfo.labels ? modelInfo.labels.length : 0}</div>
                </div>
              )}
              <div>
                <div style={{ fontSize: '12px', opacity: 0.8, marginBottom: '4px' }}>64×64 preview</div>
                <canvas
                  width={64}
                  height={64}
                  ref={(el) => {
                    if (!el) return;
                    const ctx = el.getContext('2d');
                    if (!ctx) return;
                    const img = ctx.createImageData(64, 64);
                    for (let i = 0; i < 64 * 64; i++) {
                      // draw as black ink on white background
                      const ink = lastVec[i] || 0; // [0,1], ink=1
                      const gray = Math.max(0, Math.min(255, Math.round((1 - ink) * 255)));
                      img.data[i * 4 + 0] = gray;
                      img.data[i * 4 + 1] = gray;
                      img.data[i * 4 + 2] = gray;
                      img.data[i * 4 + 3] = 255;
                    }
                    ctx.putImageData(img, 0, 0);
                  }}
                  style={{ border: '1px solid #333' }}
                />
              </div>
              {allModes && (
                <div style={{ fontSize: '12px', opacity: 0.85, minWidth: '220px' }}>
                  <div style={{ marginBottom: '6px' }}>By mode (top-3):</div>
                  <div>• KNN: {allModes.knn.slice(0,3).map(p => `${p.letter} ${(p.prob*100).toFixed(0)}%`).join('  ·  ')}</div>
                  <div>• Centroid: {allModes.centroid.slice(0,3).map(p => `${p.letter} ${(p.prob*100).toFixed(0)}%`).join('  ·  ')}</div>
                  <div>• CNN: {allModes.cnn.slice(0,3).map(p => `${p.letter} ${(p.prob*100).toFixed(0)}%`).join('  ·  ')}</div>
                  <div>• Hybrid: {allModes.hybrid.slice(0,3).map(p => `${p.letter} ${(p.prob*100).toFixed(0)}%`).join('  ·  ')}</div>
                </div>
              )}
              {hybridContribs && (
                <div style={{ fontSize: '11px', opacity: 0.8 }}>
                  <div style={{ marginBottom: '6px' }}>Hybrid contributions (top-3):</div>
                  {hybridContribs.slice(0,3).map((c) => (
                    <div key={c.letter}>
                      <span style={{ fontWeight: 600 }} dir="rtl">{c.letter}</span>
                      {`  · logp=${c.logp.toFixed(3)}  · proto=${c.proto.toFixed(3)} (α=${c.alpha.toFixed(2)})  · prior=${c.prior.toFixed(2)}`}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ marginTop: '8px' }}>
              <button onClick={() => {
                const payload = {
                  mode: prefs.mode,
                  k: prefs.k,
                  augment: prefs.augment,
                  predictions,
                  cnnRaw,
                  allModes,
                  hybridContribs,
                  vec: Array.from(lastVec),
                };
                const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'daber_debug.json';
                a.click();
                URL.revokeObjectURL(url);
              }}>Export JSON</button>
            </div>
          </div>
        )}
        <div class={panels.shortcuts}>
          Enter = predict · Space = clear · Ctrl+Z = undo
        </div>
      </div>
    </>
  );
}
