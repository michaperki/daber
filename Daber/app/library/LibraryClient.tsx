"use client";
import React from 'react';
import StartOrContinueButton from '@/app/StartOrContinueButton';

export type LessonCard = {
  id: string;
  title: string;
  level: string;
  type: string;
  description: string | null;
  itemCount: number;
  progressPct: number;
  accuracyPct: number;
};

type FilterKey = 'all' | 'beginner' | 'intermediate' | 'verbs' | 'pronouns' | 'completed';

function matchFilter(l: LessonCard, f: FilterKey): boolean {
  if (f === 'all') return true;
  if (f === 'beginner') return (l.level || '').toLowerCase() === 'beginner';
  if (f === 'intermediate') return (l.level || '').toLowerCase() === 'intermediate';
  if (f === 'completed') return l.progressPct >= 100;
  const hay = `${l.title} ${l.description || ''} ${l.type}`.toLowerCase();
  if (f === 'verbs') return /verb|tense|conjug/i.test(hay);
  if (f === 'pronouns') return /pronoun/i.test(hay);
  return true;
}

export default function LibraryClient({ lessons }: { lessons: LessonCard[] }) {
  const [filter, setFilter] = React.useState<FilterKey>('all');
  const filtered = React.useMemo(() => lessons.filter(l => matchFilter(l, filter)), [lessons, filter]);
  return (
    <>
      <div className="filter-row">
        {(['all','beginner','intermediate','verbs','pronouns','completed'] as FilterKey[]).map(key => (
          <button
            key={key}
            className={`filter-pill${filter === key ? ' active' : ''}`}
            onClick={() => setFilter(key)}
          >
            {key}
          </button>
        ))}
      </div>

      <div className="section-eyebrow">available</div>
      {filtered.map((l) => (
        <LessonPackCard key={l.id} lesson={l} />
      ))}
      {!filtered.length ? (
        <div className="pack-card"><div className="pack-meta"><p className="pack-desc">No lessons match this filter</p></div></div>
      ) : null}
    </>
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

