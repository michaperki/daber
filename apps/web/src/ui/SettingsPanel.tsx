import { useState } from 'preact/hooks';
import { calibration, deviceId, progress, settingsOpen, syncStatus } from '../state/signals';
import { setDeviceId } from '../storage/device';
import { emptyCalibration } from '../storage/calibration';
import { emptyProgress } from '../storage/progress';
import { getCalibration, getProgress, putCalibration, putProgress } from '../storage/sync';
import { getStrokes } from '../storage/strokes_fetch';
import { commitCalibration, commitProgress } from '../storage/mutations';
import styles from './SettingsPanel.module.css';
import { strokeSamples } from '../state/strokes';
import { predictByStroke } from '../recognizer/stroke';
import { measureBounds } from '../recognizer/raster';
import type { LetterGlyph } from '../recognizer/types';

// Device handoff flow (per USER_FLOW.md):
//  - Every device mints a local UUID on first boot.
//  - To move to a new device, the user reads their existing code off the old
//    device and types it into the new device's Settings panel.
//  - We overwrite the local deviceId and then GET the server's blobs for that
//    id, replacing whatever this browser already had.
function shortCode(id: string): string {
  return id ? id.replace(/-/g, '').slice(0, 6).toUpperCase() : '------';
}

export function SettingsPanel() {
  const id = deviceId.value;
  const [showFull, setShowFull] = useState(false);
  const [entered, setEntered] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);

  function close() {
    settingsOpen.value = false;
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(id);
      setMsg({ kind: 'ok', text: 'Device code copied.' });
    } catch {
      setMsg({ kind: 'bad', text: 'Copy failed — select and copy manually.' });
    }
  }

  async function onUseCode() {
    const next = entered.trim();
    if (!next) return;
    // Accept only UUID-ish input to avoid typos that would pollute the server.
    const uuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!uuid.test(next)) {
      setMsg({ kind: 'bad', text: 'Expected a UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      setDeviceId(next);
      deviceId.value = next;
      syncStatus.value = 'loading';
      const [cal, prog, strokes] = await Promise.all([
        getCalibration(next),
        getProgress(next),
        getStrokes(next),
      ]);
      // Replace local state with whatever the server has for that device.
      // Fall back to empty blobs if the server has nothing stored yet (new
      // code). commitCalibration/commitProgress also persist locally + push
      // back up under the new device id.
      commitCalibration(cal && cal.version === 1 ? cal : emptyCalibration());
      commitProgress(prog && prog.version === 1 ? prog : emptyProgress());
      if (strokes && strokes.version === 1) {
        strokeSamples.value = strokes.samples as any;
      } else {
        strokeSamples.value = {} as any;
      }
      syncStatus.value = 'idle';
      setMsg({ kind: 'ok', text: 'Loaded profile from server.' });
      setEntered('');
    } catch {
      syncStatus.value = 'error';
      setMsg({ kind: 'bad', text: 'Failed to fetch profile — still offline?' });
    } finally {
      setBusy(false);
    }
  }

  async function onWipe() {
    if (!confirm('Wipe local calibration, progress, and saved samples? This also clears the server copy for this device.')) {
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const emptyCal = emptyCalibration();
      const emptyProg = emptyProgress();
      calibration.value = emptyCal;
      progress.value = emptyProg;
      // Push empty blobs up so a later re-sync doesn't resurrect old state.
      try {
        await Promise.all([
          putCalibration(id, emptyCal),
          putProgress(id, emptyProg),
        ]);
      } catch {
        // Offline is fine; local wipe still happened.
      }
      // Persist locally via commit helpers so debounced PUT is idempotent.
      commitCalibration(emptyCal);
      commitProgress(emptyProg);
      setMsg({ kind: 'ok', text: 'All data wiped on this device.' });
    } finally {
      setBusy(false);
    }
  }

  function onBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  return (
    <div class={styles.backdrop} onClick={onBackdropClick}>
      <div class={styles.modal} role="dialog" aria-modal="true" aria-label="Settings">
        <h2 class={styles.title}>Settings</h2>

        <div>
          <div class={styles.label}>Your device code</div>
          <div class={styles.short}>{shortCode(id)}</div>
          {showFull ? (
            <div class={styles.code}>{id || '(none)'}</div>
          ) : null}
          <div class={styles.row}>
            <button type="button" onClick={() => setShowFull((v) => !v)}>
              {showFull ? 'Hide full code' : 'Show full code'}
            </button>
            <button type="button" onClick={onCopy} disabled={!id}>
              Copy
            </button>
          </div>
          <div class={styles.hint}>
            Type this full code into another device's Settings to move your calibration and
            progress across.
          </div>
        </div>

        <div class={styles.divider} />

        {/* Dev-only: show stroke sample counts to verify DB hydrate */}
        {typeof window !== 'undefined' && /(?:^|[?&])dev=1(?:&|$)/.test(window.location.search) && (
          <div>
            <div class={styles.label}>Dev: Stroke samples loaded</div>
            <div class={styles.hint}>
              {(() => {
                const sdb = strokeSamples.value as any as Record<string, any[]>;
                let total = 0;
                for (const k of Object.keys(sdb)) total += (sdb[k] || []).length;
                const y = (sdb['י'] || []).length || 0;
                const v = (sdb['ו'] || []).length || 0;
                const n = (sdb['ן'] || []).length || 0;
                return `total=${total}  ·  י=${y}  ו=${v}  ן=${n}`;
              })()}
            </div>
          </div>
        )}

        <div>
          <div class={styles.label}>Export debug bundle</div>
          <div class={styles.hint}>Calibration, progress, and saved stroke samples for this device</div>
          <div class={styles.row}>
            <button
              type="button"
              onClick={async () => {
                try {
                  const did = deviceId.value;
                  const strokes = await getStrokes(did);
                  const payload = {
                    version: 1,
                    device_id: did,
                    exported_at: new Date().toISOString(),
                    calibration: calibration.value,
                    progress: progress.value,
                    strokes: strokes ?? { version: 1, samples: {} },
                  };
                  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'daber_debug_bundle.json';
                  a.click();
                  URL.revokeObjectURL(url);
                } catch {
                  alert('Export failed — still offline?');
                }
              }}
            >
              Export JSON
            </button>
          </div>
        </div>

        <div class={styles.divider} />

        <div>
          <div class={styles.label}>Use an existing device code</div>
          <input
            type="text"
            value={entered}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            onInput={(e) => setEntered((e.target as HTMLInputElement).value)}
            disabled={busy}
            style={{ width: '100%', fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}
          />
          <div class={styles.row}>
            <button type="button" onClick={onUseCode} disabled={busy || !entered.trim()}>
              Load profile
            </button>
          </div>
          <div class={styles.hint}>
            Replaces this device's local data with the server copy for the code above.
          </div>
        </div>

        <div class={styles.divider} />

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
            Clears calibration samples and progress on this device and on the server for this
            device code. Cannot be undone.
          </div>
        </div>

        {/* Dev-only: quick confusion check for י/ו/ן with and without geometry */}
        {typeof window !== 'undefined' && /(?:^|[?&])dev=1(?:&|$)/.test(window.location.search) && (
          <>
            <div class={styles.divider} />
            <div>
              <div class={styles.label}>Dev: Stroke confusion check</div>
              <div class={styles.hint}>Compare base vs geometry-weighted stroke scoring for י/ו/ן (λ∈{0,0.5,1.0})</div>
              <div class={styles.row}>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const targets: LetterGlyph[] = ['י','ו','ן'];
                      const sdb = strokeSamples.value as any as Record<LetterGlyph, any[]>;
                      const stats = {
                        base: { correct: 0, total: 0, conf: {} as Record<string, number> },
                        g05: { correct: 0, total: 0, conf: {} as Record<string, number> },
                        g10: { correct: 0, total: 0, conf: {} as Record<string, number> },
                      };
                      for (const L of targets) {
                        const arr = (sdb[L] || []) as any[];
                        if (!arr || arr.length < 2) continue;
                        for (let i = 0; i < arr.length; i++) {
                          const held = arr[i];
                          const hold: any = {};
                          for (const LL of targets) {
                            const a2 = (sdb[LL] || []).slice();
                            if (LL === L) a2.splice(i, 1);
                            hold[LL] = a2;
                          }
                          const p0 = predictByStroke(held, hold, { topN: 1, geometryWeight: 0 });
                          const bTop = p0[0]?.letter as LetterGlyph | undefined;
                          stats.base.total++;
                          if (bTop === L) stats.base.correct++; else if (bTop) {
                            const k = `${L}->${bTop}`; stats.base.conf[k] = (stats.base.conf[k] || 0) + 1;
                          }
                          const p05 = predictByStroke(held, hold, { topN: 1, geometryWeight: 0.5 });
                          const g05Top = p05[0]?.letter as LetterGlyph | undefined;
                          stats.g05.total++;
                          if (g05Top === L) stats.g05.correct++; else if (g05Top) {
                            const k = `${L}->${g05Top}`; stats.g05.conf[k] = (stats.g05.conf[k] || 0) + 1;
                          }
                          const p10 = predictByStroke(held, hold, { topN: 1, geometryWeight: 1.0 });
                          const g10Top = p10[0]?.letter as LetterGlyph | undefined;
                          stats.g10.total++;
                          if (g10Top === L) stats.g10.correct++; else if (g10Top) {
                            const k = `${L}->${g10Top}`; stats.g10.conf[k] = (stats.g10.conf[k] || 0) + 1;
                          }
                        }
                      }
                      const pct = (c: number, t: number) => (t ? Math.round((100 * c) / t) : 0);
                      const top5 = (m: Record<string, number>) => Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`${k}(${v})`).join(' · ') || '—';
                      alert([
                        `Base (λ=0):    ${pct(stats.base.correct, stats.base.total)}%  conf: ${top5(stats.base.conf)}`,
                        `Geom (λ=0.5):  ${pct(stats.g05.correct, stats.g05.total)}%  conf: ${top5(stats.g05.conf)}`,
                        `Geom (λ=1.0):  ${pct(stats.g10.correct, stats.g10.total)}%  conf: ${top5(stats.g10.conf)}`,
                      ].join('\n'));
                    } catch (e) {
                      alert('Confusion check failed. Collect stroke samples first.');
                    }
                  }}
                >
                  Run stroke confusion check
                </button>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const letters: LetterGlyph[] = ['י','ו','ן'];
                      const sdb = strokeSamples.value as any as Record<LetterGlyph, any[]>;
                      function logAspectLocal(strokes: any[]): number {
                        const b = measureBounds(strokes as any);
                        if (!b) return 0;
                        const w = Math.max(1e-3, b.width);
                        const h = Math.max(1e-3, b.height);
                        return Math.log(h / w);
                      }
                      const lines: string[] = [];
                      for (const L of letters) {
                        const arr = (sdb[L] || []) as any[];
                        const vals = arr.map(a => logAspectLocal(a)).filter(v => Number.isFinite(v));
                        if (!vals.length) { lines.push(`${L}: n=0`); continue; }
                        const n = vals.length;
                        const mean = vals.reduce((s,v)=>s+v,0)/n;
                        const sd = Math.sqrt(vals.reduce((s,v)=>s+(v-mean)*(v-mean),0)/n);
                        const min = Math.min(...vals);
                        const max = Math.max(...vals);
                        lines.push(`${L}: n=${n}  mean=${mean.toFixed(3)}  sd=${sd.toFixed(3)}  min=${min.toFixed(3)}  max=${max.toFixed(3)}`);
                      }
                      alert(lines.join('\n'));
                    } catch (e) {
                      alert('Aspect stats failed.');
                    }
                  }}
                  style={{ marginLeft: '8px' }}
                >
                  Aspect stats (י/ו/ן)
                </button>
              </div>
            </div>
          </>
        )}

        {msg ? (
          <div class={styles.hint} style={{ color: msg.kind === 'ok' ? 'var(--accent-2)' : 'var(--danger)' }}>
            {msg.text}
          </div>
        ) : null}

        <div class={styles.row} style={{ justifyContent: 'flex-end' }}>
          <button type="button" onClick={close} disabled={busy}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
