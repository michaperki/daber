import type { LetterGlyph, Ranked } from './types';
import { dotPixels } from './distance';
import { normalizeUnit } from './features';
import { queryVariants } from './augment';

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
  opts: { augment?: boolean; topN?: number; expectedLetter?: LetterGlyph } = {},
): Ranked[] {
  const topN = opts.topN ?? 5;
  const centroids = computeCentroids(db, false);
  const q = normalizeUnit(vec);
  const qVars = queryVariants(vec, opts.augment ?? false);
  // Small prior boost for the expected letter — helps in close calls without
  // overwhelming genuine evidence. 0.04 on raw cosine ≈ ~50% prob boost after
  // softmax with temp=10.
  const prior = opts.expectedLetter ? 0.04 : 0;
  const scored: { letter: LetterGlyph; raw: number }[] = [];
  for (const [letter, c] of Object.entries(centroids) as [LetterGlyph, Float32Array][]) {
    const boost = letter === opts.expectedLetter ? prior : 0;
    let best = dotPixels(q, c);
    if ((opts.augment ?? false) && qVars.length > 1) {
      for (let j = 1; j < qVars.length; j++) {
        const s = dotPixels(qVars[j], c);
        if (s > best) best = s;
      }
    }
    scored.push({ letter, raw: best + boost });
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
