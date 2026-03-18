"use client";
import React from 'react';
import { useParams, useRouter } from 'next/navigation';

type Summary = {
  sessionId: string;
  lessonId: string;
  counts: { correct: number; flawed: number; incorrect: number };
  total: number;
};

export default function DaberSummaryPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const [summary, setSummary] = React.useState<Summary | null>(null);

  React.useEffect(() => {
    (async () => {
      const res = await fetch(`/api/sessions/${sessionId}/summary`);
      const data = await res.json();
      if (res.ok) setSummary(data);
    })();
  }, [sessionId]);

  if (!summary) {
    return (
      <div className="drill-root">
        <div className="prompt-card"><div className="prompt-text">Loading…</div></div>
      </div>
    );
  }

  const total = summary.total || 1;
  const pctC = Math.round((summary.counts.correct / total) * 100);
  const pctF = Math.round((summary.counts.flawed / total) * 100);
  const pctI = Math.round((summary.counts.incorrect / total) * 100);

  return (
    <div className="drill-root">
      <div className="prompt-card" style={{ textAlign: 'center' }}>
        <div className="prompt-eyebrow">session summary</div>
        <div className="prompt-text">{summary.counts.correct} of {total} correct</div>
        <div style={{ display: 'flex', height: 6, borderRadius: 99, overflow: 'hidden', gap: 2, margin: '0.75rem 0 1rem' }}>
          <div style={{ width: `${pctC}%`, background: '#639922', borderRadius: 99 }} />
          <div style={{ width: `${pctF}%`, background: '#EF9F27', borderRadius: 99 }} />
          <div style={{ width: `${pctI}%`, background: '#E24B4A', borderRadius: 99 }} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button
            className="next-btn"
            onClick={async () => {
              try {
                const res = await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lessonId: summary.lessonId }) });
                const data = await res.json();
                if (res.ok && data.session?.id) router.push(`/session/${data.session.id}`);
                else router.push('/');
              } catch { router.push('/'); }
            }}
          >
            do it again
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 7a5 5 0 1 0 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M2 3v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button className="next-btn" onClick={() => router.push('/retry')}>
            retry missed
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
