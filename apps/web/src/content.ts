// Thin wrapper around the built @daber/content vocab artifact.
//
// The content package emits `dist/vocab.json` via `npm -w packages/content
// run build`. If that build hasn't run yet we fall back to an empty array so
// Vite doesn't fail to start — the Vocab tab will just show an empty state.

export type VocabEntry = { he: string; en: string; pos: string; variant?: string; lemma?: string };

// Vite's import.meta.glob with `eager: true` statically bundles matching
// files, but tolerates zero matches (it yields an empty record). This gives
// us a build-time optional import for the generated vocab.json.
const modules = import.meta.glob('../../../packages/content/dist/vocab.json', {
  eager: true,
  import: 'default',
}) as Record<string, VocabEntry[]>;

const first = Object.values(modules)[0];
export const vocab: VocabEntry[] = Array.isArray(first) ? first : [];

// Optional curriculum import; tolerates absence during dev
const currMods = import.meta.glob('../../../packages/content/dist/curriculum.json', {
  eager: true,
  import: 'default',
}) as Record<string, { verbs: Record<string, string[]>; adjectives: Record<string, string[]>; nouns: Record<string, string[]>; tokens: { verb: string[]; adjective: string[]; noun: string[] }; chapters?: { verbs?: string[]; adjectives?: string[]; nouns?: string[] } }>;
const firstCurr = Object.values(currMods)[0];
const curriculum = firstCurr || { verbs: {}, tokens: [] };
export const curriculumData = curriculum;
export const activeChapters: string[] = (() => {
  const set = new Set<string>();
  const ch = (curriculum as any)?.chapters || {};
  for (const s of ch.verbs || []) set.add(String(s));
  for (const s of ch.adjectives || []) set.add(String(s));
  for (const s of ch.nouns || []) set.add(String(s));
  return Array.from(set);
})();

import { progress } from './state/signals';
import { getActiveVerbTokens } from './curriculum_active';

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

  // Eligible cells from curriculum across POS with a corresponding vocab row
  const items: { key: string; row: VocabEntry }[] = [];
  // Verbs
  const effectiveVerbs = getActiveVerbTokens(curriculumData.verbs || {});
  for (const [lemma, tokens] of Object.entries(effectiveVerbs || {})) {
    for (const token of tokens) {
      const key = `verb:${lemma}:${token}`;
      const row = vmap.get(key);
      if (!row) continue;
      if (row.he.replace(/\s/g, '').length < 3) continue;
      items.push({ key, row });
    }
  }
  // Adjectives
  for (const [lemma, tokens] of Object.entries(curriculumData.adjectives || {})) {
    for (const token of tokens) {
      const key = `adjective:${lemma}:${token}`;
      const row = amap.get(key);
      if (!row) continue;
      if (row.he.replace(/\s/g, '').length < 3) continue;
      items.push({ key, row });
    }
  }
  // Nouns
  for (const [lemma, tokens] of Object.entries(curriculumData.nouns || {})) {
    for (const token of tokens) {
      const key = `noun:${lemma}:${token}`;
      const row = nmap.get(key);
      if (!row) continue;
      if (row.he.replace(/\s/g, '').length < 3) continue;
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
  const wouldViolateDepthCap = (lemma: string) => last1 === lemma && last2 === lemma;
  const breadthCheck = (lemma: string) => {
    if (pickCount < 9) return true;
    const arr = [...recentLemmas.slice(-9), lemma];
    return new Set(arr).size >= 3;
  };
  const noveltyBudget = 3; // 2–4 target; pick 3 as default
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
    if (isNewCell(key) && newCells >= noveltyBudget) return false;
    if (pickCount < 2 && !isEasy(row)) return false; // warm-up
    return true;
  };

  const filtered = items.filter(applyGuards);

  const source = filtered.length ? filtered : items;

  const weighted = source.map(({ key, row }) => {
    const c = cells[key];
    const w = stateWeight(c?.state) * recency(c?.last_seen_at) * difficulty(c?.streak);
    return { item: row, weight: w };
  });
  const picked = pickWeighted(weighted);
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
  }
  pickCount++;
  (randomVocabEntryByCell as any)._recentLemmas = recentLemmas;
  (randomVocabEntryByCell as any)._seenCells = seenCells;
  (randomVocabEntryByCell as any)._pickCount = pickCount;
  (randomVocabEntryByCell as any)._newCells = newCells;
  return picked;
}
