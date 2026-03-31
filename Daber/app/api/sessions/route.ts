import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logEvent } from '@/lib/log';
import { zCreateSessionRequest } from '@/lib/contracts';
import { runGenerationJob } from '../../../lib/generation/pipeline';
import { scheduleGenerationJob } from '@/lib/infra/queue';

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

    const ensureLesson = async () => {
      if (lessonId === 'vocab_all') {
        return prisma.lesson.upsert({
          where: { id: lessonId },
          update: { title: 'All Vocab', language: 'he', level: 'mixed', type: 'vocab', description: 'Drill across all vocab lessons' },
          create: { id: lessonId, title: 'All Vocab', language: 'he', level: 'mixed', type: 'vocab', description: 'Drill across all vocab lessons' }
        });
      }
      if (lessonId === 'vocab_green') {
        return prisma.lesson.upsert({
          where: { id: lessonId },
          update: { title: 'Green Vocab', language: 'he', level: 'green', type: 'vocab', description: 'Foundational drill: Green lexeme set (base forms + conjugations later)' },
          create: { id: lessonId, title: 'Green Vocab', language: 'he', level: 'green', type: 'vocab', description: 'Foundational drill: Green lexeme set (base forms + conjugations later)' }
        });
      }
      const found = await prisma.lesson.findUnique({ where: { id: lessonId } });
      return found;
    };
    const lesson = await ensureLesson();
    if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });

    const subsetData = (subset && subset.length ? (subset as any) : undefined);
    const session = await prisma.session.create({
      data: { lesson_id: lessonId, user_id: userId ?? null, subset_item_ids: subsetData },
      select: { id: true, lesson_id: true, started_at: true }
    });
    logEvent({ type: 'session_started', session_id: session.id, lesson_id: lessonId, user_id: userId ?? undefined });

    // Background generation trigger: ensure we have a queue of undrilled generated items
    try {
      const threshold = Number.parseInt(process.env.GEN_QUEUE_THRESHOLD || '', 10) || 20;
      const pending = await prisma.generatedBatch.count({ where: { status: 'pending' } });
      if (pending === 0) {
        const undrilled = await prisma.lessonItem.count({ where: { lesson: { type: 'vocab_generated' }, attempts: { none: {} } } });
        if (undrilled < threshold) {
          await scheduleGenerationJob({ userId }, async (job) => {
            if (job.type === 'generate_drills') {
              await runGenerationJob({ userId: job.payload.userId ?? undefined });
            }
          });
        }
      }
    } catch {}
    return NextResponse.json({ session });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to create session' }, { status: 500 });
  }
}
