import type { LetterGlyph, Ranked } from './types';
import { dot } from './distance';
import { augmentCardinal } from './augment';

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
      if (augment) {
        for (const aug of augmentCardinal(v)) {
          vectors.push(aug);
          labels.push(letter);
        }
      }
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
  opts: { k: number; augment?: boolean; topN?: number } = { k: 5 },
): Ranked[] {
  const flat = buildFlatDb(db, opts.augment ?? false);
  const n = flat.vectors.length;
  if (n === 0) return [];

  const sims = new Array<{ sim: number; label: LetterGlyph }>(n);
  for (let i = 0; i < n; i++) {
    sims[i] = { sim: dot(vec, flat.vectors[i]), label: flat.labels[i] };
  }
  sims.sort((a, b) => b.sim - a.sim);

  const k = Math.min(opts.k, n);
  const votes = new Map<LetterGlyph, number>();
  for (let i = 0; i < k; i++) {
    const s = sims[i];
    votes.set(s.label, (votes.get(s.label) ?? 0) + s.sim);
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
