"use client";
import React from 'react';

export function TranscriptEditor({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="editor-wrap">
      <textarea
        className="editor-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || 'Type or edit your answer'}
        rows={3}
      />
    </div>
  );
}

