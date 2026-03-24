import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const WRITE_FAM = 'fam_ktov';
  const STUDY_FAM = 'fam_lmd';

  const writeIds = ['ptb01_005','ptb01_006','ptb01_007','ptb01_008'];
  const studyIds = ['ptb01_009','ptb01_010'];

  // Link write family; prefer ptb01_005 as base
  for (const id of writeIds) {
    await prisma.lessonItem.update({ where: { id }, data: { family_id: WRITE_FAM, family_base: id === 'ptb01_005' } }).catch(() => {});
  }
  // Link study family; prefer ptb01_009 as base
  for (const id of studyIds) {
    await prisma.lessonItem.update({ where: { id }, data: { family_id: STUDY_FAM, family_base: id === 'ptb01_009' } }).catch(() => {});
  }

  const w = await prisma.lessonItem.findMany({ where: { id: { in: writeIds } }, select: { id: true, family_id: true, family_base: true } });
  const s = await prisma.lessonItem.findMany({ where: { id: { in: studyIds } }, select: { id: true, family_id: true, family_base: true } });
  console.log('Linked write family:', w);
  console.log('Linked study family:', s);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => {
  await prisma.$disconnect();
});

