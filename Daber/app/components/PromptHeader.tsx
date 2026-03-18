"use client";
import React from 'react';

export function PromptHeader({ index, total, onExit }: { index: number; total: number; onExit: () => void }) {
  const pct = total ? Math.min(100, Math.round((index / total) * 100)) : 0;
  return (
    <div className="top-bar">
      <button className="exit-btn" onClick={onExit} title="Exit">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3L5 8l5 5"/></svg>
      </button>
      <div className="progress-track"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
      <span className="progress-label">{index} / {total}</span>
    </div>
  );
}

