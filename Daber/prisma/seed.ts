import { PrismaClient } from '@prisma/client';
import path from 'node:path';
import fs from 'node:fs';
import { readVocabFromRepoRoot, readEnhancedVocabFromRepoRoot } from '../lib/authoring/parseVocab';

const prisma = new PrismaClient();

type LessonSeed = {
  id: string;
  title: string;
  language: string;
  level: string;
  type: string;
  description?: string;
  items: any[];
};

async function main() {
  const SEED_LEXEMES = process.env.SEED_LEXEMES === '1';
  const file = path.join(process.cwd(), 'data', 'lessons', 'present_tense_basics_01.json');
  const raw = fs.readFileSync(file, 'utf8');
  const data: LessonSeed = JSON.parse(raw);

  await prisma.lesson.upsert({
    where: { id: data.id },
    update: {
      title: data.title,
      language: data.language,
      level: data.level,
      type: data.type,
      description: data.description,
    },
    create: {
      id: data.id,
      title: data.title,
      language: data.language,
      level: data.level,
      type: data.type,
      description: data.description,
    }
  });

  for (const item of data.items) {
    await prisma.lessonItem.upsert({
      where: { id: item.id },
      update: {
        lesson_id: data.id,
        english_prompt: item.english_prompt,
        target_hebrew: item.target_hebrew,
        transliteration: item.transliteration,
        accepted_variants: item.accepted_variants,
        near_miss_patterns: item.near_miss_patterns,
        tags: item.tags,
        difficulty: item.difficulty,
      },
      create: {
        id: item.id,
        lesson_id: data.id,
        english_prompt: item.english_prompt,
        target_hebrew: item.target_hebrew,
        transliteration: item.transliteration,
        accepted_variants: item.accepted_variants,
        near_miss_patterns: item.near_miss_patterns,
        tags: item.tags,
        difficulty: item.difficulty,
      }
    });
    if (SEED_LEXEMES) {
      // Create or link a Lexeme for the target form; inflection holds the same form initially
      const lexId = `lex_${Buffer.from(item.target_hebrew).toString('base64url').slice(0, 20)}`;
      await prisma.lexeme.upsert({
        where: { id: lexId },
        update: { lemma: item.target_hebrew, language: 'he', pos: 'unknown' },
        create: { id: lexId, lemma: item.target_hebrew, language: 'he', pos: 'unknown' }
      });
      await prisma.inflection.create({
        data: { lexeme_id: lexId, form: item.target_hebrew, transliteration: item.transliteration || null }
      }).catch(() => {});
      await prisma.lessonItem.update({ where: { id: item.id }, data: { lexeme_id: lexId } }).catch(() => {});
    }
  }

  console.log('Seed completed');

  // Optional: import user's vocab as a second lesson
  const enhanced = readEnhancedVocabFromRepoRoot('Mike_Hebrew_Vocab.md');
  const cards = enhanced.cards;
  if (cards.length) {
    const lessonId = 'user_vocab_01';
    await prisma.lesson.upsert({
      where: { id: lessonId },
      update: {
        title: 'My Vocab 01',
        language: 'hebrew',
        level: 'beginner',
        type: 'vocab',
        description: 'From Mike_Hebrew_Vocab.md',
      },
      create: {
        id: lessonId,
        title: 'My Vocab 01',
        language: 'hebrew',
        level: 'beginner',
        type: 'vocab',
        description: 'From Mike_Hebrew_Vocab.md',
      }
    });

    const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24);
    const used = new Set<string>();
    let idx = 1;
    for (const c of cards) {
      const base = slug(c.en) || `item_${idx}`;
      let id = `vocab_${base}`;
      while (used.has(id)) { id = `vocab_${base}_${idx++}`; }
      used.add(id);
      await prisma.lessonItem.upsert({
        where: { id },
        update: {
          lesson_id: lessonId,
          english_prompt: c.en,
          target_hebrew: c.he,
          transliteration: null,
          accepted_variants: [],
          near_miss_patterns: [],
          tags: ['vocab'],
          difficulty: 1,
        },
        create: {
          id,
          lesson_id: lessonId,
          english_prompt: c.en,
          target_hebrew: c.he,
          transliteration: null,
          accepted_variants: [],
          near_miss_patterns: [],
          tags: ['vocab'],
          difficulty: 1,
        }
      });
      // Linking to lexeme will be done after creating structured lexemes
    }
    console.log(`Imported ${cards.length} vocab items into lesson '${lessonId}'.`);

    if (SEED_LEXEMES && enhanced.lexemes.length) {
      for (const lx of enhanced.lexemes) {
        const lexId = `lex_${Buffer.from(lx.lemma).toString('base64url').slice(0, 20)}`;
        await prisma.lexeme.upsert({
          where: { id: lexId },
          update: { lemma: lx.lemma, language: 'he', pos: lx.pos, features: lx.features ?? null },
          create: { id: lexId, lemma: lx.lemma, language: 'he', pos: lx.pos, features: lx.features ?? null }
        });
        const existing = await prisma.inflection.findMany({ where: { lexeme_id: lexId }, select: { form: true, tense: true, person: true, number: true, gender: true, features: true } });
        const seen = new Set(existing.map(e => {
          const voice = (e as any).features && typeof (e as any).features === 'object' ? (e as any).features.voice || '' : '';
          return [e.form, e.tense || '', voice, e.person || '', e.number || '', e.gender || ''].join('|');
        }));
        for (const inf of lx.inflections) {
          const key = [inf.form, inf.tense || '', inf.voice || '', inf.person || '', inf.number || '', inf.gender || ''].join('|');
          if (seen.has(key)) continue;
          await prisma.inflection.create({
            data: {
              lexeme_id: lexId,
              form: inf.form,
              transliteration: inf.transliteration ?? null,
              tense: inf.tense ?? null,
              aspect: inf.aspect ?? null,
              person: inf.person ?? null,
              number: inf.number ?? null,
              gender: inf.gender ?? null,
              features: inf.voice ? { voice: inf.voice } as any : null
            }
          }).catch(() => {});
        }
      }
      // Link lesson items to lexemes by exact form match
      const vocabItems = await prisma.lessonItem.findMany({ where: { lesson_id: lessonId }, select: { id: true, target_hebrew: true } });
      for (const li of vocabItems) {
        const hit = enhanced.lexemes.find(lx => lx.inflections.some(inf => inf.form === li.target_hebrew) || lx.lemma === li.target_hebrew);
        if (!hit) continue;
        const lexId = `lex_${Buffer.from(hit.lemma).toString('base64url').slice(0, 20)}`;
        await prisma.lessonItem.update({ where: { id: li.id }, data: { lexeme_id: lexId } }).catch(() => {});
      }
    }
  } else {
    console.log('No Mike_Hebrew_Vocab.md found or no cards parsed.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
