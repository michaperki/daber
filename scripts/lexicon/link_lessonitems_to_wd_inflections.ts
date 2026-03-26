/*
  Link LessonItems to Wikidata Lexemes via Inflection form matching (v1)

  Purpose:
  - Take the existing phrasebook (LessonItems)
  - Tokenize target_hebrew
  - Match tokens against Inflection.form for lexemes we seeded from Wikidata (lexeme_id startsWith 'wd:')
  - Produce:
      - A JSON report in scripts/out/
      - Optional DB annotations:
          - set LessonItem.lexeme_id when the whole LessonItem is a single-token match (safe)
          - for multiword items, DO NOT mutate LessonItem yet; just report matches.

  Usage:
    cd hebrew_drills
    npx ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/lexicon/link_lessonitems_to_wd_inflections.ts --out scripts/out/link_report.json

  Options:
    --write-single-token-links   (only sets LessonItem.lexeme_id when target_hebrew is single token)
    --limit N                    (limit lesson items scanned)

  Notes:
  - Prefix stripping is done as *candidate expansion* (non-destructive):
      token, token[1:] if startsWith ה/ל/ו/ב/כ/מ/ש
*/

import fs from 'fs';
import path from 'path';

type Args = {
  out: string;
  writeSingleTokenLinks: boolean;
  limit: number | null;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    out: `scripts/out/link_report_${Date.now()}.json`,
    writeSingleTokenLinks: false,
    limit: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i] || args.out;
    else if (a === '--write-single-token-links') args.writeSingleTokenLinks = true;
    else if (a === '--limit') args.limit = Number(argv[++i] || '0') || null;
  }
  return args;
}

function stripNiqqud(s: string) {
  return (s || '').replace(/[\u0591-\u05C7]/g, '');
}

function normalize(s: string) {
  return stripNiqqud(s)
    .replace(/["“”„׳״']/g, '')
    .replace(/[\-–—]/g, ' ')
    .replace(/[.,!?()\[\]{}:;\/\\|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(s: string): string[] {
  const n = normalize(s);
  if (!n) return [];
  return n.split(' ').map(t => t.trim()).filter(Boolean);
}

const PREFIXES = ['ה', 'ל', 'ו', 'ב', 'כ', 'מ', 'ש'];

function expandTokenCandidates(tok: string): Array<{ candidate: string; why: string }> {
  const out: Array<{ candidate: string; why: string }> = [{ candidate: tok, why: 'exact' }];
  if (tok.length >= 3 && PREFIXES.includes(tok[0])) {
    out.push({ candidate: tok.slice(1), why: `strip_${tok[0]}` });
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);

  const outPath = path.resolve(args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const { PrismaClient } = require('../../node_modules/@prisma/client');
  const prisma = new PrismaClient();

  // Load inflections for wd: lexemes into a map: form -> [{lexeme_id,...}]
  const inflections = await prisma.inflection.findMany({
    where: { lexeme_id: { startsWith: 'wd:' } },
    select: { lexeme_id: true, form: true, features: true },
  });

  const formMap = new Map<string, Array<{ lexeme_id: string }>>();
  for (const infl of inflections) {
    const form = normalize(infl.form);
    if (!form) continue;
    const arr = formMap.get(form) || [];
    arr.push({ lexeme_id: infl.lexeme_id });
    formMap.set(form, arr);
  }

  const lessonItems = await prisma.lessonItem.findMany({
    ...(args.limit ? { take: args.limit } : {}),
    select: { id: true, target_hebrew: true, english_prompt: true, lexeme_id: true },
  });

  let totalItems = 0;
  let multiwordItems = 0;
  let singleTokenItems = 0;

  let itemsWithAnyMatch = 0;
  let tokensTotal = 0;
  let tokensMatchedExact = 0;
  let tokensMatchedStripped = 0;

  let wroteLinks = 0;

  const itemMatches: any[] = [];

  for (const it of lessonItems) {
    totalItems++;
    const tokens = tokenize(it.target_hebrew || '');
    if (tokens.length === 0) continue;

    if (tokens.length === 1) singleTokenItems++;
    else multiwordItems++;

    const tokenMatches: any[] = [];
    let any = false;

    for (const tok of tokens) {
      tokensTotal++;
      let matched = null as null | { lexeme_id: string; candidate: string; why: string };

      for (const cand of expandTokenCandidates(tok)) {
        const hits = formMap.get(cand.candidate);
        if (hits && hits.length) {
          matched = { lexeme_id: hits[0].lexeme_id, candidate: cand.candidate, why: cand.why };
          break;
        }
      }

      if (matched) {
        any = true;
        if (matched.why === 'exact') tokensMatchedExact++;
        else tokensMatchedStripped++;
        tokenMatches.push({ tok, ...matched });
      }
    }

    if (any) {
      itemsWithAnyMatch++;
      itemMatches.push({
        id: it.id,
        target: it.target_hebrew,
        english: it.english_prompt,
        tokenMatches,
      });
    }

    // Only write LessonItem.lexeme_id for single-token items where we have an exact match
    if (args.writeSingleTokenLinks && tokens.length === 1 && tokenMatches.length === 1 && tokenMatches[0].why === 'exact') {
      const newLexemeId = tokenMatches[0].lexeme_id;
      if (!it.lexeme_id) {
        await prisma.lessonItem.update({ where: { id: it.id }, data: { lexeme_id: newLexemeId } });
        wroteLinks++;
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    wdLexemes: await prisma.lexeme.count({ where: { id: { startsWith: 'wd:' } } }),
    wdInflections: inflections.length,
    totals: {
      totalItems,
      singleTokenItems,
      multiwordItems,
      itemsWithAnyMatch,
      tokensTotal,
      tokensMatchedExact,
      tokensMatchedStripped,
      tokensMatchedAny: tokensMatchedExact + tokensMatchedStripped,
      wroteLinks,
    },
    sampleItemMatches: itemMatches.slice(0, 50),
  };

  await prisma.$disconnect();

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`wrote ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
