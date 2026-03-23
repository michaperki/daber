import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateNextFromLexicon } from '@/lib/drill/generators';

export async function GET(req: Request, { params }: { params: { sessionId: string } }) {
  const { sessionId } = params;
  try {
    // Session cap (applies to all sessions; tune via env)
    const baseCap = Number.parseInt(process.env.SESSION_DUE_CAP || '', 10) || 20;
    const hardMax = 25;
    const attemptsCount = await prisma.attempt.count({ where: { session_id: sessionId } });
    const url = new URL(req.url);
    const pacing = url.searchParams.get('pacing'); // 'adaptive' | null
    const useRandom = url.searchParams.get('random') === '1' || url.searchParams.get('random') === 'true';
    const useLex = url.searchParams.get('mode') === 'lex';
    const focusWeak = url.searchParams.get('focus') === 'weak';
    const dueParam = url.searchParams.get('due'); // 'feature' | 'item'

    // Adaptive pacing logic
    let offerEnd = false;
    let offerExtend = false;
    const cap = pacing === 'adaptive' ? hardMax : baseCap;
    if (cap > 0 && attemptsCount >= cap) {
      return NextResponse.json({ done: true, index: attemptsCount, total: cap });
    }
    if (pacing === 'adaptive' && attemptsCount >= 3) {
      const recent = await prisma.attempt.findMany({
        where: { session_id: sessionId },
        orderBy: { created_at: 'desc' },
        take: 3,
        select: { grade: true }
      });
      const allIncorrect = recent.every(a => a.grade === 'incorrect');
      const allCorrect = recent.every(a => a.grade === 'correct');
      if (allIncorrect) offerEnd = true;
      if (attemptsCount >= baseCap && allCorrect) offerExtend = true;
    }
    if (!pacing && baseCap > 0 && attemptsCount >= baseCap) {
      return NextResponse.json({ done: true, index: attemptsCount, total: baseCap });
    }
    const session = await prisma.session.findUnique({ where: { id: sessionId }, include: { lesson: { select: { type: true } } } });
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

    const attempted = await prisma.attempt.findMany({
      where: { session_id: sessionId },
      select: { lesson_item_id: true }
    });
    const attemptedIds = new Set(attempted.map(a => a.lesson_item_id));

    const subsetRaw = (session as any).subset_item_ids as unknown;
    const subset = Array.isArray(subsetRaw) ? (subsetRaw as unknown[]).map(String) : [];

    async function computePhaseFor(itemId: string): Promise<'intro' | 'recognition' | 'free_recall'> {
      try {
        const stat = await prisma.itemStat.findUnique({ where: { lesson_item_id: itemId } });
        if (!stat) return 'intro';
        const streak = stat.correct_streak || 0;
        if (streak === 0) return 'recognition';
        return 'free_recall';
      } catch {
        return 'free_recall';
      }
    }

    if ((useLex || dueParam === 'feature' || dueParam === 'blend') && session.lesson?.type === 'vocab') {
      try {
        const gen = await generateNextFromLexicon(sessionId, attemptedIds, { focusWeakness: focusWeak });
        if (gen) {
          const phase = await computePhaseFor(gen.id);
          return NextResponse.json({ done: false, item: gen, offerEnd: offerEnd || undefined, offerExtend: offerExtend || undefined, phase });
        }
      } catch {
        // fall through to regular selection when generator fails
      }
      // fall through to regular selection when no generated item is available
    }
    if (dueParam === 'item' || dueParam === 'blend') {
      // Pick an authored item from this lesson that is due in ItemStat
      const now = new Date();
      const dueItems = await prisma.itemStat.findMany({ where: { next_due: { lte: now } } });
      const dueSet = new Set(dueItems.map(d => d.lesson_item_id));
      const remaining = await prisma.lessonItem.findMany({ where: { lesson_id: session.lesson_id, id: { in: Array.from(dueSet) }, NOT: { id: { in: Array.from(attemptedIds) } } }, select: { id: true, english_prompt: true, target_hebrew: true, transliteration: true, features: true } });
      const pick = useRandom ? (remaining.length ? remaining[Math.floor(Math.random() * remaining.length)] : null) : (remaining[0] || null);
      if (pick) {
        const total = cap > 0 ? cap : await prisma.lessonItem.count({ where: { lesson_id: session.lesson_id } });
        const index = attemptedIds.size + 1;
        const phase = await computePhaseFor(pick.id);
        return NextResponse.json({ done: false, item: pick, index, total, offerEnd: offerEnd || undefined, offerExtend: offerExtend || undefined, phase });
      }
      // continue to normal selection if none due
    }
    if (subset.length) {
      const remainingIds = subset.filter(id => !attemptedIds.has(id));
      const total = subset.length;
      const pickId = useRandom ? remainingIds[Math.floor(Math.random() * remainingIds.length)] : remainingIds[0];
      if (!pickId) return NextResponse.json({ done: true, index: attemptedIds.size, total });
      const item = await prisma.lessonItem.findUnique({ where: { id: pickId }, select: { id: true, english_prompt: true, target_hebrew: true, transliteration: true, features: true } });
      if (!item) return NextResponse.json({ done: true, index: attemptedIds.size, total });
      const index = attemptedIds.size + 1;
      const phase = await computePhaseFor(item.id);
      return NextResponse.json({ done: false, item, index, total, offerEnd: offerEnd || undefined, offerExtend: offerExtend || undefined, phase });
    } else {
      let nextItem: any = null;
      if (useRandom) {
        const remain = await prisma.lessonItem.findMany({
          where: { lesson_id: session.lesson_id, NOT: { id: { in: Array.from(attemptedIds) } } },
          select: { id: true, english_prompt: true, target_hebrew: true, transliteration: true, features: true }
        });
        if (remain.length) nextItem = remain[Math.floor(Math.random() * remain.length)] as any;
      } else {
        nextItem = await prisma.lessonItem.findFirst({
          where: { lesson_id: session.lesson_id, NOT: { id: { in: Array.from(attemptedIds) } } },
          orderBy: { id: 'asc' },
          select: { id: true, english_prompt: true, target_hebrew: true, transliteration: true, features: true }
        });
      }
      const total = cap > 0 ? cap : await prisma.lessonItem.count({ where: { lesson_id: session.lesson_id } });
      if (!nextItem) return NextResponse.json({ done: true, index: attemptedIds.size, total });
      const index = attemptedIds.size + 1;
      const phase = await computePhaseFor(nextItem.id);
      return NextResponse.json({ done: false, item: nextItem, index, total, offerEnd: offerEnd || undefined, offerExtend: offerExtend || undefined, phase });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to get next item' }, { status: 500 });
  }
}
