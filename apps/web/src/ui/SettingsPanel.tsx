import { useEffect, useState } from 'preact/hooks';
import { calibration, deviceId, progress, settingsOpen, syncStatus, calibrationMode } from '../state/signals';
import { emptyCalibration } from '../storage/calibration';
import { emptyProgress } from '../storage/progress';
import { putCalibration, putProgress } from '../storage/sync';
import { commitCalibration, commitProgress, updatePrefs } from '../storage/mutations';
import { clearLocalStrokes, emptyStrokes } from '../storage/strokes_store';
import { strokeSamples } from '../state/strokes';
import styles from './SettingsPanel.module.css';

export function SettingsPanel() {
  const id = deviceId.value;
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState<string>('…');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/version');
        const json = await res.json();
        if (!cancelled) setVersion(json?.version || '0');
      } catch {
        if (!cancelled) setVersion('0');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function close() { settingsOpen.value = false; }

  async function onWipe() {
    if (!confirm('Wipe local calibration, progress, and saved samples? This also clears the server copy for this device.')) return;
    setBusy(true);
    try {
      const emptyCal = emptyCalibration();
      const emptyProg = emptyProgress();
      // Clear local canonical stroke dataset
      clearLocalStrokes();
      strokeSamples.value = emptyStrokes().samples as any;
      calibration.value = emptyCal;
      progress.value = emptyProg;
      try {
        await Promise.all([
          putCalibration(id, emptyCal),
          putProgress(id, emptyProg),
        ]);
      } catch {}
      commitCalibration(emptyCal);
      commitProgress(emptyProg);
    } finally {
      setBusy(false);
    }
  }

  function onBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  const prefs = progress.value.prefs;

  return (
    <div class={styles.backdrop} onClick={onBackdropClick}>
      <div class={styles.modal} role="dialog" aria-modal="true" aria-label="Settings">
        <h2 class={styles.title}>Settings</h2>

        {/* Sound */}
        <div>
          <div class={styles.label}>Sound</div>
          <label class="inline">
            Enabled
            <input
              type="checkbox"
              checked={!!prefs.sound_enabled}
              onChange={(e) => updatePrefs({ sound_enabled: (e.target as HTMLInputElement).checked })}
            />
          </label>
        </div>

        {/* Haptics */}
        <div>
          <div class={styles.label}>Haptics</div>
          <label class="inline">
            Enabled
            <input
              type="checkbox"
              checked={!!prefs.haptics_enabled}
              onChange={(e) => updatePrefs({ haptics_enabled: (e.target as HTMLInputElement).checked })}
            />
          </label>
        </div>

        <div class={styles.divider} />

        {/* Calibration access */}
        <div>
          <div class={styles.label}>Calibration</div>
          <div class={styles.row}>
            <button
              type="button"
              onClick={() => { calibrationMode.value = true; close(); }}
              disabled={busy}
            >
              Open Calibration
            </button>
          </div>
        </div>

        <div class={styles.divider} />

        {/* Danger zone */}
        <div>
          <div class={styles.label}>Danger zone</div>
          <div class={styles.row}>
            <button
              type="button"
              class={styles.danger}
              onClick={onWipe}
              disabled={busy}
            >
              Wipe all data
            </button>
          </div>
          <div class={styles.hint}>
            Clears calibration samples and progress on this device and on the server for this device code. Cannot be undone.
          </div>
        </div>

        {/* Footer */}
        <div class={styles.row} style={{ justifyContent: 'space-between' }}>
          <div class={styles.hint}>Version {version}</div>
          <button type="button" onClick={close} disabled={busy}>Close</button>
        </div>
      </div>
    </div>
  );
}
