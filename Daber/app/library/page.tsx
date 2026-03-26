import React from 'react';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import LibraryClient from './LibraryClient';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type LessonCard = {
  id: string;
  title: string;
  level: string;
  type: string;
  description: string | null;
  itemCount: number;
  progressPct: number;
  accuracyPct: number;
};

async function getLessons(): Promise<LessonCard[]> {
  const lessons = await prisma.lesson.findMany({
    where: { NOT: { type: 'vocab_generated' } },
    orderBy: { id: 'asc' },
    include: { _count: { select: { items: true } } }
  });
  const result: LessonCard[] = [];
  for (const l of lessons) {
    const itemCount = (l as any)._count?.items ?? 0;
    let progressPct = 0;
    let accuracyPct = 0;
    if (itemCount > 0) {
      const attempts = await prisma.attempt.findMany({
        where: { session: { is: { lesson_id: l.id } }, lesson_item: { is: { lesson_id: l.id } } },
        select: { lesson_item_id: true, grade: true }
      });
      const unique = new Set(attempts.map(a => a.lesson_item_id));
      progressPct = Math.min(100, Math.round((unique.size / itemCount) * 100));
      const total = attempts.length;
      const correct = attempts.filter(a => a.grade === 'correct').length;
      accuracyPct = total ? Math.round((correct / total) * 100) : 0;
    }
    result.push({
      id: l.id,
      title: l.title,
      level: l.level,
      type: l.type,
      description: l.description ?? null,
      itemCount,
      progressPct,
      accuracyPct
    });
  }
  return result;
}

export default async function LibraryPage() {
  const lessons = await getLessons();
  return (
    <div className="lib-root">
      <div className="lib-topbar">
        <h1 className="lib-title">lesson packs</h1>
        <Link href="/profile" className="lib-settings-btn" title="settings" aria-label="settings">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 4h12M2 8h12M2 12h12" strokeLinecap="round"/>
            <circle cx="6" cy="4" r="1.6" fill="currentColor" stroke="none"/>
            <circle cx="10" cy="8" r="1.6" fill="currentColor" stroke="none"/>
            <circle cx="8" cy="12" r="1.6" fill="currentColor" stroke="none"/>
          </svg>
        </Link>
      </div>

      <LibraryClient lessons={ lessons } />

      <div className="divider" />
      <div className="section-eyebrow">reference</div>
      <Link href="/dictionary" className="pack-card" style={{ padding: 12, marginTop: 8 }}>
        <div className="pack-top">
          <div className="pack-meta">
            <p className="pack-name">Dictionary</p>
            <p className="pack-desc">lemmas + forms (seeded from public Wikidata lexemes)</p>
          </div>
          <span className="pack-status-badge">open</span>
        </div>
      </Link>
      <Link href="/library/words" className="pack-card" style={{ padding: 12, marginTop: 8 }}>
        <div className="pack-top">
          <div className="pack-meta">
            <p className="pack-name">Raw Words</p>
            <p className="pack-desc">auto-extracted tokens from phrases (no morphology)</p>
          </div>
          <span className="pack-status-badge">open</span>
        </div>
      </Link>

      <div className="divider" />
      <div className="section-eyebrow">coming soon</div>
      <div className="pack-card locked">
        <div className="pack-top">
          <div className="pack-icon" style={{ background: 'var(--color-background-secondary)' }}>
            <svg viewBox="0 0 18 18" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.5">
              <rect x="4" y="8" width="10" height="8" rx="2"/>
              <path d="M6 8V6a3 3 0 0 1 6 0v2" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="pack-meta">
            <p className="pack-name">Past Tense Basics 01</p>
            <p className="pack-desc">pa'al basics, common verbs</p>
          </div>
          <span className="pack-status-badge badge-locked">locked</span>
        </div>
      </div>
    </div>
  );
}
