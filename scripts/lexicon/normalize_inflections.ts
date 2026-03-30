/*
  Normalize Inflection metadata for Hebrew lexemes

  - Fills structured columns (tense/number/gender/person) using:
    - Existing structured fields (leave as-is)
    - Lightweight heuristics on the surface form (no niqqud)
  - Focuses on practical targets:
    - Verbs: detect infinitive (ל*) when tense is missing
    - Adjectives: prefer m.sg vs f.sg when possible; set number by suffix
    - Nouns: set number by suffix; avoid guessing gender unless obvious

  Usage:
    DATABASE_URL=... npx ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/lexicon/normalize_inflections.ts
*/

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function stripNikkud(s: string): string {
  return (s || '').replace(/[\u0591-\u05C7]/g, '');
}
function isSingleToken(s: string): boolean {
  return (s || '').split(/\s+/).filter(Boolean).length === 1;
}
function looksPlural(s: string): boolean {
  return /(?:ים|ות)$/.test(s || '');
}
function looksFeminineSingular(s: string): boolean {
  return /(?:ה|ית)$/.test(s || '');
}
function looksInfinitive(s: string): boolean {
  return /^ל\S+$/.test(s || '');
}

async function normalize() {
  const lexemes = await prisma.lexeme.findMany({
    where: { language: 'he' },
    select: { id: true, pos: true }
  });
  const posOf = new Map(lexemes.map(l => [l.id, (l.pos || '').toLowerCase()] as const));

  const pageSize = 1000;
  let offset = 0;
  let total = 0;
  let updates = 0;

  while (true) {
    const infl = await prisma.inflection.findMany({
      skip: offset,
      take: pageSize,
      select: { id: true, lexeme_id: true, form: true, tense: true, person: true, number: true, gender: true }
    });
    if (!infl.length) break;
    total += infl.length;

    for (const row of infl) {
      const pos = (posOf.get(row.lexeme_id) || '').toLowerCase();
      const form = stripNikkud(row.form || '').trim();
      const patch: any = {};

      if ((pos === 'q24905' || pos === 'verb')) {
        // Prefer explicit tense; if missing, detect infinitive by ל* pattern
        if (!row.tense && isSingleToken(form) && looksInfinitive(form)) {
          patch.tense = 'infinitive';
          patch.person = null;
          patch.number = null;
          patch.gender = null;
        }
      } else if (pos === 'q34698' || pos === 'adjective') {
        // Number by suffix if missing
        if (!row.number) patch.number = looksPlural(form) ? 'pl' : 'sg';
        // Gender heuristic for singular only if missing
        if (!row.gender && (patch.number === 'sg' || row.number === 'sg')) {
          patch.gender = looksFeminineSingular(form) ? 'f' : 'm';
        }
      } else if (pos === 'q1084' || pos === 'noun') {
        if (!row.number) patch.number = looksPlural(form) ? 'pl' : 'sg';
        // Avoid gender guess for nouns unless clearly feminine by suffix
        if (!row.gender && (patch.number === 'sg' || row.number === 'sg')) {
          if (looksFeminineSingular(form)) patch.gender = 'f';
        }
      }

      if (Object.keys(patch).length) {
        await prisma.inflection.update({ where: { id: row.id }, data: patch });
        updates++;
      }
    }
    offset += pageSize;
  }

  console.log(`Normalized ${updates} inflection rows (scanned ${total}).`);
}

normalize()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

