import type { Stroke } from '../recognizer/types';
import type { LetterGlyph } from '../recognizer/types';

export type StrokesPayload = {
  version: 1;
  samples: Record<LetterGlyph, Stroke[][]>;
};

export async function getStrokes(deviceId: string): Promise<StrokesPayload | null> {
  const res = await fetch(`/api/strokes/${encodeURIComponent(deviceId)}`);
  if (!res.ok) return null;
  const json = (await res.json()) as StrokesPayload;
  if (!json || json.version !== 1) return null;
  return json;
}

