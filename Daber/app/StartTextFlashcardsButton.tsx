"use client";
import React from 'react';
import { useRouter } from 'next/navigation';
import { apiCreateSession, getUserId } from '@/lib/client/api';

export default function StartTextFlashcardsButton() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const onClick = async () => {
    try {
      setBusy(true);
      const { session } = await apiCreateSession('vocab_llm_flashcards', getUserId());
      if (session?.id) router.push(`/session/${session.id}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className="qs-btn" onClick={onClick} disabled={busy}>
      {busy ? 'starting…' : 'LLM flashcards'}
    </button>
  );
}

