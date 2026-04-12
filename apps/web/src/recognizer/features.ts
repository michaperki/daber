import type { Stroke } from './types';
import { rasterizeStrokesTo64 } from './raster';

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

// Public API: convert strokes → 64x64 unit vector
export function extractFeaturesFromStrokes(strokes: Stroke[]): Float32Array {
  const img = rasterizeStrokesTo64(strokes);
  return normalizeUnit(img);
}

