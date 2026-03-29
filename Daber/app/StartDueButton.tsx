"use client";
import React from 'react';
import { useRouter } from 'next/navigation';
import { useSettings } from '@/lib/client/settings';
import { apiCreateSession, getUserId } from '@/lib/client/api';

export default function StartDueButton({ lessonId, type = 'feature', label }: { lessonId: string; type?: 'feature'|'item'; label?: string }) {
  const router = useRouter();
  const { setUseLexiconDrills } = useSettings();
  const [busy, setBusy] = React.useState(false);
  const onClick = async () => {
    try {
      setBusy(true);
      if (type === 'feature') setUseLexiconDrills(true);
      const { session } = await apiCreateSession(lessonId, getUserId());
      if (session?.id) router.push(`/session/${session.id}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className="qs-btn" onClick={onClick} disabled={busy}>{busy ? 'starting…' : (label || 'review due')}</button>
  );
}
