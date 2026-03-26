/*
  Seed Lexeme/Inflection from Wiktionary (Hebrew) — verbs only (v1)

  This consumes a public dictionary source (Wiktionary) into the existing Prisma models:
  - Lexeme (lemma, pos=verb)
  - Inflection (infinitive + observed form)

  v1 scope:
  - Use en.wiktionary.org MediaWiki API (parse wikitext)
  - Parse Hebrew section only
  - Handle pages that include:
      {{he-infinitive of|to|<PAST/LEMMA>}}
      {{he-verb form|wv=<INFINITIVE>}}
    Common for forms like "לשבור".

  Output:
  - Writes a JSON summary to scripts/out/
  - Writes to Postgres via Prisma

  Usage:
    cd hebrew_drills
    DATABASE_URL=... npx ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/lexicon/seed_wiktionary_verbs.ts --limit 200

  Notes:
  - Designed to be idempotent: upserts Lexemes by deterministic id.
*/

import fs from 'fs';
import path from 'path';

type Args = {
  limit: number;
  dryRun: boolean;
  sleepMs: number;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { limit: 200, dryRun: false, sleepMs: 100 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') args.limit = Number(argv[++i] || '200');
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--sleep-ms') args.sleepMs = Number(argv[++i] || '100');
  }
  return args;
}

function sleep(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}

function stripNiqqud(s: string) {
  return (s || '').replace(/[\u0591-\u05C7]/g, '');
}

