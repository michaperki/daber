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

    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const existing = await tx.itemStat.findUnique({ where: { lesson_item_id: lessonItemId } });
      if (existing) {
        await tx.itemStat.update({ where: { lesson_item_id: lessonItemId }, data: { last_attempt: now, next_due: now } });
      } else {
        await tx.itemStat.create({
          data: {
            lesson_item_id: lessonItemId,
            correct_streak: 0,
            easiness: 2.5,
            interval_days: 0,
            last_attempt: now,
            next_due: now,
            correct_count: 0,
            flawed_count: 0,
            incorrect_count: 0,
          }
        });
      }
    });

    logEvent({ type: 'item_seen_intro', session_id: sessionId, lesson_id: session.lesson_id, payload: { lesson_item_id: lessonItemId } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to mark seen' }, { status: 500 });
  }
}

