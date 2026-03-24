import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logEvent } from '@/lib/log';
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
    const session = await prisma.session.findUnique({ where: { id: sessionId }, include: { lesson: { select: { id: true, type: true } } } });
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

    const isCrossVocab = session.lesson_id === 'vocab_all';
    const allowedLessonIds: string[] = isCrossVocab
      ? (
        [
          ...(await prisma.lesson.findMany({ where: { type: 'vocab' }, select: { id: true } })).map(l => l.id),
          ...(await prisma.lesson.findMany({ where: { type: 'vocab_generated' }, select: { id: true } })).map(l => l.id),
        ]
      )
      : [session.lesson_id];

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
          logEvent({ type: 'next_item_pick', session_id: sessionId, lesson_id: session.lesson_id, payload: { item_id: gen.id, source: 'lex', cross: isCrossVocab } }).catch(() => {});
          const newGenReady = await prisma.generatedDrill.count({ where: { created_at: { gt: session.started_at } } })
            .then(c => c > 0)
            .catch(() => false);
          return NextResponse.json({ done: false, item: gen, offerEnd: offerEnd || undefined, offerExtend: offerExtend || undefined, phase, newContentReady: newGenReady || undefined });
        }
      } catch {
        // fall through to regular selection when generator fails
      }
      // fall through to regular selection when no generated item is available
    }
    if (!dueParam || dueParam === 'item' || dueParam === 'blend') {
      // Pick an authored item from this lesson that is due in ItemStat
      const now = new Date();
      const dueItems = await prisma.itemStat.findMany({ where: { next_due: { lte: now } } });
      const dueSet = new Set(dueItems.map(d => d.lesson_item_id));
      const remaining = await prisma.lessonItem.findMany({ where: { lesson_id: { in: allowedLessonIds }, id: { in: Array.from(dueSet) }, NOT: { id: { in: Array.from(attemptedIds) } } }, select: { id: true, english_prompt: true, target_hebrew: true, transliteration: true, features: true } });
      const pick = useRandom ? (remaining.length ? remaining[Math.floor(Math.random() * remaining.length)] : null) : (remaining[0] || null);
      if (pick) {
        const total = cap > 0 ? cap : await prisma.lessonItem.count({ where: { lesson_id: { in: allowedLessonIds } } });
        const index = attemptedIds.size + 1;
        const phase = await computePhaseFor(pick.id);
        logEvent({ type: 'next_item_pick', session_id: sessionId, lesson_id: session.lesson_id, payload: { item_id: pick.id, source: 'due_item', cross: isCrossVocab } }).catch(() => {});
        const newGenReady = await prisma.generatedDrill.count({ where: { created_at: { gt: session.started_at } } })
          .then(c => c > 0)
          .catch(() => false);
        return NextResponse.json({ done: false, item: pick, index, total, offerEnd: offerEnd || undefined, offerExtend: offerExtend || undefined, phase, newContentReady: newGenReady || undefined });
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
      logEvent({ type: 'next_item_pick', session_id: sessionId, lesson_id: session.lesson_id, payload: { item_id: item.id, source: 'subset', cross: isCrossVocab } }).catch(() => {});
      const newGenReady = await prisma.generatedDrill.count({ where: { created_at: { gt: session.started_at } } })
        .then(c => c > 0)
        .catch(() => false);
      return NextResponse.json({ done: false, item, index, total, offerEnd: offerEnd || undefined, offerExtend: offerExtend || undefined, phase, newContentReady: newGenReady || undefined });
    } else {
      // SRS priority when not using due mode explicitly: weak items before new
      const remaining = await prisma.lessonItem.findMany({
        where: { lesson_id: { in: allowedLessonIds }, NOT: { id: { in: Array.from(attemptedIds) } } },
        select: { id: true }
      });
      const remainingIds = remaining.map(r => r.id);
      let nextItem: { id: string; english_prompt: string; target_hebrew: string; transliteration: string | null; features: Record<string, string | null> | null } | null = null;
      if (remainingIds.length) {
        const weakStats = await prisma.itemStat.findMany({
          where: { lesson_item_id: { in: remainingIds }, OR: [{ correct_streak: { lte: 1 } }, { incorrect_count: { gt: 0 } }] },
          orderBy: [{ incorrect_count: 'desc' }, { last_attempt: 'desc' }]
        });
        const weakIds = weakStats.map(s => s.lesson_item_id);
        let pickId: string | null = null;
        if (weakIds.length) {
          pickId = useRandom ? weakIds[Math.floor(Math.random() * weakIds.length)] : weakIds[0];
        }
        if (!pickId) {
          // No weak items — pick a new item
          pickId = useRandom ? remainingIds[Math.floor(Math.random() * remainingIds.length)] : remainingIds[0];
        }
        if (pickId) {
          const raw = await prisma.lessonItem.findUnique({ where: { id: pickId }, select: { id: true, english_prompt: true, target_hebrew: true, transliteration: true, features: true } });
          if (raw) nextItem = { ...raw, features: raw.features as Record<string, string | null> | null };
        }
      }
      const total = cap > 0 ? cap : await prisma.lessonItem.count({ where: { lesson_id: { in: allowedLessonIds } } });
      if (!nextItem) return NextResponse.json({ done: true, index: attemptedIds.size, total });
      const index = attemptedIds.size + 1;
      const phase = await computePhaseFor(nextItem.id);
      logEvent({ type: 'next_item_pick', session_id: sessionId, lesson_id: session.lesson_id, payload: { item_id: nextItem.id, source: useRandom ? 'random' : 'sequential', cross: isCrossVocab } }).catch(() => {});
      const newGenReady = await prisma.generatedDrill.count({ where: { created_at: { gt: session.started_at } } })
        .then(c => c > 0)
        .catch(() => false);
      return NextResponse.json({ done: false, item: nextItem, index, total, offerEnd: offerEnd || undefined, offerExtend: offerExtend || undefined, phase, newContentReady: newGenReady || undefined });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to get next item' }, { status: 500 });
  }
}
