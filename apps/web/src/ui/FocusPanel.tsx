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
  const now = Date.now();
  // Compute near-unlock and active-now slices
  function readinessDelta(row: VerbProgressRow): number | null {
    const cells = progress.value.cells || {};
    const group = row.tier === 1
      ? ['present_m_sg','present_f_sg','present_m_pl','present_f_pl']
      : row.tier === 2
        ? ['past_1sg','past_2sg_m','past_2sg_f','past_3sg_m','past_3sg_f','past_1pl','past_2pl_m','past_2pl_f','past_3pl']
        : row.tier === 3
          ? ['future_1sg','future_2sg_m','future_2sg_f','future_3sg_m','future_3sg_f','future_1pl','future_2pl_m','future_2pl_f','future_3pl']
          : [];
    if (!group.length) return null;
    const needed = row.tier === 1 ? 3 : 6;
    let count = 0;
    for (const tok of group) {
      const key = `verb:${row.lemma}:${tok}`;
      const st = cells[key]?.state;
      if (st === 'practicing' || st === 'mastered') count++;
    }
    return Math.max(0, needed - count);
  }
  const nearUnlock = verbs
    .map((v) => ({ v, d: readinessDelta(v) }))
    .filter((x) => x.d !== null && x.d <= 1)
    .sort((a, b) => (a.d! - b.d!) || (b.v.lastSeen - a.v.lastSeen))
    .slice(0, 3)
    .map((x) => x.v);
  const recentMs = 10 * 60 * 1000;
  const activeNow = verbs
    .filter((v) => (now - v.lastSeen) <= recentMs && !nearUnlock.find((n) => n.lemma === v.lemma))
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .slice(0, 5);

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

        {/* Near unlock */}
        <div>
          <div class={styles.muted}>Near unlock</div>
          <div class={styles.list}>
            {nearUnlock.length ? (
              nearUnlock.map((v) => (
                <div>
                  {v.lemma} — {formatTier(v.tier)} (almost ready)
                </div>
              ))
            ) : (
              <div class={styles.muted}>—</div>
            )}
          </div>
        </div>

        {/* Active now */}
        <div>
          <div class={styles.muted}>Active now</div>
          <div class={styles.list}>
            {activeNow.length ? (
              activeNow.map((v) => (
                <div>
                  {v.lemma} — {formatTier(v.tier)}
                </div>
              ))
            ) : (
              <div class={styles.muted}>—</div>
            )}
          </div>
        </div>

        <div class={styles.muted}>Verbs unlock by suggestion; nouns/adjectives practice directly (no tiers).</div>
      </div>
    </div>
  );
}
