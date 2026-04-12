import type { LetterGlyph } from '../recognizer/types';
import { u8ToBase64, base64ToU8 } from './base64';
import { FEATURE_SIZE, normalizeUnit } from '../recognizer/features';

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
  for (const [letter, arr] of Object.entries(cal.samples) as [LetterGlyph, string[]][]) {
    out[letter] = arr.map((b64) => {
      const f = dequantize(base64ToU8(b64));
      // Backward-compat: pad older 4096-dim samples to current feature size
      if (f.length !== FEATURE_SIZE) {
        const v = new Float32Array(FEATURE_SIZE);
        const n = Math.min(f.length, FEATURE_SIZE);
        for (let i = 0; i < n; i++) v[i] = f[i];
        return normalizeUnit(v);
      }
      return normalizeUnit(f);
    });
  }
  return out as Record<LetterGlyph, Float32Array[]>;
}
