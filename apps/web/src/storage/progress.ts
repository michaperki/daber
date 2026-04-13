export type ProgressV1 = {
  version: 1;
  prefs: {
    mode: 'knn' | 'centroid' | 'hybrid' | 'cnn' | 'stroke';
    k: number;
    augment: boolean;
    samples_per_letter: number;
    practice_threshold: number; // 0..1
    pilot_wizard_done: boolean;
  };
  practice_stats: { correct: number; total: number };
  vocab_stats: { correct_letters: number; total_letters: number; words_completed: number };
  seen_words: Record<string, { count: number; last_seen_at: string }>;
  updated_at: string;
};

const KEY = 'daber_progress_v1';

export function nowIso() {
  return new Date().toISOString();
}

export function emptyProgress(): ProgressV1 {
  return {
    version: 1,
    prefs: { mode: 'stroke', k: 5, augment: true, samples_per_letter: 5, practice_threshold: 0.5, pilot_wizard_done: false },
    practice_stats: { correct: 0, total: 0 },
    vocab_stats: { correct_letters: 0, total_letters: 0, words_completed: 0 },
    seen_words: {},
    updated_at: nowIso(),
  };
}

export function loadProgress(): ProgressV1 {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw) as ProgressV1;
    if (parsed && parsed.version === 1) return parsed;
    return emptyProgress();
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(p: ProgressV1) {
  p.updated_at = nowIso();
  localStorage.setItem(KEY, JSON.stringify(p));
}
