// Similarity helpers used by the KNN and Centroid scorers.
//
// Both paths use cosine similarity of unit-normalized feature vectors. Since
// features are always unit-normalized upstream, cosine similarity reduces to
// a plain dot product — no division, no norm computation per comparison.
// See docs/RECOGNIZER.md §"Why unit-normalize?".

import { FEATURE_PIXELS } from './features';

export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// Cosine similarity over only the 64×64 pixel dimensions, ignoring geometry
// extras. This avoids noise from the 3 appended features (width, height,
// aspect) which can hurt discrimination for similar-shaped letters.
export function dotPixels(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length, FEATURE_PIXELS);
  let sa = 0, sb = 0, sab = 0;
  for (let i = 0; i < n; i++) {
    sa += a[i] * a[i];
    sb += b[i] * b[i];
    sab += a[i] * b[i];
  }
  const denom = Math.sqrt(sa) * Math.sqrt(sb);
  return denom > 0 ? sab / denom : 0;
}

export function l2(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}
