/*
  Extract Hebrew tokens from LessonItems for lexicon seeding.

  Output: newline-delimited tokens (normalized, no niqqud), plus a JSON summary.

  Usage:
    cd hebrew_drills
    npx ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/lexicon/extract_tokens.ts --out scripts/out/tokens.txt --json scripts/out/tokens_summary.json

  Options:
    --min-len N
    --max-tokens N
    --include-multiword   (tokenize phrases; default true)
*/

import fs from 'fs';
import path from 'path';

type Args = {
  out: string;
  json: string;
  minLen: number;
  maxTokens: number | null;
  includeMultiword: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    out: `scripts/out/tokens_${Date.now()}.txt`,
    json: `scripts/out/tokens_${Date.now()}.json`,
    minLen: 2,
    maxTokens: null,
    includeMultiword: true,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i] || args.out;
    else if (a === '--json') args.json = argv[++i] || args.json;
    else if (a === '--min-len') args.minLen = Number(argv[++i] || '2');
    else if (a === '--max-tokens') args.maxTokens = Number(argv[++i] || '0') || null;
    else if (a === '--include-multiword') args.includeMultiword = true;
    else if (a === '--no-multiword') args.includeMultiword = false;
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

// extremely conservative stopwords list (we can expand later)
const STOPWORDS = new Set([
  'את','של','או','לא','כן','הוא','היא','אני','אתה','אתם','אתן','אנחנו','הם','הן','זה','זאת','אלה','מה','מי','איך','למה','מתי','איפה',
  'עם','על','אל','ב','כ','ל','מ','ש','ו',
  'לי','לך','לו','לה','לנו','לכם','להם','להן','שלי','שלך','שלו','שלה','שלנו','שלכם','שלהם','שלהן',
]);

async function main() {
  const args = parseArgs(process.argv);
  const outPath = path.resolve(args.out);
  const jsonPath = path.resolve(args.json);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });

  const { PrismaClient } = require('../../node_modules/@prisma/client');
  const prisma = new PrismaClient();

  const items = await prisma.lessonItem.findMany({
    select: { target_hebrew: true },
  });

  let totalItems = 0;
  let totalTokens = 0;
  const uniq = new Set<string>();

  for (const it of items) {
    totalItems++;
    const text = it.target_hebrew ?? '';
    const tokens = args.includeMultiword ? tokenize(text) : [normalize(text)].filter(Boolean);

    for (const tok of tokens) {
      totalTokens++;
      if (tok.length < args.minLen) continue;
      if (STOPWORDS.has(tok)) continue;
      // ignore obvious non-hebrew tokens
      if (!/[\u0590-\u05FF]/.test(tok)) continue;
      uniq.add(tok);
      if (args.maxTokens && uniq.size >= args.maxTokens) break;
    }
    if (args.maxTokens && uniq.size >= args.maxTokens) break;
  }

  await prisma.$disconnect();

  const tokens = Array.from(uniq);
  tokens.sort((a, b) => a.localeCompare(b, 'he'));
  fs.writeFileSync(outPath, tokens.join('\n') + '\n');

  const summary = {
    generatedAt: new Date().toISOString(),
    totalItems,
    totalTokens,
    uniqueTokens: tokens.length,
    minLen: args.minLen,
    includeMultiword: args.includeMultiword,
    sample: tokens.slice(0, 50),
  };
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));

  console.log(`wrote ${outPath}`);
  console.log(`wrote ${jsonPath}`);
  console.log(summary);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
