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
}) as Record<string, { verbs: Record<string, string[]>; tokens: string[] }>;
const firstCurr = Object.values(currMods)[0];
const curriculum = firstCurr || { verbs: {}, tokens: [] };
export const curriculumData = curriculum;

import { progress } from './state/signals';

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
  // Build lemma+token → row index for verbs
  const map = new Map<string, VocabEntry>();
  for (const e of vocab) {
    if (e.pos !== 'verb') continue;
    const lemma = e.lemma || (e.variant ? undefined : e.he);
    const token = e.variant || 'lemma';
    if (!lemma) continue;
    map.set(`verb:${lemma}:${token}`, e);
  }

  // Eligible cells from curriculum that have a corresponding vocab row
  const items: { key: string; row: VocabEntry }[] = [];
  for (const [lemma, tokens] of Object.entries(curriculumData.verbs || {})) {
    for (const token of tokens) {
      const key = `verb:${lemma}:${token}`;
      const row = map.get(key);
      if (!row) continue; // skip if no built row (missing labels)
      if (row.he.replace(/\s/g, '').length < 3) continue; // skip short
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

  const weighted = items.map(({ key, row }) => {
    const c = cells[key];
    const w = stateWeight(c?.state) * recency(c?.last_seen_at) * difficulty(c?.streak);
    return { item: row, weight: w };
  });
  return pickWeighted(weighted);
}
