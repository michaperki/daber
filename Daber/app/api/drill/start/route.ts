import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/db';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const level: string = body.level;
  const count: number = body.count || 20;

  if (!level) {
    return NextResponse.json({ error: 'level is required' }, { status: 400 });
  }

  const where =
    level === 'all'
      ? {}
      : { lesson: { level } };

  const dueItems = await prisma.lessonItem.findMany({
    where: {
      ...where,
      id: {
        in: (
          await prisma.itemStat.findMany({
            where: {
              user_id: 'anon',
              next_due: { lte: new Date() },
            },
            select: { lesson_item_id: true },
          })
        ).map((s) => s.lesson_item_id),
      },
    },
    select: { id: true },
    take: count,
  });

  let selectedIds = dueItems.map((i) => i.id);

  if (selectedIds.length < count) {
    const remaining = count - selectedIds.length;
    const excludeIds = new Set(selectedIds);

    const filler = await prisma.lessonItem.findMany({
      where: {
        ...where,
        id: { notIn: [...excludeIds] },
      },
      select: { id: true },
      take: remaining,
      orderBy: { id: 'asc' },
    });

    selectedIds = [...selectedIds, ...filler.map((i) => i.id)];
  }

  if (selectedIds.length === 0) {
    return NextResponse.json({ error: 'No items found for this level' }, { status: 404 });
  }

  const lessonId =
    level === 'all'
      ? (await prisma.lesson.findFirst({ select: { id: true } }))!.id
      : (await prisma.lesson.findFirst({ where: { level }, select: { id: true } }))!.id;

  const session = await prisma.session.create({
    data: {
      user_id: 'anon',
      lesson_id: lessonId,
      subset_item_ids: selectedIds,
    },
  });

  return NextResponse.json({
    sessionId: session.id,
    totalItems: selectedIds.length,
  });
}
