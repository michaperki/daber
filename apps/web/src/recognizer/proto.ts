import type { Stroke } from './types';
import type { LetterGlyph, Ranked } from './types';
import { LETTERS } from './types';
import { extractFeaturesFromStrokes, normalizeUnit, FEATURE_SIZE } from './features';

// Prototype-based recognizer: compares the unit-normalized query vector to
// per-letter prototype vectors and returns top-N by cosine similarity.
export function predictByPrototypesFromStrokes(
  strokes: Stroke[],
  prototypes: Record<LetterGlyph, Float32Array[]>,
  opts: { topN?: number } = {},
): Ranked[] {
  const vec = extractFeaturesFromStrokes(strokes);
  return predictByPrototypesFromVector(vec, prototypes, opts);
}

export function predictByPrototypesFromVector(
  vec: Float32Array,
  prototypes: Record<LetterGlyph, Float32Array[]>,
  opts: { topN?: number } = {},
): Ranked[] {
  const q = normalizeUnit(vec);

  // Guard against zero vectors.
  let sum = 0;
  for (let i = 0; i < q.length; i++) sum += q[i];
  if (!isFinite(sum) || sum === 0) return [];

  const scores: { letter: LetterGlyph; score: number }[] = [];
  for (const L of LETTERS) {
    const arr = prototypes[L] || [];
    if (!arr.length) continue;
    let best = -Infinity;
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      if (!p) continue;
      let dot = 0;
      const n = Math.min(q.length, p.length, FEATURE_SIZE);
      for (let k = 0; k < n; k++) dot += q[k] * p[k];
      if (dot > best) best = dot;
    }
    if (isFinite(best) && best > -Infinity) scores.push({ letter: L, score: best });
  }

  scores.sort((a, b) => b.score - a.score);
  const top = opts.topN ?? 5;
  const maxScore = scores.length ? Math.max(1e-6, scores[0]!.score) : 1;
  return scores.slice(0, top).map((s) => ({ letter: s.letter, raw: s.score, prob: s.score / maxScore }));
}
