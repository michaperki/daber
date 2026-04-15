// Thin wrapper around the built @daber/content vocab artifact.
//
// The content package emits `dist/vocab.json` via `npm -w packages/content
// run build`. If that build hasn't run yet we fall back to an empty array so
// Vite doesn't fail to start — the Vocab tab will just show an empty state.

export type VocabEntry = { he: string; en: string; pos: string; variant?: string; lemma?: string };
export type CellItem = {
  key: string;
  row: VocabEntry;
  pos: string;
  lemma: string;
  token: string;
};
type LessonScope = {
  verbs: Record<string, string[]>;
  adjectives: Record<string, string[]>;
  nouns: Record<string, string[]>;
};

// Vite's import.meta.glob with `eager: true` statically bundles matching
// files, but tolerates zero matches (it yields an empty record). This gives
// us a build-time optional import for the generated vocab.json.
const modules = import.meta.glob('../../../packages/content/dist/vocab.json', {
  eager: true,
  import: 'default',
}) as Record<string, VocabEntry[]>;

const first = Object.values(modules)[0];
export const vocab: VocabEntry[] = Array.isArray(first) ? first : [];

// Optional lessons import; tolerates absence during dev
export type LessonJSON = {
  id: string;
  title: string;
  tagline?: string;
  estimated_minutes?: number;
  endpoint?: { description?: string };
  core?: { verbs?: Record<string, string[]>; adjectives?: Record<string, string[]>; nouns?: Record<string, string[]> };
  supporting?: { verbs?: Record<string, string[]>; adjectives?: Record<string, string[]>; nouns?: Record<string, string[]> };
  phases?: { id: string; title?: string; goal?: string }[];
  wishlist?: string[];
};
const lessonMods = import.meta.glob('../../../packages/content/dist/lessons.json', {
  eager: true,
  import: 'default',
}) as Record<string, LessonJSON[]>;
export const lessons: LessonJSON[] = Array.isArray(Object.values(lessonMods)[0]) ? (Object.values(lessonMods)[0] as LessonJSON[]) : [];

import { progress, selectedLessonId } from './state/signals';

function emptyLessonScope(): LessonScope {
  return { verbs: {}, adjectives: {}, nouns: {} };
}

function mergeScope(dst: LessonScope, src?: LessonScope | LessonJSON['core']) {
  if (!src) return;
  const merge = (kind: keyof LessonScope) => {
    for (const [lemma, toks] of Object.entries(src[kind] || {})) {
      if (!dst[kind][lemma]) dst[kind][lemma] = [];
      const set = new Set(dst[kind][lemma]);
      for (const t of toks) set.add(t);
      dst[kind][lemma] = Array.from(set);
    }
  };
  merge('verbs');
  merge('adjectives');
  merge('nouns');
}

function buildMaps() {
  const vmap = new Map<string, VocabEntry>();
  const amap = new Map<string, VocabEntry>();
  const nmap = new Map<string, VocabEntry>();
  for (const e of vocab) {
    const meta = cellMetaForEntry(e);
    if (!meta) continue;
    if (e.pos === 'verb') vmap.set(meta.key, e);
    else if (e.pos === 'adjective') amap.set(meta.key, e);
    else if (e.pos === 'noun') nmap.set(meta.key, e);
  }
  return { vmap, amap, nmap };
}

export function cellMetaForEntry(row: VocabEntry): Omit<CellItem, 'row'> | null {
  if (row.pos !== 'verb' && row.pos !== 'adjective' && row.pos !== 'noun') return null;
  const lemma = row.lemma || (row.variant ? undefined : row.he);
  const token = row.variant || (row.pos === 'verb' ? 'lemma' : row.pos === 'noun' ? 'sg' : 'm_sg');
  if (!lemma || !token) return null;
  return { key: `${row.pos}:${lemma}:${token}`, pos: row.pos, lemma, token };
}

export function lessonScopeFor(lesson: LessonJSON, parts: Array<'core' | 'supporting'> = ['core', 'supporting']): LessonScope {
  const scoped = emptyLessonScope();
  for (const part of parts) mergeScope(scoped, lesson[part]);
  return scoped;
}

