import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/db';

export async function GET() {
  const counts = await prisma.lessonItem.groupBy({
    by: ['lesson_id'],
    _count: { id: true },
  });

  const lessons = await prisma.lesson.findMany({
    select: { id: true, level: true },
  });

  const lessonLevel = new Map(lessons.map((l) => [l.id, l.level]));

  const byLevel = new Map<string, number>();
  let total = 0;
  for (const c of counts) {
    const level = lessonLevel.get(c.lesson_id) ?? 'unknown';
    byLevel.set(level, (byLevel.get(level) ?? 0) + c._count.id);
    total += c._count.id;
  }

  const result = [
    ...[...byLevel.entries()]
      .map(([level, itemCount]) => ({ level, itemCount }))
      .sort((a, b) => a.level.localeCompare(b.level)),
    { level: 'all', itemCount: total },
  ];

  return NextResponse.json(result);
}
