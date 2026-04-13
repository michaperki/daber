import { useEffect, useMemo, useRef } from 'preact/hooks';
import { DrawCanvas, type DrawCanvasHandle } from '../canvas/DrawCanvas';
import type { Stroke } from '../recognizer/types';
import { LETTERS, type LetterGlyph } from '../recognizer/types';
import {
  calibrateLetterIdx,
  calibration,
  sampleCounts,
  setupComplete,
  setupCount,
} from '../state/signals';
import {
  addCalibrationSample,
  clearLetterSamples,
} from '../storage/mutations';
import { appendLocalSample } from '../storage/strokes_store';
import { strokeSamples } from '../state/strokes';
import { LettersGrid } from './LettersGrid';
import panels from './panels.module.css';
import { calibrationMode } from '../state/signals';

// Hebrew right-to-left order for next/prev navigation matches the order
// learners encounter letters in the alphabet (LETTERS array).

function nextIncompleteIndex(
  counts: Record<LetterGlyph, number>,
  fromIdx: number,
): number | null {
  for (let i = 0; i < LETTERS.length; i++) {
    const idx = (fromIdx + i) % LETTERS.length;
    if ((counts[LETTERS[idx]] || 0) === 0) return idx;
  }
  return null;
}

export function Onboarding() {
  const canvasRef = useRef<DrawCanvasHandle | null>(null);
  const lastVecRef = useRef<Float32Array | null>(null);

  const idx = calibrateLetterIdx.value;
  const targetLetter = LETTERS[idx];
  const counts = sampleCounts.value;
  // Reference calibration for memo invalidation; `cal` itself isn't used
  // directly in render but must be depended on.
  const cal = calibration.value;
  void cal;

  // On mount: if setup is incomplete, jump to the first incomplete letter so
  // the user picks up where they left off. Matches USER_FLOW.md.
  useEffect(() => {
    if (!setupComplete.value) {
      const next = nextIncompleteIndex(counts, 0);
      if (next !== null) calibrateLetterIdx.value = next;
    }
    // Mount-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetCanvas() {
    canvasRef.current?.clear();
    lastVecRef.current = null;
  }
  function setIdx(i: number) {
    const n = LETTERS.length;
    calibrateLetterIdx.value = ((i % n) + n) % n;
    resetCanvas();
  }
  // Also reset if the active index changes externally (e.g., via LettersGrid)
  useEffect(() => { resetCanvas(); }, [idx]);

  function saveSample() {
    const c = canvasRef.current;
    if (!c || !c.hasInk()) return;
    const vec = lastVecRef.current ?? c.extract();
    // Skip if the vector is effectively empty (no ink).
    let sum = 0;
    for (let i = 0; i < vec.length; i++) sum += vec[i];
    if (sum < 1e-3) return;

    addCalibrationSample(targetLetter, vec);
    // Append to canonical stroke dataset immediately for runtime recognition
    const strokes: Stroke[] | undefined = c.getStrokes?.();
    if (strokes && strokes.length) {
      const updated = appendLocalSample(targetLetter, strokes);
      strokeSamples.value = updated.samples as any;
      // Best-effort capture of raw strokes to the API for training
      import('../storage/strokes')
        .then((m) => m.captureStroke(targetLetter, strokes).catch(() => {}))
        .catch(() => {});
    }

    // Auto-advance: during setup, jump to the next incomplete letter.
    const nextCounts = {
      ...sampleCounts.value,
      [targetLetter]: (sampleCounts.value[targetLetter] || 0) + 1,
    } as Record<LetterGlyph, number>;
    const ni = nextIncompleteIndex(nextCounts, idx + 1);
    if (ni !== null) setIdx(ni);
  }

  function onStroke(vec: Float32Array) {
    lastVecRef.current = vec;
  }

  function onClearLetter() {
    const n = counts[targetLetter] || 0;
    if (!n) return;
    if (!confirm(`Clear all ${n} sample(s) for "${targetLetter}"?`)) return;
    clearLetterSamples(targetLetter);
    resetCanvas();
  }

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = (e.target as HTMLElement | null)?.tagName;
      if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return;
      if (e.key === ' ') {
        e.preventDefault();
        resetCanvas();
      } else if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        canvasRef.current?.undo();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // Intentionally re-binds each render so closures see the latest idx.
  });

  const progressLine = useMemo(() => {
    return LETTERS.map((L) => `${L}: ${counts[L] || 0}/1`).join('  ');
  }, [counts]);

  return (
    <>
      <LettersGrid />
      <DrawCanvas ref={canvasRef} onStrokeComplete={onStroke} watermarkLetter={targetLetter} />
      <div class={panels.row}>
        <button onClick={() => canvasRef.current?.clear()}>Clear</button>
        <button onClick={() => canvasRef.current?.undo()}>Undo</button>
        {setupComplete.value && (
          <button style={{ marginLeft: 8 }} onClick={() => { calibrationMode.value = false; }}>
            Back to Drill
          </button>
        )}
      </div>

      <div class={panels.panel}>
        <div class={panels.prompt}>
          <span class={panels.promptLabel}>Draw letter:</span>
          <span class={panels.promptValue}>{targetLetter}</span>
        </div>
        <div class={panels.row}>
          <button onClick={saveSample}>Save Sample</button>
          <button onClick={onClearLetter} title="Remove all samples for this letter">
            Clear Letter
          </button>
        </div>
        <div
          class={`${panels.progress} ${setupComplete.value ? panels.progressOk : ''}`}
        >
          {setupComplete.value
            ? 'Setup complete for all 27 letters.'
            : `Setup: ${setupCount.value}/${LETTERS.length} letters collected`}
        </div>
        <div class={panels.progress}>{progressLine}</div>
        
      </div>
    </>
  );
}
