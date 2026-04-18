import {
  cellItemsForScope,
  lessonScopeFor,
  lessons,
  scopedCellItems,
  type CellItem,
  type LessonJSON,
  type VocabEntry,
} from './content';
import type { CellProgress, PhraseProgress, ProgressV1, SessionStation } from './storage/progress';

export type { SessionStation } from './storage/progress';

export type SessionMode = 'free' | 'lesson';
export type SessionPurpose = 'new' | 'review' | 'build' | 'mixed';
export type SessionStageId =
  | 'core_meet'
  | 'core_write'
  | 'supporting_build'
  | 'core_reinforcement';

type PlannedItemBase = {
  purpose: SessionPurpose;
  stageId?: SessionStageId;
  stageLabel?: string;
  wasNewAtPlan: boolean;
};

export type PlannedCellItem = CellItem & PlannedItemBase & {
  taskType?: 'cell';
};

export type PlannedPhraseItem = PlannedItemBase & {
  taskType: 'phrase_handwriting';
  key: string;
  row: VocabEntry;
  sourceKeys: string[];
};

export type PlannedItem = PlannedCellItem | PlannedPhraseItem;

export type SessionStage = {
  id: SessionStageId;
  label: string;
  station: SessionStation;
  start: number;
  count: number;
};

export type SessionSummary = {
  id: string;
  mode: SessionMode;
  lessonId?: string;
  lessonTitle?: string;
  purpose: SessionPurpose;
  targetCount: number;
  itemsCompleted: number;
  clean: number;
  unclean: number;
  skipped: number;
  phrasesPracticed: number;
  newItemsSeen: number;
  lessonFinished: boolean;
};

export type DrillSession = {
  id: string;
  mode: SessionMode;
  lessonId?: string;
  lessonTitle?: string;
  purpose: SessionPurpose;
  targetCount: number;
  currentIndex: number;
  items: PlannedItem[];
  stages: SessionStage[];
  completed: boolean;
  summary: Omit<SessionSummary, 'lessonFinished' | 'newItemsSeen'> & {
    newItemKeys: string[];
  };
};

const FREE_TARGET = 14;
const LESSON_PRIMER_TARGET = 4;
const LESSON_PHRASE_TARGET = 6;
const LESSON_REVIEW_TARGET = 4;

function sessionId(mode: SessionMode, lessonId?: string) {
  return `${mode}:${lessonId || 'free'}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 7)}`;
}

function stateRank(c?: CellProgress) {
  if (!c) return 0;
  if (c.state === 'introduced') return 3;
  if (c.state === 'practicing') return 2;
  return 1;
}

function lastSeenRank(c?: CellProgress) {
  if (!c?.last_seen_at) return Number.MAX_SAFE_INTEGER;
  const t = Date.parse(c.last_seen_at);
  return Number.isFinite(t) ? Date.now() - t : Number.MAX_SAFE_INTEGER;
}

function sortForReview(items: CellItem[], progress: ProgressV1) {
  const cells = progress.cells || {};
  return [...items].sort((a, b) => {
    const ac = cells[a.key];
    const bc = cells[b.key];
    const stateDelta = stateRank(bc) - stateRank(ac);
    if (stateDelta) return stateDelta;
    const streakDelta = (ac?.streak || 0) - (bc?.streak || 0);
    if (streakDelta) return streakDelta;
    return lastSeenRank(bc) - lastSeenRank(ac);
  });
}

function shuffleLight<T>(items: T[]) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function plannedCell(item: PlannedItem | undefined): PlannedCellItem | undefined {
  return item && item.taskType !== 'phrase_handwriting' ? item : undefined;
}

function appendPlanned(
  out: PlannedItem[],
  candidates: CellItem[],
  count: number,
  progress: ProgressV1,
  purpose: SessionPurpose,
  stage?: Pick<PlannedItem, 'stageId' | 'stageLabel'>,
  options: { allowDuplicateKeys?: boolean } = {},
) {
  const used = new Set(out.map((x) => x.key));
  const usedInThisBlock = new Set<string>();
  const cells = progress.cells || {};
  for (let i = 0; i < count; i++) {
    const last = plannedCell(out[out.length - 1]);
    let pool = candidates.filter((item) => {
      if (!options.allowDuplicateKeys && used.has(item.key)) return false;
      if (options.allowDuplicateKeys && usedInThisBlock.has(item.key)) return false;
      return true;
    });
    if (!pool.length && options.allowDuplicateKeys) {
      usedInThisBlock.clear();
      pool = candidates;
    }
    if (!pool.length) return;
    const avoidSameLemma = pool.filter((item) => item.key !== last?.key && item.lemma !== last?.lemma);
    const avoidSameCell = pool.filter((item) => item.key !== last?.key);
    const pickPool = avoidSameLemma.length ? avoidSameLemma : (avoidSameCell.length ? avoidSameCell : pool);
    const picked = pickPool[0];
    out.push({
      ...picked,
      purpose,
      ...stage,
      wasNewAtPlan: !cells[picked.key],
    });
    used.add(picked.key);
    usedInThisBlock.add(picked.key);
  }
}

