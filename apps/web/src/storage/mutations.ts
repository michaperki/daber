import { addSample, loadCalibration, nowIso, saveCalibration, type CalibrationV1 } from './calibration';
import {
  loadProgress,
  saveProgress,
  type ProgressV1,
  type CellProgress,
  type LessonProgress,
  type LessonStageProgress,
} from './progress';
import { schedulePutCalibration, schedulePutProgress } from './sync';
import {
  calibration,
  deviceId,
  offline,
  progress,
  syncStatus,
} from '../state/signals';
import type { LetterGlyph } from '../recognizer/types';
import type { DrillSession } from '../session_planner';

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
    phrases: { ...(next.phrases || {}) },
    lessons: { ...(next.lessons || {}) },
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

export function bumpPhrase(key: string, cleanAttempt: boolean, sourceKeys?: string[]) {
  if (!key) return;
  const p = progress.value;
  const phrases = { ...(p.phrases || {}) };
  const prev = phrases[key] || { seen: 0, clean: 0, attempted: 0 };
  phrases[key] = {
    seen: prev.seen + 1,
    attempted: prev.attempted + 1,
    clean: prev.clean + (cleanAttempt ? 1 : 0),
    last_seen_at: nowIso(),
    source_keys: sourceKeys?.length ? Array.from(new Set(sourceKeys)) : prev.source_keys,
  };
  commitProgress({ ...p, phrases });
}

// ---- Cells (verb:<lemma>:<token>) ----

function cellKeyFor(pos: string, lemma: string, token: string) {
  return `${pos}:${lemma}:${token}`;
}

export function bumpCell(pos?: string, lemma?: string, token?: string, cleanAttempt?: boolean) {
  if (!pos || !lemma || !token) return;
  const p = progress.value;
  const key = cellKeyFor(pos, lemma, token);
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

  // After committing a clean verb cell, evaluate per-lemma tier readiness and maybe prompt.
  if (pos === 'verb' && clean) {
    // Lazy import to avoid circular deps at module init time
    import('../tier_suggest').then((m) => m.maybeTriggerTierSuggestion(lemma, true)).catch(() => {});
  }
}

export { cellKeyFor as cellKey };

// ---- Lesson progress ----

function stageProgressFor(session: DrillSession): LessonStageProgress[] {
  return session.stages.map((stage) => ({
    id: stage.id,
    label: stage.label,
    count: stage.count,
    completed: Math.min(stage.count, Math.max(0, session.currentIndex - stage.start)),
  }));
}

function mergeLessonProgress(
  prev: LessonProgress | undefined,
  session: DrillSession,
  patch: Partial<LessonProgress>,
): LessonProgress {
  const now = nowIso();
  const previousStatus = prev?.status || 'not_started';
  const nextStatus = patch.status || (previousStatus === 'completed' ? 'completed' : 'in_progress');
  const preserveCompletedCoverage = previousStatus === 'completed' && patch.status !== 'completed';
  return {
    status: previousStatus === 'completed' && nextStatus !== 'completed' ? 'completed' : nextStatus,
    first_started_at: prev?.first_started_at || now,
    last_practiced_at: patch.last_practiced_at || now,
    last_completed_at: patch.last_completed_at || prev?.last_completed_at,
    sessions_started: patch.sessions_started ?? prev?.sessions_started ?? 0,
    sessions_completed: patch.sessions_completed ?? prev?.sessions_completed ?? 0,
    items_completed: preserveCompletedCoverage ? (prev?.items_completed || session.targetCount) : (patch.items_completed ?? session.currentIndex),
    target_count: preserveCompletedCoverage ? (prev?.target_count || session.targetCount) : (patch.target_count ?? session.targetCount),
    stages: preserveCompletedCoverage ? (prev?.stages || stageProgressFor(session)) : (patch.stages || stageProgressFor(session)),
  };
}

export function markLessonSessionStarted(session: DrillSession) {
  if (session.mode !== 'lesson' || !session.lessonId) return;
  const p = progress.value;
  const lessons = { ...(p.lessons || {}) };
  const prev = lessons[session.lessonId];
  lessons[session.lessonId] = mergeLessonProgress(prev, session, {
    status: prev?.status === 'completed' ? 'completed' : 'in_progress',
    sessions_started: (prev?.sessions_started || 0) + 1,
    items_completed: session.currentIndex,
    target_count: session.targetCount,
    stages: stageProgressFor(session),
  });
  commitProgress({ ...p, lessons });
}

export function markLessonSessionProgress(session: DrillSession) {
  if (session.mode !== 'lesson' || !session.lessonId) return;
  const p = progress.value;
  const lessons = { ...(p.lessons || {}) };
  const prev = lessons[session.lessonId];
  lessons[session.lessonId] = mergeLessonProgress(prev, session, {
    status: prev?.status === 'completed' ? 'completed' : 'in_progress',
    items_completed: session.currentIndex,
    target_count: session.targetCount,
    stages: stageProgressFor(session),
  });
  commitProgress({ ...p, lessons });
}

export function markLessonSessionCompleted(session: DrillSession) {
  if (session.mode !== 'lesson' || !session.lessonId) return;
  const p = progress.value;
  const lessons = { ...(p.lessons || {}) };
  const prev = lessons[session.lessonId];
  lessons[session.lessonId] = mergeLessonProgress(prev, { ...session, currentIndex: session.targetCount }, {
    status: 'completed',
    last_completed_at: nowIso(),
    sessions_completed: (prev?.sessions_completed || 0) + 1,
    items_completed: session.targetCount,
    target_count: session.targetCount,
    stages: session.stages.map((stage) => ({ id: stage.id, label: stage.label, count: stage.count, completed: stage.count })),
  });
  commitProgress({ ...p, lessons });
}

// Re-hydrate local signals from localStorage. Used by the Settings reset
// flow when the user wants a completely clean slate after wiping local data.
export function rehydrateLocal() {
  calibration.value = loadCalibration();
  progress.value = loadProgress();
}
