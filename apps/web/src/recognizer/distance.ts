// Similarity helpers used by the KNN and Centroid scorers.
//
// Both paths use cosine similarity of unit-normalized feature vectors. Since
// features are always unit-normalized upstream, cosine similarity reduces to
// a plain dot product — no division, no norm computation per comparison.
// See docs/RECOGNIZER.md §"Why unit-normalize?".

export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function l2(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}
