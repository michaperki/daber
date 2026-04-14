import { useState } from 'preact/hooks';
import { Route, Router, useLocation } from 'preact-iso';
import styles from './app.module.css';
import { settingsOpen, syncStatus, syncError, setupComplete, calibrationMode } from './state/signals';
import { Onboarding } from './ui/Onboarding';
import { VerbInspector } from './ui/VerbInspector';
import { SettingsPanel } from './ui/SettingsPanel';
import { LessonsHome } from './ui/LessonsHome';
import { LessonEntry } from './ui/LessonEntry';
import { DrillScreen } from './ui/DrillScreen';
import { LessonComplete } from './ui/LessonComplete';

function SyncDot() {
  const s = syncStatus.value;
  const err = syncError.value;
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
  const handleClick = () => {
    if (s === 'error' && err) {
      alert(`Sync error:\n${err}`);
    }
  };
  return <span class={cls} title={title} aria-label={title} onClick={handleClick} />;
}

/** Returns true when the current route is a full-screen drill (no header chrome). */
function useIsDrillRoute(): boolean {
  const { path } = useLocation();
  return path.endsWith('/drill') || path === '/practice';
}

export function App() {
  const studying = setupComplete.value;
  const calibrating = calibrationMode.value;
  const [inspect, setInspect] = useState(false);

  // Gate: onboarding / calibration
  if (!studying || calibrating) {
    return (
      <div class={styles.shell}>
        <header class={styles.topBar}>
          <div class={styles.brand}>
            <SyncDot />
            <h1>Daber</h1>
          </div>
        </header>
        <main class={styles.main}>
          <section class={styles.left}>
            <Onboarding />
          </section>
        </main>
      </div>
    );
  }

  return <AppShell inspect={inspect} setInspect={setInspect} />;
}

function AppShell({ inspect, setInspect }: { inspect: boolean; setInspect: (v: boolean | ((p: boolean) => boolean)) => void }) {
  const isDrill = useIsDrillRoute();

  return (
    <div class={styles.shell}>
      {/* Hide header during drill for immersion */}
      {!isDrill && (
        <header class={styles.topBar}>
          <div class={styles.brand}>
            <SyncDot />
            <h1>Daber</h1>
          </div>
          <div class={styles.topBarActions}>
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
      )}

      <main class={isDrill ? undefined : styles.main}>
        {inspect && !isDrill ? (
          <section class={styles.left}><VerbInspector /></section>
        ) : (
          <Router>
            <Route path="/" component={LessonsHome} />
            <Route path="/lesson/:id" component={LessonEntry} />
            <Route path="/lesson/:id/drill" component={DrillScreen} />
            <Route path="/practice" component={DrillScreen} />
            <Route path="/lesson/:id/complete" component={LessonComplete} />
          </Router>
        )}
      </main>

      {settingsOpen.value && <SettingsPanel />}
    </div>
  );
}
