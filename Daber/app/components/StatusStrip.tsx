"use client";
import React from 'react';

export function StatusStrip({ dotClass, active, label, waveActive, level }: { dotClass?: string; active: boolean; label: string; waveActive: boolean; level?: number }) {
  const baseHeights = React.useMemo(() => [8, 16, 20, 12, 18, 24, 14], []);
  const amp = Math.max(0, Math.min(1, level ?? 0));
  const scale = 0.5 + amp * 0.9; // scale base heights by input level
  return (
    <div className="status-strip">
      <div className={`status-dot ${dotClass || ''} ${active ? 'active' : ''}`}></div>
      <span className="status-label">{label}</span>
      <div className="waveform">
        {baseHeights.map((h, i) => (
          <div
            key={i}
            className={`wave-bar ${waveActive ? 'active' : ''}`}
            style={waveActive ? { height: `${Math.round(h * scale)}px` } : undefined}
          ></div>
        ))}
      </div>
    </div>
  );
}