function buildAuthoredPhraseItems(lesson: LessonJSON, all: CellItem[], count: number): PlannedPhraseItem[] {
  const authored = lesson.build_phrases || [];
  return authored.filter((phrase) => phrase.drillable !== false).slice(0, count).map((phrase, phraseIndex) => ({
    taskType: 'phrase_handwriting',
    key: `phrase:${lesson.id}:authored:${phraseIndex}`,
    purpose: 'build',
    stageId: 'supporting_build',
    stageLabel: 'Build phrases',
    wasNewAtPlan: false,
    row: {
      he: phrase.he,
      en: phrase.en,
      prompt: phrase.prompt || phrase.en,
      span: phrase.span || 'phrase',
      pos: 'phrase',
      alternates: phrase.alternates,
    },
    sourceKeys: all.filter((item) => phrase.he.includes(item.row.he)).map((item) => item.key),
  }));
}

export function authoredPhraseItemsForLesson(lesson: LessonJSON): PlannedPhraseItem[] {
  const sourceItems = cellItemsForScope(lessonScopeFor(lesson));
  return buildAuthoredPhraseItems(lesson, sourceItems, Number.MAX_SAFE_INTEGER);
}

export function allAuthoredPhraseItems(): PlannedPhraseItem[] {
  return lessons.flatMap((lesson) => authoredPhraseItemsForLesson(lesson));
}

function phraseWeakness(stat?: PhraseProgress) {
  if (!stat) return 0;
  const misses = Math.max(0, stat.attempted - stat.clean);
  const incomplete = stat.clean > 0 ? 0 : 1;
  return misses * 3 + incomplete;
}

function sortPhrasesForReview(items: PlannedPhraseItem[], progress: ProgressV1) {
  const phrases = progress.phrases || {};
  return [...items]
    .filter((item) => {
      const stat = phrases[item.key];
      return !!stat && (stat.attempted > stat.clean || stat.clean < 2 || lastSeenRank({ last_seen_at: stat.last_seen_at } as CellProgress) > 24 * 60 * 60 * 1000);
    })
    .sort((a, b) => {
      const ap = phrases[a.key];
      const bp = phrases[b.key];
      const weaknessDelta = phraseWeakness(bp) - phraseWeakness(ap);
      if (weaknessDelta) return weaknessDelta;
      return lastSeenRank(bp ? ({ last_seen_at: bp.last_seen_at } as CellProgress) : undefined)
        - lastSeenRank(ap ? ({ last_seen_at: ap.last_seen_at } as CellProgress) : undefined);
    });
}

export function phraseItemsForReview(progress: ProgressV1, limit = 6): PlannedPhraseItem[] {
  return sortPhrasesForReview(allAuthoredPhraseItems(), progress).slice(0, limit).map((item) => ({
    ...item,
    purpose: 'review',
    stageId: undefined,
    stageLabel: undefined,
  }));
}

function appendPhraseStage(
  out: PlannedItem[],
  stages: SessionStage[],
  lesson: LessonJSON,
  sourceItems: CellItem[],
  count: number,
) {
  const start = out.length;
  const phraseItems = buildAuthoredPhraseItems(lesson, sourceItems, count);
  out.push(...phraseItems);
  if (phraseItems.length > 0) {
    stages.push({
      id: 'supporting_build',
      label: 'Build phrases',
      station: 'phrase',
      start,
      count: phraseItems.length,
    });
  }
}

function makeSummary(session: Omit<DrillSession, 'summary'>): DrillSession['summary'] {
  return {
    id: session.id,
    mode: session.mode,
    lessonId: session.lessonId,
    lessonTitle: session.lessonTitle,
    purpose: session.purpose,
    targetCount: session.targetCount,
    itemsCompleted: 0,
    clean: 0,
    unclean: 0,
    skipped: 0,
    phrasesPracticed: 0,
    newItemKeys: [],
  };
}

export function createFreeSession(progress: ProgressV1): DrillSession {
  const all = scopedCellItems(null);
  const cells = progress.cells || {};
  const phraseReview = phraseItemsForReview(progress, 4);
  const weak = sortForReview(
    all.filter((item) => {
      const c = cells[item.key];
      return c && c.attempts > c.correct;
    }),
    progress,
  );
  const review = sortForReview(
    all.filter((item) => {
      const c = cells[item.key];
      return c && (c.state !== 'mastered' || lastSeenRank(c) > 12 * 60 * 60 * 1000);
    }),
    progress,
  );
  const fresh = shuffleLight(all.filter((item) => !cells[item.key]));
  const fallback = shuffleLight(all);
  const items: PlannedItem[] = [];
  items.push(...phraseReview);
  appendPlanned(items, weak, 5, progress, 'review');
  appendPlanned(items, review, 5, progress, 'review');
  appendPlanned(items, fresh, 3, progress, 'new');
  appendPlanned(items, fresh, 1, progress, 'build');
  appendPlanned(items, fallback, FREE_TARGET - items.length, progress, 'mixed');

  const base: Omit<DrillSession, 'summary'> = {
    id: sessionId('free'),
    mode: 'free',
    purpose: 'mixed',
    targetCount: items.length,
    currentIndex: 0,
    items,
    stages: [],
    completed: items.length === 0,
  };
  return { ...base, summary: makeSummary(base) };
}

