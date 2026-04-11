// Local calibration storage for handwriting prototypes

import { MODEL_INPUT, ProtoMap } from './engine';

const STORAGE_KEY = 'daber_handwriting_calibration_v1';

export type CalibState = {
  version: 1;
  // letter -> list of Uint8Array (quantized features 0..255)
  samples: Record<string, Uint8Array[]>;
};

export function floatToU8(vec: Float32Array): Uint8Array {
  const out = new Uint8Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    const v = Math.max(0, Math.min(255, Math.round(vec[i] * 255)));
    out[i] = v;
  }
  return out;
}

export function u8ToFloat(arr: Uint8Array): Float32Array {
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = arr[i] / 255;
  // renormalize
  let norm = 1e-6; for (let i = 0; i < out.length; i++) norm += out[i]*out[i];
  norm = Math.sqrt(norm);
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

export function loadCalibration(): CalibState {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return { version: 1, samples: {} };
    const parsed = JSON.parse(raw);
    const samples: Record<string, Uint8Array[]> = {};
    for (const k of Object.keys(parsed.samples || {})) {
      const arr: string[] = parsed.samples[k] || [];
      samples[k] = arr.map(b64 => base64ToU8(b64));
    }
    return { version: 1, samples };
  } catch {
    return { version: 1, samples: {} };
  }
}

export function saveCalibration(state: CalibState) {
  const payload: any = { version: 1, samples: {} as Record<string,string[]> };
  for (const k of Object.keys(state.samples)) {
    payload.samples[k] = state.samples[k].map(u8 => u8ToBase64(u8));
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }
}

export function computePrototypes(state: CalibState): ProtoMap {
  const out: ProtoMap = {};
  for (const letter of Object.keys(state.samples)) {
    const list = state.samples[letter];
    if (!list?.length) continue;
    const acc = new Float32Array(MODEL_INPUT * MODEL_INPUT);
    for (const u8 of list) {
      const f = u8ToFloat(u8);
      for (let i = 0; i < acc.length; i++) acc[i] += f[i];
    }
    for (let i = 0; i < acc.length; i++) acc[i] /= list.length;
    let norm = 1e-6; for (let i = 0; i < acc.length; i++) norm += acc[i]*acc[i];
    norm = Math.sqrt(norm);
    for (let i = 0; i < acc.length; i++) acc[i] /= norm;
    out[letter] = acc;
  }
  return out;
}

export function exportCalibration(state: CalibState): Blob {
  const payload: any = { version: 1, samples: {} as Record<string,string[]> };
  for (const k of Object.keys(state.samples)) {
    payload.samples[k] = state.samples[k].map(u8 => u8ToBase64(u8));
  }
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
}

export async function importCalibration(file: File): Promise<CalibState> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const samples: Record<string, Uint8Array[]> = {};
  for (const k of Object.keys(parsed.samples || {})) {
    samples[k] = (parsed.samples[k] || []).map((b64: string) => base64ToU8(b64));
  }
  return { version: 1, samples };
}

function u8ToBase64(u8: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    const sub = u8.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, sub as unknown as number[]);
  }
  return (typeof btoa !== 'undefined') ? btoa(binary) : Buffer.from(u8).toString('base64');
}

function base64ToU8(b64: string): Uint8Array {
  const bin = (typeof atob !== 'undefined') ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

