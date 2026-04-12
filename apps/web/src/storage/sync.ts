import type { CalibrationV1 } from './calibration';
import type { ProgressV1 } from './progress';

const API_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_BASE_URL) || '/api';

function url(path: string) {
  return `${API_BASE}${path}`;
}

export async function getCalibration(deviceId: string): Promise<CalibrationV1 | null> {
  const res = await fetch(url(`/calibration/${encodeURIComponent(deviceId)}`));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET calibration: ${res.status}`);
  return (await res.json()) as CalibrationV1;
}

export async function putCalibration(deviceId: string, payload: CalibrationV1): Promise<void> {
  const res = await fetch(url(`/calibration/${encodeURIComponent(deviceId)}`), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`PUT calibration: ${res.status}`);
}

export async function getProgress(deviceId: string): Promise<ProgressV1 | null> {
  const res = await fetch(url(`/progress/${encodeURIComponent(deviceId)}`));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET progress: ${res.status}`);
  return (await res.json()) as ProgressV1;
}

export async function putProgress(deviceId: string, payload: ProgressV1): Promise<void> {
  const res = await fetch(url(`/progress/${encodeURIComponent(deviceId)}`), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`PUT progress: ${res.status}`);
}

// Debounced PUT helpers
let calTimer: number | undefined;
export function schedulePutCalibration(deviceId: string, payload: CalibrationV1, debounceMs = 2000) {
  if (typeof window === 'undefined') return;
  if (calTimer) window.clearTimeout(calTimer);
  calTimer = window.setTimeout(() => void putCalibration(deviceId, payload).catch(() => {}), debounceMs);
}

let progTimer: number | undefined;
export function schedulePutProgress(deviceId: string, payload: ProgressV1, debounceMs = 2000) {
  if (typeof window === 'undefined') return;
  if (progTimer) window.clearTimeout(progTimer);
  progTimer = window.setTimeout(() => void putProgress(deviceId, payload).catch(() => {}), debounceMs);
}