export function createLessonSession(lessonId: string, progress: ProgressV1): DrillSession {
  const lesson = lessons.find((l) => l.id === lessonId);
  if (!lesson) return createFreeSession(progress);

  const core = sortForReview(cellItemsForScope(lessonScopeFor(lesson, ['core'])), progress);
  const supporting = sortForReview(cellItemsForScope(lessonScopeFor(lesson, ['supporting'])), progress);
  const all = sortForReview(cellItemsForScope(lessonScopeFor(lesson)), progress);
  const items: PlannedItem[] = [];
  const stages: SessionStage[] = [];

  const addStage = (
    id: SessionStageId,
    label: string,
    station: SessionStation,
    candidates: CellItem[],
    purpose: SessionPurpose,
    count: number,
    allowDuplicateKeys = false,
  ) => {
    const start = items.length;
    const source = candidates.length ? candidates : all;
    const targetCount = Math.min(count, source.length || count);
    appendPlanned(items, source, targetCount, progress, purpose, { stageId: id, stageLabel: label }, { allowDuplicateKeys });
    const actual = items.length - start;
    if (actual > 0) stages.push({ id, label, station, start, count: actual });
  };

  const meetCount = Math.max(1, Math.ceil(LESSON_PRIMER_TARGET / 2));
  const writeCount = Math.max(1, LESSON_PRIMER_TARGET - meetCount);
  addStage('core_meet', 'Meet the forms', 'words', core, 'new', meetCount);
  addStage('core_write', 'Write by hand', 'write', core, 'build', writeCount, true);

  const reviewPool = supporting.length ? [...supporting, ...core] : all;
  appendPhraseStage(items, stages, lesson, reviewPool, LESSON_PHRASE_TARGET);

  addStage('core_reinforcement', 'Mixed review', 'review', reviewPool, 'review', LESSON_REVIEW_TARGET, true);

  const base: Omit<DrillSession, 'summary'> = {
    id: sessionId('lesson', lessonId),
    mode: 'lesson',
    lessonId,
    lessonTitle: lesson.title,
    purpose: 'mixed',
    targetCount: items.length,
    currentIndex: 0,
    items,
    stages,
    completed: items.length === 0,
  };
  return { ...base, summary: makeSummary(base) };
}

export function createDrillSession(mode: SessionMode, lessonId: string | null | undefined, progress: ProgressV1): DrillSession {
  if (mode === 'lesson' && lessonId) return createLessonSession(lessonId, progress);
  return createFreeSession(progress);
}

export function currentPlannedItem(session: DrillSession | null): PlannedItem | null {
  if (!session || session.completed) return null;
  return session.items[session.currentIndex] || null;
}

export function currentStage(session: DrillSession | null): (SessionStage & { ordinal: number; doneInStage: number }) | null {
  if (!session) return null;
  const idx = Math.min(session.currentIndex, Math.max(0, session.targetCount - 1));
  const stageIndex = session.stages.findIndex((stage) => idx >= stage.start && idx < stage.start + stage.count);
  if (stageIndex < 0) return null;
  const stage = session.stages[stageIndex];
  return { ...stage, ordinal: stageIndex + 1, doneInStage: Math.max(0, idx - stage.start) };
}

export function recordSessionResult(session: DrillSession, result: 'clean' | 'unclean' | 'skipped'): DrillSession {
  const item = currentPlannedItem(session);
  const summary = {
    ...session.summary,
    itemsCompleted: session.summary.itemsCompleted + 1,
    clean: session.summary.clean + (result === 'clean' ? 1 : 0),
    unclean: session.summary.unclean + (result === 'unclean' || result === 'skipped' ? 1 : 0),
    skipped: session.summary.skipped + (result === 'skipped' ? 1 : 0),
    phrasesPracticed: session.summary.phrasesPracticed + (item?.taskType === 'phrase_handwriting' ? 1 : 0),
    newItemKeys: [...session.summary.newItemKeys],
  };
  if (item?.wasNewAtPlan && !summary.newItemKeys.includes(item.key)) {
    summary.newItemKeys.push(item.key);
  }
  const nextIndex = session.currentIndex + 1;
  return {
    ...session,
    currentIndex: nextIndex,
    completed: nextIndex >= session.targetCount,
    summary,
  };
}

export function finalSummary(session: DrillSession): SessionSummary {
  return {
    ...session.summary,
    newItemsSeen: session.summary.newItemKeys.length,
    lessonFinished: session.mode === 'lesson' && session.completed,
  };
}
