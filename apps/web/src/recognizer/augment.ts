import { normalizeUnit, FEATURE_PIXELS } from './features';

const W = 64;
const BASE = FEATURE_PIXELS; // 64*64

// ---------------------------------------------------------------------------
// Low-level 64×64 transforms
// ---------------------------------------------------------------------------

// Shift the 64×64 image portion by (dx, dy), preserving appended extras.
export function shift64(vec: Float32Array, dx: number, dy: number): Float32Array {
  const out = new Float32Array(vec.length);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const sy = y - dy;
      const sx = x - dx;
      if (sx < 0 || sy < 0 || sx >= W || sy >= W) continue;
      out[y * W + x] = vec[sy * W + sx];
    }
  }
  for (let i = BASE; i < vec.length; i++) out[i] = vec[i];
  return out;
}

// Rotate the 64×64 grid by `angle` radians around its centre.
function rotate64(vec: Float32Array, angle: number): Float32Array {
  const out = new Float32Array(vec.length);
  const cx = 31.5, cy = 31.5;
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const sx = Math.round(cos * dx - sin * dy + cx);
      const sy = Math.round(sin * dx + cos * dy + cy);
      if (sx < 0 || sy < 0 || sx >= W || sy >= W) continue;
      out[y * W + x] = vec[sy * W + sx];
    }
  }
  for (let i = BASE; i < vec.length; i++) out[i] = vec[i];
  return out;
}

// Uniform scale (zoom in/out) of the 64×64 grid around its centre.
function scale64(vec: Float32Array, factor: number): Float32Array {
  const out = new Float32Array(vec.length);
  const cx = 31.5, cy = 31.5;
  const inv = 1 / factor;
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const sx = Math.round((x - cx) * inv + cx);
      const sy = Math.round((y - cy) * inv + cy);
      if (sx < 0 || sy < 0 || sx >= W || sy >= W) continue;
      out[y * W + x] = vec[sy * W + sx];
    }
  }
  for (let i = BASE; i < vec.length; i++) out[i] = vec[i];
  return out;
}

// Morphological dilation (3×3 box): thickens strokes by ~1 pixel.
function dilate64(vec: Float32Array): Float32Array {
  const out = new Float32Array(vec.length);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      let maxV = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < W && nx >= 0 && nx < W) {
            const v = vec[ny * W + nx];
            if (v > maxV) maxV = v;
          }
        }
      }
      out[y * W + x] = maxV;
    }
  }
  for (let i = BASE; i < vec.length; i++) out[i] = vec[i];
  return out;
}

// ---------------------------------------------------------------------------
// Public augmentation API
// ---------------------------------------------------------------------------

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

// Richer augmentation: cardinal shifts + small rotations + scale jitter +
// dilation (stroke thickening). Produces ~13 variants per sample.
export function augmentRich(vec: Float32Array): Float32Array[] {
  const out: Float32Array[] = [];

  // Cardinal ±1px shifts (4)
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as [number,number][]) {
    out.push(normalizeUnit(shift64(vec, dx, dy)));
  }

  // ±2px shifts (4)
  for (const [dx, dy] of [[2,0],[-2,0],[0,2],[0,-2]] as [number,number][]) {
    out.push(normalizeUnit(shift64(vec, dx, dy)));
  }

  // Small rotations (4): ±5° and ±10°
  const deg5 = (5 * Math.PI) / 180;
  const deg10 = (10 * Math.PI) / 180;
  out.push(normalizeUnit(rotate64(vec, deg5)));
  out.push(normalizeUnit(rotate64(vec, -deg5)));
  out.push(normalizeUnit(rotate64(vec, deg10)));
  out.push(normalizeUnit(rotate64(vec, -deg10)));

  // Scale jitter (2): ±10%
  out.push(normalizeUnit(scale64(vec, 1.1)));
  out.push(normalizeUnit(scale64(vec, 0.9)));

  // Dilated original (1): thicken strokes
  out.push(normalizeUnit(dilate64(vec)));

  return out; // 15 variants
}

// Build query-side variants for cheap translational invariance during scoring.
// When augment=true, return unit-normalized [original, ±1px cardinal shifts].
// When augment=false, return [normalized original] only. This avoids exploding
// the database size and yields similar robustness at ~5x cost instead of ~16x.
export function queryVariants(vec: Float32Array, augment: boolean): Float32Array[] {
  if (!augment) return [normalizeUnit(vec)];
  const variants: Float32Array[] = [];
  // original
  variants.push(normalizeUnit(vec));
  // ±1px cardinal shifts
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as [number,number][]) {
    variants.push(normalizeUnit(shift64(vec, dx, dy)));
  }
  return variants;
}
