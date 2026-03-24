import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const KNOWN_LEVELS = ['blue', 'light_blue', 'lime', 'orange', 'pink', 'red', 'yellow'];
const GREEN_LEVEL = 'green';

async function main() {
  const now = new Date().toISOString();

  // Batch 1: Known levels → correct_streak=2 (free_recall)
  const knownResult = await prisma.$executeRawUnsafe(`
    INSERT INTO "ItemStat" (lesson_item_id, correct_streak, easiness, interval_days, next_due, correct_count, flawed_count, incorrect_count)
    SELECT li.id, 2, 2.5, 6, $1::timestamp, 0, 0, 0
    FROM "LessonItem" li
    JOIN "Lesson" l ON li.lesson_id = l.id
    WHERE l.id LIKE 'cc_%'
      AND LOWER(l.level) IN (${KNOWN_LEVELS.map((_, i) => `$${i + 2}`).join(', ')})
    ON CONFLICT (lesson_item_id) DO UPDATE SET
      correct_streak = CASE WHEN "ItemStat".correct_streak < 2 THEN 2 ELSE "ItemStat".correct_streak END,
      easiness = CASE WHEN "ItemStat".correct_streak < 2 THEN 2.5 ELSE "ItemStat".easiness END,
      interval_days = CASE WHEN "ItemStat".correct_streak < 2 THEN 6 ELSE "ItemStat".interval_days END,
      next_due = CASE WHEN "ItemStat".correct_streak < 2 THEN $1::timestamp ELSE "ItemStat".next_due END
  `, now, ...KNOWN_LEVELS);

  console.log(`Known levels (free_recall): ${knownResult} rows affected`);

  // Batch 2: Green level → correct_streak=0 (recognition, not intro)
  const greenResult = await prisma.$executeRawUnsafe(`
    INSERT INTO "ItemStat" (lesson_item_id, correct_streak, easiness, interval_days, next_due, correct_count, flawed_count, incorrect_count)
    SELECT li.id, 0, 2.5, 0, $1::timestamp, 0, 0, 0
    FROM "LessonItem" li
    JOIN "Lesson" l ON li.lesson_id = l.id
    WHERE l.id LIKE 'cc_%'
      AND LOWER(l.level) = $2
    ON CONFLICT (lesson_item_id) DO NOTHING
  `, now, GREEN_LEVEL);

  console.log(`Green level (recognition): ${greenResult} rows affected`);

  // Summary
  const total = await prisma.itemStat.count({
    where: { lesson_item_id: { startsWith: 'cc_' } },
  });
  console.log(`Total CC ItemStat records: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
