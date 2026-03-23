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
  const SEED_CC = process.env.SEED_CC === '1';
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
          update: { lemma: lx.lemma, language: 'he', pos: lx.pos, features: (lx.features as any) ?? undefined },
          create: { id: lexId, lemma: lx.lemma, language: 'he', pos: lx.pos, features: (lx.features as any) ?? undefined }
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
              binyan: inf.binyan ?? null,
              features: inf.voice ? ({ voice: inf.voice } as any) : undefined
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

  // Seed minimal pairs lesson
  try {
    const mpFile = path.join(process.cwd(), 'data', 'minimal-pairs.json');
    if (fs.existsSync(mpFile)) {
      const mpRaw = JSON.parse(fs.readFileSync(mpFile, 'utf8'));
      const mpLessonId = mpRaw.id || 'minimal_pairs_01';
      await prisma.lesson.upsert({
        where: { id: mpLessonId },
        update: { title: mpRaw.title, language: mpRaw.language, level: mpRaw.level, type: mpRaw.type, description: mpRaw.description },
        create: { id: mpLessonId, title: mpRaw.title, language: mpRaw.language, level: mpRaw.level, type: mpRaw.type, description: mpRaw.description }
      });
      let mpIdx = 0;
      for (const pair of mpRaw.pairs || []) {
        // Create two items per pair: one for each word
        for (const side of ['a', 'b'] as const) {
          const word = pair[`word_${side}`];
          const meaning = pair[`meaning_${side}`];
          const partner = pair[side === 'a' ? 'word_b' : 'word_a'];
          const itemId = `mp_${mpIdx++}_${side}`;
          await prisma.lessonItem.upsert({
            where: { id: itemId },
            update: {
              lesson_id: mpLessonId,
              english_prompt: meaning,
              target_hebrew: word,
              transliteration: null,
              accepted_variants: [],
              near_miss_patterns: [partner],
              tags: ['minimal_pair', pair.confusable],
              difficulty: 2,
              features: { type: 'minimal_pair', confusable: pair.confusable } as any
            },
            create: {
              id: itemId,
              lesson_id: mpLessonId,
              english_prompt: meaning,
              target_hebrew: word,
              transliteration: null,
              accepted_variants: [],
              near_miss_patterns: [partner],
              tags: ['minimal_pair', pair.confusable],
              difficulty: 2,
              features: { type: 'minimal_pair', confusable: pair.confusable } as any
            }
          });
        }
      }
      console.log(`Seeded ${mpRaw.pairs?.length || 0} minimal pairs into lesson '${mpLessonId}'.`);
    }
  } catch (e) {
    console.log('Minimal pairs seeding skipped:', (e as Error).message);
  }

  if (SEED_CC) {
    try {
      const importDir = path.join(process.cwd(), 'data', 'imports');
      if (fs.existsSync(importDir)) {
        const filesAll = fs.readdirSync(importDir).filter(f => f.endsWith('.json'));
        const ccPrefix = process.env.SEED_CC_PREFIX?.trim();
        const files = ccPrefix ? filesAll.filter(f => f.includes(ccPrefix)) : filesAll;
        for (const f of files) {
          const p = path.join(importDir, f);
          const raw = fs.readFileSync(p, 'utf8');
          const data = JSON.parse(raw) as LessonSeed;
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
                transliteration: item.transliteration || null,
                accepted_variants: item.accepted_variants || [],
                near_miss_patterns: item.near_miss_patterns || [],
                tags: item.tags || [],
                difficulty: item.difficulty ?? 1,
                features: ((item as any).features ?? undefined) as any,
              },
              create: {
                id: item.id,
                lesson_id: data.id,
                english_prompt: item.english_prompt,
                target_hebrew: item.target_hebrew,
                transliteration: item.transliteration || null,
                accepted_variants: item.accepted_variants || [],
                near_miss_patterns: item.near_miss_patterns || [],
                tags: item.tags || [],
                difficulty: item.difficulty ?? 1,
                features: ((item as any).features ?? undefined) as any,
              }
            });
          }
          console.log(`Seeded import '${data.id}' from ${f} (${data.items.length} items).`);
        }
      } else {
        console.log('No imports directory found; skipping SEED_CC.');
      }
    } catch (e) {
      console.log('SEED_CC failed:', (e as Error).message);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
