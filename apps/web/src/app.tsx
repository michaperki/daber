import { useEffect } from 'preact/hooks';
import styles from './app.module.css';
import { settingsOpen, syncStatus, setupComplete, calibrationMode, focusOpen } from './state/signals';
import { Onboarding } from './ui/Onboarding';
import { VocabTab } from './ui/VocabTab';
import { VerbInspector } from './ui/VerbInspector';
import { useState } from 'preact/hooks';
import { SettingsPanel } from './ui/SettingsPanel';
import { FocusPanel } from './ui/FocusPanel';
import { activeChapters } from './content';

function SyncDot() {
  const s = syncStatus.value;
  const cls =
    s === 'error'
      ? `${styles.syncDot} ${styles.syncDotError}`
      : s === 'loading'
        ? `${styles.syncDot} ${styles.syncDotLoading}`
        : styles.syncDot;
  const title =
    s === 'error'
      ? 'Offline — local changes will sync when the API is reachable'
      : s === 'loading'
        ? 'Syncing…'
        : 'Synced';
  return <span class={cls} title={title} aria-label={title} />;
}

function useWakeLockWhenStudying(studying: boolean) {
  useEffect(() => {
    if (!studying) return;
    if (!navigator.wakeLock) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    navigator.wakeLock.request('screen').then(
      (s) => {
        if (cancelled) { s.release(); return; }
        sentinel = s;
      },
      () => {},
    );
    return () => {
      cancelled = true;
      sentinel?.release();
    };
  }, [studying]);
}

export function App() {
  const studying = setupComplete.value;
  const calibrating = calibrationMode.value;
  useWakeLockWhenStudying(studying);
  const [inspect, setInspect] = useState(false);

  return (
    <div class={styles.shell}>
      {/* Top bar */}
      <header class={styles.topBar}>
        <div class={styles.brand}>
          <SyncDot />
          <h1>Daber</h1>
        </div>

        <div class={styles.topBarActions}>
          {/* Active chapters pill */}
          <button
            class={styles.pill}
            onClick={() => { focusOpen.value = true; }}
            title="View current focus"
            aria-label="View current focus"
          >
            {(() => {
              const ch = activeChapters;
              if (!ch.length) return 'Chapters: —';
              const head = ch.slice(0, 2).join(', ');
              const extra = ch.length > 2 ? ` +${ch.length - 2}` : '';
              return `Chapters: ${head}${extra}`;
            })()}
          </button>
          <button
            class={styles.modeSelect}
            onClick={() => setInspect((v) => !v)}
            title={inspect ? 'Back to Drill' : 'Open Verb Inspector'}
            aria-label={inspect ? 'Back to Drill' : 'Open Verb Inspector'}
          >
            {inspect ? 'Drill' : 'Inspect'}
          </button>
          <button
            class={styles.gear}
            onClick={() => { settingsOpen.value = true; }}
            title="Settings"
            aria-label="Open settings"
          >
            ⚙
          </button>
        </div>
      </header>

      {/* Main content */}
      <main class={styles.main}>
        <section class={styles.left}>
          {calibrating
            ? <Onboarding />
            : (!studying ? <Onboarding /> : (inspect ? <VerbInspector /> : <VocabTab />))}
        </section>
      </main>

      {settingsOpen.value && <SettingsPanel />}
      {focusOpen.value && <FocusPanel />}
    </div>
  );
}
