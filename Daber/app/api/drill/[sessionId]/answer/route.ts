import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/db';
import { evaluateAttempt } from '../../../../../lib/evaluator';
import { evaluateEnglishAnswer } from '../../../../../lib/evaluator/englishEvaluator';

export async function POST(
  req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const body = await req.json();
  const { lessonItemId, answer, direction } = body as {
    lessonItemId: string;
    answer: string;
    direction: 'he_to_en' | 'en_to_he';
  };

  if (!lessonItemId || answer === undefined || !direction) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const item = await prisma.lessonItem.findUnique({
    where: { id: lessonItemId },
  });

  if (!item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  let grade: string;
  let reasons: { code: string; message: string }[];
  let correctAnswer: string;

  if (direction === 'he_to_en') {
    const result = evaluateEnglishAnswer(answer, item.english_prompt);
    grade = result.grade;
    reasons = result.reasons;
    correctAnswer = item.english_prompt;
  } else {
    const itemLike = {
      id: item.id,
      english_prompt: item.english_prompt,
      target_hebrew: item.target_hebrew,
      transliteration: item.transliteration,
      accepted_variants: (item.accepted_variants as string[]) || [],
      near_miss_patterns: (item.near_miss_patterns as { type: string; examples: string[] }[]) || [],
      features: (item.features as Record<string, string | null>) || null,
    };
    const result = evaluateAttempt(itemLike, answer);
    grade = result.grade;
    reasons = result.reasons;
    correctAnswer = item.target_hebrew;
  }

  await prisma.attempt.create({
    data: {
      session_id: params.sessionId,
      lesson_item_id: lessonItemId,
      raw_transcript: answer,
      normalized_transcript: answer,
      grade,
      reason: reasons,
      correct_hebrew: item.target_hebrew,
    },
  });

  const gradeField =
    grade === 'correct'
      ? 'correct_count'
      : grade === 'flawed'
      ? 'flawed_count'
      : 'incorrect_count';

  await prisma.session.update({
    where: { id: params.sessionId },
    data: { [gradeField]: { increment: 1 } },
  });

  const q = grade === 'correct' ? 5 : grade === 'flawed' ? 3 : 1;
  const now = new Date();

  const existing = await prisma.itemStat.findUnique({
    where: {
      lesson_item_id_user_id: {
        lesson_item_id: lessonItemId,
        user_id: 'anon',
      },
    },
  });

  if (existing) {
    const newStreak = grade === 'incorrect' ? 0 : existing.correct_streak + 1;
    const newEasiness = Math.max(1.3, existing.easiness - 0.8 + 0.28 * q - 0.02 * q * q);
    let newInterval: number;
    if (newStreak === 0) {
      newInterval = 0;
    } else if (newStreak === 1) {
      newInterval = 1;
    } else if (newStreak === 2) {
      newInterval = 6;
    } else {
      newInterval = Math.round(existing.interval_days * newEasiness);
    }

    const nextDue = new Date(now.getTime() + newInterval * 86400000);

    await prisma.itemStat.update({
      where: {
        lesson_item_id_user_id: {
          lesson_item_id: lessonItemId,
          user_id: 'anon',
        },
      },
      data: {
        correct_streak: newStreak,
        easiness: newEasiness,
        interval_days: newInterval,
        last_attempt: now,
        next_due: nextDue,
        [gradeField]: { increment: 1 },
      },
    });
  } else {
    const newStreak = grade === 'incorrect' ? 0 : 1;
    const newEasiness = Math.max(1.3, 2.5 - 0.8 + 0.28 * q - 0.02 * q * q);
    const newInterval = grade === 'incorrect' ? 0 : 1;
    const nextDue = new Date(now.getTime() + newInterval * 86400000);

    await prisma.itemStat.create({
      data: {
        lesson_item_id: lessonItemId,
        user_id: 'anon',
        correct_streak: newStreak,
        easiness: newEasiness,
        interval_days: newInterval,
        last_attempt: now,
        next_due: nextDue,
        correct_count: grade === 'correct' ? 1 : 0,
        flawed_count: grade === 'flawed' ? 1 : 0,
        incorrect_count: grade === 'incorrect' ? 1 : 0,
      },
    });
  }

  return NextResponse.json({ grade, reasons, correctAnswer });
}
