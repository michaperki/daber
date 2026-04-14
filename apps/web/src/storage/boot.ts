import { getOrCreateDeviceId } from './device';
import { loadCalibration } from './calibration';
import { loadProgress } from './progress';
import { getCalibration, getProgress } from './sync';
import { getStrokes } from './strokes_fetch';
import { calibration, deviceId, offline, progress, syncStatus, syncError } from '../state/signals';
import { strokeSamples } from '../state/strokes';
import { emptyStrokes, loadLocalStrokes, mergeStrokes, saveLocalStrokes } from './strokes_store';

// Boot sequence:
// 1. Synchronously hydrate signals from localStorage so the UI renders with
//    whatever we have locally.
// 2. Kick off parallel GETs for calibration + progress. Per USER_FLOW.md
//    "server wins" on first load, so if the server returns a blob we replace
//    the local copy outright.
// 3. Errors are swallowed — the app stays fully usable offline.
export async function bootSync() {
  const id = getOrCreateDeviceId();
  deviceId.value = id;

  // Local hydrate first.
  calibration.value = loadCalibration();
  progress.value = loadProgress();
  // Hydrate local strokes first so recognizer is usable offline immediately
  try {
    const local = loadLocalStrokes();
    strokeSamples.value = local.samples as any;
  } catch {
    strokeSamples.value = emptyStrokes().samples as any;
  }

  syncStatus.value = 'loading';
  let step = 'fetch';
  try {
    const [cal, prog, strokes] = await Promise.all([
      getCalibration(id),
      getProgress(id),
      getStrokes(id),
    ]);
    step = 'apply-calibration';
    if (cal && cal.version === 1) {
      calibration.value = cal;
    }
    step = 'apply-progress';
    if (prog && prog.version === 1) {
      progress.value = prog;
    }
    step = 'merge-strokes';
    if (strokes && strokes.version === 1) {
      // Merge server strokes into local, deduping and capping.
      // Stroke merge is best-effort — if localStorage is full the app still works
      // because strokes are persisted server-side.
      try {
        const local = loadLocalStrokes();
        const merged = mergeStrokes(local, { version: 1, samples: strokes.samples as any, updated_at: new Date().toISOString() });
        saveLocalStrokes(merged);
        strokeSamples.value = merged.samples as any;
      } catch {
        // Fall back to server strokes in memory only (no local cache)
        strokeSamples.value = strokes.samples as any;
      }
    }
    offline.value = false;
    syncStatus.value = 'idle';
  } catch (err) {
    offline.value = true;
    syncStatus.value = 'error';
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    syncError.value = `[${step}] ${msg}`;
    console.error('[bootSync]', msg, err);
  }
}
