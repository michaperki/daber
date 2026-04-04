'use client';

import { useEffect, useCallback, useState } from 'react';

// Phonetic keyboard — 22 base Hebrew letters, each appears once
// Shift+key inserts the sofit (final) form for כ מ נ פ צ
const ROWS = [
  [
    { key: 'q', he: 'ק' }, { key: 'w', he: 'ש' }, { key: 'e', he: 'ע' },
    { key: 'r', he: 'ר' }, { key: 't', he: 'ת' }, { key: 'y', he: 'י' },
    { key: 'u', he: 'ט' }, { key: 'p', he: 'פ' },
  ],
  [
    { key: 'a', he: 'א' }, { key: 's', he: 'ס' }, { key: 'd', he: 'ד' },
    { key: 'g', he: 'ג' }, { key: 'h', he: 'ה' }, { key: 'x', he: 'ח' },
    { key: 'k', he: 'כ' }, { key: 'l', he: 'ל' },
  ],
  [
    { key: 'z', he: 'ז' }, { key: 'v', he: 'ו' }, { key: 'b', he: 'ב' },
    { key: 'n', he: 'נ' }, { key: 'm', he: 'מ' }, { key: 'c', he: 'צ' },
  ],
];

const SOFIT_MAP: Record<string, string> = {
  'כ': 'ך', 'מ': 'ם', 'נ': 'ן', 'פ': 'ף', 'צ': 'ץ',
};

const KEY_TO_HEBREW: Record<string, string> = {};
for (const row of ROWS) {
  for (const k of row) {
    KEY_TO_HEBREW[k.key] = k.he;
  }
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  inputRef: React.RefObject<HTMLInputElement>;
};

export default function HebrewKeyboard({ value, onChange, inputRef }: Props) {
  const [shifted, setShifted] = useState(false);

  const insertChar = useCallback(
    (char: string) => {
      const input = inputRef.current;
      if (!input) {
        onChange(value + char);
        return;
      }
      const start = input.selectionStart ?? value.length;
      const end = input.selectionEnd ?? value.length;
      const next = value.slice(0, start) + char + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        const pos = start + char.length;
        input.setSelectionRange(pos, pos);
        input.focus();
      });
    },
    [value, onChange, inputRef]
  );

  const handleDelete = useCallback(() => {
    const input = inputRef.current;
    const pos = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? pos;
    if (pos !== end) {
      onChange(value.slice(0, pos) + value.slice(end));
      requestAnimationFrame(() => input?.setSelectionRange(pos, pos));
    } else if (pos > 0) {
      onChange(value.slice(0, pos - 1) + value.slice(pos));
      requestAnimationFrame(() => input?.setSelectionRange(pos - 1, pos - 1));
    }
  }, [value, onChange, inputRef]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target !== inputRef.current) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'Backspace') {
        e.preventDefault();
        handleDelete();
        return;
      }

      if (e.key === ' ') {
        e.preventDefault();
        insertChar(' ');
        return;
      }

      const base = KEY_TO_HEBREW[e.key.toLowerCase()];
      if (base) {
        e.preventDefault();
        const char = e.shiftKey && SOFIT_MAP[base] ? SOFIT_MAP[base] : base;
        insertChar(char);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [insertChar, handleDelete, inputRef]);

  function getDisplay(he: string): string {
    return shifted && SOFIT_MAP[he] ? SOFIT_MAP[he] : he;
  }

  function handleKeyTap(he: string) {
    const char = shifted && SOFIT_MAP[he] ? SOFIT_MAP[he] : he;
    insertChar(char);
    setShifted(false);
  }

  return (
    <div className="mt-3 select-none">
      {ROWS.map((row, ri) => (
        <div key={ri} className="flex justify-center gap-1 mb-1" dir="rtl">
          {row.map((k) => (
            <button
              key={k.key}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleKeyTap(k.he);
              }}
              className="w-9 h-10 rounded bg-gray-100 hover:bg-gray-200 active:bg-gray-300 border border-gray-300 text-base font-medium flex flex-col items-center justify-center transition-colors"
            >
              <span className="text-gray-900 leading-none">{getDisplay(k.he)}</span>
              <span className="text-[9px] text-gray-400 leading-none mt-0.5">{k.key}</span>
            </button>
          ))}
        </div>
      ))}
      <div className="flex justify-center gap-1 mt-1">
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            setShifted((s) => !s);
          }}
          className={`w-14 h-9 rounded border text-xs font-medium transition-colors ${
            shifted
              ? 'bg-blue-500 text-white border-blue-600'
              : 'bg-gray-100 hover:bg-gray-200 border-gray-300 text-gray-500'
          }`}
        >
          סופית
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            insertChar(' ');
          }}
          className="flex-1 h-9 rounded bg-gray-100 hover:bg-gray-200 active:bg-gray-300 border border-gray-300 text-xs text-gray-500 transition-colors"
        >
          space
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleDelete();
          }}
          className="w-14 h-9 rounded bg-gray-100 hover:bg-gray-200 active:bg-gray-300 border border-gray-300 text-xs text-gray-500 transition-colors"
        >
          ← del
        </button>
      </div>
    </div>
  );
}
