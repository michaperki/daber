import { addSample, loadCalibration, nowIso, saveCalibration, type CalibrationV1 } from './calibration';
import { loadProgress, saveProgress, type ProgressV1, type CellProgress, type CellState } from './progress';
import { schedulePutCalibration, schedulePutProgress } from './sync';
import {
  calibration,
  deviceId,
  offline,
  progress,
  syncStatus,
} from '../state/signals';
import type { LetterGlyph } from '../recognizer/types';

// Helpers that tabs call when they mutate local state. Each one:
//   1. updates the in-memory signal (so Preact re-renders)
//   2. persists to localStorage
//   3. schedules a debounced PUT to the API
//
// Signals are cloned shallowly before being assigned so Preact's equality
// check actually fires a re-render.

function markSyncing() {
  if (offline.value) return;
  syncStatus.value = 'saving';
  // Drop back to idle after the debounce window so the dot doesn't stay
  // yellow forever on happy-path flows.
  window.setTimeout(() => {
    if (syncStatus.value === 'saving' && !offline.value) {
      syncStatus.value = 'idle';
    }
  }, 2500);
}

// ---- Calibration mutations ----

export function commitCalibration(next: CalibrationV1) {
  next.updated_at = nowIso();
  saveCalibration(next);
  calibration.value = { ...next, samples: { ...next.samples } };
  schedulePutCalibration(deviceId.value, next);
  markSyncing();
}

export function addCalibrationSample(letter: LetterGlyph, vec: Float32Array) {
  const cal = addSample(calibration.value, letter, vec);
  commitCalibration(cal);
}

export function deleteLastSample(letter: LetterGlyph) {
  const cal = calibration.value;
  const list = cal.samples[letter] || [];
  if (!list.length) return;
  list.pop();
  if (!list.length) delete cal.samples[letter];
  commitCalibration(cal);
}

export function clearLetterSamples(letter: LetterGlyph) {
  const cal = calibration.value;
  if (!cal.samples[letter]) return;
  delete cal.samples[letter];
  commitCalibration(cal);
}

export function replaceCalibration(next: CalibrationV1) {
  commitCalibration(next);
}

// Merge two calibration blobs by appending per-letter sample arrays.
// Per the pre-flight decision in PLAN.md, Import uses "merge" semantics: no
// samples are lost.
export function mergeCalibration(incoming: CalibrationV1) {
  const base = calibration.value;
  const merged: CalibrationV1 = {
    version: 1,
    samples: { ...base.samples },
    updated_at: nowIso(),
  };
  for (const [letter, arr] of Object.entries(incoming.samples || {}) as [
    LetterGlyph,
    string[],
  ][]) {
    merged.samples[letter] = [...(merged.samples[letter] || []), ...arr];
  }
  commitCalibration(merged);
}

export function resetCalibration() {
  commitCalibration({ version: 1, samples: {} as any, updated_at: nowIso() });
}

// ---- Progress mutations ----

export function commitProgress(next: ProgressV1) {
  next.updated_at = nowIso();
  saveProgress(next);
  progress.value = {
    ...next,
    prefs: { ...next.prefs },
    practice_stats: { ...next.practice_stats },
    vocab_stats: { ...next.vocab_stats },
    seen_words: { ...next.seen_words },
    cells: { ...(next.cells || {}) },
  };
  schedulePutProgress(deviceId.value, next);
  markSyncing();
}

export function updatePrefs(patch: Partial<ProgressV1['prefs']>) {
  const p = progress.value;
  commitProgress({ ...p, prefs: { ...p.prefs, ...patch } });
}

// Practice stats helpers removed with PracticeTab.

export function bumpVocabLetter(correct: boolean) {
  const p = progress.value;
  const stats = {
    ...p.vocab_stats,
    correct_letters: p.vocab_stats.correct_letters + (correct ? 1 : 0),
    total_letters: p.vocab_stats.total_letters + 1,
  };
  commitProgress({ ...p, vocab_stats: stats });
}

export function bumpVocabWord(he: string, cleanAttempt: boolean) {
  const p = progress.value;
  const prev = p.seen_words[he] || { seen: 0, clean: 0, attempted: 0 };
  const next = {
    ...p.seen_words,
    [he]: {
      seen: prev.seen + 1,
      attempted: prev.attempted + 1,
      clean: prev.clean + (cleanAttempt ? 1 : 0),
    },
  };
  commitProgress({
    ...p,
    seen_words: next,
    vocab_stats: {
      ...p.vocab_stats,
      words_completed: p.vocab_stats.words_completed + 1,
    },
  });
}

// ---- Cells (verb:<lemma>:<token>) ----

function cellKey(lemma: string, token: string) {
  return `verb:${lemma}:${token}`;
}

export function bumpCell(lemma?: string, token?: string, cleanAttempt?: boolean) {
  if (!lemma || !token) return;
  const p = progress.value;
  const key = cellKey(lemma, token);
  const cells = { ...(p.cells || {}) } as Record<string, CellProgress>;
  const prev: CellProgress = cells[key] || { state: 'introduced', streak: 0, correct: 0, attempts: 0 };
  const nowIsoStr = nowIso();
  const next: CellProgress = { ...prev, attempts: prev.attempts + 1, last_seen_at: nowIsoStr };
  const clean = !!cleanAttempt;
  if (clean) next.correct = prev.correct + 1;

  // Transitions
  if (!clean) {
    // Demote mastered on miss, reset streak
    if (prev.state === 'mastered') next.state = 'practicing';
    next.streak = 0;
  } else {
    if (prev.state === 'introduced') {
      next.streak = prev.streak + 1;
      if (next.streak >= 3) {
        next.state = 'practicing';
        next.streak = 0;
      }
    } else if (prev.state === 'practicing') {
      next.streak = prev.streak + 1;
      if (next.streak >= 5) {
        next.state = 'mastered';
        next.streak = 0;
      }
    } else if (prev.state === 'mastered') {
      // Stay mastered on clean; keep streak at 0 (unused in mastered)
      next.streak = 0;
    }
  }

  cells[key] = next;
  commitProgress({ ...p, cells });
}

export { cellKey };

// Re-hydrate local signals from localStorage. Used by the Settings reset
// flow when the user wants a completely clean slate after wiping local data.
export function rehydrateLocal() {
  calibration.value = loadCalibration();
  progress.value = loadProgress();
}
