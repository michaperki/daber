"use client";
import React from 'react';

type Reason = { code: string; message: string };

function featureChipFromPrompt(correctHebrew: string): string | null {
  if (/ים$/.test(correctHebrew)) return '👨👩 pl';
  if (/ות$/.test(correctHebrew)) return '👩👩 f·pl';
  return null;
}

function featureChips(features?: Record<string, string | null> | null): string[] {
  if (!features) return [];
  const chips: string[] = [];
  if (features.pos) chips.push(String(features.pos));
  if (features.binyan) chips.push(String(features.binyan));
  if (features.tense) chips.push(String(features.tense));
  const p = features.person || '';
  const n = features.number || '';
  const g = features.gender || '';
  const parts = [p && `${p}`, n && `${n}`, g && `${g}`].filter(Boolean);
  if (parts.length) chips.push(parts.join(' '));
  return chips;
}

function diffChars(a: string, b: string): { parts: Array<{ t: 'ok'|'bad'|'extra'|'missing'; ch: string }> } {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1; else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const parts: Array<{ t: 'ok'|'bad'|'extra'|'missing'; ch: string }> = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { parts.unshift({ t: 'ok', ch: b[j - 1] }); i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) { parts.unshift({ t: 'missing', ch: a[i - 1] }); i--; }
    else { parts.unshift({ t: 'extra', ch: b[j - 1] }); j--; }
  }
  while (i > 0) { parts.unshift({ t: 'missing', ch: a[i - 1] }); i--; }
  while (j > 0) { parts.unshift({ t: 'extra', ch: b[j - 1] }); j--; }
  const normalized: typeof parts = parts.map(p => p);
  return { parts: normalized };
}

export function FeedbackPanel({ grade, reason, correctHebrew, transliteration, features, userTranscript }: { grade: 'correct' | 'flawed' | 'incorrect'; reason?: Reason[]; correctHebrew: string; transliteration?: string | null; features?: Record<string, string | null> | null; userTranscript?: string }) {
  return (
    <div className={`feedback-card ${grade}`}>
      <div className="feedback-top">
        <span className={`feedback-badge ${grade}`}>{grade === 'correct' ? 'correct' : grade === 'flawed' ? 'close' : 'not quite'}</span>
        <span className="feedback-reason">{reason?.map(r => r.message).join(' · ') || ''}</span>
      </div>
      <div className="correct-hebrew">{correctHebrew}</div>
      {transliteration ? (
        <div className="correct-transliteration">{transliteration}</div>
      ) : null}
      {typeof userTranscript === 'string' && userTranscript.length ? (
        <div style={{ marginTop: 8, fontSize: 13 }}>
          <div style={{ color: 'var(--color-text-tertiary)', marginBottom: 2 }}>you said</div>
          <div className="diff-line">
            {diffChars(correctHebrew, userTranscript).parts.map((p, idx) => (
              <span key={idx} className={`diff-${p.t}`}>{p.ch}</span>
            ))}
          </div>
        </div>
      ) : null}
      {featureChips(features).length ? (
        <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {featureChips(features).map((c, i) => <span key={i} className="vocab-chip">{c}</span>)}
        </div>
      ) : featureChipFromPrompt(correctHebrew) ? (
        <div style={{ marginTop: 6 }}><span className="vocab-chip">{featureChipFromPrompt(correctHebrew)}</span></div>
      ) : null}
    </div>
  );
}
