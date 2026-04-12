export type Point = { x: number; y: number; t?: number };
export type Stroke = Point[];

export type LetterGlyph =
  | 'א' | 'ב' | 'ג' | 'ד' | 'ה' | 'ו' | 'ז' | 'ח' | 'ט' | 'י'
  | 'ך' | 'כ' | 'ל' | 'ם' | 'מ' | 'ן' | 'נ' | 'ס' | 'ע' | 'ף'
  | 'פ' | 'ץ' | 'צ' | 'ק' | 'ר' | 'ש' | 'ת';

export const LETTERS: LetterGlyph[] = [
  'א','ב','ג','ד','ה','ו','ז','ח','ט','י','ך','כ','ל','ם','מ','ן','נ','ס','ע','ף','פ','ץ','צ','ק','ר','ש','ת'
];

// A single ranked prediction. `prob` is a softmax-over-similarities score in
// [0, 1]; `raw` is the underlying cosine similarity or summed vote. Both are
// exposed so margin-based acceptance (see RECOGNIZER.md §"Acceptance logic")
// can use whichever is appropriate.
export type Ranked = {
  letter: LetterGlyph;
  prob: number;
  raw: number;
};
