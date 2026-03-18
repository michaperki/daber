"use client";
import React from 'react';
import { useTTS } from '@/lib/client/audio/useTTS';
import { useSettings } from '@/lib/client/settings';

 type Card = { en: string; he: string; hint?: string };

export default function VocabClient({ cards }: { cards: Card[] }) {
  const [i, setI] = React.useState(0);
  const [show, setShow] = React.useState(false);
  const tts = useTTS();
  const settings = useSettings();
  const next = React.useCallback(() => {
    setShow(false);
    setI(prev => (cards.length ? (prev + 1) % cards.length : 0));
  }, [cards.length]);
  const card = cards[i] || { en: 'No cards found', he: '' };
  return (
    <div className="pack-card" style={{ padding: '1.5rem' }}>
      <div className="prompt-text" style={{ marginBottom: 8 }}>{card.en}</div>
      {card.hint ? (
        <div style={{ marginBottom: 8 }}>
          <span className="vocab-chip">{card.hint}</span>
        </div>
      ) : null}
      {show ? (
        <div className="correct-hebrew" style={{ marginBottom: 8 }}>{card.he}</div>
      ) : null}
      <div className="cta-row">
        <button className="btn-start" onClick={() => setShow(true)} disabled={show}>reveal</button>
        <button className="btn-start" onClick={() => tts.play(card.he, settings.ttsRate)} disabled={!card.he}>hear</button>
        <button className="btn-resume" onClick={next}>next</button>
      </div>
    </div>
  );
}