export function datasetScope(): LessonScope {
  const scoped = emptyLessonScope();
  for (const e of vocab) {
    const meta = cellMetaForEntry(e);
    if (!meta) continue;
    const kind = e.pos === 'verb' ? 'verbs' : e.pos === 'adjective' ? 'adjectives' : 'nouns';
    if (!scoped[kind][meta.lemma]) scoped[kind][meta.lemma] = [];
    if (!scoped[kind][meta.lemma].includes(meta.token)) scoped[kind][meta.lemma].push(meta.token);
  }
  return scoped;
}

export function cellItemsForScope(scope: LessonScope): CellItem[] {
  const { vmap, amap, nmap } = buildMaps();
  const items: CellItem[] = [];
  for (const [lemma, tokens] of Object.entries(scope.verbs || {})) {
    for (const token of tokens) {
      const key = `verb:${lemma}:${token}`;
      const row = vmap.get(key);
      if (row) items.push({ key, row, pos: 'verb', lemma, token });
    }
  }
  for (const [lemma, tokens] of Object.entries(scope.adjectives || {})) {
    for (const token of tokens) {
      const key = `adjective:${lemma}:${token}`;
      const row = amap.get(key);
      if (row) items.push({ key, row, pos: 'adjective', lemma, token });
    }
  }
  for (const [lemma, tokens] of Object.entries(scope.nouns || {})) {
    for (const token of tokens) {
      const key = `noun:${lemma}:${token}`;
      const row = nmap.get(key);
      if (row) items.push({ key, row, pos: 'noun', lemma, token });
    }
  }
  return items;
}

export function scopedCellItems(lessonId?: string | null): CellItem[] {
  const activeLesson = lessonId ? lessons.find((l) => l.id === lessonId) : null;
  return cellItemsForScope(activeLesson ? lessonScopeFor(activeLesson) : datasetScope());
}

function pickWeighted<T>(items: { item: T; weight: number }[]): T | null {
  const total = items.reduce((s, x) => s + x.weight, 0);
  if (total <= 0) return items.length ? items[Math.floor(Math.random() * items.length)].item : null;
  let r = Math.random() * total;
  for (const { item, weight } of items) {
    r -= weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1]?.item ?? null;
}

export function randomVocabEntry(): VocabEntry | null {
  if (!vocab.length) return null;
  return randomVocabEntryByCell();
}

