"use client";
import React from 'react';

const KEYS = [
  'א','ב','ג','ד','ה','ו','ז','ח','ט','י','כ','ך','ל','מ','ם','נ','ן','ס','ע','פ','ף','צ','ץ','ק','ר','ש','ת','־',' ' 
];

export function HebrewKeyboard({ onInsert, onBackspace }: { onInsert: (txt: string) => void; onBackspace: () => void }) {
  return (
    <div className="hebrew-kb">
      <div className="kb-grid">
        {KEYS.map((k, i) => (
          <button key={i} className="kb-key" onClick={() => onInsert(k)}>{k === ' ' ? '␣' : k}</button>
        ))}
        <button className="kb-key wide" onClick={onBackspace} title="Backspace">⌫</button>
      </div>
    </div>
  );
}

