"use client";
import React from 'react';
import { useToast } from '@/lib/client/toast';

export default function GenerateDrillsButton() {
  const [busy, setBusy] = React.useState(false);
  const toast = useToast();
  const onClick = async () => {
    try {
      setBusy(true);
      const res = await fetch('/api/generate-drills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ background: false }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Generation failed');
        return;
      }
      toast.success(`${data.created ?? 0} new sentences ready`);
    } catch {
      toast.error('Generation failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className="qs-btn" onClick={onClick} disabled={busy}>
      <svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M7.5 1l2 4 4.5.5-3.3 3 1 4.5L7.5 11 3.3 13l1-4.5L1 5.5 5.5 5z" strokeLinejoin="round"/>
      </svg>
      {busy ? 'generating...' : 'fresh sentences'}
    </button>
  );
}
