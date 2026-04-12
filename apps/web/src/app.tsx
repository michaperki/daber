import styles from './app.module.css';
import { activeTab, settingsOpen, syncStatus, type TabId } from './state/signals';
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

export function App() {
  const tab = activeTab.value;
  return (
    <div class={styles.shell}>
      <header class={styles.header}>
        <div class={styles.brand}>
          <SyncDot />
          <h1>Daber</h1>
        </div>
        <nav class={styles.nav}>
          {TABS.map((t) => (
            <button
              key={t.id}
              class={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
              onClick={() => {
                activeTab.value = t.id;
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <button
          class={styles.gear}
          onClick={() => {
            settingsOpen.value = true;
          }}
          title="Settings"
          aria-label="Open settings"
        >
          ⚙
        </button>
      </header>
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
      <footer class={styles.footer}>
        <small>Local KNN based on your calibration. No data leaves your browser except sync blobs.</small>
      </footer>
      {settingsOpen.value && <SettingsPanel />}
    </div>
  );
}
