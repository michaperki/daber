import {
  cellItemsForScope,
  lessonScopeFor,
  lessons,
  scopedCellItems,
  type CellItem,
  type LessonJSON,
  type VocabEntry,
} from './content';
import type { CellProgress, ProgressV1 } from './storage/progress';

export type SessionMode = 'free' | 'lesson';
export type SessionPurpose = 'new' | 'review' | 'build' | 'mixed';
export type SessionStageId = 'core_exposure' | 'core_reinforcement' | 'supporting_build';

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
    stageLabel: 'Build/use',
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
    stages.push({ id: 'supporting_build', label: 'Build/use', start, count: phraseItems.length });
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
    newItemKeys: [],
  };
}

export function createFreeSession(progress: ProgressV1): DrillSession {
  const all = scopedCellItems(null);
  const cells = progress.cells || {};
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
    candidates: CellItem[],
    purpose: SessionPurpose,
    count: number,
    allowDuplicateKeys = false,
  ) => {
    const start = items.length;
    const source = candidates.length ? candidates : all;
    const targetCount = Math.min(count, source.length);
    appendPlanned(items, source, targetCount, progress, purpose, { stageId: id, stageLabel: label }, { allowDuplicateKeys });
    const actual = items.length - start;
    if (actual > 0) stages.push({ id, label, start, count: actual });
  };

  addStage('core_exposure', 'Quick primer', core, 'new', LESSON_PRIMER_TARGET);

  const reviewPool = supporting.length ? [...supporting, ...core] : all;
  appendPhraseStage(items, stages, lesson, reviewPool, LESSON_PHRASE_TARGET);

  if (stages.some((stage) => stage.id === 'supporting_build')) {
    addStage('core_reinforcement', 'Mixed review', reviewPool, 'review', LESSON_REVIEW_TARGET);
  } else {
    addStage('supporting_build', 'Build/use', reviewPool, 'build', LESSON_PHRASE_TARGET);
  }

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
