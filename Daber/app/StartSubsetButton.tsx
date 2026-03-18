"use client";
import React from 'react';
import { useRouter } from 'next/navigation';

export default function StartSubsetButton({ lessonId, itemIds, label }: { lessonId: string; itemIds: string[]; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const onClick = async () => {
    try {
      setBusy(true);
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId, subset: itemIds })
      });
      const data = await res.json();
      if (res.ok && data.session?.id) router.push(`/session/${data.session.id}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className="btn-resume" onClick={onClick} disabled={busy || !itemIds.length}>
      {busy ? 'starting…' : (label || 'drill misses only')}
    </button>
  );
}

