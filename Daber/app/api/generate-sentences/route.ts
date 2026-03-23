import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateSentences } from '@/lib/drill/sentenceGenerator';

export async function POST() {
  try {
    // Get user's vocabulary from lexemes
    const lexemes = await prisma.lexeme.findMany({
      where: { language: 'he' },
      select: { lemma: true },
      take: 50,
    });

    if (!lexemes.length) {
      return NextResponse.json(
        { error: 'No vocabulary found. Seed lexemes first.' },
        { status: 400 }
      );
    }

    const vocab = lexemes.map((l) => l.lemma);
    const sentences = await generateSentences(vocab, 5);

    if (!sentences.length) {
      return NextResponse.json(
        { error: 'Failed to generate sentences' },
        { status: 500 }
      );
    }

    // Create or update the sentences lesson
    const lessonId = 'sentences_gen';
    await prisma.lesson.upsert({
      where: { id: lessonId },
      update: {
        title: 'AI Sentence Drills',
        language: 'hebrew',
        level: 'beginner',
        type: 'sentences',
        description: 'AI-generated sentences from your vocabulary',
      },
      create: {
        id: lessonId,
        title: 'AI Sentence Drills',
        language: 'hebrew',
        level: 'beginner',
        type: 'sentences',
        description: 'AI-generated sentences from your vocabulary',
      },
    });

    // Create lesson items from generated sentences
    const items = [];
    for (let i = 0; i < sentences.length; i++) {
      const s = sentences[i];
      const itemId = `sent_${Date.now()}_${i}`;
      const item = await prisma.lessonItem.create({
        data: {
          id: itemId,
          lesson_id: lessonId,
          english_prompt: s.english,
          target_hebrew: s.hebrew,
          transliteration: null,
          accepted_variants: [],
          near_miss_patterns: [],
          tags: ['generated', 'sentence'],
          difficulty: s.difficulty,
          features: { pos: 'sentence', difficulty: String(s.difficulty) } as any,
        },
      });
      items.push(item);
    }

    return NextResponse.json({
      lessonId,
      count: items.length,
      items: items.map((i) => ({
        id: i.id,
        english: i.english_prompt,
        hebrew: i.target_hebrew,
      })),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed to generate sentences' },
      { status: 500 }
    );
  }
}
