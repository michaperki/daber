import React from 'react';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getRecentAttempts(limit = 100) {
  const rows = await prisma.attempt.findMany({
    orderBy: { created_at: 'desc' },
    take: limit,
    select: {
      id: true,
      created_at: true,
      grade: true,
      raw_transcript: true,
      normalized_transcript: true,
      correct_hebrew: true,
      reason: true,
      session_id: true,
      lesson_item: { select: { id: true, english_prompt: true } },
    }
  });
  return rows;
}

export default async function AdminAttemptsPage() {
  const attempts = await getRecentAttempts(100);
  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ marginBottom: 8 }}>Recent Attempts</h1>
      <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>
        Latest 100 attempts (server time order). Useful for reviewing guided outputs.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '160px 80px 1fr 1fr 1fr', gap: 8, alignItems: 'start' }}>
        <div style={{ fontWeight: 600 }}>time</div>
        <div style={{ fontWeight: 600 }}>grade</div>
        <div style={{ fontWeight: 600 }}>english prompt</div>
        <div style={{ fontWeight: 600 }}>your answer</div>
        <div style={{ fontWeight: 600 }}>correct hebrew</div>
        {attempts.map((a) => (
          <React.Fragment key={a.id}>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
              {new Date(a.created_at).toLocaleString()}
            </div>
            <div style={{ fontWeight: 600, color: a.grade === 'correct' ? '#2f7a1f' : a.grade === 'flawed' ? '#a07512' : '#a12b2b' }}>{a.grade}</div>
            <div>{a.lesson_item?.english_prompt || ''}</div>
            <div style={{ direction: 'rtl' }}>{a.raw_transcript || a.normalized_transcript || ''}</div>
            <div style={{ direction: 'rtl' }}>{a.correct_hebrew}</div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

