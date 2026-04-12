import { useEffect, useMemo, useRef } from 'preact/hooks';
import { DrawCanvas, type DrawCanvasHandle } from '../canvas/DrawCanvas';
import { LETTERS, type LetterGlyph } from '../recognizer/types';
import {
  calibrateLetterIdx,
  calibration,
  progress,
  sampleCounts,
  setupComplete,
  setupCount,
} from '../state/signals';
import {
  addCalibrationSample,
  clearLetterSamples,
  deleteLastSample,
  mergeCalibration,
  resetCalibration,
  updatePrefs,
} from '../storage/mutations';
import type { CalibrationV1 } from '../storage/calibration';
import panels from './panels.module.css';

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

export function CalibrateTab() {
  const canvasRef = useRef<DrawCanvasHandle | null>(null);
  const lastVecRef = useRef<Float32Array | null>(null);

  const idx = calibrateLetterIdx.value;
  const targetLetter = LETTERS[idx];
  const counts = sampleCounts.value;
  const samplesPerLetter = progress.value.prefs.samples_per_letter;
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
  function nextLetter() {
    setIdx(idx + 1);
  }
  function prevLetter() {
    setIdx(idx - 1);
  }

  function saveSample() {
    const c = canvasRef.current;
    if (!c || !c.hasInk()) return;
    const vec = lastVecRef.current ?? c.extract();
    // Skip if the vector is effectively empty (no ink).
    let sum = 0;
    for (let i = 0; i < vec.length; i++) sum += vec[i];
    if (sum < 1e-3) return;

    addCalibrationSample(targetLetter, vec);

    // Auto-advance: during setup, jump to the next incomplete letter;
    // otherwise advance once the per-letter target is reached.
    const nextCounts = {
      ...sampleCounts.value,
      [targetLetter]: (sampleCounts.value[targetLetter] || 0) + 1,
    } as Record<LetterGlyph, number>;
    if (!setupComplete.value) {
      const ni = nextIncompleteIndex(nextCounts, idx + 1);
      if (ni !== null) setIdx(ni);
      else resetCanvas();
    } else if ((nextCounts[targetLetter] || 0) >= samplesPerLetter) {
      nextLetter();
    } else {
      resetCanvas();
    }
  }

  function onStroke(vec: Float32Array) {
    lastVecRef.current = vec;
  }

  // ---- Export / Import / Reset ----
  function exportCalibration() {
    const payload = calibration.value;
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'daber_calibration.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importCalibration(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as CalibrationV1;
      if (parsed.version !== 1 || !parsed.samples) throw new Error('bad shape');
      mergeCalibration(parsed);
    } catch {
      alert('Import failed: invalid JSON');
    }
  }

  function onReset() {
    if (!confirm('Clear all calibration samples?')) return;
    resetCalibration();
    resetCanvas();
  }

  function onDeleteLast() {
    deleteLastSample(targetLetter);
    resetCanvas();
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
      if (e.key === 'Enter') {
        e.preventDefault();
        saveSample();
      } else if (e.key === ' ') {
        e.preventDefault();
        resetCanvas();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextLetter();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevLetter();
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
    return LETTERS.map((L) => `${L}: ${counts[L] || 0}/${samplesPerLetter}`).join('  ');
  }, [counts, samplesPerLetter]);

  return (
    <>
      <DrawCanvas ref={canvasRef} onStrokeComplete={onStroke} />
      <div class={panels.row}>
        <button onClick={() => canvasRef.current?.clear()}>Clear</button>
        <button onClick={() => canvasRef.current?.undo()}>Undo</button>
      </div>

      <div class={panels.panel}>
        <div class={panels.prompt}>
          <span class={panels.promptLabel}>Draw letter:</span>
          <span class={panels.promptValue}>{targetLetter}</span>
        </div>
        <div class={panels.row}>
          <button onClick={saveSample}>Save Sample</button>
          <button onClick={nextLetter}>Next Letter</button>
          <button onClick={onDeleteLast} title="Remove the last saved sample">
            Delete Last
          </button>
          <button onClick={onClearLetter} title="Remove all samples for this letter">
            Clear Letter
          </button>
          <label class="inline">
            Samples/letter
            <input
              type="number"
              min={1}
              max={20}
              value={samplesPerLetter}
              onChange={(e) => {
                const v = Math.max(1, Math.min(20, Number((e.target as HTMLInputElement).value) || 5));
                updatePrefs({ samples_per_letter: v });
              }}
            />
          </label>
        </div>
        <div class={panels.row}>
          <button onClick={exportCalibration}>Export Calibration</button>
          <label class={panels.fileInput}>
            Import
            <input type="file" accept="application/json" onChange={importCalibration} />
          </label>
          <button onClick={onReset}>Reset</button>
        </div>
        <div
          class={`${panels.progress} ${setupComplete.value ? panels.progressOk : ''}`}
        >
          {setupComplete.value
            ? 'Setup complete for all 27 letters.'
            : `Setup: ${setupCount.value}/${LETTERS.length} letters collected`}
        </div>
        <div class={panels.progress}>{progressLine}</div>
        <div class={panels.shortcuts}>
          Enter = save · Space = clear · ← → = prev/next letter · Ctrl+Z = undo. Click a tile on the right to jump.
        </div>
      </div>
    </>
  );
}
