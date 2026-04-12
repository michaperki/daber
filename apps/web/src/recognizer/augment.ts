import { normalizeUnit } from './features';

// Shift only the 64x64 image portion by (dx, dy), preserving any appended
// extra features (e.g., aspect ratio). The output preserves the input length.
export function shift64(vec: Float32Array, dx: number, dy: number): Float32Array {
  const base = 64 * 64;
  const out = new Float32Array(vec.length);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const sy = y - dy;
      const sx = x - dx;
      if (sx < 0 || sy < 0 || sx >= 64 || sy >= 64) continue;
      out[y * 64 + x] = vec[sy * 64 + sx];
    }
  }
  // Preserve any extra dimensions after the 64x64 grid
  for (let i = base; i < vec.length; i++) out[i] = vec[i];
  return out;
}

// Cardinal ±1px shifts (4 variants). Each variant is re-normalized to unit
// length so it plays nicely with the cosine-similarity scorer. Ported from
// `augmentFeature` in reference/hebrewhandwritingweb/app.js ~line 348.
export function augmentCardinal(vec: Float32Array): Float32Array[] {
  const shifts: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  return shifts.map(([dx, dy]) => normalizeUnit(shift64(vec, dx, dy)));
}
