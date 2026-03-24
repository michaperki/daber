import { prisma } from '../Daber/lib/db';
import { runGenerationJob } from '../Daber/lib/generation/pipeline';

async function main() {
  console.log('Starting generation job...');
  const res = await runGenerationJob({ targets: 3, itemsPerTarget: 3 });
  console.log('Batch:', res.batchId);
  console.log('\nRaw LLM output (first 2000 chars):');
  console.log((res.raw || '').slice(0, 2000));
  console.log('\nParsed items:');
  console.log(res.llmItems);
  console.log('\nPersisted items:');
  const items = await prisma.lessonItem.findMany({ where: { id: { in: res.itemIds } }, select: { id: true, lesson_id: true, english_prompt: true, target_hebrew: true, difficulty: true } });
  for (const it of items) {
    console.log(`- ${it.id} [d=${it.difficulty}] ${it.english_prompt}  ⇄  ${it.target_hebrew}`);
  }
  const links = await prisma.generatedDrill.findMany({ where: { lesson_item_id: { in: res.itemIds } }, select: { lesson_item_id: true, drill_type: true, difficulty: true, grammar_focus: true } });
  console.log('\nGeneratedDrill links:');
  console.log(links);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { try { await prisma.$disconnect(); } catch {} });
