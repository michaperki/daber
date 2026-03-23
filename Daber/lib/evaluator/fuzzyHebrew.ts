/**
 * Fuzzy Hebrew matching for confusable letter pairs.
 * When a user swaps one confusable for another, grade "flawed" with a helpful hint.
 */

const CONFUSABLE_PAIRS: [string, string][] = [
  ['כ', 'ח'],
  ['ט', 'ת'],
  ['ס', 'ש'],
  ['א', 'ע'],
  ['ק', 'כ'],
  ['ו', 'ב'],
];

// Build a lookup: for each letter, which letters it can be confused with
const confusableMap = new Map<string, Set<string>>();
for (const [a, b] of CONFUSABLE_PAIRS) {
  if (!confusableMap.has(a)) confusableMap.set(a, new Set());
  if (!confusableMap.has(b)) confusableMap.set(b, new Set());
  confusableMap.get(a)!.add(b);
  confusableMap.get(b)!.add(a);
}

export function fuzzyHebrewMatch(
  transcript: string,
  target: string
): { match: boolean; pairs: string[] } {
  if (transcript.length !== target.length) {
    return { match: false, pairs: [] };
  }
  if (transcript === target) {
    return { match: false, pairs: [] }; // exact match, not fuzzy
  }

  const pairs: string[] = [];
  for (let i = 0; i < transcript.length; i++) {
    const tc = transcript[i];
    const tg = target[i];
    if (tc === tg) continue;
    const confusables = confusableMap.get(tg);
    if (confusables && confusables.has(tc)) {
      pairs.push(`${tc}/${tg}`);
    } else {
      // Non-confusable difference found
      return { match: false, pairs: [] };
    }
  }

  return { match: pairs.length > 0, pairs };
}
