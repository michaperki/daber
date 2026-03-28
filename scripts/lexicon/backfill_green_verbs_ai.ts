import fs from 'fs';
import path from 'path';
import { z } from 'zod';

// Runs inside the Daber app (needs DATABASE_URL + OPENAI_API_KEY).
// Usage:
//   cd hebrew_drills
//   npx ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/lexicon/backfill_green_verbs_ai.ts --limit 5

type Args = { limit: number | null; inPath: string };
function parseArgs(argv: string[]): Args {
  const args: Args = { limit: null, inPath: 'scripts/out/green_targets_linked.json' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') args.limit = Number(argv[++i] || '0') || null;
    else if (a === '--in') args.inPath = argv[++i] || args.inPath;
  }
  return args;
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

const PRONOUNS = [
  { person: '1', number: 'sg', gender: null, label: 'אני' },
  { person: '2', number: 'sg', gender: 'm', label: 'אתה' },
  { person: '2', number: 'sg', gender: 'f', label: 'את' },
  { person: '3', number: 'sg', gender: 'm', label: 'הוא' },
  { person: '3', number: 'sg', gender: 'f', label: 'היא' },
  { person: '1', number: 'pl', gender: null, label: 'אנחנו' },
  { person: '2', number: 'pl', gender: 'm', label: 'אתם' },
  { person: '2', number: 'pl', gender: 'f', label: 'אתן' },
  { person: '3', number: 'pl', gender: 'm', label: 'הם' },
  { person: '3', number: 'pl', gender: 'f', label: 'הן' },
] as const;

const TENSES = ['present', 'past', 'future'] as const;

type CellKey = `${typeof TENSES[number]}|${typeof PRONOUNS[number]['person']}|${typeof PRONOUNS[number]['number']}|${'m' | 'f' | ''}`;

const zConj = z.object({
  infinitive: z.string().min(1),
  binyan: z.string().optional().nullable(),
  forms: z.array(z.object({
    tense: z.enum(TENSES as any),
    person: z.enum(['1', '2', '3']),
    number: z.enum(['sg', 'pl']),
    gender: z.enum(['m', 'f']).optional().nullable(),
    form: z.string().min(1),
  })).min(1)
});

async function main() {
  const args = parseArgs(process.argv);
  const inPath = path.resolve(args.inPath);
  const raw = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const items = Array.isArray(raw.items) ? raw.items : [];

  const lexemeIdsAll = Array.from(new Set(items.map((i: any) => i.lexeme_id).filter(Boolean)));

  // Prisma client is installed at repo root.
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  const lexemes = await prisma.lexeme.findMany({ where: { id: { in: lexemeIdsAll } }, select: { id: true, lemma: true, pos: true } });
  const verbLexemes = lexemes.filter((l: any) => l.pos === 'Q24905');

  // OpenAI client helper lives in the Next app
  const { getOpenAI } = require(path.resolve(__dirname, '../../Daber/lib/openai'));
  const openai = getOpenAI();

  let processed = 0;
  let created = 0;

  for (const l of verbLexemes) {
    if (args.limit && processed >= args.limit) break;
    processed++;

    const existing = await prisma.inflection.findMany({
      where: { lexeme_id: l.id },
      select: { id: true, form: true, tense: true, person: true, number: true, gender: true, binyan: true }
    });

    const have = new Set<string>();
    for (const e of existing) {
      if (!e.tense || !e.person || !e.number) continue;
      const key = [e.tense, e.person, e.number, e.gender || ''].join('|');
      have.add(key);
    }

    const missing: Array<{ tense: string; person: string; number: string; gender: string | null }> = [];
    for (const pr of PRONOUNS) {
      for (const t of TENSES) {
        const key = [t, pr.person, pr.number, pr.gender || ''].join('|');
        if (!have.has(key)) missing.push({ tense: t, person: pr.person, number: pr.number, gender: pr.gender });
      }
    }

    // Also require infinitive
    const hasInf = existing.some((e: any) => typeof e.form === 'string' && e.form.startsWith('ל') && !e.tense && !e.person);

    if (missing.length === 0 && hasInf) {
      console.log(`verb ${l.id} (${l.lemma}): already complete`);
      continue;
    }

    console.log(`verb ${l.id} (${l.lemma}): missing ${missing.length} cells; infinitive=${hasInf ? 'yes' : 'no'}`);

    const prompt = {
      lexeme: { id: l.id, lemma: normalizeHebrew(l.lemma) },
      existingSamples: existing.slice(0, 40).map((e: any) => ({ form: e.form, tense: e.tense, person: e.person, number: e.number, gender: e.gender })),
      required: {
        infinitive: true,
        grid: PRONOUNS.flatMap(pr => TENSES.map(t => ({ tense: t, person: pr.person, number: pr.number, gender: pr.gender }))),
      },
      rules: [
        'Hebrew output must be WITHOUT niqqud.',
        'Return modern Israeli Hebrew conjugations (standard).',
        'Be consistent. Prefer the most standard form for each cell.',
        'If multiple forms exist in common use, choose one (do not return multiple).',
        'Infinitive must start with ל (lamed).',
      ]
    };

    const sys = `You are a Hebrew morphology engine. Produce a complete conjugation paradigm for ONE Hebrew verb.
Return ONLY JSON matching this schema:
{ infinitive: string, binyan?: string|null, forms: Array<{tense: 'present'|'past'|'future', person:'1'|'2'|'3', number:'sg'|'pl', gender?:'m'|'f'|null, form:string}> }
All Hebrew MUST be unpointed (no niqqud).`;

    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: JSON.stringify(prompt) },
      ],
      response_format: { type: 'json_object' },
    });

    const content = resp.choices?.[0]?.message?.content || '';
    const parsed = zConj.parse(JSON.parse(content));

    const infinitive = normalizeHebrew(parsed.infinitive);

    if (!hasInf && infinitive && infinitive.startsWith('ל')) {
      await prisma.inflection.create({
        data: {
          lexeme_id: l.id,
          form: infinitive,
          // Use a dedicated tense marker so we can distinguish infinitives from legacy/null-feature rows.
          tense: 'infinitive',
          person: null,
          number: null,
          gender: null,
          binyan: parsed.binyan || null,
          features: { source: 'ai', kind: 'infinitive', generatedAt: new Date().toISOString() },
        }
      });
      created++;
    }

    // Insert missing cells
    for (const f of parsed.forms) {
      const form = normalizeHebrew(f.form);
      if (!form) continue;
      const key = [f.tense, f.person, f.number, (f.gender || '')].join('|');
      if (have.has(key)) continue;

      await prisma.inflection.create({
        data: {
          lexeme_id: l.id,
          form,
          tense: f.tense,
          person: f.person,
          number: f.number,
          gender: f.gender || null,
          binyan: parsed.binyan || null,
          features: { source: 'ai', generatedAt: new Date().toISOString() },
        }
      });
      created++;
      have.add(key);
    }
  }

  await prisma.$disconnect();
  console.log(JSON.stringify({ processed, created }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
