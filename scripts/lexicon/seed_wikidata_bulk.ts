/*
  Bulk seed Wikidata Lexemes for Hebrew tokens (v1)

  This is the "consume a public dictionary" workhorse.

  Inputs:
  - tokens file (newline-delimited)

  Behavior:
  - For each token, search wikidata lexemes using multiple query variants:
      token
      strip leading punctuation
      strip leading ה/ל/ו/ב/כ/מ/ש (candidate only)
  - Fetch the lexeme entity and ingest:
      Lexeme id: wd:<LID>
      Lexeme.lemma: lemmas.he.value (normalized)
      Lexeme.pos: lexicalCategory Q-id
      Inflection.form: each forms[].representations.he.value (normalized)
      Inflection.features: store grammaticalFeatures Q-ids

  Idempotent: Lexeme is created only if not exists; inflections inserted if missing.

  Safety:
  - rate limited
  - resumable via --resume-state JSON file

  Usage:
    cd hebrew_drills
    npx ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/lexicon/seed_wikidata_bulk.ts \
      --in scripts/out/tokens.txt --limit 500 --sleep-ms 75
*/

import fs from 'fs';
import path from 'path';

type Args = {
  input: string;
  limit: number | null;
  sleepMs: number;
  dryRun: boolean;
  resumeState: string;
  outJson: string;
};

function parseArgs(argv: string[]): Args {
  const now = Date.now();
  const args: Args = {
    input: 'scripts/out/tokens.txt',
    limit: null,
    sleepMs: 75,
    dryRun: false,
    resumeState: `scripts/out/wd_seed_state.json`,
    outJson: `scripts/out/wd_seed_summary_${now}.json`,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--in') args.input = argv[++i] || args.input;
    else if (a === '--limit') args.limit = Number(argv[++i] || '0') || null;
    else if (a === '--sleep-ms') args.sleepMs = Number(argv[++i] || '75');
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--resume-state') args.resumeState = argv[++i] || args.resumeState;
    else if (a === '--out') args.outJson = argv[++i] || args.outJson;
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

const PREFIXES = ['ה', 'ל', 'ו', 'ב', 'כ', 'מ', 'ש'];

function queryVariants(tok: string): string[] {
  const t = normalizeHebrew(tok);
  const vars = new Set<string>();
  if (t) vars.add(t);
  if (t.length >= 3 && PREFIXES.includes(t[0])) vars.add(t.slice(1));
  return Array.from(vars);
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
    headers: { 'user-agent': 'daber-lexicon-seed/0.1 (wikidata bulk)' },
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
    headers: { 'user-agent': 'daber-lexicon-seed/0.1 (wikidata bulk)' },
    signal: controller.signal,
  }).finally(() => clearTimeout(t));

  const json: any = await res.json();
  return json?.entities?.[id] ?? null;
}

function getHebrewLemma(entity: any): string | null {
  const lemma = entity?.lemmas?.he?.value;
  return typeof lemma === 'string' ? normalizeHebrew(lemma) : null;
}

function getLexicalCategory(entity: any): string | null {
  const cat = entity?.lexicalCategory;
  return typeof cat === 'string' ? cat : null;
}

function getLanguage(entity: any): string | null {
  const lang = entity?.language;
  return typeof lang === 'string' ? lang : null;
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
    out.push({ form, grammaticalFeatures, raw: { id: f?.id, grammaticalFeatures } });
  }
  return out;
}

type State = {
  doneTokens: Record<string, true>;
};

function loadState(p: string): State {
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const json = JSON.parse(raw);
    return { doneTokens: json?.doneTokens || {} };
  } catch {
    return { doneTokens: {} };
  }
}

function saveState(p: string, state: State) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state, null, 2));
}

async function main() {
  const args = parseArgs(process.argv);
  const inPath = path.resolve(args.input);
  const statePath = path.resolve(args.resumeState);
  const outPath = path.resolve(args.outJson);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const tokensAll = fs
    .readFileSync(inPath, 'utf8')
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);

  const state = loadState(statePath);

  const { PrismaClient } = require('../../node_modules/@prisma/client');
  const prisma = new PrismaClient();

  let considered = 0;
  let ok = 0;
  let noLexeme = 0;
  let createdLexemes = 0;
  let createdInflections = 0;

  for (const tok of tokensAll) {
    if (args.limit && considered >= args.limit) break;
    if (state.doneTokens[tok]) continue;

    considered++;
    if (considered % 5 === 0) console.log(`token ${considered}: ${tok}`);

    let found: { lexemeId: string; entity: any; queryUsed: string } | null = null;
    let error: string | null = null;

    try {
      for (const q of queryVariants(tok)) {
        const lexemeId = await wikidataSearchLexeme(q);
        if (!lexemeId) continue;
        const entity = await wikidataGetLexeme(lexemeId);
        if (!entity) continue;
        found = { lexemeId, entity, queryUsed: q };
        break;
      }
    } catch (e: any) {
      error = e?.message ?? String(e);
    }

    if (!found) {
      noLexeme++;
      state.doneTokens[tok] = true;
      if (considered % 25 === 0) saveState(statePath, state);
      await sleep(args.sleepMs);
      continue;
    }

    const lemma = getHebrewLemma(found.entity);
    const lang = getLanguage(found.entity);
    const pos = getLexicalCategory(found.entity);
    const forms = getForms(found.entity);

    if (!lemma || !lang || !pos) {
      noLexeme++;
      state.doneTokens[tok] = true;
      if (considered % 25 === 0) saveState(statePath, state);
      await sleep(args.sleepMs);
      continue;
    }

    const daberLexemeId = `wd:${found.lexemeId}`;

    if (!args.dryRun) {
      const existing = await prisma.lexeme.findUnique({ where: { id: daberLexemeId }, select: { id: true } });
      if (!existing) {
        await prisma.lexeme.create({
          data: {
            id: daberLexemeId,
            lemma,
            language: 'he',
            pos,
            features: {
              source: 'wikidata',
              seededAt: new Date().toISOString(),
              wikidata: { id: found.lexemeId, language: lang, lexicalCategory: pos, queryUsed: found.queryUsed, token: tok },
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
            features: { source: 'wikidata', wikidata: { lexemeId: found.lexemeId, grammaticalFeatures: f.grammaticalFeatures, raw: f.raw } },
          },
        });
        createdInflections++;
      }
    }

    ok++;
    state.doneTokens[tok] = true;

    if (considered % 25 === 0) {
      saveState(statePath, state);
      console.log(`progress ${considered} ok=${ok} noLex=${noLexeme} +lex=${createdLexemes} +infl=${createdInflections}`);
    }

    await sleep(args.sleepMs);
  }

  saveState(statePath, state);
  await prisma.$disconnect();

  const summary = {
    generatedAt: new Date().toISOString(),
    input: args.input,
    considered,
    ok,
    noLexeme,
    createdLexemes,
    createdInflections,
    statePath: args.resumeState,
  };

  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(`wrote ${outPath}`);
  console.log(summary);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
