"use client";
import React from 'react';

const ROW1 = ['ק','ר','א','ט','ו','ן','ם','פ'];
const ROW2 = ['ש','ד','ג','כ','ע','י','ח','ל','ך','ף'];
const ROW3 = ['ז','ס','ב','ה','נ','מ','צ','ת','ץ'];

export function HebrewKeyboard({ onInsert, onBackspace }: { onInsert: (txt: string) => void; onBackspace: () => void }) {
  return (
    <div className="hebrew-kb">
      <div className="kb-row">
        {ROW1.map((k, i) => (
          <button key={i} className="kb-key" onClick={() => onInsert(k)}>{k}</button>
        ))}
      </div>
      <div className="kb-row">
        {ROW2.map((k, i) => (
          <button key={i} className="kb-key" onClick={() => onInsert(k)}>{k}</button>
        ))}
      </div>
      <div className="kb-row">
        {ROW3.map((k, i) => (
          <button key={i} className="kb-key" onClick={() => onInsert(k)}>{k}</button>
        ))}
      </div>
      <div className="kb-row">
        <button className="kb-key backspace" onClick={onBackspace} title="Backspace">⌫</button>
        <button className="kb-key space" onClick={() => onInsert(' ')}>␣</button>
        <button className="kb-key" onClick={() => onInsert('־')}>־</button>
      </div>
    </div>
  );
}
