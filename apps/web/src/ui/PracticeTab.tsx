import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DrawCanvas, type DrawCanvasHandle } from '../canvas/DrawCanvas';
import { predictTop, topMargin } from '../recognizer';
import type { LetterGlyph } from '../recognizer/types';
import { calibratedLetters, calibration, progress } from '../state/signals';
import { toPrototypes } from '../storage/calibration';
import {
  addCalibrationSample,
  bumpPracticeStats,
  resetPracticeStats,
  updatePrefs,
} from '../storage/mutations';
import panels from './panels.module.css';

// Single-letter random drill. App picks a random calibrated letter, user
// draws it. On pen-up: predict, accept on top-1 match + margin >= threshold,
// otherwise shake and let them retry. Accepted samples auto-calibrate.
export function PracticeTab() {
  const canvasRef = useRef<DrawCanvasHandle | null>(null);
  const [target, setTarget] = useState<LetterGlyph | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'bad' | 'idle'; text: string }>({
    kind: 'idle',
    text: '',
  });
  const [lastReject, setLastReject] = useState<Float32Array | null>(null);
  const busyRef = useRef(false);

  const cal = calibration.value;
  const prefs = progress.value.prefs;
  const stats = progress.value.practice_stats;
  const pool = calibratedLetters.value;

  const prototypes = useMemo(() => toPrototypes(cal), [cal]);

  function pickNextTarget(prev?: LetterGlyph | null): LetterGlyph | null {
    if (pool.length === 0) return null;
    let pick: LetterGlyph;
    let attempts = 0;
    do {
      pick = pool[Math.floor(Math.random() * pool.length)]!;
      attempts++;
    } while (pool.length > 1 && pick === prev && attempts < 8);
    return pick;
  }

  // Pick an initial target on mount and whenever the calibrated pool changes
  // such that the current target is no longer valid.
  useEffect(() => {
    if (!target || !pool.includes(target)) {
      setTarget(pickNextTarget(target));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool.length]);

  function nextTarget() {
    setFeedback({ kind: 'idle', text: '' });
    setLastReject(null);
    setTarget(pickNextTarget(target));
    canvasRef.current?.clear();
  }

  function onStroke(vec: Float32Array) {
    if (!target) return;
    if (busyRef.current) return;

    let sum = 0;
    for (let i = 0; i < vec.length; i++) sum += vec[i];
    if (sum < 1e-3) return;

    const top = predictTop(vec, {
      mode: prefs.mode,
      k: prefs.k,
      augment: prefs.augment,
      prototypes,
      topN: 10,
    });
    if (!top.length) return;
    const top1 = top[0];
    const margin = topMargin(top);
    const threshold = prefs.practice_threshold;
    const accepted = top1.letter === target && margin >= threshold;

    bumpPracticeStats(accepted);

    if (accepted) {
      // Auto-calibrate from the correct draw.
      addCalibrationSample(target, vec);
      setLastReject(null);
      setFeedback({
        kind: 'ok',
        text: `✓ ${top1.letter} (margin ${(margin * 100).toFixed(1)}%)`,
      });
      navigator.vibrate?.(30);
      canvasRef.current?.flashAccept();
      busyRef.current = true;
      window.setTimeout(() => {
        busyRef.current = false;
        nextTarget();
      }, 380);
    } else {
      const reason =
        top1.letter === target
          ? `low margin ${(margin * 100).toFixed(1)}% < ${(threshold * 100).toFixed(0)}%`
          : `got ${top1.letter} (${(top1.prob * 100).toFixed(0)}%) vs expected ${target}`;
      setFeedback({ kind: 'bad', text: `✗ ${reason}` });
      setLastReject(vec);
      navigator.vibrate?.([50, 30, 50]);
      canvasRef.current?.shake();
    }
  }

  // Keyboard shortcuts: Enter = skip, Space = clear, Ctrl+Z = undo.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = (e.target as HTMLElement | null)?.tagName;
      if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return;
      if (e.key === 'Enter') {
        e.preventDefault();
        nextTarget();
      } else if (e.key === ' ') {
        e.preventDefault();
        canvasRef.current?.clear();
      } else if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        canvasRef.current?.undo();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function forceAccept() {
    if (!lastReject || !target) return;
    addCalibrationSample(target, lastReject);
    bumpPracticeStats(true);
    setLastReject(null);
    setFeedback({
      kind: 'ok',
      text: `✓ ${target} (force-accepted)`,
    });
    navigator.vibrate?.(30);
    canvasRef.current?.flashAccept();
    busyRef.current = true;
    window.setTimeout(() => {
      busyRef.current = false;
      nextTarget();
    }, 380);
  }

  const pct = stats.total ? Math.round((100 * stats.correct) / stats.total) : 0;
  const feedbackClass =
    feedback.kind === 'ok'
      ? `${panels.feedback} ${panels.feedbackOk}`
      : feedback.kind === 'bad'
        ? `${panels.feedback} ${panels.feedbackBad}`
        : panels.feedback;

  return (
    <>
      <DrawCanvas ref={canvasRef} onStrokeComplete={onStroke} />
      <div class={panels.row}>
        <button onClick={() => canvasRef.current?.clear()}>Clear</button>
        <button onClick={() => canvasRef.current?.undo()}>Undo</button>
      </div>

      <div class={panels.panel}>
        <div class={panels.prompt}>
          <span class={panels.promptLabel}>Draw:</span>
          <span class={panels.promptValue}>{target ?? '—'}</span>
        </div>
        <div class={panels.row}>
          <button onClick={nextTarget} title="Pick a new target">
            Skip
          </button>
          <button onClick={() => resetPracticeStats()}>Reset Score</button>
          <label class="inline" title="Use CNN + KNN fusion if a model is available; otherwise falls back to Centroid">
            Hybrid
            <input
              type="checkbox"
              checked={prefs.mode === 'hybrid'}
              onChange={(e) => updatePrefs({ mode: (e.target as HTMLInputElement).checked ? 'hybrid' : 'knn' })}
            />
          </label>
          <label class="inline" title="Top-1 minus top-2 probability required to accept">
            Threshold
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={prefs.practice_threshold}
              onChange={(e) => {
                const v = Math.max(
                  0,
                  Math.min(1, Number((e.target as HTMLInputElement).value) || 0),
                );
                updatePrefs({ practice_threshold: v });
              }}
            />
          </label>
        </div>
        <div class={feedbackClass}>
          {target == null
            ? 'Calibrate at least one letter to start practicing.'
            : feedback.text}
        </div>
        {lastReject && (
          <div class={panels.row}>
            <button onClick={forceAccept} title="Save this drawing as a correct sample and advance">
              I drew it right
            </button>
          </div>
        )}
        <div class={panels.stats}>
          Correct: {stats.correct} / {stats.total}  ({pct}%)
        </div>
        <div class={panels.shortcuts}>
          Draw the prompted letter. Lift pen to submit. Space = retry · Enter = skip · Ctrl+Z = undo
        </div>
      </div>
    </>
  );
}
