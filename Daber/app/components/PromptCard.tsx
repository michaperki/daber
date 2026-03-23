"use client";
import React from 'react';

function featureChips(features?: Record<string, string | null> | null): string[] {
  if (!features) return [];
  const chips: string[] = [];
  if (features.pos) chips.push(String(features.pos));
  if (features.binyan) chips.push(String(features.binyan));
  if (features.tense) chips.push(String(features.tense));
  const p = features.person || '';
  const n = features.number || '';
  const g = features.gender || '';
  if (p || n || g) {
    const person = p ? (p === '1' ? '1' : p === '2' ? '2' : '3') : '';
    const num = n === 'pl' ? 'pl' : n === 'sg' ? 'sg' : '';
    const gen = g === 'm' ? 'm' : g === 'f' ? 'f' : '';
    const parts = [person && `${person}`, num && `${num}`, gen && `${gen}`].filter(Boolean);
    if (parts.length) chips.push(parts.join(' '));
  }
  return chips;
}

export function PromptCard({ eyebrow, prompt, transliteration, hintVisible, onToggleHint, emojiHint, features }: { eyebrow?: string; prompt: string; transliteration?: string | null; hintVisible: boolean; onToggleHint: () => void; emojiHint?: string; features?: Record<string, string | null> | null }) {
  return (
    <div className="prompt-card">
      <div className="prompt-eyebrow">{eyebrow || ''}</div>
      <div className="prompt-text">
        {prompt}
        {emojiHint ? <span className="gender-cue">{emojiHint}</span> : null}
      </div>
      {featureChips(features).length ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 2px' }}>
          {featureChips(features).map((c, i) => (
            <span key={i} className="vocab-chip">{c}</span>
          ))}
        </div>
      ) : null}
      <div className="transliteration" onClick={onToggleHint}>
        <div className="hint-dot" style={{ background: hintVisible ? 'var(--color-text-tertiary)' : 'transparent' }} />
        <span className="hint-text">{hintVisible ? (transliteration || '') : 'show hint'}</span>
      </div>
    </div>
  );
}