function normalizeHebrewToken(s: string) {
  return stripNiqqud(s)
    .replace(/["“”„׳״']/g, '')
    .replace(/[\-–—]/g, ' ')
    .replace(/[.,!?()\[\]{}:;\/\\|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchWikitext(title: string): Promise<string | null> {
  const url = new URL('https://en.wiktionary.org/w/api.php');
  url.searchParams.set('action', 'parse');
  url.searchParams.set('format', 'json');
  url.searchParams.set('prop', 'wikitext');
  url.searchParams.set('page', title);
  url.searchParams.set('origin', '*');

  const res = await fetch(url.toString(), {
    headers: { 'user-agent': 'daber-lexicon-seed/0.1 (wiktionary verbs v1)' },
  });
  const json: any = await res.json();
  const wt = json?.parse?.wikitext?.['*'];
  if (typeof wt !== 'string') return null;
  return wt;
}

function extractHebrewSection(wikitext: string): string | null {
  // Return the content lines after ==Hebrew== until next ==...==
  const lines = wikitext.split('\n');
  let inHebrew = false;
  const out: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const l2 = line.match(/^==\s*([^=].*?)\s*==\s*$/);
    if (l2) {
      const header = l2[1].trim();
      if (header.toLowerCase() === 'hebrew') {
        inHebrew = true;
        continue;
      }
      if (inHebrew) break;
    }
    if (inHebrew) out.push(line);
  }

  return out.length ? out.join('\n') : null;
}

type ParsedVerb = {
  pageTitle: string;
  lemma: string;        // base lexeme lemma (no niqqud)
  infinitive: string;   // infinitive (no niqqud)
  observedForm: string; // the page title token (no niqqud)
};

function parseVerbFromHebrewSection(pageTitle: string, hebrewSection: string): ParsedVerb | null {
  // Heuristic parsing:
  // - lemma is from {{he-infinitive of|to|<lemma>...}}
  // - infinitive is from he-verb form wv=<...> when present, else use pageTitle

  const lemmaMatch = hebrewSection.match(/\{\{he-infinitive of\|[^|]*\|([^|}]+)(?:\||\}\})/);
  const wvMatch = hebrewSection.match(/\{\{he-verb form\|[^}]*\bwv=([^|}\n]+)(?:\||\}\})/);

  if (!lemmaMatch && !wvMatch) return null;

  const lemmaRaw = lemmaMatch ? lemmaMatch[1].trim() : null;
  const wvRaw = wvMatch ? wvMatch[1].trim() : null;

  const lemma = lemmaRaw ? normalizeHebrewToken(lemmaRaw) : '';
  const infinitive = wvRaw ? normalizeHebrewToken(wvRaw) : normalizeHebrewToken(pageTitle);
  const observedForm = normalizeHebrewToken(pageTitle);

  if (!lemma || !infinitive || !observedForm) return null;

  return { pageTitle, lemma, infinitive, observedForm };
}

function lexemeIdFor(lemma: string) {
  // deterministic id; safe for upsert
  return `wk:he:verb:${lemma}`;
}

async function main() {
  const args = parseArgs(process.argv);

  const outDir = path.resolve('scripts/out');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `wiktionary_verbs_seed_${Date.now()}.json`);

  const { PrismaClient } = require('../../node_modules/@prisma/client');
  const prisma = new PrismaClient();

  // Pull single-token items that look like verbs (infinitive-ish) first.
  const items = await prisma.lessonItem.findMany({
    select: { target_hebrew: true },
  });

  const candidates: string[] = [];
  for (const it of items) {
    const t = normalizeHebrewToken(it.target_hebrew ?? '');
    if (!t) continue;
    if (t.includes(' ')) continue;
    // prioritize infinitive-looking forms; include a few others too
    if (t.startsWith('ל') && t.length >= 3) candidates.push(t);
  }

  // de-dupe and cap
  const unique = Array.from(new Set(candidates)).slice(0, args.limit);

  const results: any[] = [];
  let createdLexemes = 0;
  let createdInflections = 0;

  for (let i = 0; i < unique.length; i++) {
    const token = unique[i];

    let wikitext: string | null = null;
    let error: string | null = null;
    try {
      wikitext = await fetchWikitext(token);
    } catch (e: any) {
      error = e?.message ?? String(e);
    }

    if (!wikitext) {
      results.push({ token, ok: false, reason: 'no_page_or_fetch_failed', error });
      await sleep(args.sleepMs);
      continue;
    }

    const heSection = extractHebrewSection(wikitext);
    if (!heSection) {
      results.push({ token, ok: false, reason: 'no_hebrew_section' });
      await sleep(args.sleepMs);
      continue;
    }

    const parsed = parseVerbFromHebrewSection(token, heSection);
    if (!parsed) {
      results.push({ token, ok: false, reason: 'no_verb_templates_found' });
      await sleep(args.sleepMs);
      continue;
    }

    const lexemeId = lexemeIdFor(parsed.lemma);

    if (!args.dryRun) {
      // Upsert lexeme
      const existing = await prisma.lexeme.findUnique({ where: { id: lexemeId }, select: { id: true } });
      if (!existing) {
        await prisma.lexeme.create({
          data: {
            id: lexemeId,
            lemma: parsed.lemma,
            language: 'he',
            pos: 'verb',
            features: {
              source: 'wiktionary',
              seed: 'verbs_v1',
              createdAt: new Date().toISOString(),
            },
          },
        });
        createdLexemes++;
      }

      // Insert inflections if missing
      const formsToEnsure = [
        { form: parsed.infinitive, tense: 'infinitive', person: null, number: null, gender: null },
        // observed token itself (can be infinitive or another form)
        { form: parsed.observedForm, tense: null, person: null, number: null, gender: null },
      ];

      for (const f of formsToEnsure) {
        const exists = await prisma.inflection.findFirst({
          where: { lexeme_id: lexemeId, form: f.form },
          select: { id: true },
        });
        if (!exists) {
          await prisma.inflection.create({
            data: {
              lexeme_id: lexemeId,
              form: f.form,
              tense: f.tense,
              person: f.person,
              number: f.number,
              gender: f.gender,
              features: {
                source: 'wiktionary',
                pageTitle: parsed.pageTitle,
                seededAt: new Date().toISOString(),
              },
            },
          });
          createdInflections++;
        }
      }
    }

    results.push({ token, ok: true, parsed, lexemeId });

    if ((i + 1) % 25 === 0) {
      console.log(`progress ${i + 1}/${unique.length} (lexemes +${createdLexemes}, inflections +${createdInflections})`);
    }

    await sleep(args.sleepMs);
  }

  await prisma.$disconnect();

  const summary = {
    generatedAt: new Date().toISOString(),
    args,
    inputCount: unique.length,
    createdLexemes,
    createdInflections,
    okCount: results.filter(r => r.ok).length,
    failCount: results.filter(r => !r.ok).length,
    sampleOk: results.filter(r => r.ok).slice(0, 10),
    sampleFail: results.filter(r => !r.ok).slice(0, 10),
  };

  fs.writeFileSync(outPath, JSON.stringify({ summary, results }, null, 2));
  console.log(`wrote ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
