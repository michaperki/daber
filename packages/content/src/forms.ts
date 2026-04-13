import { z } from 'zod';

// Canonical verb form tokens for curricular cells
export const PRESENT_FORMS = [
  'present_m_sg',
  'present_f_sg',
  'present_m_pl',
  'present_f_pl',
] as const;

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

export const IMPERATIVE_FORMS = [
  'imperative_sg_m',
  'imperative_sg_f',
  'imperative_pl_m',
  'imperative_pl_f',
] as const;

export const VERB_FORMS = [
  'lemma',
  ...PRESENT_FORMS,
  ...PAST_FORMS,
  ...FUTURE_FORMS,
  ...IMPERATIVE_FORMS,
] as const;

export type VerbFormToken = (typeof VERB_FORMS)[number];

export const VerbFormTokenSchema = z.enum(VERB_FORMS);

// Expand wildcard-like patterns to concrete verb form tokens.
// Supported patterns: exact tokens, group wildcards like 'present_*', 'past_*', 'future_*', 'imperative_*'.
export function expandVerbFormPatterns(patterns: string[]): VerbFormToken[] {
  const out = new Set<VerbFormToken>();
  for (const p of patterns || []) {
    if (p === 'lemma') {
      out.add('lemma');
      continue;
    }
    if (p.endsWith('*')) {
      const prefix = p.slice(0, -1);
      const matches = (VERB_FORMS as readonly string[]).filter((t) => t.startsWith(prefix));
      for (const m of matches) out.add(m as VerbFormToken);
      continue;
    }
    // Exact token if valid
    if ((VERB_FORMS as readonly string[]).includes(p)) {
      out.add(p as VerbFormToken);
    }
  }
  return Array.from(out);
}

// ---- Adjectives ----
export const ADJ_FORMS = [
  'm_sg',
  'f_sg',
  'm_pl',
  'f_pl',
] as const;
export type AdjectiveFormToken = (typeof ADJ_FORMS)[number];

export function expandAdjectiveFormPatterns(patterns: string[]): AdjectiveFormToken[] {
  const out = new Set<AdjectiveFormToken>();
  for (const p of patterns || []) {
    if (p.endsWith('*')) {
      const prefix = p.slice(0, -1);
      for (const t of ADJ_FORMS) if ((t as string).startsWith(prefix)) out.add(t);
      continue;
    }
    if ((ADJ_FORMS as readonly string[]).includes(p)) out.add(p as AdjectiveFormToken);
  }
  return Array.from(out);
}

// ---- Nouns ----
export const NOUN_FORMS = [
  'sg',
  'pl',
] as const;
export type NounFormToken = (typeof NOUN_FORMS)[number];

export function expandNounFormPatterns(patterns: string[]): NounFormToken[] {
  const out = new Set<NounFormToken>();
  for (const p of patterns || []) {
    if (p.endsWith('*')) {
      const prefix = p.slice(0, -1);
      for (const t of NOUN_FORMS) if ((t as string).startsWith(prefix)) out.add(t);
      continue;
    }
    if ((NOUN_FORMS as readonly string[]).includes(p)) out.add(p as NounFormToken);
  }
  return Array.from(out);
}
