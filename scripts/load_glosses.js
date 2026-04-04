// scripts/load_glosses.js
// Usage: DATABASE_URL="..." node scripts/load_glosses.js
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

async function main() {
  const p = new PrismaClient();
  const glossFile = path.join(__dirname, '..', 'data', 'glosses.json');
  
  if (!fs.existsSync(glossFile)) {
    console.error('Missing ' + glossFile);
    process.exit(1);
  }

  const glosses = JSON.parse(fs.readFileSync(glossFile, 'utf8'));
  const ids = Object.keys(glosses);
  console.log('Glosses to load: ' + ids.length);

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const id of ids) {
    const gloss = glosses[id];
    if (!gloss) { skipped++; continue; }

    try {
      const lex = await p.lexeme.findUnique({ where: { id }, select: { id: true, gloss: true, lemma: true } });
      if (!lex) { notFound++; continue; }
      if (lex.gloss && lex.gloss.trim() !== '') { skipped++; continue; }

      await p.lexeme.update({ where: { id }, data: { gloss } });
      updated++;
      console.log('  ' + lex.lemma + ' → ' + gloss);
    } catch (e) {
      console.error('  ERROR ' + id + ': ' + e.message.slice(0, 80));
    }
  }

  console.log('\nDone. Updated: ' + updated + ' | Skipped (already has gloss): ' + skipped + ' | Not found: ' + notFound);
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
