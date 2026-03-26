// Lightweight Hebrew utilities (intentionally simple; evolve as needed)

export function stripNiqqud(input: string): string {
  // Hebrew combining marks: U+0591..U+05C7
  return input.replace(/[\u0591-\u05C7]/g, '');
}

export function normalizeHebrewForMatch(input: string): string {
  // 1) strip niqqud
  // 2) normalize quotes/dashes and remove most punctuation
  // 3) collapse whitespace
  const noNiqqud = stripNiqqud(input);
  return noNiqqud
    .replace(/["“”„׳״']/g, '')
    .replace(/[\-–—]/g, ' ')
    .replace(/[.,!?()\[\]{}:;\/\\|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeHebrew(input: string): string[] {
  const normalized = normalizeHebrewForMatch(input);
  if (!normalized) return [];
  // Keep Hebrew letters and a small set of non-letters as separators.
  // We intentionally keep this simple (no morphological splitting yet).
  return normalized
    .split(' ')
    .map(t => t.trim())
    .filter(Boolean);
}
