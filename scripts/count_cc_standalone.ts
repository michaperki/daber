import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function isBareHebrew(str: string): boolean {
  const s = (str || '').trim();
  if (!s) return false;
  // Only Hebrew letters and spaces
  if (!/^[\p{Script=Hebrew}\s]+$/u.test(s)) return false;
  const tokens = s.split(/\s+/).filter(Boolean);
  return tokens.length <= 2;
}

async function main() {
  const items = await prisma.lessonItem.findMany({
    where: { lesson: { id: { startsWith: 'cc_' } } },
    select: { id: true, lesson_id: true, english_prompt: true, target_hebrew: true }
  });
  let total = 0;
  let bare = 0;
  const examples: Array<{ id: string; he: string; en: string; lesson: string }> = [];
  for (const it of items) {
    total++;
    if (isBareHebrew(it.target_hebrew)) {
      bare++;
      if (examples.length < 20) examples.push({ id: it.id, he: it.target_hebrew, en: it.english_prompt, lesson: it.lesson_id });
    }
  }
  console.log(JSON.stringify({ total_cc_items: total, bare_candidates: bare, ratio: Number((bare / total).toFixed(3)), examples }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });

