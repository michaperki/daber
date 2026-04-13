import { signal, computed } from '@preact/signals';
import type { CalibrationV1 } from '../storage/calibration';
import { emptyCalibration } from '../storage/calibration';
import type { ProgressV1 } from '../storage/progress';
import { emptyProgress } from '../storage/progress';
import type { LetterGlyph } from '../recognizer/types';
import { LETTERS } from '../recognizer/types';
import { strokeSamples } from './strokes';

// ---- Top-level signals ----

export const deviceId = signal<string>('');

// Calibration and progress are loaded from localStorage synchronously at boot
// and then rehydrated from the server once the initial GETs return.
export const calibration = signal<CalibrationV1>(emptyCalibration());
export const progress = signal<ProgressV1>(emptyProgress());

// Lightweight sync status for an inline offline indicator in the header.
export type SyncStatus = 'idle' | 'loading' | 'error' | 'saving';
export const syncStatus = signal<SyncStatus>('idle');
export const offline = signal<boolean>(false);

// Current letter index inside the Calibrate tab (0..LETTERS.length-1).
export const calibrateLetterIdx = signal<number>(0);

// Settings panel visibility
export const settingsOpen = signal<boolean>(false);

// ---- Derived ----

export const sampleCounts = computed<Record<LetterGlyph, number>>(() => {
  // Canonical: counts from the stroke dataset used by the recognizer
  const db = strokeSamples.value as Record<LetterGlyph, any>;
  const out = {} as Record<LetterGlyph, number>;
  for (const L of LETTERS) out[L] = ((db && db[L]) ? db[L].length : 0);
  return out;
});

export const setupCount = computed<number>(() => {
  const counts = sampleCounts.value;
  let n = 0;
  for (const L of LETTERS) if ((counts[L] || 0) > 0) n++;
  return n;
});

export const setupComplete = computed<boolean>(() => setupCount.value >= LETTERS.length);

// No calibratedLetters computed; onboarding uses counts directly.
