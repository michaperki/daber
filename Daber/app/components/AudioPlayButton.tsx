"use client";
import React from 'react';

type Props = {
  playing: boolean;
  onPlay: () => void;
};

export function AudioPlayButton({ playing, onPlay }: Props) {
  return (
    <button
      className={`audio-play-btn ${playing ? 'is-playing' : ''}`}
      onClick={onPlay}
      aria-label={playing ? 'Playing' : 'Play audio'}
    >
      {playing ? (
        <div className="audio-play-waves">
          {[8, 16, 20, 14, 18].map((h, i) => (
            <div key={i} className="audio-play-bar" style={{ animationDelay: `${i * 0.08}s` }} />
          ))}
        </div>
      ) : (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M4 3.5v11l10-5.5L4 3.5z" fill="currentColor" />
        </svg>
      )}
    </button>
  );
}
