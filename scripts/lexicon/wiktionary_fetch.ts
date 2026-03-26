/*
  Wiktionary Hebrew entry fetcher (spike)

  Goal:
  - Given a list of Hebrew tokens (no niqqud preferred), fetch the corresponding Wiktionary page
  - Extract whether a Hebrew section exists + what POS sections exist
  - (Later) parse conjugation/declension templates into structured inflections

  This is deliberately lightweight and resilient; it outputs JSONL for inspection.

  Usage:
    ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/lexicon/wiktionary_fetch.ts --in tokens.txt --out out.jsonl

  Or pull tokens from the DB:
    ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/lexicon/wiktionary_fetch.ts --from-db --limit 200 --out out.jsonl
*/

import fs from 'fs';
import path from 'path';

type Args = {
  in?: string;
  out: string;
  limit: number;
  fromDb: boolean;
  lang: 'en';
  sleepMs: number;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    out: 'scripts/out/wiktionary_he.jsonl',
    limit: 200,
    fromDb: false,
    lang: 'en',
    sleepMs: 250,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--in') args.in = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--limit') args.limit = Number(argv[++i] || '200');
    else if (a === '--from-db') args.fromDb = true;
    else if (a === '--sleep-ms') args.sleepMs = Number(argv[++i] || '250');
    else if (a === '--lang') {
      const v = (argv[++i] as any) || 'en';
      if (v !== 'en') throw new Error(`unsupported --lang ${v}`);
      args.lang = v;
    }
  }

  if (!args.fromDb && !args.in) {
    throw new Error('Provide --in tokens.txt or use --from-db');
  }

  return args;
}

function sleep(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}

function stripNiqqud(s: string) {
  return s.replace(/[\u0591-\u05C7]/g, '');
}

function normalizeToken(s: string) {
  return stripNiqqud(s)
    .replace(/["“”„׳״']/g, '')
    .replace(/[\-–—]/g, ' ')
    .replace(/[.,!?()\[\]{}:;\/\\|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

async function fetchWikitext(title: string): Promise<string | null> {
  // MediaWiki API: parse wikitext
  const url = new URL('https://en.wiktionary.org/w/api.php');
  url.searchParams.set('action', 'parse');
  url.searchParams.set('format', 'json');
  url.searchParams.set('prop', 'wikitext');
  url.searchParams.set('page', title);
  // Origin for CORS (not needed for node but harmless)
  url.searchParams.set('origin', '*');

  const res = await fetch(url.toString(), {
    headers: {
      'user-agent': 'daber-lexicon-spike/0.1 (https://daber.app; contact: repo owner)',
    },
  });

  if (res.status === 404) return null;
  const json: any = await res.json();
  if (json?.error) return null;
  const wt = json?.parse?.wikitext?.['*'];
  return typeof wt === 'string' ? wt : null;
}

function extractHebrewPosFromWikitext(wikitext: string): { hasHebrew: boolean; pos: string[] } {
  // Extremely simple heuristic:
  // - Find the Hebrew language section header: ==Hebrew==
  // - Collect level-3 headers under it: ===Verb===, ===Noun===, etc.
  const lines = wikitext.split('\n');

  let inHebrew = false;
  let hasHebrew = false;
  const pos: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    // Level-2 header: must be exactly 2 '=' on each side (not 3+)
    const l2 = line.match(/^==\s*([^=].*?)\s*==\s*$/);
    if (l2) {
      const header = l2[1].trim();
      inHebrew = header.toLowerCase() === 'hebrew';
      if (inHebrew) hasHebrew = true;
      continue;
    }

    if (!inHebrew) continue;

    // Level-3 header: must be exactly 3 '=' on each side (not 4+)
    const l3 = line.match(/^===\s*([^=].*?)\s*===\s*$/);
    if (l3) {
      const h = l3[1].trim();
      // keep common POS and a few relevant section types
      pos.push(h);
    }
  }

  return { hasHebrew, pos: unique(pos) };
}

async function readTokensFromFile(filePath: string, limit: number): Promise<string[]> {
  const raw = fs.readFileSync(filePath, 'utf8');
  const tokens = raw
    .split(/\r?\n/)
    .map(s => normalizeToken(s))
    .filter(Boolean);
  return unique(tokens).slice(0, limit);
}

async function readTokensFromDb(limit: number): Promise<string[]> {
  // Load Prisma dynamically so this script can run from repo root.
  const { PrismaClient } = require('../../node_modules/@prisma/client');
  const prisma = new PrismaClient();

  const items = await prisma.lessonItem.findMany({
    select: { target_hebrew: true },
  });

  const tokens: string[] = [];
  for (const it of items) {
    const t = normalizeToken(it.target_hebrew ?? '');
    if (!t) continue;
    // single-token only for this spike
    if (t.includes(' ')) continue;
    // skip short tokens
    if (t.length < 2) continue;
    tokens.push(t);
  }

  await prisma.$disconnect();

  return unique(tokens).slice(0, limit);
}

async function main() {
  const args = parseArgs(process.argv);
  const outPath = path.resolve(args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const tokens = args.fromDb
    ? await readTokensFromDb(args.limit)
    : await readTokensFromFile(path.resolve(args.in!), args.limit);

  const out = fs.createWriteStream(outPath, { flags: 'w' });

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    let wikitext: string | null = null;
    let error: string | null = null;

    try {
      wikitext = await fetchWikitext(token);
    } catch (e: any) {
      error = e?.message ?? String(e);
    }

    let hasHebrew = false;
    let pos: string[] = [];
    if (wikitext) {
      const extracted = extractHebrewPosFromWikitext(wikitext);
      hasHebrew = extracted.hasHebrew;
      pos = extracted.pos;
    }

    const row = {
      token,
      hasWiktionaryPage: Boolean(wikitext),
      hasHebrew,
      pos,
      error,
    };

    out.write(JSON.stringify(row) + '\n');

    if ((i + 1) % 25 === 0) {
      console.log(`progress ${i + 1}/${tokens.length}`);
    }

    await sleep(args.sleepMs);
  }

  out.end();
  console.log(`wrote ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
