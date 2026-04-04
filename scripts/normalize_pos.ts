/**
 * Normalize Lexeme.pos from Wikidata Q-codes to clean labels.
 * Idempotent — skips lexemes that already have clean labels.
 *
 * Run: npx ts-node --compiler-options '{"module":"commonjs","strict":false}' scripts/normalize_pos.ts
 */
import { PrismaClient } from '@prisma/client';
import path from 'path';

try { require('dotenv').config({ path: path.resolve(__dirname, '../Daber/.env') }); } catch {}

const prisma = new PrismaClient();

const Q_CODE_MAP: Record<string, string> = {
  'Q1084':    'noun',
  'Q24905':   'verb',
  'Q34698':   'adjective',
  'Q380057':  'adverb',
  'Q4833830': 'preposition',
  'Q63116':   'numeral',
  'Q147276':  'proper_noun',
  'Q36224':   'pronoun',
  'Q36484':   'conjunction',
  'Q83034':   'interjection',
  'Q1478451': 'participle',
  'Q576271':  'determiner',
};

async function main() {
  // Before: count per POS value
  const before = await prisma.lexeme.groupBy({
    by: ['pos'],
    _count: { pos: true },
    orderBy: { _count: { pos: 'desc' } },
  });

  console.log('=== BEFORE ===');
  for (const row of before) {
    console.log(`  ${row.pos}: ${row._count.pos}`);
  }

  // Update each Q-code
  let totalUpdated = 0;
  for (const [qCode, label] of Object.entries(Q_CODE_MAP)) {
    const result = await prisma.lexeme.updateMany({
      where: { pos: qCode },
      data: { pos: label },
    });
    if (result.count > 0) {
      console.log(`  ${qCode} → ${label}: ${result.count} updated`);
      totalUpdated += result.count;
    }
  }

  console.log(`\nTotal updated: ${totalUpdated}`);

  // After: count per POS value
  const after = await prisma.lexeme.groupBy({
    by: ['pos'],
    _count: { pos: true },
    orderBy: { _count: { pos: 'desc' } },
  });

  console.log('\n=== AFTER ===');
  for (const row of after) {
    console.log(`  ${row.pos}: ${row._count.pos}`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
