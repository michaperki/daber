import React from 'react';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
import StartOrContinueButton from './StartOrContinueButton';
import StartDueButton from './StartDueButton';
import StartWeakSpotsButton from './StartWeakSpotsButton';
import StartDynamicDrillButton from './StartDynamicDrillButton';
import StartTextFlashcardsButton from './StartTextFlashcardsButton';
// Fresh sentences feature removed; local LLM on-the-fly is session-driven

function formatDate(d: Date) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(d);
}

function localDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function getDashboardData() {
  const uid = cookies().get('daber.uid')?.value || 'anon';
  const inProgress = await prisma.session.findFirst({
    where: { ended_at: null, OR: [{ user_id: uid }, { user_id: null }] },
    orderBy: { started_at: 'desc' },
    select: { id: true, lesson_id: true, correct_count: true, flawed_count: true, incorrect_count: true, started_at: true, lesson: { select: { title: true, level: true, type: true } } }
  });
  const lastSession = inProgress || await prisma.session.findFirst({
    where: { OR: [{ user_id: uid }, { user_id: null }] },
    orderBy: { started_at: 'desc' },
    select: { id: true, lesson_id: true, correct_count: true, flawed_count: true, incorrect_count: true, ended_at: true, started_at: true, lesson: { select: { title: true, level: true, type: true } } }
  });
  let totalItems = 0;
  if (lastSession) {
    if (lastSession.lesson_id === 'vocab_all') {
      totalItems = await prisma.lessonItem.count({ where: { lesson_id: { in: (await prisma.lesson.findMany({ where: { type: 'vocab' }, select: { id: true } })).map(l => l.id) } } });
    } else {
      totalItems = await prisma.lessonItem.count({ where: { lesson_id: lastSession.lesson_id } });
    }
  }
  const sums = await prisma.session.aggregate({ where: { OR: [{ user_id: uid }, { user_id: null }] }, _sum: { correct_count: true, flawed_count: true, incorrect_count: true } });
  const sumCorrect = sums._sum.correct_count || 0;
  const sumFlawed = sums._sum.flawed_count || 0;
  const sumIncorrect = sums._sum.incorrect_count || 0;
  const totalAttempts = sumCorrect + sumFlawed + sumIncorrect;
  const accuracy = totalAttempts ? Math.round((sumCorrect / totalAttempts) * 100) : 0;

  const since = new Date(); since.setDate(since.getDate() - 6);
  const recentSessions = await prisma.session.findMany({ where: { started_at: { gte: since }, OR: [{ user_id: uid }, { user_id: null }] }, select: { started_at: true } });
  const daySet = new Set(recentSessions.map(s => localDateKey(new Date(s.started_at))));
  // streak: count back from today
  let streak = 0; {
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const key = localDateKey(d);
      if (daySet.has(key)) streak++; else break;
    }
  }

  const missed = await prisma.attempt.findMany({
    where: { OR: [{ grade: 'flawed' }, { grade: 'incorrect' }], session: { OR: [{ user_id: uid }, { user_id: null }] } },
    orderBy: { created_at: 'desc' },
    take: 3,
    select: { grade: true, correct_hebrew: true, lesson_item: { select: { english_prompt: true } } }
  });

  // Fallback lesson id: prefer a user vocab lesson if available
  const vocab = await prisma.lesson.findFirst({ where: { id: 'user_vocab_01' }, select: { id: true, title: true, level: true, type: true } });
  if (!lastSession && vocab?.id) {
    totalItems = await prisma.lessonItem.count({ where: { lesson_id: vocab.id } });
  }
  return { inProgress, lastSession, totalItems, sumCorrect, totalAttempts, accuracy, daySet, missed, fallbackLesson: vocab };
}

