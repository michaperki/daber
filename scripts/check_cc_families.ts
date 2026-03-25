import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
(async () => {
  const count = await prisma.lessonItem.count({ where: { lesson: { id: { startsWith: 'cc_' } }, NOT: { family_id: null } } });
  const total = await prisma.lessonItem.count({ where: { lesson: { id: { startsWith: 'cc_' } } } });
  console.log(JSON.stringify({ cc_items_with_family: count, total_cc_items: total, ratio: Number((count/total).toFixed(3)) }, null, 2));
})().catch(e => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
