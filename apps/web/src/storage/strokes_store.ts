import type { LetterGlyph, Stroke } from '../recognizer/types';
import { LETTERS } from '../recognizer/types';
import { resampleStroke } from '../recognizer/stroke';
import { u8ToBase64 } from './base64';

export type StrokesPayload = {
  version: 1;
  samples: Record<LetterGlyph, Stroke[][]>;
  updated_at: string;
};

const KEY = 'daber_strokes_v1';
const MAX_SAMPLES_PER_LETTER = 30;

function nowIso() { return new Date().toISOString(); }

export function emptyStrokes(): StrokesPayload {
  const samples = {} as Record<LetterGlyph, Stroke[][]>;
  for (const L of LETTERS) samples[L] = [];
  return { version: 1, samples, updated_at: nowIso() };
}

export function loadLocalStrokes(): StrokesPayload {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyStrokes();
    const parsed = JSON.parse(raw) as StrokesPayload;
    if (!parsed || parsed.version !== 1 || !parsed.samples) return emptyStrokes();
    // Ensure all letters exist
    for (const L of LETTERS) if (!parsed.samples[L]) parsed.samples[L] = [];
    return parsed;
  } catch {
    return emptyStrokes();
  }
}

export function saveLocalStrokes(p: StrokesPayload): boolean {
  p.updated_at = nowIso();
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
    return true;
  } catch {
    // QuotaExceededError — trim each letter to half and retry once
    for (const L of LETTERS) {
      const arr = p.samples[L];
      if (arr && arr.length > 5) {
        p.samples[L] = arr.slice(-Math.ceil(arr.length / 2));
      }
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
      return true;
    } catch {
      return false;
    }
  }
}

// Basic sample validity: at least one stroke, enough points, non-trivial bounds
export function isValidSample(strokes: Stroke[]): boolean {
  if (!strokes || strokes.length === 0) return false;
  let points = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes) {
    if (!s || s.length === 0) continue;
    points += s.length;
    for (let i = 0; i < s.length; i++) {
      const p = s[i]!;
      if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
    }
  }
  if (points < 8) return false;
  const w = Math.max(0, maxX - minX);
  const h = Math.max(0, maxY - minY);
  if (w < 6 || h < 6) return false;
  return true;
}

// Fingerprint for dedupe: resample to 96, quantize to 8-bit per coord, base64
export function fingerprint(strokes: Stroke[], N = 96): string {
  const v = resampleStroke(strokes, N); // Float32Array length 2N, ~[0,1]
  const u = new Uint8Array(v.length);
  for (let i = 0; i < v.length; i++) {
    let x = v[i]!;
    if (!isFinite(x)) x = 0;
    x = Math.max(0, Math.min(1, x));
    u[i] = Math.round(x * 255);
  }
  return u8ToBase64(u);
}

// Merge helper: union samples with dedupe by fingerprint
export function mergeStrokes(base: StrokesPayload, incoming: StrokesPayload): StrokesPayload {
  const out: StrokesPayload = {
    version: 1,
    samples: {} as Record<LetterGlyph, Stroke[][]>,
    updated_at: nowIso(),
  };
  for (const L of LETTERS) {
    const arr: Stroke[][] = [];
    const seen = new Set<string>();
    const a = (base.samples[L] || []);
    const b = (incoming.samples[L] || []);
    for (const s of a) {
      const fp = fingerprint(s);
      if (seen.has(fp)) continue; seen.add(fp); arr.push(s);
    }
    for (const s of b) {
      const fp = fingerprint(s);
      if (seen.has(fp)) continue; seen.add(fp); arr.push(s);
    }
    // Cap oldest if needed
    if (arr.length > MAX_SAMPLES_PER_LETTER) arr.splice(0, arr.length - MAX_SAMPLES_PER_LETTER);
    out.samples[L] = arr;
  }
  return out;
}

// Append a single local sample with validation, dedupe and cap. Returns the updated payload.
export function appendLocalSample(letter: LetterGlyph, strokes: Stroke[]): StrokesPayload {
  const store = loadLocalStrokes();
  if (!isValidSample(strokes)) return store;
  const arr = store.samples[letter] || [];
  const fp = fingerprint(strokes);
  for (let i = 0; i < arr.length; i++) {
    if (fingerprint(arr[i]!) === fp) {
      // already present; no-op
      return store;
    }
  }
  arr.push(strokes);
  // Cap oldest
  if (arr.length > MAX_SAMPLES_PER_LETTER) arr.splice(0, arr.length - MAX_SAMPLES_PER_LETTER);
  store.samples[letter] = arr;
  saveLocalStrokes(store);
  return store;
}

export function clearLocalStrokes() {
  const empty = emptyStrokes();
  saveLocalStrokes(empty);
}

