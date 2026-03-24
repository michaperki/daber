import { prisma } from '../Daber/lib/db';

async function computePhaseFor(itemId: string): Promise<'intro' | 'recognition' | 'free_recall'> {
  const stat = await prisma.itemStat.findUnique({ where: { lesson_item_id: itemId } });
  if (stat) {
    const streak = stat.correct_streak || 0;
    return streak === 0 ? 'recognition' : 'free_recall';
  }
  const li = await prisma.lessonItem.findUnique({ where: { id: itemId }, select: { family_id: true, lexeme_id: true } });
  const familyId = (li?.family_id) || (li?.lexeme_id ? `lex:${li.lexeme_id}` : null);
  if (!familyId) return 'intro';
  const fam = await prisma.familyStat.findUnique({ where: { family_id: familyId } });
  return fam ? 'recognition' : 'intro';
}

async function maybeSwapToFamilyBase(itemId: string, allowedLessonIds: string[]): Promise<string> {
  const li = await prisma.lessonItem.findUnique({ where: { id: itemId }, select: { family_id: true, lexeme_id: true } });
  const familyId = (li?.family_id) || (li?.lexeme_id ? `lex:${li.lexeme_id}` : null);
  if (!familyId) return itemId;
  const famIntro = await prisma.familyStat.findUnique({ where: { family_id: familyId } });
  if (famIntro) return itemId;
  const base = await prisma.lessonItem.findFirst({ where: { family_id: familyId, lesson_id: { in: allowedLessonIds }, family_base: true }, select: { id: true } });
  return base?.id || itemId;
}

async function main() {
  // Reset any prior stats for a clean test
  const subset = ['ptb01_005','ptb01_006','ptb01_007','ptb01_008'];
  await prisma.attempt.deleteMany({ where: { lesson_item_id: { in: subset } } }).catch(() => {});
  await prisma.itemStat.deleteMany({ where: { lesson_item_id: { in: subset } } }).catch(() => {});
  await prisma.familyStat.deleteMany({ where: { family_id: 'fam_ktov' } }).catch(() => {});

  // Pick a non-base item and ensure we would swap to base on intro
  const nonBaseId = 'ptb01_007';
  const swapped1 = await maybeSwapToFamilyBase(nonBaseId, ['present_tense_basics_01']);
  console.log('Before intro, non-base resolves to:', swapped1);
  const phase1 = await computePhaseFor(swapped1);
  console.log('Phase of resolved item:', phase1);

  // Simulate intro seen on the resolved item: mark family introduced
  await prisma.familyStat.upsert({ where: { family_id: 'fam_ktov' }, update: {}, create: { family_id: 'fam_ktov' } });

  // Now another non-base should no longer swap, and phase should be recognition
  const nonBaseId2 = 'ptb01_006';
  const swapped2 = await maybeSwapToFamilyBase(nonBaseId2, ['present_tense_basics_01']);
  console.log('After intro, non-base resolves to:', swapped2);
  const phase2 = await computePhaseFor(swapped2);
  console.log('Phase of resolved item:', phase2);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
