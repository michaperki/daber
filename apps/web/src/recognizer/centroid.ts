import type { LetterGlyph, Ranked } from './types';
import { dot } from './distance';
import { normalizeUnit } from './features';
import { augmentCardinal } from './augment';

export type Prototypes = Record<LetterGlyph, Float32Array[]>;

// One averaged + re-normalized prototype per class. Includes augmentation
// variants when `augment` is true. Cached per call — callers that rebuild
// often should memoize upstream.
export function computeCentroids(
  db: Prototypes,
  augment: boolean,
): Partial<Record<LetterGlyph, Float32Array>> {
  const out: Partial<Record<LetterGlyph, Float32Array>> = {};
  for (const [letter, arr] of Object.entries(db) as [LetterGlyph, Float32Array[]][]) {
    if (!arr || arr.length === 0) continue;
    const dim = arr[0].length;
    const acc = new Float32Array(dim);
    let n = 0;
    for (const v of arr) {
      for (let i = 0; i < dim; i++) acc[i] += v[i];
      n++;
      if (augment) {
        for (const aug of augmentCardinal(v)) {
          for (let i = 0; i < dim; i++) acc[i] += aug[i];
          n++;
        }
      }
    }
    if (!n) continue;
    for (let i = 0; i < dim; i++) acc[i] /= n;
    out[letter] = normalizeUnit(acc);
  }
  return out;
}

export function predictByCentroid(
  vec: Float32Array,
  db: Prototypes,
  opts: { augment?: boolean; topN?: number } = {},
): Ranked[] {
  const topN = opts.topN ?? 5;
  const centroids = computeCentroids(db, opts.augment ?? false);
  const q = normalizeUnit(vec);
  const scored: { letter: LetterGlyph; raw: number }[] = [];
  for (const [letter, c] of Object.entries(centroids) as [LetterGlyph, Float32Array][]) {
    scored.push({ letter, raw: dot(q, c) });
  }
  scored.sort((a, b) => b.raw - a.raw);
  const top = scored.slice(0, topN);
  // Softmax-like probs for readability. Temperature matches the reference
  // app (see reference/hebrewhandwritingweb/app.js predictTopCentroid).
  const temp = 10;
  const exps = top.map((s) => Math.exp(s.raw * temp));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return top.map((s, i) => ({ letter: s.letter, prob: exps[i] / sum, raw: s.raw }));
}
