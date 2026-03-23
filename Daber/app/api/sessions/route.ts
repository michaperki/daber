import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logEvent } from '@/lib/log';
import { zCreateSessionRequest } from '@/lib/contracts';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = zCreateSessionRequest.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    const { lessonId, userId, subset } = parsed.data;
    if (!lessonId) {
      return NextResponse.json({ error: 'lessonId required' }, { status: 400 });
    }

    const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });

    const subsetData = (subset && subset.length ? (subset as any) : undefined);
    const session = await prisma.session.create({
      data: { lesson_id: lessonId, user_id: userId ?? null, subset_item_ids: subsetData },
      select: { id: true, lesson_id: true, started_at: true }
    });
    logEvent({ type: 'session_started', session_id: session.id, lesson_id: lessonId, user_id: userId ?? undefined });
    return NextResponse.json({ session });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to create session' }, { status: 500 });
  }
}
