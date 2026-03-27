"use client";
import React from 'react';
import { useRouter } from 'next/navigation';

export default function StartOrContinueButton({ sessionId = null, lessonId, label, bootstrapUrl, className }: { sessionId?: string | null; lessonId: string; label: string; bootstrapUrl?: string; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const onClick = async () => {
    try {
      setBusy(true);
      if (sessionId) {
        router.push(`/session/${sessionId}`);
        return;
      }
      if (bootstrapUrl) {
        // Ensure backing lesson/items exist (idempotent server bootstrap)
        try { await fetch(bootstrapUrl, { method: 'POST' }); } catch {}
      }
      const res = await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lessonId }) });
      const data = await res.json();
      if (res.ok && data.session?.id) router.push(`/session/${data.session.id}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className={className || "today-btn"} onClick={onClick} disabled={busy}>
      {busy ? 'loading…' : label}
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );
}

