import { useEffect } from 'preact/hooks';
import styles from './app.module.css';
import { activeTab, rightRailOpen, settingsOpen, syncStatus, type TabId } from './state/signals';
import { CalibrateTab } from './ui/CalibrateTab';
import { RecognizeTab } from './ui/RecognizeTab';
import { PracticeTab } from './ui/PracticeTab';
import { VocabTab } from './ui/VocabTab';
import { RightRail } from './ui/RightRail';
import { SettingsPanel } from './ui/SettingsPanel';

const TABS: { id: TabId; label: string }[] = [
  { id: 'calibrate', label: 'Calibrate' },
  { id: 'recognize', label: 'Recognize' },
  { id: 'practice', label: 'Practice' },
  { id: 'vocab', label: 'Vocab' },
];

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

function useWakeLock(tab: TabId) {
  useEffect(() => {
    if (tab !== 'practice' && tab !== 'vocab') return;
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
  }, [tab]);
}

export function App() {
  const tab = activeTab.value;
  const drawerOpen = rightRailOpen.value;

  useWakeLock(tab);

  function selectTab(id: TabId) {
    activeTab.value = id;
  }

  return (
    <div class={styles.shell}>
      {/* Top bar */}
      <header class={styles.topBar}>
        <div class={styles.brand}>
          <SyncDot />
          <h1>Daber</h1>
        </div>

        {/* Desktop nav */}
        <nav class={styles.desktopNav}>
          {TABS.map((t) => (
            <button
              key={t.id}
              class={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
              onClick={() => selectTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div class={styles.topBarActions}>
          <button
            class={styles.railToggle}
            onClick={() => { rightRailOpen.value = !drawerOpen; }}
            title="Toggle letters panel"
            aria-label="Toggle letters panel"
          >
            ⊞
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
          {tab === 'calibrate' && <CalibrateTab />}
          {tab === 'recognize' && <RecognizeTab />}
          {tab === 'practice' && <PracticeTab />}
          {tab === 'vocab' && <VocabTab />}
        </section>
        <section class={styles.right}>
          <RightRail />
        </section>
      </main>

      {/* Bottom nav — mobile only */}
      <nav class={styles.bottomNav}>
        {TABS.map((t) => (
          <button
            key={t.id}
            class={`${styles.bottomTab} ${tab === t.id ? styles.bottomTabActive : ''}`}
            onClick={() => selectTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* RightRail drawer — mobile overlay */}
      {drawerOpen && (
        <div
          class={styles.drawerBackdrop}
          onClick={() => { rightRailOpen.value = false; }}
        >
          <div class={styles.drawer} onClick={(e) => e.stopPropagation()}>
            <RightRail />
          </div>
        </div>
      )}

      {settingsOpen.value && <SettingsPanel />}
    </div>
  );
}
