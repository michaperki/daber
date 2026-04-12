import { getOrCreateDeviceId } from './device';
import { loadCalibration } from './calibration';
import { loadProgress } from './progress';
import { getCalibration, getProgress } from './sync';
import {
  calibration,
  deviceId,
  offline,
  progress,
  syncStatus,
} from '../state/signals';

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

  syncStatus.value = 'loading';
  try {
    const [cal, prog] = await Promise.all([
      getCalibration(id),
      getProgress(id),
    ]);
    if (cal && cal.version === 1) {
      calibration.value = cal;
    }
    if (prog && prog.version === 1) {
      progress.value = prog;
    }
    offline.value = false;
    syncStatus.value = 'idle';
  } catch {
    offline.value = true;
    syncStatus.value = 'error';
  }
}