export default async function DaberHome() {
  const now = new Date();
  const { inProgress, lastSession, totalItems, sumCorrect, totalAttempts, accuracy, daySet, missed, fallbackLesson } = await getDashboardData();
  const attemptsDone = (lastSession?.correct_count || 0) + (lastSession?.flawed_count || 0) + (lastSession?.incorrect_count || 0);
  const pct = totalItems ? Math.round((attemptsDone / totalItems) * 100) : 0;
  const weekDays = Array.from({ length: 7 }).map((_, idx) => {
    const d = new Date(now); d.setDate(now.getDate() - (6 - idx));
    const key = localDateKey(d);
    return { d, key, has: daySet.has(key), isToday: idx === 6 };
  });
  return (
    <div className="home-root">
      <div className="home-header">
        <div>
          <h1 className="home-greeting">בוקר טוב</h1>
          <div className="home-date">{formatDate(now)}</div>
        </div>
        <div className="avatar">M</div>
      </div>

      <div className="today-card">
        <div className="today-deco"></div>
        <div className="today-deco2"></div>
        <div className="today-eyebrow">{inProgress ? 'continue where you left off' : 'jump back in'}</div>
        <div className="today-pack-name">{lastSession?.lesson?.title || fallbackLesson?.title || 'Present Tense Basics 01'}</div>
        <div className="today-pack-meta">{totalItems} items · {lastSession?.lesson?.level || fallbackLesson?.level || 'beginner'}</div>
        <div className="today-progress-row">
          <div className="today-track"><div className="today-fill" style={{ width: `${pct}%` }} /></div>
          <span className="today-pct">{attemptsDone} of {totalItems} done</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <StartOrContinueButton sessionId={null} lessonId={'vocab_mini_morph'} label={'start mini morph drill'} />
        </div>
      </div>

      <div className="section-header" style={{ marginTop: '0.25rem' }}>
        <span className="section-label">this week</span>
      </div>
      <div className="week-grid">
        <div className="week-labels">
          {['S','M','T','W','T','F','S'].map((c,i) => <div key={i} className="week-lbl">{c}</div>)}
        </div>
        <div className="week-row">
          {weekDays.map(({ d, has, isToday }, i) => (
            <div key={i} className={`week-day ${has ? 'has-session' : ''} ${isToday ? 'today-cell' : ''}`}>{d.getDate()}</div>
          ))}
        </div>
      </div>

      <div className="stat-row">
        <div className="stat-tile">
          <div className="streak-bar">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className={`streak-col ${i===5 ? 'today' : 'done'}`} style={{ height: `${40 + i*8}%` }} />)}
          </div>
          <div className="stat-num">{totalAttempts}</div>
          <div className="stat-caption">items drilled</div>
        </div>
        <div className="stat-tile">
          <div style={{ height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M11 3C11 3 15.5 8.5 15.5 12.5C15.5 15 13.5 17 11 17C8.5 17 6.5 15 6.5 12.5C6.5 10 8 8 8 8C8 8 7 11 9.5 12.5C9.5 9 10 6 11 3Z" fill="#EF9F27"/>
              <path d="M11 17C11 17 15.5 14.5 17 19C18 21.5 15 24 11 24C7 24 4 22 5 19C6.5 14.5 11 17 11 17Z" fill="#BA7517"/>
            </svg>
          </div>
          <div className="stat-num">{weekDays.filter(w=>w.has).length}</div>
          <div className="stat-caption">days this week</div>
        </div>
        <div className="stat-tile">
          <div style={{ height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="8" stroke="var(--color-border-secondary)" strokeWidth="2"/>
              <path d="M10 10l0-5" stroke="#639922" strokeWidth="2" strokeLinecap="round"/>
              <path d="M10 10l3.5 3.5" stroke="#639922" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="stat-num">{accuracy}<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--color-text-tertiary)' }}>%</span></div>
          <div className="stat-caption">accuracy</div>
        </div>
      </div>

      <div className="divider"></div>

      <div className="section-header">
        <span className="section-label">review these</span>
        <Link className="section-link" href="/library">drill all →</Link>
      </div>
      <div className="missed-card">
        {missed.map((m,i) => (
          <div key={i} className="missed-row">
            <div className={`missed-pip ${m.grade === 'incorrect' ? 'pip-incorrect' : 'pip-flawed'}`}></div>
            <div className="missed-hebrew-sm">{m.correct_hebrew}</div>
            <div className="missed-eng">{m.lesson_item?.english_prompt || ''}</div>
          </div>
        ))}
        {!missed.length ? (
          <div className="missed-row"><div className="missed-eng" style={{ textAlign: 'center', flex: 'unset' }}>No missed items yet</div></div>
        ) : null}
      </div>

      <div className="section-header">
        <span className="section-label">quick start</span>
      </div>
      <div className="quick-start-row">
        <Link href="/library" className="qs-btn" style={{ textDecoration: 'none' }}>
          <svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M7.5 2v11M2 7.5h11" strokeLinecap="round"/></svg>
          new pack
        </Link>
        <Link href="/retry" className="qs-btn" style={{ textDecoration: 'none' }}>
          <svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M2 7a5 5 0 1 0 5-5" strokeLinecap="round"/><path d="M2 3.5v3.5h3.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          retry missed
        </Link>
        {fallbackLesson?.id ? (
          <>
            <StartWeakSpotsButton lessonId={fallbackLesson.id} label="drill weak spots" />
            <StartDueButton lessonId={fallbackLesson.id} type="feature" label="review due" />
            <StartDynamicDrillButton lessonId={fallbackLesson.id} />
          </>
        ) : null}
        <StartTextFlashcardsButton />
      </div>
    </div>
  );
}
