import type { LetterGlyph, Stroke } from './types';

type StrokeDB = Partial<Record<LetterGlyph, Stroke[][]>>;

function validStrokeCount(sample: Stroke[]): number {
  return sample.filter((stroke) => stroke && stroke.length > 1).length;
}

export function expectedStrokeCount(letter: LetterGlyph, db: StrokeDB): number | null {
  const samples = db[letter] || [];
  const counts = new Map<number, number>();
  let total = 0;

  for (const sample of samples) {
    const count = validStrokeCount(sample);
    if (count < 1) continue;
    total++;
    counts.set(count, (counts.get(count) || 0) + 1);
  }

  if (!total) return null;

  let bestCount = 0;
  let bestFrequency = 0;
  for (const [count, frequency] of counts) {
    if (frequency > bestFrequency) {
      bestCount = count;
      bestFrequency = frequency;
    }
  }

  if (total === 1) return bestCount;
  return bestFrequency > total / 2 ? bestCount : null;
}

export function isIncompleteExpectedLetter(
  letter: LetterGlyph,
  strokes: Stroke[],
  db: StrokeDB,
): boolean {
  const expected = expectedStrokeCount(letter, db);
  return expected !== null && expected > 1 && validStrokeCount(strokes) < expected;
}
