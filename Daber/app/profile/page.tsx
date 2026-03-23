import React from 'react';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import SettingsCard from './SettingsCard';

async function getProfileData() {
  const sums = await prisma.session.aggregate({ _sum: { correct_count: true, flawed_count: true, incorrect_count: true } });
  const sumCorrect = sums._sum.correct_count || 0;
  const sumFlawed = sums._sum.flawed_count || 0;
  const sumIncorrect = sums._sum.incorrect_count || 0;
  const totalAttempts = sumCorrect + sumFlawed + sumIncorrect;
  const accuracy = totalAttempts ? Math.round((sumCorrect / totalAttempts) * 100) : 0;
  const sessions = await prisma.session.count();
  const lessons = await prisma.lesson.count();
  return { totalAttempts, accuracy, sessions, lessons };
}

export default async function ProfilePage() {
  const { totalAttempts, accuracy, sessions, lessons } = await getProfileData();
  return (
    <div className="lib-root">
      <div className="lib-topbar">
        <h1 className="lib-title">profile</h1>
        <div className="avatar">M</div>
      </div>
      <div className="kpi-row" style={{ marginTop: 8 }}>
        <div className="kpi-tile"><div className="kpi-num">{sessions}</div><div className="kpi-label">sessions</div></div>
        <div className="kpi-tile"><div className="kpi-num">{totalAttempts}</div><div className="kpi-label">items</div></div>
        <div className="kpi-tile"><div className="kpi-num">{accuracy}<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-tertiary)' }}>%</span></div><div className="kpi-label">accuracy</div></div>
        <div className="kpi-tile"><div className="kpi-num">{lessons}</div><div className="kpi-label">lessons</div></div>
      </div>
      <div className="section-header">
        <span className="section-label">quick links</span>
      </div>
      <div className="quick-start-row" style={{ flexWrap: 'wrap' }}>
        <Link href="/conjugations" className="qs-btn" style={{ textDecoration: 'none' }}>
          <svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="2" y="2" width="11" height="11" rx="1.5"/><path d="M2 5.5h11M5.5 2v11" strokeLinecap="round"/></svg>
          tables
        </Link>
        <Link href="/retry" className="qs-btn" style={{ textDecoration: 'none' }}>
          <svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M2 7a5 5 0 1 0 5-5" strokeLinecap="round"/><path d="M2 3.5v3.5h3.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          retry
        </Link>
        <Link href="/vocab" className="qs-btn" style={{ textDecoration: 'none' }}>
          <svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M3 2.5h9M3 7.5h9M3 12.5h6" strokeLinecap="round"/></svg>
          vocab
        </Link>
      </div>
      <SettingsCard />
    </div>
  );
}
