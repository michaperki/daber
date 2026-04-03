/*
  Seed base LessonItems for orphan families (per-user FamilyStat without any ItemStat via LessonItem)

  - Creates a single base LessonItem per lexeme under lesson 'vocab_past_import'
  - Marks it family_base=true and family_id='lex:<lexeme_id>'
  - Upserts ItemStat for the target user with correct_streak>=5, next_due=now()

  Usage:
    DATABASE_URL=... npx ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/seed_bases_for_orphan_families.ts --user-id <uuid>
    # If --user-id omitted, picks the most active user by sessions
*/

import { PrismaClient } from '@prisma/client';
import path from 'node:path';

type Args = { userId?: string };
function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--user-id') args.userId = argv[++i] || undefined;
  }
  return args;
}

function sanitizeId(id: string): string { return id.replace(/[^a-zA-Z0-9_]/g, '_'); }

async function main() {
  const args = parseArgs(process.argv);
  const prisma = new PrismaClient();

  // Resolve user
  let userId = args.userId || null;
  if (!userId) {
    const top = await prisma.session.groupBy({ by: ['user_id'], where: { user_id: { not: null } }, _count: true, orderBy: { _count: { user_id: 'desc' } as any }, take: 1 });
    userId = (top?.[0]?.user_id as string) || null;
  }
  if (!userId) throw new Error('No user_id found. Pass --user-id');

  // Ensure lesson exists
  const lessonId = 'vocab_past_import';
  await prisma.lesson.upsert({
    where: { id: lessonId },
    update: { title: 'Past Level Vocab Import', language: 'he', level: 'past', type: 'vocab', description: 'Base items created for imported past-level lexemes.' },
    create: { id: lessonId, title: 'Past Level Vocab Import', language: 'he', level: 'past', type: 'vocab', description: 'Base items created for imported past-level lexemes.' }
  });

  // Find orphan families for this user
  const orphanFamilies = await prisma.$queryRawUnsafe<Array<{ family_id: string }>>(
    `SELECT fs.family_id
     FROM "FamilyStat" fs
     WHERE fs.family_id LIKE 'lex:%' AND fs.user_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM "LessonItem" li
         JOIN "ItemStat" ist ON ist.lesson_item_id = li.id
         WHERE li.lexeme_id = REPLACE(fs.family_id, 'lex:', '')
           AND ist.user_id = fs.user_id
       )`,
    userId
  );

  let createdItems = 0;
  let itemStatUpserts = 0;
  const now = new Date();
  for (const row of orphanFamilies) {
    const familyId = row.family_id;
    const lexemeId = familyId.replace(/^lex:/, '');

    const lex = await prisma.lexeme.findUnique({ where: { id: lexemeId }, select: { id: true, lemma: true, gloss: true, pos: true } });
    if (!lex) continue;

    // Create base LessonItem if missing
    const baseId = `past_${sanitizeId(lexemeId)}`;
    const existingLi = await prisma.lessonItem.findUnique({ where: { id: baseId }, select: { id: true } });
    if (!existingLi) {
      await prisma.lessonItem.create({
        data: {
          id: baseId,
          lesson_id: lessonId,
          english_prompt: lex.gloss ? `Imported: ${lex.gloss}` : `Imported vocab: ${lex.lemma}`,
          target_hebrew: lex.lemma,
          transliteration: null,
          accepted_variants: [],
          near_miss_patterns: [],
          tags: ['vocab','imported','past'],
          difficulty: 1,
          lexeme_id: lexemeId,
          features: { pos: lex.pos || null, source: 'past_import' } as any,
          family_id: familyId,
          family_base: true,
        }
      });
      createdItems++;
    }

    // Upsert ItemStat for user on the base item
    const key = { lesson_item_id: baseId, user_id: userId } as const;
    const stat = await prisma.itemStat.findUnique({ where: { lesson_item_id_user_id: key } });
    if (!stat) {
      await prisma.itemStat.create({ data: { ...key, correct_streak: 5, next_due: now } });
    } else if ((stat.correct_streak || 0) < 5 || !stat.next_due) {
      await prisma.itemStat.update({ where: { lesson_item_id_user_id: key }, data: { correct_streak: Math.max(5, stat.correct_streak || 0), next_due: now } });
    }
    itemStatUpserts++;
  }

  await prisma.$disconnect();
  console.log(JSON.stringify({ userId, orphanFamilies: orphanFamilies.length, createdItems, itemStatUpserts }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });

