import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const session = await prisma.session.findUnique({
    where: { id: params.sessionId },
  });

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const totalItems = (session.subset_item_ids as string[])?.length || 0;
  const totalAttempted = session.correct_count + session.flawed_count + session.incorrect_count;

  return NextResponse.json({
    sessionId: session.id,
    totalItems,
    totalAttempted,
    correct: session.correct_count,
    flawed: session.flawed_count,
    incorrect: session.incorrect_count,
  });
}
