import type { Stroke } from './types';
import { rasterizeStrokesTo64, measureBounds } from './raster';

export function l2norm(vec: Float32Array): number {
  let s = 0;
  for (let i = 0; i < vec.length; i++) s += vec[i] * vec[i];
  return Math.sqrt(s);
}

export function normalizeUnit(vec: Float32Array): Float32Array {
  const n = l2norm(vec);
  if (!isFinite(n) || n === 0) return new Float32Array(vec.length);
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / n;
  return out;
}

// Base 64x64 image feature count
export const FEATURE_PIXELS = 64 * 64;
// Number of extra geometry features appended to preserve aspect/scale info
export const FEATURE_EXTRAS = 3; // widthNorm, heightNorm, aspect
export const FEATURE_SIZE = FEATURE_PIXELS + FEATURE_EXTRAS;

function geometryExtras(strokes: Stroke[]): Float32Array {
  const out = new Float32Array(FEATURE_EXTRAS);
  const b = measureBounds(strokes);
  if (!b) return out; // zeros
  const w = Math.max(1e-3, b.width);
  const h = Math.max(1e-3, b.height);
  const m = Math.max(w, h);
  const widthNorm = w / m;   // [0,1]
  const heightNorm = h / m;  // [0,1]
  const ratio = h / w;       // [0, inf)
  const aspect = Math.atan(ratio) / (Math.PI / 2); // [0,1)
  out[0] = widthNorm;
  out[1] = heightNorm;
  out[2] = aspect;
  return out;
}

// Public API: convert strokes → unit vector (64x64 + extras)
export function extractFeaturesFromStrokes(strokes: Stroke[]): Float32Array {
  const img = rasterizeStrokesTo64(strokes);
  const extras = geometryExtras(strokes);
  const combined = new Float32Array(FEATURE_SIZE);
  combined.set(img, 0);
  combined.set(extras, FEATURE_PIXELS);
  return normalizeUnit(combined);
}
