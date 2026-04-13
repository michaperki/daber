import { signal } from '@preact/signals';

// Local, lightweight overlay for per-lemma verb tier unlocks.
// Persisted in localStorage; session snoozes and prompt latches are managed elsewhere.

export type TierNumber = 1 | 2 | 3 | 4;

export const PRESENT_FORMS = ['present_m_sg', 'present_f_sg', 'present_m_pl', 'present_f_pl'] as const;
export const PAST_FORMS = [
  'past_1sg',
  'past_2sg_m',
  'past_2sg_f',
  'past_3sg_m',
  'past_3sg_f',
  'past_1pl',
  'past_2pl_m',
  'past_2pl_f',
  'past_3pl',
] as const;
export const FUTURE_FORMS = [
  'future_1sg',
  'future_2sg_m',
  'future_2sg_f',
  'future_3sg_m',
  'future_3sg_f',
  'future_1pl',
  'future_2pl_m',
  'future_2pl_f',
  'future_3pl',
] as const;
export const IMPERATIVE_FORMS = ['imperative_sg_m', 'imperative_sg_f', 'imperative_pl_m', 'imperative_pl_f'] as const;

export const TIER_LABEL: Record<TierNumber, 'Present' | 'Past' | 'Future' | 'Imperative'> = {
  1: 'Present',
  2: 'Past',
  3: 'Future',
  4: 'Imperative',
};

function tokensForTier(t: TierNumber): string[] {
  if (t === 2) return [...PAST_FORMS];
  if (t === 3) return [...FUTURE_FORMS];
  if (t === 4) return [...IMPERATIVE_FORMS];
  return [...PRESENT_FORMS];
}

// Storage shape: { version: 1, verbs: { [lemma]: highestUnlockedTier } }
type UnlockStore = { version: 1; verbs: Record<string, TierNumber> };
const KEY = 'daber_tier_unlocks_v1';

function loadStore(): UnlockStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { version: 1, verbs: {} };
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === 1 && parsed.verbs && typeof parsed.verbs === 'object') {
      return { version: 1, verbs: parsed.verbs as Record<string, TierNumber> };
    }
  } catch {}
  return { version: 1, verbs: {} };
}

function saveStore(s: UnlockStore) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

const storeSig = signal<UnlockStore>(loadStore());

export function getUnlockedTier(lemma: string): TierNumber {
  const s = storeSig.value;
  const t = s.verbs[lemma];
  return (t && (t === 1 || t === 2 || t === 3 || t === 4) ? t : 1) as TierNumber;
}

export function unlockTier(lemma: string, tier: TierNumber) {
  // Only allow upgrading, never downgrading; ignore no-ops.
  const cur = getUnlockedTier(lemma);
  const next = (tier > cur ? tier : cur) as TierNumber;
  if (next === cur) return;
  const s = storeSig.value;
  const updated: UnlockStore = { version: 1, verbs: { ...s.verbs, [lemma]: next } };
  storeSig.value = updated;
  saveStore(updated);
}

export function clearUnlocks() {
  const empty: UnlockStore = { version: 1, verbs: {} };
  storeSig.value = empty;
  saveStore(empty);
}

export function getActiveVerbTokens(baseline: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [lemma, toks] of Object.entries(baseline || {})) {
    const set = new Set<string>(toks || []);
    const unlocked = getUnlockedTier(lemma);
    // Overlay tiers 2..unlocked (baseline already includes present_* via chapters)
    if (unlocked >= 2) for (const t of tokensForTier(2)) set.add(t);
    if (unlocked >= 3) for (const t of tokensForTier(3)) set.add(t);
    if (unlocked >= 4) for (const t of tokensForTier(4)) set.add(t);
    out[lemma] = Array.from(set.values());
  }
  return out;
}

export function currentTierFromTokens(tokens: string[]): TierNumber {
  const has = (p: string) => tokens?.some((t) => t.startsWith(p));
  if (has('imperative_')) return 4;
  if (has('future_')) return 3;
  if (has('past_')) return 2;
  return 1;
}

export function tierTokens(t: TierNumber): string[] {
  return tokensForTier(t);
}

