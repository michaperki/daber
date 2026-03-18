// Basic normalization per spec: lowercase ASCII, trim, collapse spaces.
// For Hebrew, we keep letters but strip common punctuation and extra spaces.

export function normalizeTranscript(input: string | null | undefined): string {
  if (!input) return '';
  let s = input
    .replace(/[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g, '') // strip Hebrew diacritics (nikkud, marks)
    .replace(/[\u200B-\u200D\u2060]/g, '') // strip zero-width chars
    .replace(/["'`]/g, '') // strip quotes/apostrophes
    .replace(/[.,!?;:()\[\]{}\-\u2012-\u2015\/]/g, ' ')
    .toLowerCase();
  s = s.replace(/ch/g, 'kh').replace(/tz/g, 'ts');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}
