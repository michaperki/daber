import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function lowerFirst(s: string): string { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
function dropLeadingThe(s: string): string { return s.replace(/^\s*the\s+/i, '').trim(); }

async function main() {
  const apply = process.argv.includes('--apply');
  const items = await prisma.lessonItem.findMany({
    where: { },
    select: { id: true, english_prompt: true, features: true }
  });
  const changes: Array<{ id: string; before: string; after: string; reason: string }> = [];
  for (const it of items) {
    const f = (it.features as any) || {};
    const pos = typeof f.pos === 'string' ? f.pos.toLowerCase() : '';
    const en = (it.english_prompt || '').trim();
    if (!en || /^how\s+do\s+i\s+say/i.test(en)) continue;
    if (pos === 'noun') {
      const next = lowerFirst(dropLeadingThe(en));
      if (next !== en) changes.push({ id: it.id, before: en, after: next, reason: 'noun_drop_the' });
    } else if (pos === 'adjective') {
      const next = lowerFirst(en.replace(/\([^)]*\)/g, '').trim());
      if (next !== en) changes.push({ id: it.id, before: en, after: next, reason: 'adj_drop_parens' });
    }
  }
  if (!changes.length) {
    console.log('No candidates found');
  } else {
    console.log(JSON.stringify({ count: changes.length, sample: changes.slice(0, 10) }, null, 2));
    if (apply) {
      let updated = 0;
      for (const c of changes) {
        await prisma.lessonItem.update({ where: { id: c.id }, data: { english_prompt: c.after } }).catch(() => {});
        updated++;
      }
      console.log('Updated rows:', updated);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });

