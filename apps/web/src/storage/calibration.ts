import type { LetterGlyph } from '../recognizer/types';
import { u8ToBase64, base64ToU8 } from './base64';
import { FEATURE_SIZE, FEATURE_PIXELS, normalizeUnit } from '../recognizer/features';

export type CalibrationV1 = {
  version: 1;
  samples: Record<LetterGlyph, string[]>; // base64-encoded Uint8Array per sample
  updated_at: string; // ISO
};

const KEY = 'daber_calibration_v1';

export function nowIso() {
  return new Date().toISOString();
}

export function emptyCalibration(): CalibrationV1 {
  return { version: 1, samples: {} as Record<LetterGlyph, string[]>, updated_at: nowIso() };
}

export function quantize(vec: Float32Array): Uint8Array {
  const out = new Uint8Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    const v = Math.max(0, Math.min(1, vec[i]));
    out[i] = Math.round(v * 255);
  }
  return out;
}

export function dequantize(u8: Uint8Array): Float32Array {
  const out = new Float32Array(u8.length);
  for (let i = 0; i < u8.length; i++) out[i] = u8[i] / 255;
  return out;
}

export function loadCalibration(): CalibrationV1 {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyCalibration();
    const parsed = JSON.parse(raw) as CalibrationV1;
    // basic shape check
    if (parsed && parsed.version === 1 && parsed.samples) return parsed;
    return emptyCalibration();
  } catch {
    return emptyCalibration();
  }
}

export function saveCalibration(cal: CalibrationV1) {
  cal.updated_at = nowIso();
  localStorage.setItem(KEY, JSON.stringify(cal));
}

export function addSample(cal: CalibrationV1, letter: LetterGlyph, vec: Float32Array): CalibrationV1 {
  const u8 = quantize(vec);
  const b64 = u8ToBase64(u8);
  const samples = cal.samples[letter] || [];
  samples.push(b64);
  // Cap samples per letter to prevent unbounded growth and stale drift
  const MAX_SAMPLES_PER_LETTER = 30;
  if (samples.length > MAX_SAMPLES_PER_LETTER) {
    // Drop oldest first
    const drop = samples.length - MAX_SAMPLES_PER_LETTER;
    samples.splice(0, drop);
  }
  cal.samples[letter] = samples;
  saveCalibration(cal);
  return cal;
}

export function toPrototypes(cal: CalibrationV1): Record<LetterGlyph, Float32Array[]> {
  const out: Partial<Record<LetterGlyph, Float32Array[]>> = {};
  // Light morphology to harmonize stored samples with current raster (thicker strokes).
  function dilate64x64(src: Float32Array): Float32Array {
    const W = 64;
    const dst = new Float32Array(FEATURE_PIXELS);
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        let mx = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy, nx = x + dx;
            if (ny >= 0 && ny < W && nx >= 0 && nx < W) {
              const v = src[ny * W + nx];
              if (v > mx) mx = v;
            }
          }
        }
        dst[y * W + x] = mx;
      }
    }
    return dst;
  }
  for (const [letter, arr] of Object.entries(cal.samples) as [LetterGlyph, string[]][]) {
    out[letter] = arr.map((b64) => {
      const f = dequantize(base64ToU8(b64));
      // Backward-compat: pad older 4096-dim samples to current feature size
      if (f.length !== FEATURE_SIZE) {
        const v = new Float32Array(FEATURE_SIZE);
        const n = Math.min(f.length, FEATURE_SIZE);
        for (let i = 0; i < n; i++) v[i] = f[i];
        // Harmonize thickness for the pixel slice
        const thick = dilate64x64(v.subarray(0, FEATURE_PIXELS));
        const w = new Float32Array(FEATURE_SIZE);
        w.set(thick, 0);
        for (let i = FEATURE_PIXELS; i < FEATURE_SIZE; i++) w[i] = v[i];
        return normalizeUnit(w);
      }
      // Harmonize thickness for the pixel slice
      const thick = dilate64x64(f.subarray(0, FEATURE_PIXELS));
      const w = new Float32Array(FEATURE_SIZE);
      w.set(thick, 0);
      for (let i = FEATURE_PIXELS; i < FEATURE_SIZE; i++) w[i] = f[i];
      return normalizeUnit(w);
    });
  }
  return out as Record<LetterGlyph, Float32Array[]>;
}

// Raw vectors (no normalization), useful for pipelines that need the original
// 64×64 pixel values for CNN evaluation. Pads older 4096-dim samples.
export function toRawVectors(cal: CalibrationV1): Record<LetterGlyph, Float32Array[]> {
  const out: Partial<Record<LetterGlyph, Float32Array[]>> = {};
  for (const [letter, arr] of Object.entries(cal.samples) as [LetterGlyph, string[]][]) {
    out[letter] = arr.map((b64) => {
      const f = dequantize(base64ToU8(b64));
      const v = new Float32Array(FEATURE_SIZE);
      const n = Math.min(f.length, FEATURE_SIZE);
      for (let i = 0; i < n; i++) v[i] = f[i];
      // Harmonize thickness for the pixel slice as well so Bench queries
      // match prototype processing.
      const thick = (function dilate64(src: Float32Array): Float32Array {
        const W = 64;
        const dst = new Float32Array(FEATURE_PIXELS);
        for (let y = 0; y < W; y++) {
          for (let x = 0; x < W; x++) {
            let mx = 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const ny = y + dy, nx = x + dx;
                if (ny >= 0 && ny < W && nx >= 0 && nx < W) {
                  const val = src[ny * W + nx];
                  if (val > mx) mx = val;
                }
              }
            }
            dst[y * W + x] = mx;
          }
        }
        return dst;
      })(v.subarray(0, FEATURE_PIXELS));
      v.set(thick, 0);
      return v;
    });
  }
  return out as Record<LetterGlyph, Float32Array[]>;
}
