"use client";
import React from 'react';

type Props = {
  playing: boolean;
  onPlay: () => void;
  disabled?: boolean;
  title?: string;
};

export function AudioPlayButton({ playing, onPlay, disabled, title }: Props) {
  return (
    <button
      className={`audio-play-btn ${playing ? 'is-playing' : ''} ${disabled ? 'is-disabled' : ''}`}
      onClick={() => { if (!playing && !disabled) onPlay(); }}
      disabled={playing || !!disabled}
      aria-label={playing ? 'Playing' : (disabled ? 'Audio unavailable' : 'Play audio')}
      title={title || (disabled ? 'Audio unavailable' : undefined)}
    >
      {playing ? (
        <div className="audio-play-waves">
          {[8, 16, 20, 14, 18].map((h, i) => (
            <div key={i} className="audio-play-bar" style={{ animationDelay: `${i * 0.08}s` }} />
          ))}
        </div>
      ) : disabled ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M4 9v6h4l5 5V4L8 9H4z" fill="currentColor" opacity="0.4"/>
          <path d="M18 6l-2 2m0 0l-2 2m2-2l2 2m-2-2l-2-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M4 3.5v11l10-5.5L4 3.5z" fill="currentColor" />
        </svg>
      )}
    </button>
  );
}
