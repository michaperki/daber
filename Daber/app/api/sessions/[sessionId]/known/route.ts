import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logEvent } from '@/lib/log';
import { zMarkSeenRequest } from '@/lib/contracts';

export async function POST(req: Request, { params }: { params: { sessionId: string } }) {
  const { sessionId } = params;
  try {
    const body = await req.json();
    const parsed = zMarkSeenRequest.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    const { lessonItemId } = parsed.data;

    const [session, item] = await Promise.all([
      prisma.session.findUnique({ where: { id: sessionId } }),
      prisma.lessonItem.findUnique({ where: { id: lessonItemId }, select: { id: true, target_hebrew: true, features: true, family_id: true, lexeme_id: true } })
    ]);
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (!item) return NextResponse.json({ error: 'Lesson item not found' }, { status: 404 });
    const userId = (session.user_id || 'anon');

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      const familyId = item.family_id || (item.lexeme_id ? `lex:${item.lexeme_id}` : null);
      if (familyId) {
        await tx.familyStat.upsert({ where: { family_id_user_id: { family_id: familyId, user_id: userId } }, update: {}, create: { family_id: familyId, user_id: userId } });
      }

      const existing = await tx.itemStat.findUnique({ where: { lesson_item_id_user_id: { lesson_item_id: lessonItemId, user_id: userId } } });
      const correct_streak = Math.max(existing?.correct_streak || 0, 2);
      const easiness = existing?.easiness ?? 2.5;
      const interval_days = correct_streak === 1 ? 1 : correct_streak >= 2 ? 6 : 0;
      const next_due = interval_days > 0 ? new Date(now.getTime() + interval_days * 86400000) : now;
      const counters = {
        correct_count: existing?.correct_count || 0,
        flawed_count: existing?.flawed_count || 0,
        incorrect_count: existing?.incorrect_count || 0
      };
      if (existing) {
        await tx.itemStat.update({
          where: { lesson_item_id_user_id: { lesson_item_id: lessonItemId, user_id: userId } },
          data: { correct_streak, easiness, interval_days, last_attempt: now, next_due, ...counters }
        });
      } else {
        await tx.itemStat.create({
          data: { lesson_item_id: lessonItemId, user_id: userId, correct_streak, easiness, interval_days, last_attempt: now, next_due, ...counters }
        });
      }

      await tx.attempt.create({
        data: {
          session_id: sessionId,
          lesson_item_id: lessonItemId,
          raw_transcript: null,
          normalized_transcript: null,
          grade: 'correct',
          reason: [{ code: 'user_mark_known', message: 'marked known' }],
          correct_hebrew: item.target_hebrew,
          features: (item.features as any) || null
        }
      });
    });

    logEvent({ type: 'item_mark_known', session_id: sessionId, lesson_id: session.lesson_id, payload: { lesson_item_id: lessonItemId } }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to mark known' }, { status: 500 });
  }
}
