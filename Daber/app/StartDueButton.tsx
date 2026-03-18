"use client";
import React from 'react';
import { useRouter } from 'next/navigation';
import { useSettings } from '@/lib/client/settings';

export default function StartDueButton({ lessonId, type = 'feature', label }: { lessonId: string; type?: 'feature'|'item'; label?: string }) {
  const router = useRouter();
  const { setUseLexiconDrills, setDueMode } = useSettings();
  const [busy, setBusy] = React.useState(false);
  const onClick = async () => {
    try {
      setBusy(true);
      if (type === 'feature') setUseLexiconDrills(true);
      setDueMode(type);
      const res = await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lessonId }) });
      const data = await res.json();
      if (res.ok && data.session?.id) router.push(`/session/${data.session.id}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className="qs-btn" onClick={onClick} disabled={busy}>{busy ? 'starting…' : (label || 'review due')}</button>
  );
}

