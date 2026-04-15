import { getOrCreateDeviceId } from './device';
import { loadCalibration } from './calibration';
import { loadProgress, normalizeProgress } from './progress';
import { getCalibration, getProgress } from './sync';
import { getStrokes } from './strokes_fetch';
import { calibration, deviceId, offline, progress, syncStatus, syncError } from '../state/signals';
import { strokeSamples } from '../state/strokes';
import { emptyStrokes, loadLocalStrokes, mergeStrokes, saveLocalStrokes } from './strokes_store';
import { toPrototypes } from './calibration';

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
  syncError.value = '';
  try {
    const [calRes, progRes, strokesRes] = await Promise.allSettled([
      getCalibration(id),
      getProgress(id),
      getStrokes(id),
    ]);

    const errors: string[] = [];

    if (calRes.status === 'fulfilled' && calRes.value && calRes.value.version === 1) {
      calibration.value = calRes.value;
    } else if (calRes.status === 'rejected') {
      const msg = calRes.reason instanceof Error ? `${calRes.reason.name}: ${calRes.reason.message}` : String(calRes.reason);
      errors.push(`[calibration] ${msg}`);
    }

    if (progRes.status === 'fulfilled' && progRes.value && progRes.value.version === 1) {
      progress.value = normalizeProgress(progRes.value);
    } else if (progRes.status === 'rejected') {
      const msg = progRes.reason instanceof Error ? `${progRes.reason.name}: ${progRes.reason.message}` : String(progRes.reason);
      errors.push(`[progress] ${msg}`);
    }

    if (strokesRes.status === 'fulfilled' && strokesRes.value && strokesRes.value.version === 1) {
      // Merge server strokes into local, deduping and capping. This remains
      // best-effort because localStorage can hit Safari quota limits.
      try {
        const local = loadLocalStrokes();
        const merged = mergeStrokes(local, { version: 1, samples: strokesRes.value.samples as any, updated_at: new Date().toISOString() });
        saveLocalStrokes(merged);
        strokeSamples.value = merged.samples as any;
      } catch {
        // Fall back to server strokes in memory only (no local cache)
        strokeSamples.value = strokesRes.value.samples as any;
      }
    }

    const anyFulfilled = [calRes, progRes, strokesRes].some((r) => r.status === 'fulfilled');
    offline.value = !anyFulfilled;
    syncStatus.value = anyFulfilled ? 'idle' : 'error';

    // When all requests fail but we still have local recognizer data, keep the
    // app in usable state and avoid a false "broken" signal.
    if (!anyFulfilled) {
      let strokeLetters = 0;
      const local = loadLocalStrokes();
      for (const k in local.samples) {
        if ((local.samples as any)[k]?.length) strokeLetters++;
      }
      const prototypes = toPrototypes(calibration.value);
      let protoLetters = 0;
      for (const k in prototypes) {
        if ((prototypes as any)[k]?.length) protoLetters++;
      }
      if (strokeLetters > 0 || protoLetters > 0) {
        syncStatus.value = 'idle';
      }
    }

    if (syncStatus.value === 'error' && errors.length) {
      syncError.value = errors.join('\n');
      console.error('[bootSync]', syncError.value);
    }
  } catch (err) {
    offline.value = true;
    syncStatus.value = 'error';
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    syncError.value = `[bootSync] ${msg}`;
    console.error('[bootSync]', msg, err);
  }
}
