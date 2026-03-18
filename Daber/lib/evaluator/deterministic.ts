import { LessonItemLike, Grade, Reason } from '../types';
import { normalizeTranscript } from './normalize';

type Morph = { person?: string | null; number?: string | null; gender?: string | null };

const PRONOUNS_HE: Record<string, Morph> = {
  'אני': { person: '1', number: 'sg', gender: null },
  'אתה': { person: '2', number: 'sg', gender: 'm' },
  'את': { person: '2', number: 'sg', gender: 'f' },
  'הוא': { person: '3', number: 'sg', gender: 'm' },
  'היא': { person: '3', number: 'sg', gender: 'f' },
  'אנחנו': { person: '1', number: 'pl', gender: null },
  'אתם': { person: '2', number: 'pl', gender: 'm' },
  'אתן': { person: '2', number: 'pl', gender: 'f' },
  'הם': { person: '3', number: 'pl', gender: 'm' },
  'הן': { person: '3', number: 'pl', gender: 'f' }
};

const PRONOUNS_ROMA: Record<string, Morph> = {
  'ani': { person: '1', number: 'sg', gender: null },
  'ata': { person: '2', number: 'sg', gender: 'm' },
  'at': { person: '2', number: 'sg', gender: 'f' },
  'hu': { person: '3', number: 'sg', gender: 'm' },
  'hi': { person: '3', number: 'sg', gender: 'f' },
  'anachnu': { person: '1', number: 'pl', gender: null },
  'atem': { person: '2', number: 'pl', gender: 'm' },
  'aten': { person: '2', number: 'pl', gender: 'f' },
  'hem': { person: '3', number: 'pl', gender: 'm' },
  'hen': { person: '3', number: 'pl', gender: 'f' }
};

function detectPronounMorph(n: string): Morph | null {
  // check Hebrew tokens first
  for (const tok of Object.keys(PRONOUNS_HE)) {
    if (n.includes(tok)) return PRONOUNS_HE[tok];
  }
  // split spaces for romanization
  const parts = n.split(' ').filter(Boolean);
  for (const p of parts) {
    const m = PRONOUNS_ROMA[p];
    if (m) return m;
  }
  return null;
}

function compareMorph(target: Morph | null | undefined, heard: Morph | null | undefined): Reason[] {
  const reasons: Reason[] = [];
  if (!target || !heard) return reasons;
  // person mismatch
  if (target.person && heard.person && target.person !== heard.person) {
    reasons.push({ code: 'wrong_person', message: 'Close, wrong person.' });
  }
  if (target.number && heard.number && target.number !== heard.number) {
    reasons.push({ code: 'wrong_number', message: 'Close, wrong number.' });
  }
  if (target.gender && heard.gender && target.gender !== heard.gender) {
    reasons.push({ code: 'wrong_gender', message: 'Close, wrong gender.' });
  }
  return reasons;
}

function detectMorphFromHebrewForm(form: string): Morph | null {
  const s = form.trim();
  if (!s) return null;
  // Plural masculine: ״ים"
  if (/ים$/.test(s)) return { number: 'pl', gender: 'm' };
  // Plural feminine: ״ות"
  if (/ות$/.test(s)) return { number: 'pl', gender: 'f' };
  // Feminine singular present/adjective often ends with ״ת"
  if (/ת$/.test(s)) return { number: 'sg', gender: 'f' };
  return null;
}

function extractLastHebrewToken(raw: string): string | null {
  const matches = raw.match(/[\p{Script=Hebrew}]+/gu);
  if (!matches || !matches.length) return null;
  return matches[matches.length - 1] || null;
}

function includesNormalized(haystack: string[], needle: string): boolean {
  const n = normalizeTranscript(needle);
  return haystack.some(h => normalizeTranscript(h) === n);
}

export function deterministicEvaluate(
  item: LessonItemLike,
  rawTranscript: string
): { grade: Grade; reasons: Reason[] } | null {
  const nT = normalizeTranscript(rawTranscript);
  const nTarget = normalizeTranscript(item.target_hebrew);

  // Exact match to target or accepted_variants (distinguish exact vs variant)
  const accepted = [item.target_hebrew, ...(item.accepted_variants || [])];
  const nAccepted = accepted.map(a => normalizeTranscript(a));
  if (nAccepted.includes(nT)) {
    const isExact = nT === nTarget;
    return {
      grade: 'correct',
      reasons: [isExact ? { code: 'exact_match', message: 'Correct.' } : { code: 'accepted_variant', message: 'Correct.' }]
    };
  }

  // Near miss: match to authored near-miss examples
  for (const p of item.near_miss_patterns || []) {
    if (includesNormalized(p.examples || [], rawTranscript)) {
      const code =
        p.type === 'wrong_gender' ? 'wrong_gender' :
        p.type === 'wrong_number' ? 'wrong_number' :
        p.type === 'wrong_gender_number' ? 'wrong_number' :
        p.type;
      const message =
        code === 'wrong_gender' ? 'Close, wrong gender.' :
        code === 'wrong_number' ? 'Not quite.' :
        'Close.';
      return { grade: 'flawed', reasons: [{ code, message }] };
    }
  }

  // Pronoun omission handling with tense: past allows omission, present/future generally require it
  const parts = nTarget.split(' ');
  const features = item.features || null;
  const tense = (features && typeof features === 'object' ? (features as any).tense : null) as string | null;
  if (/^\p{Script=Hebrew}/u.test(item.target_hebrew) && parts.length > 1) {
    const withoutFirst = parts.slice(1).join(' ');
    if (nT === withoutFirst) {
      if (tense === 'past') {
        return { grade: 'correct', reasons: [{ code: 'pronoun_optional', message: 'Correct (pronoun optional in past).' }] };
      }
      if (tense === 'present' || tense === 'future') {
        return { grade: 'flawed', reasons: [{ code: 'missing_pronoun_required', message: 'Close. Include the pronoun in present/future.' }] };
      }
      return { grade: 'flawed', reasons: [{ code: 'missing_pronoun', message: 'Close. Say the full form like this.' }] };
    }
  }

  // Feature-aware mismatch checks based on heard pronoun vs target features
  if (features) {
    const heardPronoun = detectPronounMorph(nT);
    const targetMorph: Morph = {
      person: features.person || null,
      number: features.number || null,
      gender: features.gender || null
    };
    const diffsPron = compareMorph(targetMorph, heardPronoun);
    if (diffsPron.length) {
      return { grade: 'flawed', reasons: diffsPron };
    }
    // If no pronoun detected, try to infer morphology from the last Hebrew token in transcript
    const lastHeb = extractLastHebrewToken(rawTranscript);
    if (lastHeb) {
      const heardMorph = detectMorphFromHebrewForm(lastHeb);
      const diffsMorph = compareMorph(targetMorph, heardMorph);
      if (diffsMorph.length) {
        return { grade: 'flawed', reasons: diffsMorph };
      }
    }
    // Also, compare morphology against the target itself; if target morph available and contradicts features, skip
    // (No-op here; features are authoritative.)
    if (false) {}
  }

  return null; // let caller decide incorrect or fallback
}
