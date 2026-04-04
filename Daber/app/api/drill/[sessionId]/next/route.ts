import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const session = await prisma.session.findUnique({
    where: { id: params.sessionId },
    include: { attempts: { select: { lesson_item_id: true } } },
  });

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const subsetIds = (session.subset_item_ids as string[]) || [];
  const attemptedIds = new Set(session.attempts.map((a) => a.lesson_item_id));
  const remainingIds = subsetIds.filter((id) => !attemptedIds.has(id));

  if (remainingIds.length === 0) {
    return NextResponse.json({ done: true });
  }

  const nextItemId = remainingIds[0];
  const item = await prisma.lessonItem.findUnique({
    where: { id: nextItemId },
    include: { lexeme: true },
  });

  if (!item) {
    return NextResponse.json({ done: true });
  }

  const stat = await prisma.itemStat.findUnique({
    where: {
      lesson_item_id_user_id: {
        lesson_item_id: item.id,
        user_id: 'anon',
      },
    },
  });

  const streak = stat?.correct_streak ?? 0;
  const direction = streak < 2 ? 'he_to_en' : 'en_to_he';

  const sentence: { hebrew: string; english: string } | null = null;

  const index = attemptedIds.size + 1;
  const total = subsetIds.length;

  let prompt: string;
  let targetAnswer: string;

  if (direction === 'he_to_en') {
    prompt = sentence?.hebrew || item.target_hebrew;
    targetAnswer = sentence?.english || item.english_prompt;
  } else {
    prompt = sentence?.english || item.english_prompt;
    targetAnswer = item.target_hebrew;
  }

  return NextResponse.json({
    done: false,
    item: {
      id: item.id,
      prompt,
      direction,
      targetHebrew: item.target_hebrew,
      englishPrompt: item.english_prompt,
      sentenceHebrew: sentence?.hebrew || null,
      sentenceEnglish: sentence?.english || null,
    },
    index,
    total,
  });
}
