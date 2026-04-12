import type { LetterGlyph, Ranked } from './types';
import { dotPixels } from './distance';
import { normalizeUnit } from './features';
import { queryVariants } from './augment';

export type KnnDb = Record<LetterGlyph, Float32Array[]>;

// Build a flat list of (vector, label) pairs from the per-letter prototypes
// map. If `augment` is true we include ±1px cardinal shifts of every stored
// sample, ~5× the effective sample count.
export type FlatDb = { vectors: Float32Array[]; labels: LetterGlyph[] };

export function buildFlatDb(db: KnnDb, augment: boolean): FlatDb {
  const vectors: Float32Array[] = [];
  const labels: LetterGlyph[] = [];
  for (const [letter, arr] of Object.entries(db) as [LetterGlyph, Float32Array[]][]) {
    for (const v of arr) {
      vectors.push(v);
      labels.push(letter);
    }
  }
  return { vectors, labels };
}

// KNN scoring with cosine similarity. Each of the top-k neighbors contributes
// its similarity to the running vote for its label; the label with the
// highest summed vote wins. Matches reference/hebrewhandwritingweb/app.js
// `predictTopKnn` behavior, including the {prob, raw} shape used by the
// acceptance-margin check in Practice / Vocab tabs.
export function predictByKnn(
  vec: Float32Array,
  db: KnnDb,
  opts: { k: number; augment?: boolean; topN?: number; expectedLetter?: LetterGlyph } = { k: 5 },
): Ranked[] {
  // Normalize the query so cosine similarity is a pure dot product.
  const q = normalizeUnit(vec);
  const qVars = queryVariants(vec, opts.augment ?? false);
  const flat = buildFlatDb(db, false);
  const n = flat.vectors.length;
  if (n === 0) return [];

  // Find top-k using query-side shift invariance and a small running buffer
  // to avoid sorting the entire array.
  const k = Math.min(opts.k, n);
  const buf: { sim: number; label: LetterGlyph }[] = [];
  function bufMinIndex(): number {
    let mi = 0;
    for (let i = 1; i < buf.length; i++) if (buf[i].sim < buf[mi].sim) mi = i;
    return mi;
  }
  for (let i = 0; i < n; i++) {
    const v = flat.vectors[i];
    let best = -Infinity;
    // baseline on normalized q for the common case augment=false
    best = Math.max(best, dotPixels(q, v));
    if ((opts.augment ?? false) && qVars.length > 1) {
      for (let j = 1; j < qVars.length; j++) {
        const s = dotPixels(qVars[j], v);
        if (s > best) best = s;
      }
    }
    const item = { sim: best, label: flat.labels[i] };
    if (buf.length < k) {
      buf.push(item);
    } else if (k > 0) {
      const mi = bufMinIndex();
      if (item.sim > buf[mi].sim) buf[mi] = item;
    }
  }
  buf.sort((a, b) => b.sim - a.sim);
  const votes = new Map<LetterGlyph, number>();
  for (let i = 0; i < Math.min(k, buf.length); i++) {
    const s = buf[i];
    votes.set(s.label, (votes.get(s.label) ?? 0) + s.sim);
  }
  // Small prior boost for the expected letter — adds a fractional "virtual
  // vote" so the expected letter wins close ties. Equivalent to about half
  // a max-similarity neighbor voting for it.
  if (opts.expectedLetter && votes.size > 0) {
    const cur = votes.get(opts.expectedLetter) ?? 0;
    votes.set(opts.expectedLetter, cur + 0.4);
  }
  const total = Array.from(votes.values()).reduce((a, b) => a + b, 0) || 1;
  const ranked: Ranked[] = Array.from(votes.entries()).map(([letter, vote]) => ({
    letter,
    prob: vote / total,
    raw: vote / k,
  }));
  ranked.sort((a, b) => b.prob - a.prob);
  return ranked.slice(0, opts.topN ?? 5);
}
