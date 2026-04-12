import type { LetterGlyph } from './types';

const FINAL_TO_BASE: Record<string, string> = {
  'ך': 'כ',
  'ם': 'מ',
  'ן': 'נ',
  'ף': 'פ',
  'ץ': 'צ',
};

const BASE_TO_FINAL: Record<string, string> = {
  'כ': 'ך',
  'מ': 'ם',
  'נ': 'ן',
  'פ': 'ף',
  'צ': 'ץ',
};

export function toBaseForm(ch: LetterGlyph): LetterGlyph {
  return (FINAL_TO_BASE[ch] as LetterGlyph) || ch;
}

export function isFinalForm(ch: string): boolean {
  return ch in FINAL_TO_BASE;
}

export function baseToFinal(ch: string): string {
  return BASE_TO_FINAL[ch] || ch;
}

