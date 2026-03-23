import React from 'react';
import { prisma } from '@/lib/db';
import RetryClient from './RetryClient';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function RetryPage() {
  const recent = await prisma.attempt.findMany({
    where: { OR: [{ grade: 'flawed' }, { grade: 'incorrect' }] },
    orderBy: { created_at: 'desc' },
    take: 12,
    select: { lesson_item_id: true, grade: true, lesson_item: { select: { id: true, english_prompt: true, target_hebrew: true, lesson_id: true, lesson: { select: { title: true } } } } }
  });
  const byLesson = new Map<string, { title: string; lessonId: string; items: { he: string; en: string; id: string }[] }>();
  for (const r of recent) {
    const l = r.lesson_item?.lesson_id || '';
    if (!l) continue;
    const title = r.lesson_item?.lesson?.title || l;
    const entry = byLesson.get(l) || { title, lessonId: l, items: [] };
    if (entry.items.length < 3) entry.items.push({ he: r.lesson_item?.target_hebrew || '', en: r.lesson_item?.english_prompt || '', id: r.lesson_item?.id || '' });
    byLesson.set(l, entry);
  }
  const groups = Array.from(byLesson.values());
  return (
    <div className="drill-root">
      <div className="prompt-card" style={{ marginBottom: 12 }}>
        <div className="prompt-eyebrow">retry missed</div>
        <div className="prompt-text">Jump back into packs you missed</div>
      </div>
      <RetryClient groups={groups.map(g => ({ lessonId: g.lessonId, title: g.title, items: g.items }))} />
      {!groups.length ? (
        <div className="prompt-card"><div className="prompt-text">No missed items yet</div></div>
      ) : null}
    </div>
  );
}
