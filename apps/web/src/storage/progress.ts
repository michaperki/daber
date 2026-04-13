export type CellState = 'introduced' | 'practicing' | 'mastered';

export type CellProgress = {
  state: CellState;
  streak: number;
  correct: number;
  attempts: number;
  last_seen_at?: string;
};

export type ProgressV1 = {
  version: 1;
  prefs: {
    sound_enabled: boolean;
    haptics_enabled: boolean;
  };
  practice_stats: { correct: number; total: number };
  vocab_stats: { correct_letters: number; total_letters: number; words_completed: number };
  // Per-word performance stats
  seen_words: Record<string, { seen: number; clean: number; attempted: number }>;
  // Per-cell progress (verb:<lemma>:<token>)
  cells?: Record<string, CellProgress>;
  updated_at: string;
};

const KEY = 'daber_progress_v1';

export function nowIso() {
  return new Date().toISOString();
}

export function emptyProgress(): ProgressV1 {
  return {
    version: 1,
    prefs: { sound_enabled: true, haptics_enabled: true },
    practice_stats: { correct: 0, total: 0 },
    vocab_stats: { correct_letters: 0, total_letters: 0, words_completed: 0 },
    seen_words: {},
    cells: {},
    updated_at: nowIso(),
  };
}

export function loadProgress(): ProgressV1 {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw) as any;
    if (parsed && parsed.version === 1) {
      // Migrate legacy seen_words shape { count, last_seen_at } → { seen, clean, attempted }
      const sw = parsed.seen_words || {};
      const migrated: Record<string, { seen: number; clean: number; attempted: number }> = {};
      for (const [he, v] of Object.entries(sw)) {
        if (v && typeof v === 'object' && 'seen' in (v as any)) {
          migrated[he] = v as any;
        } else if (v && typeof v === 'object' && 'count' in (v as any)) {
          const count = Math.max(0, Number((v as any).count) || 0);
          migrated[he] = { seen: count, clean: count, attempted: count };
        } else {
          migrated[he] = { seen: 0, clean: 0, attempted: 0 };
        }
      }
      parsed.seen_words = migrated;
      // Migrate prefs: ensure sound/haptics present; add cell selector flag default
      const p = parsed.prefs || {};
      parsed.prefs = {
        sound_enabled: typeof p.sound_enabled === 'boolean' ? p.sound_enabled : true,
        haptics_enabled: typeof p.haptics_enabled === 'boolean' ? p.haptics_enabled : true,
      };
      if (!parsed.cells) parsed.cells = {};
      return parsed as ProgressV1;
    }
    return emptyProgress();
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(p: ProgressV1) {
  p.updated_at = nowIso();
  localStorage.setItem(KEY, JSON.stringify(p));
}
