import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== DATA QUALITY INVESTIGATION ===\n');

  // 1. Search for the three specific bad items
  console.log('--- Item 1: "אני אשמח" / "I will try" ---');
  const item1a = await prisma.lessonItem.findMany({
    where: { target_hebrew: { contains: 'אשמח' } },
    include: { lesson: { select: { id: true, title: true, type: true, level: true } } },
  });
  for (const i of item1a) {
    console.log(JSON.stringify({ id: i.id, lesson_id: i.lesson_id, lesson_title: i.lesson.title, lesson_type: i.lesson.type, english_prompt: i.english_prompt, target_hebrew: i.target_hebrew, tags: i.tags, difficulty: i.difficulty, features: i.features }, null, 2));
  }
  // Also search by "I will try"
  const item1b = await prisma.lessonItem.findMany({
    where: { english_prompt: { contains: 'I will try' } },
    include: { lesson: { select: { id: true, title: true, type: true } } },
  });
  if (item1b.length) {
    console.log('\nMatches for "I will try" in english_prompt:');
    for (const i of item1b) {
      console.log(JSON.stringify({ id: i.id, english_prompt: i.english_prompt, target_hebrew: i.target_hebrew, lesson: i.lesson.title }, null, 2));
    }
  } else {
    console.log('\nNo items found with "I will try" in english_prompt.');
  }

  console.log('\n--- Item 2: "מה המצב רוח?" / "What is the matter?" ---');
  const item2a = await prisma.lessonItem.findMany({
    where: { target_hebrew: { contains: 'המצב רוח' } },
    include: { lesson: { select: { id: true, title: true, type: true } } },
  });
  for (const i of item2a) {
    console.log(JSON.stringify({ id: i.id, lesson_id: i.lesson_id, lesson_title: i.lesson.title, lesson_type: i.lesson.type, english_prompt: i.english_prompt, target_hebrew: i.target_hebrew, tags: i.tags, difficulty: i.difficulty, features: i.features }, null, 2));
  }
  const item2b = await prisma.lessonItem.findMany({
    where: { english_prompt: { contains: 'What is the matter' } },
    include: { lesson: { select: { id: true, title: true, type: true } } },
  });
  if (item2b.length) {
    console.log('\nMatches for "What is the matter" in english_prompt:');
    for (const i of item2b) {
      console.log(JSON.stringify({ id: i.id, english_prompt: i.english_prompt, target_hebrew: i.target_hebrew, lesson: i.lesson.title }, null, 2));
    }
  } else {
    console.log('\nNo items found with "What is the matter" in english_prompt.');
  }

  console.log('\n--- Item 3: "אני כותבת מסמך" / "I am writing a note" ---');
  const item3a = await prisma.lessonItem.findMany({
    where: { target_hebrew: { contains: 'כותבת מסמך' } },
    include: { lesson: { select: { id: true, title: true, type: true } } },
  });
  for (const i of item3a) {
    console.log(JSON.stringify({ id: i.id, lesson_id: i.lesson_id, lesson_title: i.lesson.title, lesson_type: i.lesson.type, english_prompt: i.english_prompt, target_hebrew: i.target_hebrew, tags: i.tags, difficulty: i.difficulty, features: i.features }, null, 2));
  }
  const item3b = await prisma.lessonItem.findMany({
    where: { english_prompt: { contains: 'writing a note' } },
    include: { lesson: { select: { id: true, title: true, type: true } } },
  });
  if (item3b.length) {
    console.log('\nMatches for "writing a note" in english_prompt:');
    for (const i of item3b) {
      console.log(JSON.stringify({ id: i.id, english_prompt: i.english_prompt, target_hebrew: i.target_hebrew, lesson: i.lesson.title }, null, 2));
    }
  } else {
    console.log('\nNo items found with "writing a note" in english_prompt.');
  }
  // Also search for מסמך broadly
  const item3c = await prisma.lessonItem.findMany({
    where: { target_hebrew: { contains: 'מסמך' } },
    include: { lesson: { select: { id: true, title: true, type: true } } },
  });
  console.log(`\nAll items containing "מסמך" in target_hebrew (${item3c.length} total):`);
  for (const i of item3c) {
    console.log(`  ${i.id} | "${i.english_prompt}" → "${i.target_hebrew}" [${i.lesson.title}]`);
  }

  // 2. Count LessonItems where english_prompt ends with "?"
  console.log('\n\n--- Question mark analysis ---');
  const qMarkItems = await prisma.lessonItem.findMany({
    where: { english_prompt: { endsWith: '?' } },
    select: { id: true, english_prompt: true, target_hebrew: true, lesson_id: true, tags: true },
  });
  console.log(`Total LessonItems with english_prompt ending in "?": ${qMarkItems.length}`);

  const totalItems = await prisma.lessonItem.count();
  console.log(`Total LessonItems: ${totalItems}`);
  console.log(`Percentage with "?": ${((qMarkItems.length / totalItems) * 100).toFixed(1)}%`);

  // Check if there are generator-created items with "?"
  const genQMark = qMarkItems.filter(i => i.id.startsWith('gen_'));
  console.log(`Generator-created items with "?": ${genQMark.length}`);

  // Non-generator items with "?"
  const nonGenQMark = qMarkItems.filter(i => !i.id.startsWith('gen_'));
  console.log(`Non-generator items with "?": ${nonGenQMark.length}`);

  // 3. Sample of questionable items (non-questions ending in ?)
  console.log('\n--- Sample non-generator items ending in "?" ---');
  const sample = nonGenQMark.slice(0, 20);
  for (const s of sample) {
    console.log(`  ${s.id} | "${s.english_prompt}" → "${s.target_hebrew}"`);
  }

  // 4. Breakdown by lesson
  console.log('\n--- Breakdown by lesson ---');
  const byLesson = new Map<string, number>();
  for (const i of qMarkItems) {
    byLesson.set(i.lesson_id, (byLesson.get(i.lesson_id) || 0) + 1);
  }
  const sorted = Array.from(byLesson.entries()).sort((a, b) => b[1] - a[1]);
  for (const [lid, count] of sorted.slice(0, 20)) {
    const lesson = await prisma.lesson.findUnique({ where: { id: lid }, select: { title: true, type: true } });
    console.log(`  ${lid} (${lesson?.type || '?'}) "${lesson?.title}": ${count} items`);
  }

  // 5. Generator items sample
  console.log('\n--- Sample generator items ending in "?" ---');
  for (const g of genQMark.slice(0, 10)) {
    console.log(`  ${g.id} | "${g.english_prompt}" → "${g.target_hebrew}"`);
  }

  // 6. Check GeneratedDrill/GeneratedBatch tables
  console.log('\n--- GeneratedDrill / GeneratedBatch tables ---');
  const batchCount = await prisma.generatedBatch.count();
  const drillCount = await prisma.generatedDrill.count();
  console.log(`GeneratedBatch count: ${batchCount}`);
  console.log(`GeneratedDrill count: ${drillCount}`);

  if (drillCount > 0) {
    const sampleDrills = await prisma.generatedDrill.findMany({
      take: 5,
      include: { lesson_item: { select: { english_prompt: true, target_hebrew: true } } },
    });
    console.log('Sample GeneratedDrills:');
    for (const d of sampleDrills) {
      console.log(`  ${d.id} | type=${d.drill_type} | "${d.lesson_item.english_prompt}" → "${d.lesson_item.target_hebrew}"`);
    }
  }

  // 7. Check if the 3 specific items might be in GeneratedDrill
  console.log('\n--- Checking if bad items are LLM-generated ---');
  for (const heb of ['אשמח', 'המצב רוח', 'כותבת מסמך']) {
    const items = await prisma.lessonItem.findMany({
      where: { target_hebrew: { contains: heb } },
      select: { id: true, generatedDrills: true },
    });
    for (const i of items) {
      console.log(`  ${i.id}: generatedDrills=${JSON.stringify(i.generatedDrills)}`);
    }
  }

  // 8. Items with nikkud (Hebrew vowel marks U+05B0-05BD, U+05BF, U+05C1-05C2, U+05C4-05C5, U+05C7)
  console.log('\n--- Items containing nikkud (vowel points) ---');
  const allItems = await prisma.lessonItem.findMany({
    select: { id: true, target_hebrew: true, lesson_id: true },
  });
  const nikkudRegex = /[\u05B0-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/;
  const withNikkud = allItems.filter(i => nikkudRegex.test(i.target_hebrew));
  console.log(`Items with nikkud in target_hebrew: ${withNikkud.length} out of ${allItems.length}`);
  if (withNikkud.length) {
    console.log('Sample:');
    for (const i of withNikkud.slice(0, 10)) {
      console.log(`  ${i.id} → "${i.target_hebrew}" [${i.lesson_id}]`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
