/*
  Seed Lexeme/Inflection from Wikidata Lexemes (Hebrew) — v1

  Why Wikidata:
  - Truly public, structured lexeme + forms with grammatical features.
  - Much better suited than Wiktionary for programmatic lexicon building.

  v1 scope:
  - Search for lexemes by exact/near-exact lemma string (Hebrew)
  - Ingest:
      Lexeme id: wd:<LID>
      Lexeme.lemma: entities[L].lemmas.he.value (strip niqqud for canonical)
      Lexeme.pos: lexicalCategory id (stored as Q-id string for now)
      Inflection.form: each form representation (strip niqqud for canonical)
      Inflection.features: grammaticalFeatures (Q-ids) + raw

  Usage:
    cd hebrew_drills
    npx ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/lexicon/seed_wikidata_lexemes.ts --limit 50

  Notes:
  - Idempotent via lexeme id = wd:<LID>
  - Does NOT attempt to map Q-ids to tense/person/gender yet; that’s Phase 2.
*/

import fs from 'fs';
import path from 'path';

type Args = { limit: number; dryRun: boolean; sleepMs: number };

function parseArgs(argv: string[]): Args {
  const args: Args = { limit: 50, dryRun: false, sleepMs: 100 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') args.limit = Number(argv[++i] || '50');
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

function normalizeHebrew(s: string) {
  return stripNiqqud(s)
    .replace(/["“”„׳״']/g, '')
    .replace(/[\-–—]/g, ' ')
    .replace(/[.,!?()\[\]{}:;\/\\|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function wikidataSearchLexeme(query: string, timeoutMs = 10000): Promise<string | null> {
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.searchParams.set('action', 'wbsearchentities');
  url.searchParams.set('format', 'json');
  url.searchParams.set('language', 'he');
  url.searchParams.set('uselang', 'en');
  url.searchParams.set('type', 'lexeme');
  url.searchParams.set('limit', '1');
  url.searchParams.set('search', query);

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const res = await fetch(url.toString(), {
    headers: { 'user-agent': 'daber-lexicon-seed/0.1 (wikidata lexemes v1)' },
    signal: controller.signal,
  }).finally(() => clearTimeout(t));
  const json: any = await res.json();
  const id = json?.search?.[0]?.id;
  return typeof id === 'string' ? id : null;
}

async function wikidataGetLexeme(id: string, timeoutMs = 10000): Promise<any | null> {
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.searchParams.set('action', 'wbgetentities');
  url.searchParams.set('format', 'json');
  url.searchParams.set('ids', id);

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const res = await fetch(url.toString(), {
    headers: { 'user-agent': 'daber-lexicon-seed/0.1 (wikidata lexemes v1)' },
    signal: controller.signal,
  }).finally(() => clearTimeout(t));
  const json: any = await res.json();
  return json?.entities?.[id] ?? null;
}

function getBestHebrewLemma(entity: any): string | null {
  const lemma = entity?.lemmas?.he?.value;
  return typeof lemma === 'string' ? normalizeHebrew(lemma) : null;
}

function getLexicalCategory(entity: any): string | null {
  const cat = entity?.lexicalCategory;
  return typeof cat === 'string' ? cat : null; // Q-id
}

function getLanguage(entity: any): string | null {
  const lang = entity?.language;
  return typeof lang === 'string' ? lang : null; // Q-id (Hebrew language is Q9288)
}

function getForms(entity: any): Array<{ form: string; grammaticalFeatures: string[]; raw: any }> {
  const forms = Array.isArray(entity?.forms) ? entity.forms : [];
  const out: Array<{ form: string; grammaticalFeatures: string[]; raw: any }> = [];
  for (const f of forms) {
    const rep = f?.representations?.he?.value;
    if (typeof rep !== 'string') continue;
    const form = normalizeHebrew(rep);
    if (!form) continue;
    const grammaticalFeatures = Array.isArray(f?.grammaticalFeatures)
      ? f.grammaticalFeatures.filter((x: any) => typeof x === 'string')
      : [];
    out.push({ form, grammaticalFeatures, raw: { id: f?.id, representations: f?.representations, grammaticalFeatures } });
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);

  const outDir = path.resolve('scripts/out');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `wikidata_lexemes_seed_${Date.now()}.json`);

  const { PrismaClient } = require('../../node_modules/@prisma/client');
  const prisma = new PrismaClient();

  const items = await prisma.lessonItem.findMany({ select: { target_hebrew: true } });
  const candidates: string[] = [];
  for (const it of items) {
    const t = normalizeHebrew(it.target_hebrew ?? '');
    if (!t) continue;
    if (t.includes(' ')) continue;
    // prioritize infinitive-looking tokens and medium-length tokens
    if (t.length < 2) continue;
    if (t.startsWith('ל') || t.length >= 4) candidates.push(t);
  }
  const unique = Array.from(new Set(candidates)).slice(0, args.limit);

  const results: any[] = [];
  let createdLexemes = 0;
  let createdInflections = 0;

  for (let i = 0; i < unique.length; i++) {
    const token = unique[i];
    if ((i + 1) % 5 === 0) console.log(`searching ${i + 1}/${unique.length}: ${token}`);

    let lexemeId: string | null = null;
    let entity: any | null = null;
    let error: string | null = null;

    const queries: string[] = [token];
    // If infinitive-like, also try stripping leading ל.
    if (token.startsWith('ל') && token.length > 2) queries.push(token.slice(1));
    // If definite-article-like, also try stripping leading ה.
    if (token.startsWith('ה') && token.length > 2) queries.push(token.slice(1));

    try {
      for (const q of queries) {
        lexemeId = await wikidataSearchLexeme(q);
        if (lexemeId) break;
      }
      if (lexemeId) entity = await wikidataGetLexeme(lexemeId);
    } catch (e: any) {
      error = e?.message ?? String(e);
    }

    if (!lexemeId || !entity) {
      results.push({ token, ok: false, reason: 'no_lexeme_found', error });
      await sleep(args.sleepMs);
      continue;
    }

    const lemma = getBestHebrewLemma(entity);
    const lang = getLanguage(entity);
    const pos = getLexicalCategory(entity);
    const forms = getForms(entity);

    if (!lemma || !lang || !pos) {
      results.push({ token, ok: false, reason: 'missing_fields', lexemeId, lemma, lang, pos });
      await sleep(args.sleepMs);
      continue;
    }

    const daberLexemeId = `wd:${lexemeId}`;

    if (!args.dryRun) {
      const existing = await prisma.lexeme.findUnique({ where: { id: daberLexemeId }, select: { id: true } });
      if (!existing) {
        await prisma.lexeme.create({
          data: {
            id: daberLexemeId,
            lemma,
            language: 'he',
            pos: pos, // Q-id for now
            features: {
              source: 'wikidata',
              wikidata: { id: lexemeId, language: lang, lexicalCategory: pos },
              seededAt: new Date().toISOString(),
            },
          },
        });
        createdLexemes++;
      }

      for (const f of forms) {
        const exists = await prisma.inflection.findFirst({ where: { lexeme_id: daberLexemeId, form: f.form }, select: { id: true } });
        if (exists) continue;

        await prisma.inflection.create({
          data: {
            lexeme_id: daberLexemeId,
            form: f.form,
            features: {
              source: 'wikidata',
              wikidata: {
                lexemeId,
                grammaticalFeatures: f.grammaticalFeatures,
                raw: f.raw,
              },
            },
          },
        });
        createdInflections++;
      }
    }

    results.push({ token, ok: true, lexemeId, lemma, lang, pos, formCount: forms.length });

    if ((i + 1) % 10 === 0) {
      console.log(`progress ${i + 1}/${unique.length} (+lex ${createdLexemes}, +infl ${createdInflections})`);
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
