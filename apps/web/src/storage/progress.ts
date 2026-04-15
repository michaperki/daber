export type CellState = 'introduced' | 'practicing' | 'mastered';

export type CellProgress = {
  state: CellState;
  streak: number;
  correct: number;
  attempts: number;
  last_seen_at?: string;
};

export type LessonStatus = 'not_started' | 'in_progress' | 'completed';

export type LessonStageProgress = {
  id: string;
  label: string;
  count: number;
  completed: number;
};

export type LessonProgress = {
  status: LessonStatus;
  first_started_at?: string;
  last_practiced_at?: string;
  last_completed_at?: string;
  sessions_started: number;
  sessions_completed: number;
  items_completed: number;
  target_count: number;
  stages: LessonStageProgress[];
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
  lessons?: Record<string, LessonProgress>;
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
    lessons: {},
    updated_at: nowIso(),
  };
}

function normalizeLessonProgress(raw: any): LessonProgress | null {
  if (!raw || typeof raw !== 'object') return null;
  const status: LessonStatus =
    raw.status === 'completed' ? 'completed' : raw.status === 'in_progress' ? 'in_progress' : 'not_started';
  const stages = Array.isArray(raw.stages)
    ? raw.stages.map((stage: any) => ({
      id: String(stage?.id || ''),
      label: String(stage?.label || stage?.id || ''),
      count: Math.max(0, Number(stage?.count) || 0),
      completed: Math.max(0, Number(stage?.completed) || 0),
    })).filter((stage: LessonStageProgress) => stage.id && stage.count > 0)
    : [];
  return {
    status,
    first_started_at: typeof raw.first_started_at === 'string' ? raw.first_started_at : undefined,
    last_practiced_at: typeof raw.last_practiced_at === 'string' ? raw.last_practiced_at : undefined,
    last_completed_at: typeof raw.last_completed_at === 'string' ? raw.last_completed_at : undefined,
    sessions_started: Math.max(0, Number(raw.sessions_started) || 0),
    sessions_completed: Math.max(0, Number(raw.sessions_completed) || 0),
    items_completed: Math.max(0, Number(raw.items_completed) || 0),
    target_count: Math.max(0, Number(raw.target_count) || 0),
    stages,
  };
}

export function normalizeProgress(parsed: any): ProgressV1 {
  const base = emptyProgress();
  if (!parsed || parsed.version !== 1) return base;

  // Migrate legacy seen_words shape { count, last_seen_at } -> { seen, clean, attempted }
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

  const prefs = parsed.prefs || {};
  const lessons: Record<string, LessonProgress> = {};
  for (const [lessonId, value] of Object.entries(parsed.lessons || {})) {
    const normalized = normalizeLessonProgress(value);
    if (normalized) lessons[lessonId] = normalized;
  }

  return {
    ...base,
    ...parsed,
    prefs: {
      sound_enabled: typeof prefs.sound_enabled === 'boolean' ? prefs.sound_enabled : true,
      haptics_enabled: typeof prefs.haptics_enabled === 'boolean' ? prefs.haptics_enabled : true,
    },
    practice_stats: parsed.practice_stats || base.practice_stats,
    vocab_stats: parsed.vocab_stats || base.vocab_stats,
    seen_words: migrated,
    cells: parsed.cells || {},
    lessons,
    updated_at: typeof parsed.updated_at === 'string' ? parsed.updated_at : base.updated_at,
  };
}

export function lessonProgressFor(progress: ProgressV1, lessonId: string): LessonProgress {
  return progress.lessons?.[lessonId] || {
    status: 'not_started',
    sessions_started: 0,
    sessions_completed: 0,
    items_completed: 0,
    target_count: 0,
    stages: [],
  };
}

export function loadProgress(): ProgressV1 {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyProgress();
    return normalizeProgress(JSON.parse(raw));
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(p: ProgressV1) {
  p.updated_at = nowIso();
  localStorage.setItem(KEY, JSON.stringify(p));
}
