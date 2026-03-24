import { prisma } from '../Daber/lib/db';

async function main() {
  const [batchExists] = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='GeneratedBatch') as exists`
  );
  const [drillExists] = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='GeneratedDrill') as exists`
  );
  console.log('GeneratedBatch table exists:', !!batchExists?.exists);
  console.log('GeneratedDrill table exists:', !!drillExists?.exists);
  if (batchExists?.exists) {
    const [c] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*)::bigint AS count FROM "GeneratedBatch"`);
    console.log('GeneratedBatch rows:', c?.count?.toString?.() ?? '0');
  }
  if (drillExists?.exists) {
    const [c] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*)::bigint AS count FROM "GeneratedDrill"`);
    console.log('GeneratedDrill rows:', c?.count?.toString?.() ?? '0');
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { try { await prisma.$disconnect(); } catch {} });