function randomVocabEntryByCell(): VocabEntry | null {
  // Session guardrails
  const recentLemmas: string[] = (randomVocabEntryByCell as any)._recentLemmas || [];
  const recentKeys: string[] = (randomVocabEntryByCell as any)._recentKeys || [];
  const seenCells: Set<string> = (randomVocabEntryByCell as any)._seenCells || new Set();
  let pickCount: number = (randomVocabEntryByCell as any)._pickCount || 0;
  let newCells: number = (randomVocabEntryByCell as any)._newCells || 0;

  // Build lemma+token → row index per POS
  const vmap = new Map<string, VocabEntry>();
  const amap = new Map<string, VocabEntry>();
  const nmap = new Map<string, VocabEntry>();
  for (const e of vocab) {
    if (e.pos === 'verb') {
      const lemma = e.lemma || (e.variant ? undefined : e.he);
      const token = e.variant || 'lemma';
      if (lemma) vmap.set(`verb:${lemma}:${token}`, e);
    } else if (e.pos === 'adjective') {
      const lemma = e.lemma || (e.variant ? undefined : e.he);
      const token = e.variant || 'm_sg';
      if (lemma && token) amap.set(`adjective:${lemma}:${token}`, e);
    } else if (e.pos === 'noun') {
      const lemma = e.lemma || (e.variant ? undefined : e.he);
      const token = e.variant || 'sg';
      if (lemma && token) nmap.set(`noun:${lemma}:${token}`, e);
    }
  }

  // Build scope: prefer active lesson (core+supporting); else derive from dataset
  const activeLesson = selectedLessonId.value ? lessons.find((l) => l.id === selectedLessonId.value) : null;
  const scoped: { verbs: Record<string, string[]>; adjectives: Record<string, string[]>; nouns: Record<string, string[]> } = {
    verbs: {}, adjectives: {}, nouns: {},
  };
  if (activeLesson) {
    const merge = (dst: Record<string, string[]>, src?: Record<string, string[]>) => {
      for (const [lemma, toks] of Object.entries(src || {})) {
        if (!dst[lemma]) dst[lemma] = [];
        const set = new Set(dst[lemma]);
        for (const t of toks) set.add(t);
        dst[lemma] = Array.from(set);
      }
    };
    merge(scoped.verbs, activeLesson.core?.verbs);
    merge(scoped.verbs, activeLesson.supporting?.verbs);
    merge(scoped.adjectives, activeLesson.core?.adjectives);
    merge(scoped.adjectives, activeLesson.supporting?.adjectives);
    merge(scoped.nouns, activeLesson.core?.nouns);
    merge(scoped.nouns, activeLesson.supporting?.nouns);
  } else {
    // Derive a broad baseline from the dataset itself: include all tokens present.
    for (const e of vocab) {
      const lemma = e.lemma || (e.variant ? undefined : e.he);
      const token = e.variant || (e.pos === 'verb' ? 'lemma' : e.pos === 'noun' ? 'sg' : 'm_sg');
      if (!lemma || !token) continue;
      if (e.pos === 'verb') {
        if (!scoped.verbs[lemma]) scoped.verbs[lemma] = [];
        if (!scoped.verbs[lemma].includes(token)) scoped.verbs[lemma].push(token);
      } else if (e.pos === 'adjective') {
        if (!scoped.adjectives[lemma]) scoped.adjectives[lemma] = [];
        if (!scoped.adjectives[lemma].includes(token)) scoped.adjectives[lemma].push(token);
      } else if (e.pos === 'noun') {
        if (!scoped.nouns[lemma]) scoped.nouns[lemma] = [];
        if (!scoped.nouns[lemma].includes(token)) scoped.nouns[lemma].push(token);
      }
    }
  }

  // Eligible cells from scope across POS with a corresponding vocab row
  const items: { key: string; row: VocabEntry }[] = [];
  // Verbs
  for (const [lemma, tokens] of Object.entries(scoped.verbs || {})) {
    for (const token of tokens) {
      const key = `verb:${lemma}:${token}`;
      const row = vmap.get(key);
      if (!row) continue;
      items.push({ key, row });
    }
  }
  // Adjectives
  for (const [lemma, tokens] of Object.entries(scoped.adjectives || {})) {
    for (const token of tokens) {
      const key = `adjective:${lemma}:${token}`;
      const row = amap.get(key);
      if (!row) continue;
      items.push({ key, row });
    }
  }
  // Nouns
  for (const [lemma, tokens] of Object.entries(scoped.nouns || {})) {
    for (const token of tokens) {
      const key = `noun:${lemma}:${token}`;
      const row = nmap.get(key);
      if (!row) continue;
      items.push({ key, row });
    }
  }
  if (!items.length) return null;

  // Weighting: state (introduced=6, practicing=3, mastered=1) × recency × difficulty
  const p = progress.value;
  const cells = p.cells || {};
  const now = Date.now();
  const stateWeight = (s: string | undefined) => (s === 'mastered' ? 1 : s === 'practicing' ? 3 : 6);
  const recency = (ts?: string) => {
    if (!ts) return 4; // unseen
    const ms = Math.max(0, now - Date.parse(ts));
    const hours = ms / 3.6e6;
    return 1 + Math.min(3, Math.floor(hours / 12));
  };
  const difficulty = (streak?: number) => 1 + Math.max(0, 3 - (streak || 0));

  // Guardrails
  const last1 = recentLemmas[recentLemmas.length - 1];
  const last2 = recentLemmas[recentLemmas.length - 2];
  const lastKey = recentKeys[recentKeys.length - 1];
  const wouldViolateDepthCap = (lemma: string) => last1 === lemma && last2 === lemma;
  const breadthCheck = (lemma: string) => {
    if (pickCount < 9) return true;
    const arr = [...recentLemmas.slice(-9), lemma];
    return new Set(arr).size >= 3;
  };
  // Novelty detection
  const distinctSeen = (seenCells?.size || 0);
  const isNewCell = (key: string) => !cells[key] && !seenCells.has(key);
  const isEasy = (row: VocabEntry) => {
    const short = (row.he || '').replace(/\s/g, '').length <= 4;
    if (row.pos === 'noun' || row.pos === 'adjective') return short;
    if (row.pos === 'verb') return short && (!!row.variant && row.variant.startsWith('present_') || row.variant === 'lemma');
    return short;
  };

  const applyGuards = ({ key, row }: { key: string; row: VocabEntry }) => {
    const parts = key.split(':');
    const lemma = parts[1] || row.lemma || row.he;
    if (!lemma) return false;
    if (wouldViolateDepthCap(lemma)) return false;
    if (!breadthCheck(lemma)) return false;
    if (pickCount < 2 && !isEasy(row)) return false; // warm-up
    return true;
  };

  const filtered = items.filter(applyGuards);
  // Relaxed guards (only enforce depth cap and warm-up) to avoid collapsing
  // to a tiny candidate set early in the session or with small datasets.
  const relaxedGuards = ({ key, row }: { key: string; row: VocabEntry }) => {
    const parts = key.split(':');
    const lemma = parts[1] || row.lemma || row.he;
    if (!lemma) return true;
    if (wouldViolateDepthCap(lemma)) return false;
    if (pickCount < 2 && !isEasy(row)) return false; // warm-up bias
    return true;
  };
  const relaxed = items.filter(relaxedGuards);

  const MIN_POOL = Math.min(15, items.length);
  const baseSource = filtered.length >= MIN_POOL ? filtered : (relaxed.length >= MIN_POOL ? relaxed : items);
  const avoidSameLemmaAndCell = baseSource.filter(({ key, row }) => {
    const lemma = key.split(':')[1] || row.lemma || row.he;
    return key !== lastKey && lemma !== last1;
  });
  const avoidSameCell = baseSource.filter(({ key }) => key !== lastKey);
  const source = avoidSameLemmaAndCell.length ? avoidSameLemmaAndCell : (avoidSameCell.length ? avoidSameCell : baseSource);

  const weightedEntries = source.map(({ key, row }) => {
    const c = cells[key];
    const w = stateWeight(c?.state) * recency(c?.last_seen_at) * difficulty(c?.streak);
    return { key, item: row, weight: w };
  });
  const newBucket = weightedEntries.filter((e) => isNewCell(e.key)).map(({ item, weight }) => ({ item, weight }));
  const oldBucket = weightedEntries.filter((e) => !isNewCell(e.key)).map(({ item, weight }) => ({ item, weight }));
  const pNew = pickCount < 20 ? 0.5 : (distinctSeen < 100 ? 0.3 : 0.1);
  const chooseNew = Math.random() < pNew;
  const picked = chooseNew ? (newBucket.length ? pickWeighted(newBucket) : (oldBucket.length ? pickWeighted(oldBucket) : null))
                           : (oldBucket.length ? pickWeighted(oldBucket) : (newBucket.length ? pickWeighted(newBucket) : null));
  if (!picked) return null;
  // Update session trackers
  const pos = picked.pos;
  const lemma = picked.lemma || (picked.variant ? undefined : picked.he);
  const token = picked.variant || (pos === 'verb' ? 'lemma' : pos === 'noun' ? 'sg' : 'm_sg');
  if (lemma && token) {
    const key = `${pos}:${lemma}:${token}`;
    if (!cells[key] && !seenCells.has(key)) newCells++;
    seenCells.add(key);
    recentLemmas.push(lemma);
    if (recentLemmas.length > 10) recentLemmas.shift();
    recentKeys.push(key);
    if (recentKeys.length > 10) recentKeys.shift();
  }
  pickCount++;
  (randomVocabEntryByCell as any)._recentLemmas = recentLemmas;
  (randomVocabEntryByCell as any)._recentKeys = recentKeys;
  (randomVocabEntryByCell as any)._seenCells = seenCells;
  (randomVocabEntryByCell as any)._pickCount = pickCount;
  (randomVocabEntryByCell as any)._newCells = newCells;
  return picked;
}
