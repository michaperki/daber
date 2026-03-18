"use client";
import React from 'react';

export function MicControls({ canReplayPrompt, onReplayPrompt, listening, onStart, onStop, onSkip, disabled }: { canReplayPrompt: boolean; onReplayPrompt: () => void; listening: boolean; onStart: () => void; onStop: () => void; onSkip: () => void; disabled?: boolean }) {
  return (
    <div className="mic-row">
      <button className="side-btn" title="replay prompt" onClick={onReplayPrompt} disabled={!canReplayPrompt}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 8a6 6 0 1 0 6-6" strokeLinecap="round"/><path d="M2 4v4h4" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      {!listening ? (
        <button className={`mic-btn`} onClick={onStart} disabled={!!disabled}>
          <svg viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="9" y="2" width="8" height="14" rx="4" fill="white"/>
            <path d="M5 12a8 8 0 0 0 16 0" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
            <line x1="13" y1="20" x2="13" y2="24" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>
      ) : (
        <button className="mic-btn recording" onClick={onStop}>
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
        </button>
      )}
      <button className="side-btn" title="skip" onClick={onSkip}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 4l7 4-7 4V4zM12 4v8" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
    </div>
  );
}

