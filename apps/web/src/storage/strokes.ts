import type { Stroke } from '../recognizer/types';
import type { LetterGlyph } from '../recognizer/types';
import { deviceId } from '../state/signals';

export async function captureStroke(letter: LetterGlyph, strokes: Stroke[], split: 'train' | 'val' | 'test' = 'train') {
  try {
    const did = deviceId.value || 'anon';
    const res = await fetch('/api/strokes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: 1, deviceId: did, letter, strokes, split }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  } catch {
    return false;
  }
}

