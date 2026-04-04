/**
 * Backfill Lexeme.gloss for all lexemes missing an English gloss.
 * Uses OpenAI gpt-4o-mini to generate concise dictionary-style glosses.
 * Idempotent — skips lexemes that already have a non-empty gloss.
 *
 * Run: npx ts-node --compiler-options '{"module":"commonjs","strict":false}' scripts/backfill_glosses.ts
 *
 * Requires OPENAI_API_KEY in environment (or .env via dotenv).
 */
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

// Load .env if present
try { require('dotenv').config({ path: require('path').resolve(__dirname, '../Daber/.env.local') }); } catch {}
try { require('dotenv').config({ path: require('path').resolve(__dirname, '../Daber/.env') }); } catch {}

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const BATCH_SIZE = 10;
const DELAY_MS = 200;

interface LexemeWithInflections {
  id: string;
  lemma: string;
  pos: string;
  inflections: { form: string }[];
}

async function getGloss(lex: LexemeWithInflections): Promise<string> {
  const sampleForms = lex.inflections
    .slice(0, 3)
    .map(i => i.form)
    .join(', ');

  const prompt = `You are a Hebrew-English dictionary. Given a Hebrew word, provide a concise English gloss (1-3 words).
Word: ${lex.lemma}
Part of speech: ${lex.pos}${sampleForms ? `\nSample forms: ${sampleForms}` : ''}
Respond with ONLY the English gloss, nothing else.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 20,
    temperature: 0,
  });

  return (response.choices[0]?.message?.content ?? '').trim();
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const lexemes = await prisma.lexeme.findMany({
    where: {
      OR: [
        { gloss: null },
        { gloss: '' },
      ],
    },
    include: {
      inflections: { select: { form: true }, take: 3 },
    },
    orderBy: { pos: 'asc' },
  });

  console.log(`Found ${lexemes.length} lexemes without glosses.\n`);

  if (lexemes.length === 0) {
    console.log('Nothing to do.');
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  let failed = 0;
  const failures: string[] = [];

  for (let i = 0; i < lexemes.length; i += BATCH_SIZE) {
    const batch = lexemes.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (lex) => {
        const gloss = await getGloss(lex);
        if (!gloss) throw new Error('Empty gloss returned');
        await prisma.lexeme.update({
          where: { id: lex.id },
          data: { gloss },
        });
        console.log(`  ${lex.lemma} | ${lex.pos} | ${gloss}`);
        return gloss;
      })
    );

    for (let j = 0; j < results.length; j++) {
      if (results[j].status === 'fulfilled') {
        updated++;
      } else {
        failed++;
        const lex = batch[j];
        const reason = (results[j] as PromiseRejectedResult).reason;
        failures.push(`${lex.lemma} (${lex.id}): ${reason}`);
        console.error(`  FAILED: ${lex.lemma} — ${reason}`);
      }
    }

    // Rate-limit pause between batches
    if (i + BATCH_SIZE < lexemes.length) {
      await sleep(DELAY_MS);
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Total without gloss: ${lexemes.length}`);
  console.log(`Updated: ${updated}`);
  console.log(`Failed: ${failed}`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  ${f}`));
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
