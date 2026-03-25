import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const cols = await prisma.$queryRawUnsafe<Array<{column_name: string}>>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='LessonItem'`
  );
  const famCount = await prisma.$queryRawUnsafe<Array<{c: bigint}>>(
    `SELECT COUNT(*)::bigint AS c FROM "FamilyStat"`
  );
  const items = await prisma.lessonItem.findMany({
    where: { id: { in: ['ptb01_005','ptb01_006','ptb01_007','ptb01_008','ptb01_009','ptb01_010'] } },
    select: { id: true, family_id: true, family_base: true }
  });
  console.log(JSON.stringify({
    lessonitem_columns: cols.map(x => x.column_name).sort(),
    familystat_rows: famCount[0] ? String(famCount[0].c) : '0',
    present_tense_links: items
  }, null, 2));
}

main().catch(console.error).finally(async () => { await prisma.$disconnect(); });
