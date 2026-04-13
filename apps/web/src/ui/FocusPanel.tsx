import { focusOpen, progress } from '../state/signals';
import { activeChapters, curriculumData } from '../content';
import { getActiveVerbTokens, currentTierFromTokens } from '../curriculum_active';
import styles from './FocusPanel.module.css';

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) focusOpen.value = false;
}

function formatTier(n: number): string {
  return n === 4 ? 'Imperative' : n === 3 ? 'Future' : n === 2 ? 'Past' : 'Present';
}

type VerbProgressRow = { lemma: string; tier: number; lastSeen: number };

function computeVerbsInProgress(): VerbProgressRow[] {
  const cells = progress.value.cells || {};
  const recency = new Map<string, number>();
  for (const [key, v] of Object.entries(cells)) {
    if (!key.startsWith('verb:')) continue;
    const parts = key.split(':');
    if (parts.length < 3) continue;
    const lemma = parts[1];
    const ts = v.last_seen_at ? Date.parse(v.last_seen_at) : 0;
    const prev = recency.get(lemma) || 0;
    if (ts > prev) recency.set(lemma, ts);
  }
  const effective = getActiveVerbTokens(curriculumData.verbs || {});
  const rows: VerbProgressRow[] = [];
  for (const [lemma, last] of recency) {
    const tier = currentTierFromTokens(effective[lemma] || []);
    rows.push({ lemma, tier, lastSeen: last });
  }
  rows.sort((a, b) => b.lastSeen - a.lastSeen);
  return rows.slice(0, 8);
}

export function FocusPanel() {
  const chapters = activeChapters;
  const verbs = computeVerbsInProgress();

  return (
    <div class={styles.backdrop} onClick={onBackdropClick}>
      <div class={styles.modal} role="dialog" aria-modal="true" aria-label="Current Focus">
        <h2 class={styles.title}>Current Focus</h2>
        {/* Active chapters */}
        <div>
          <div class={styles.muted}>Active chapters</div>
          <div class={styles.chips}>
            {chapters.length ? chapters.map((c) => <span class={styles.chip}>{c}</span>) : <span class={styles.muted}>None</span>}
          </div>
        </div>

        {/* Verbs in progress */}
        <div>
          <div class={styles.muted}>Verbs in progress</div>
          <div class={styles.list}>
            {verbs.length ? (
              verbs.map((v) => (
                <div>
                  {v.lemma} — {formatTier(v.tier)}
                </div>
              ))
            ) : (
              <div class={styles.muted}>No recent verbs yet</div>
            )}
          </div>
        </div>

        <div class={styles.muted}>Verbs unlock by suggestion; nouns/adjectives practice directly.</div>
      </div>
    </div>
  );
}

