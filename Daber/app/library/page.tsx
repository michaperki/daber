import React from 'react';
import { prisma } from '@/lib/db';
import StartOrContinueButton from '@/app/StartOrContinueButton';

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
        <button className="lib-settings-btn" title="settings">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="8" r="2.5"/>
            <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      <div className="filter-row">
        <span className="filter-pill active">all</span>
        <span className="filter-pill">beginner</span>
        <span className="filter-pill">intermediate</span>
        <span className="filter-pill">verbs</span>
        <span className="filter-pill">pronouns</span>
        <span className="filter-pill">completed</span>
      </div>

      <div className="section-eyebrow">available</div>
      {lessons.map((l) => (
        <LessonPackCard key={l.id} lesson={l} />
      ))}

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

function LessonPackCard({ lesson }: { lesson: LessonCard }) {
  return (
    <div className="pack-card">
      <div className="pack-top">
        <div className="pack-icon amber">
          <svg viewBox="0 0 18 18" fill="none" stroke="#854F0B" strokeWidth="1.5">
            <path d="M9 2v14M2 9h14" strokeLinecap="round"/>
            <circle cx="9" cy="9" r="3"/>
          </svg>
        </div>
        <div className="pack-meta">
          <p className="pack-name">{lesson.title}</p>
          <p className="pack-desc">{lesson.description || lesson.type}</p>
        </div>
        <span className={`pack-status-badge ${lesson.progressPct===0? 'badge-new' : (lesson.progressPct<100? 'badge-in-progress' : 'badge-complete')}`}>
          {lesson.progressPct===0? 'new' : (lesson.progressPct<100? 'in progress' : 'done')}
        </span>
      </div>
      <div className="pack-footer">
        <div className="pack-chips">
          <span className="pack-chip">{lesson.level}</span>
          <span className="pack-chip">{lesson.type.replace('_', ' ')}</span>
          <span className="pack-chip">{lesson.itemCount} items</span>
        </div>
        <div className="pack-progress-wrap">
          <div className="pack-progress-track">
            <div className="pack-progress-fill" style={{ width: `${lesson.progressPct}%` }} />
          </div>
          <span className="pack-progress-pct">{lesson.progressPct ? `${lesson.progressPct}%` : '—'}</span>
        </div>
      </div>
      <div className="cta-row">
        <div className="pack-chips">
          <span className="pack-chip">accuracy {lesson.accuracyPct ? `${lesson.accuracyPct}%` : '—'}</span>
        </div>
        <StartOrContinueButton sessionId={null} lessonId={lesson.id} label="start" />
      </div>
    </div>
  );
}
