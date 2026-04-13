import { signal } from '@preact/signals';
import { progress } from './state/signals';
import { curriculumData, vocab } from './content';
import {
  getActiveVerbTokens,
  currentTierFromTokens,
  tierTokens,
  TIER_LABEL,
  type TierNumber,
  unlockTier,
} from './curriculum_active';

// Session-scoped prompt control
let promptUsed = false;
const snoozed = new Set<string>();

export const tierSuggestion = signal<null | { lemma: string; tier: TierNumber }>(null);
export const tierToast = signal<string>('');

function clearToastSoon() {
  window.setTimeout(() => { tierToast.value = ''; }, 1200);
}

function tokensPresentForLemma(lemma: string, tokens: string[]): boolean {
  // Build a presence set for lemma
  const present = new Set<string>();
  for (const e of vocab) {
    if (e.pos !== 'verb') continue;
    const lm = e.lemma || (e.variant ? undefined : e.he);
    const tok = e.variant || 'lemma';
    if (lm === lemma && tok) present.add(tok);
  }
  for (const t of tokens) if (!present.has(t)) return false;
  return true;
}

function practicingOrMasteredCount(lemma: string, tokenList: string[]): number {
  const cells = progress.value.cells || {};
  let n = 0;
  for (const tok of tokenList) {
    const key = `verb:${lemma}:${tok}`;
    const st = cells[key]?.state;
    if (st === 'practicing' || st === 'mastered') n++;
  }
  return n;
}

export function maybeTriggerTierSuggestion(lemma: string, cleanAttempt: boolean) {
  if (!cleanAttempt) return;
  if (promptUsed) return;
  if (snoozed.has(lemma)) return;
  // Must be in active curriculum breadth
  if (!(curriculumData.verbs || {})[lemma]) return;

  // Determine current tier from effective tokens (baseline + unlocks)
  const effective = getActiveVerbTokens(curriculumData.verbs || {});
  const currentTokens = effective[lemma] || [];
  const currentTier = currentTierFromTokens(currentTokens);
  if (currentTier >= 4) return; // nothing beyond imperative
  const nextTier = ((currentTier + 1) as TierNumber);

  // Readiness threshold per current tier
  let needed = 0;
  let group: string[] = [];
  if (currentTier === 1) { group = ['present_m_sg', 'present_f_sg', 'present_m_pl', 'present_f_pl']; needed = 3; }
  else if (currentTier === 2) { group = ['past_1sg','past_2sg_m','past_2sg_f','past_3sg_m','past_3sg_f','past_1pl','past_2pl_m','past_2pl_f','past_3pl']; needed = 6; }
  else if (currentTier === 3) { group = ['future_1sg','future_2sg_m','future_2sg_f','future_3sg_m','future_3sg_f','future_1pl','future_2pl_m','future_2pl_f','future_3pl']; needed = 6; }
  const count = practicingOrMasteredCount(lemma, group);
  if (count < needed) return;

  // Content guard: only suggest if all target tier tokens exist in dataset
  const toUnlock = tierTokens(nextTier);
  if (!tokensPresentForLemma(lemma, toUnlock)) return;

  // Queue minimal prompt
  tierSuggestion.value = { lemma, tier: nextTier };
  // Only once per session
  promptUsed = true;
}

export function acceptTierUnlock() {
  const s = tierSuggestion.value;
  if (!s) return;
  unlockTier(s.lemma, s.tier);
  tierSuggestion.value = null;
  tierToast.value = `${TIER_LABEL[s.tier]} unlocked for ${s.lemma}`;
  clearToastSoon();
}

export function snoozeTierSuggestion() {
  const s = tierSuggestion.value;
  if (!s) return;
  snoozed.add(s.lemma);
  tierSuggestion.value = null;
}

