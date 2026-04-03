// Simple DB query helper using Prisma Client
// Usage (env): DATABASE_URL=... node scripts/db_query.js <sql>

const { PrismaClient } = require('@prisma/client');

async function main() {
  const sql = process.argv.slice(2).join(' ').trim();
  if (!sql) {
    console.error('Provide a SQL query as arguments');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRawUnsafe(sql);
    const replacer = (_k, v) => (typeof v === 'bigint' ? v.toString() : v);
    console.log(JSON.stringify(rows, replacer, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
