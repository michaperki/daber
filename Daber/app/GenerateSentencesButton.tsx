"use client";
import React from 'react';
import { useRouter } from 'next/navigation';

export default function GenerateSentencesButton() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const onClick = async () => {
    try {
      setBusy(true);
      const res = await fetch('/api/generate-sentences', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to generate sentences');
        return;
      }
      // Create a session for the generated sentences
      const sesRes = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId: data.lessonId })
      });
      const sesData = await sesRes.json();
      if (sesRes.ok && sesData.session?.id) {
        router.push(`/session/${sesData.session.id}`);
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className="qs-btn" onClick={onClick} disabled={busy}>
      <svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M7.5 1l2 4 4.5.5-3.3 3 1 4.5L7.5 11 3.3 13l1-4.5L1 5.5 5.5 5z" strokeLinejoin="round"/>
      </svg>
      {busy ? 'generating…' : 'sentence drills'}
    </button>
  );
}
