// scripts/normalize_pos.js
// Usage: DATABASE_URL="..." node scripts/normalize_pos.js
const { PrismaClient } = require('@prisma/client');

const POS_MAP = {
  'Q1084': 'noun',
  'Q24905': 'verb',
  'Q34698': 'adjective',
  'Q380057': 'adverb',
  'Q4833830': 'preposition',
  'Q63116': 'numeral',
  'Q147276': 'proper_noun',
  'Q36224': 'pronoun',
  'Q36484': 'conjunction',
  'Q83034': 'interjection',
  'Q1478451': 'participle',
  'Q576271': 'determiner',
};

async function main() {
  const p = new PrismaClient();

  console.log('=== BEFORE ===');
  const before = await p.lexeme.groupBy({ by: ['pos'], _count: true, orderBy: { _count: { pos: 'desc' } } });
  before.forEach(r => console.log('  ' + r.pos + ': ' + r._count));

  for (const [qcode, label] of Object.entries(POS_MAP)) {
    const result = await p.lexeme.updateMany({ where: { pos: qcode }, data: { pos: label } });
    if (result.count > 0) console.log('\n  ' + qcode + ' → ' + label + ': ' + result.count + ' updated');
  }

  console.log('\n=== AFTER ===');
  const after = await p.lexeme.groupBy({ by: ['pos'], _count: true, orderBy: { _count: { pos: 'desc' } } });
  after.forEach(r => console.log('  ' + r.pos + ': ' + r._count));

  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
