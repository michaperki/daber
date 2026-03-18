import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logEvent } from '@/lib/log';
import { zOverrideRequest } from '@/lib/contracts';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = zOverrideRequest.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    const { sessionId, lessonItemId } = parsed.data;

    const [session, item] = await Promise.all([
      prisma.session.findUnique({ where: { id: sessionId } }),
      prisma.lessonItem.findUnique({ where: { id: lessonItemId } })
    ]);
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (!item) return NextResponse.json({ error: 'Lesson item not found' }, { status: 404 });

    const attempt = await prisma.attempt.findFirst({
      where: { session_id: sessionId, lesson_item_id: lessonItemId },
      orderBy: { created_at: 'desc' }
    });
    if (!attempt) return NextResponse.json({ error: 'No attempt to override' }, { status: 400 });
    const prev = (attempt.grade || '').toLowerCase();
    if (prev === 'correct') {
      return NextResponse.json({ grade: 'correct', reason: attempt.reason as any, correct_hebrew: item.target_hebrew });
    }

    await prisma.$transaction(async (tx) => {
      const reasons = Array.isArray(attempt.reason) ? [...(attempt.reason as any[])] : [];
      reasons.push({ code: 'user_override', message: 'marked correct' });
      await tx.attempt.update({ where: { id: attempt.id }, data: { grade: 'correct', reason: reasons } });

      const sessUpdates: any = { correct_count: { increment: 1 } };
      if (prev === 'incorrect') sessUpdates.incorrect_count = { decrement: 1 };
      if (prev === 'flawed') sessUpdates.flawed_count = { decrement: 1 };
      await tx.session.update({ where: { id: sessionId }, data: sessUpdates });

      try {
        // Recompute ItemStat fully from attempts (ensures SRS reflects override)
        const atts = await tx.attempt.findMany({ where: { lesson_item_id: lessonItemId }, orderBy: { created_at: 'asc' } });
        let correct_streak = 0;
        let easiness = 2.5;
        let interval_days = 0;
        let last_attempt: Date | null = null;
        let next_due: Date | null = null;
        let correct_count = 0, flawed_count = 0, incorrect_count = 0;
        for (const a of atts) {
          const g = String(a.grade || '').toLowerCase();
          const q = g === 'correct' ? 5 : (g === 'flawed' ? 3 : 1);
          if (g === 'correct') {
            correct_count += 1;
            correct_streak += 1;
            if (correct_streak === 1) interval_days = 1; else if (correct_streak === 2) interval_days = 6; else interval_days = Math.max(1, Math.round(interval_days * easiness));
          } else if (g === 'flawed') {
            flawed_count += 1;
            correct_streak = 0;
            interval_days = 0;
          } else {
            incorrect_count += 1;
            correct_streak = 0;
            interval_days = 0;
          }
          easiness = Math.max(1.3, easiness - 0.8 + 0.28 * q - 0.02 * q * q);
          last_attempt = a.created_at;
          next_due = interval_days > 0 ? new Date(a.created_at.getTime() + interval_days * 86400000) : a.created_at;
        }
        const existing = await tx.itemStat.findUnique({ where: { lesson_item_id: lessonItemId } });
        if (existing) {
          await tx.itemStat.update({ where: { lesson_item_id: lessonItemId }, data: { correct_streak, easiness, interval_days, last_attempt, next_due, correct_count, flawed_count, incorrect_count } });
        } else {
          await tx.itemStat.create({ data: { lesson_item_id: lessonItemId, correct_streak, easiness, interval_days, last_attempt, next_due, correct_count, flawed_count, incorrect_count } });
        }
      } catch {}

      try {
        const feat = (attempt.features as any) || null;
        if (feat && typeof feat === 'object') {
          const pos = (feat as any).pos || null;
          const tense = (feat as any).tense || null;
          const person = (feat as any).person || null;
          const number = (feat as any).number || null;
          const gender = (feat as any).gender || null;
          // Recompute FeatureStat from all attempts with matching feature bundle
          const all = await tx.attempt.findMany({ where: {}, orderBy: { created_at: 'asc' }, select: { grade: true, created_at: true, features: true } });
          const matches = all.filter(a => {
            const f = (a.features as any) || null;
            if (!f || typeof f !== 'object') return false;
            return (f.pos || null) === pos && (f.tense || null) === tense && (f.person || null) === person && (f.number || null) === number && (f.gender || null) === gender;
          });
          let correct_streak = 0;
          let easiness = 2.5;
          let interval_days = 0;
          let last_attempt: Date | null = null;
          let next_due: Date | null = null;
          let correct_count = 0, flawed_count = 0, incorrect_count = 0;
          for (const a of matches) {
            const g = String(a.grade || '').toLowerCase();
            const q = g === 'correct' ? 5 : (g === 'flawed' ? 3 : 1);
            if (g === 'correct') {
              correct_count += 1;
              correct_streak += 1;
              if (correct_streak === 1) interval_days = 1; else if (correct_streak === 2) interval_days = 6; else interval_days = Math.max(1, Math.round(interval_days * easiness));
            } else if (g === 'flawed') {
              flawed_count += 1;
              correct_streak = 0;
              interval_days = 0;
            } else {
              incorrect_count += 1;
              correct_streak = 0;
              interval_days = 0;
            }
            easiness = Math.max(1.3, easiness - 0.8 + 0.28 * q - 0.02 * q * q);
            last_attempt = a.created_at as Date;
            next_due = interval_days > 0 ? new Date((a.created_at as Date).getTime() + interval_days * 86400000) : (a.created_at as Date);
          }
          const existing = await tx.featureStat.findFirst({ where: { pos, tense, person, number, gender } });
          if (existing) {
            await tx.featureStat.update({ where: { id: existing.id }, data: { correct_streak, easiness, interval_days, last_attempt, next_due, correct_count, flawed_count, incorrect_count } });
          } else {
            await tx.featureStat.create({ data: { pos, tense, person, number, gender, correct_streak, easiness, interval_days, last_attempt, next_due, correct_count, flawed_count, incorrect_count } });
          }
        }
      } catch {}
    });

    logEvent({ type: 'attempt_override_correct', session_id: sessionId, lesson_id: session.lesson_id, payload: { lesson_item_id: lessonItemId, attempt_id: attempt.id, prev_grade: prev } });

    return NextResponse.json({ grade: 'correct', reason: [{ code: 'user_override', message: 'marked correct' }], correct_hebrew: item.target_hebrew });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to override attempt' }, { status: 500 });
  }
}
