import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { evaluateAttempt } from '@/lib/evaluator';
import { logEvent } from '@/lib/log';
import { zAttemptRequest } from '@/lib/contracts';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = zAttemptRequest.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    const { sessionId, lessonItemId, rawTranscript } = parsed.data;

    const [session, item] = await Promise.all([
      prisma.session.findUnique({ where: { id: sessionId } }),
      prisma.lessonItem.findUnique({ where: { id: lessonItemId } })
    ]);
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (!item) return NextResponse.json({ error: 'Lesson item not found' }, { status: 404 });

    const t0 = Date.now();
    let evaluation = evaluateAttempt(
      {
        id: item.id,
        english_prompt: item.english_prompt,
        target_hebrew: item.target_hebrew,
        transliteration: item.transliteration,
        accepted_variants: (item.accepted_variants as any) || [],
        near_miss_patterns: (item.near_miss_patterns as any) || [],
        features: ((item as any).features as Record<string, string | null> | null) || null
      },
      rawTranscript || ''
    );

    // Optional lexicon verification: if lesson item is linked to a lexeme and transcript contains Hebrew,
    // check if the heard form exists in Inflection. If exists but features differ → targeted flawed reasons.
    try {
      const lexemeId = (item as any).lexeme_id as string | null;
      const heard = (rawTranscript || '').match(/[\p{Script=Hebrew}]+/gu);
      if (lexemeId && heard && heard.length) {
        const last = heard[heard.length - 1];
        const infl = await prisma.inflection.findFirst({ where: { lexeme_id: lexemeId, form: last }, select: { tense: true, person: true, number: true, gender: true } });
        if (infl) {
          const tgt = ((item as any).features as any) || {};
          const diffs: Array<{ code: string; message: string }> = [];
          if (tgt.tense && infl.tense && tgt.tense !== infl.tense) diffs.push({ code: 'wrong_tense', message: 'Close, wrong tense.' });
          if (tgt.person && infl.person && tgt.person !== infl.person) diffs.push({ code: 'wrong_person', message: 'Close, wrong person.' });
          if (tgt.number && infl.number && tgt.number !== infl.number) diffs.push({ code: 'wrong_number', message: 'Close, wrong number.' });
          if (tgt.gender && infl.gender && tgt.gender !== infl.gender) diffs.push({ code: 'wrong_gender', message: 'Close, wrong gender.' });
          // Pronoun vs verb agreement (if a pronoun was spoken)
          const norm = (rawTranscript || '').toLowerCase();
          const heardPron = (() => {
            const map: Record<string, { person: string; number: string; gender: string | null }> = {
              'אני': { person: '1', number: 'sg', gender: null }, 'אתה': { person: '2', number: 'sg', gender: 'm' }, 'את': { person: '2', number: 'sg', gender: 'f' }, 'הוא': { person: '3', number: 'sg', gender: 'm' }, 'היא': { person: '3', number: 'sg', gender: 'f' }, 'אנחנו': { person: '1', number: 'pl', gender: null }, 'אתם': { person: '2', number: 'pl', gender: 'm' }, 'אתן': { person: '2', number: 'pl', gender: 'f' }, 'הם': { person: '3', number: 'pl', gender: 'm' }, 'הן': { person: '3', number: 'pl', gender: 'f' }
            };
            for (const k of Object.keys(map)) { if ((rawTranscript || '').includes(k)) return map[k]; }
            const roma: Record<string, { person: string; number: string; gender: string | null }> = {
              'ani': { person: '1', number: 'sg', gender: null }, 'ata': { person: '2', number: 'sg', gender: 'm' }, 'at': { person: '2', number: 'sg', gender: 'f' }, 'hu': { person: '3', number: 'sg', gender: 'm' }, 'hi': { person: '3', number: 'sg', gender: 'f' }, 'anachnu': { person: '1', number: 'pl', gender: null }, 'atem': { person: '2', number: 'pl', gender: 'm' }, 'aten': { person: '2', number: 'pl', gender: 'f' }, 'hem': { person: '3', number: 'pl', gender: 'm' }, 'hen': { person: '3', number: 'pl', gender: 'f' }
            };
            const toks = norm.split(/\s+/);
            for (const t of toks) { const v = roma[t]; if (v) return v; }
            return null;
          })();
          if (heardPron) {
            if (infl.person && heardPron.person && infl.person !== heardPron.person) diffs.push({ code: 'pronoun_verb_mismatch', message: 'Pronoun does not match the verb form.' });
            if (infl.number && heardPron.number && infl.number !== heardPron.number) diffs.push({ code: 'pronoun_verb_mismatch', message: 'Pronoun does not match the verb number.' });
            if (infl.gender && heardPron.gender && infl.gender !== heardPron.gender) diffs.push({ code: 'pronoun_verb_mismatch', message: 'Pronoun does not match the verb gender.' });
          }
          if (diffs.length && evaluation.grade !== 'correct') {
            evaluation = { grade: 'flawed', reasons: diffs, normalized: evaluation.normalized };
          }
        }
      }
    } catch {}

    // Infer features from item (generated items have features) or from id pattern
    function parseFeaturesFromId(id: string): Record<string, string> | null {
      if (id.startsWith('gen_vpr_')) {
        const parts = id.split('_');
        const person = parts[2] || 'na';
        const number = parts[3] || 'na';
        const gender = parts[4] || 'na';
        return { pos: 'verb', tense: 'present', person, number, gender };
      }
      if (id.startsWith('gen_adj_')) {
        const parts = id.split('_');
        const number = parts[3] || 'na';
        const gender = parts[4] || 'na';
        return { pos: 'adjective', number, gender };
      }
      return null;
    }

    const features = (item as any).features || parseFeaturesFromId(item.id) || null;

    // Return the grade immediately — DB writes happen in the background
    const response = NextResponse.json({
      grade: evaluation.grade,
      reason: evaluation.reasons,
      correct_hebrew: item.target_hebrew
    });

    logEvent({
      type: 'attempt_graded',
      session_id: sessionId,
      lesson_id: session.lesson_id,
      payload: {
        lesson_item_id: lessonItemId,
        grade: evaluation.grade,
        reasons: evaluation.reasons,
        eval_ms: Date.now() - t0
      }
    });

    // Fire-and-forget: run DB writes in parallel, then session completion check
    const grade = evaluation.grade;
    const dbWrites = async () => {
      const updates: any = {};
      if (grade === 'correct') updates.correct_count = { increment: 1 };
      if (grade === 'flawed') updates.flawed_count = { increment: 1 };
      if (grade === 'incorrect') updates.incorrect_count = { increment: 1 };

      const now = new Date();
      const q = grade === 'correct' ? 5 : (grade === 'flawed' ? 3 : 1);

      // Build feature stat update function
      const featureStatUpdate = async () => {
        if (!features || typeof features !== 'object') return;
        const pos = (features as any).pos || null;
        const tense = (features as any).tense || null;
        const person = (features as any).person || null;
        const number = (features as any).number || null;
        const gender = (features as any).gender || null;
        await prisma.$transaction(async (tx) => {
          const existing = await tx.featureStat.findFirst({ where: { pos, tense, person, number, gender } });
          let correct_streak = existing?.correct_streak || 0;
          let easiness = existing?.easiness || 2.5;
          let interval_days = existing?.interval_days || 0;
          if (grade === 'correct') {
            correct_streak += 1;
            if (correct_streak === 1) interval_days = 1; else if (correct_streak === 2) interval_days = 6; else interval_days = Math.max(1, Math.round(interval_days * easiness));
          } else {
            correct_streak = 0;
            interval_days = 0;
          }
          easiness = Math.max(1.3, easiness - 0.8 + 0.28 * q - 0.02 * q * q);
          const next_due = interval_days > 0 ? new Date(now.getTime() + interval_days * 86400000) : now;
          const counters = {
            correct_count: (existing?.correct_count || 0) + (grade === 'correct' ? 1 : 0),
            flawed_count: (existing?.flawed_count || 0) + (grade === 'flawed' ? 1 : 0),
            incorrect_count: (existing?.incorrect_count || 0) + (grade === 'incorrect' ? 1 : 0)
          };
          if (existing) {
            await tx.featureStat.update({ where: { id: existing.id }, data: { correct_streak, easiness, interval_days, last_attempt: now, next_due, ...counters } });
          } else {
            await tx.featureStat.create({ data: { pos, tense, person, number, gender, correct_streak, easiness, interval_days, last_attempt: now, next_due, ...counters } });
          }
        });
      };

      // Build item stat update function
      const itemStatUpdate = async () => {
        await prisma.$transaction(async (tx) => {
          const existing = await tx.itemStat.findUnique({ where: { lesson_item_id: lessonItemId } });
          let correct_streak = existing?.correct_streak || 0;
          let easiness = existing?.easiness || 2.5;
          let interval_days = existing?.interval_days || 0;
          if (grade === 'correct') {
            correct_streak += 1;
            if (correct_streak === 1) interval_days = 1; else if (correct_streak === 2) interval_days = 6; else interval_days = Math.max(1, Math.round(interval_days * easiness));
          } else {
            correct_streak = 0;
            interval_days = 0;
          }
          easiness = Math.max(1.3, easiness - 0.8 + 0.28 * q - 0.02 * q * q);
          const next_due = interval_days > 0 ? new Date(now.getTime() + interval_days * 86400000) : now;
          const counters = {
            correct_count: (existing?.correct_count || 0) + (grade === 'correct' ? 1 : 0),
            flawed_count: (existing?.flawed_count || 0) + (grade === 'flawed' ? 1 : 0),
            incorrect_count: (existing?.incorrect_count || 0) + (grade === 'incorrect' ? 1 : 0)
          };
          if (existing) {
            await tx.itemStat.update({ where: { lesson_item_id: lessonItemId }, data: { correct_streak, easiness, interval_days, last_attempt: now, next_due, ...counters } });
          } else {
            await tx.itemStat.create({ data: { lesson_item_id: lessonItemId, correct_streak, easiness, interval_days, last_attempt: now, next_due, ...counters } });
          }
        });
      };

      // Run attempt create, feature stat, item stat, and session counter in parallel
      await Promise.all([
        prisma.attempt.create({
          data: {
            session_id: sessionId,
            lesson_item_id: lessonItemId,
            raw_transcript: rawTranscript || null,
            normalized_transcript: evaluation.normalized,
            grade: evaluation.grade,
            reason: evaluation.reasons,
            correct_hebrew: item.target_hebrew,
            features: features
          }
        }),
        featureStatUpdate(),
        itemStatUpdate(),
        prisma.session.update({ where: { id: sessionId }, data: updates }),
      ]);

      // Session completion check (depends on attempt being created)
      const subsetRaw = (session as any).subset_item_ids as unknown;
      const subset = Array.isArray(subsetRaw) ? (subsetRaw as unknown[]).map(String) : [];
      if (subset.length) {
        const attemptedItems = await prisma.attempt.findMany({ where: { session_id: sessionId }, select: { lesson_item_id: true } });
        const uniqueAttempted = new Set(attemptedItems.map(a => a.lesson_item_id));
        if (uniqueAttempted.size >= subset.length) {
          await prisma.session.update({ where: { id: sessionId }, data: { ended_at: new Date() } });
          logEvent({ type: 'session_ended', session_id: sessionId, lesson_id: session.lesson_id });
        }
      } else {
        const totalItems = await prisma.lessonItem.count({ where: { lesson_id: session.lesson_id } });
        const attemptsCount = await prisma.attempt.count({ where: { session_id: sessionId } });
        if (attemptsCount >= totalItems) {
          await prisma.session.update({ where: { id: sessionId }, data: { ended_at: new Date() } });
          logEvent({ type: 'session_ended', session_id: sessionId, lesson_id: session.lesson_id });
        }
      }
    };

    // Fire and forget — don't block the response
    dbWrites().catch(() => {});

    return response;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to record attempt' }, { status: 500 });
  }
}
