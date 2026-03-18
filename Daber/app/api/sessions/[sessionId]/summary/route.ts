import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(_req: Request, { params }: { params: { sessionId: string } }) {
  const { sessionId } = params;
  try {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

    const total = await prisma.attempt.count({ where: { session_id: sessionId } });
    return NextResponse.json({
      sessionId,
      lessonId: session.lesson_id,
      counts: {
        correct: session.correct_count,
        flawed: session.flawed_count,
        incorrect: session.incorrect_count
      },
      total
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load summary' }, { status: 500 });
  }
}

