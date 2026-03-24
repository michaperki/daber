import { prisma } from '../Daber/lib/db';

async function main() {
  const items = await prisma.lessonItem.findMany({
    where: { lesson_id: 'vocab_all_gen' },
    orderBy: { id: 'desc' },
    take: 20,
    select: { id: true, english_prompt: true, target_hebrew: true, difficulty: true }
  });
  console.log('Recent generated items:');
  for (const it of items) {
    console.log(`- ${it.id} [d=${it.difficulty}] ${it.english_prompt}  ⇄  ${it.target_hebrew}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { try { await prisma.$disconnect(); } catch {} });

