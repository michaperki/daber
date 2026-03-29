"use client";
import React from 'react';
import { useRouter } from 'next/navigation';
import { useSettings } from '@/lib/client/settings';
import { apiCreateSession, getUserId } from '@/lib/client/api';

export default function StartDynamicDrillButton({ lessonId }: { lessonId: string }) {
  const router = useRouter();
  const { setUseLexiconDrills } = useSettings();
  const [busy, setBusy] = React.useState(false);
  const onClick = async () => {
    try {
      setBusy(true);
      setUseLexiconDrills(true);
      const { session } = await apiCreateSession(lessonId, getUserId());
      if (session?.id) router.push(`/session/${session.id}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className="qs-btn" onClick={onClick} disabled={busy}>
      <svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M7.5 1l2 4 4.5.5-3.3 3 1 4.5L7.5 11 3.3 13l1-4.5L1 5.5 5.5 5z" strokeLinejoin="round"/>
      </svg>
      {busy ? 'starting...' : 'dynamic drill'}
    </button>
  );
}
