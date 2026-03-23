/**
 * Simple English answer evaluator for listening comprehension (Hebrew→English).
 * Compares user's English translation against expected English prompt.
 */

type EnglishEvaluation = {
  grade: 'correct' | 'flawed' | 'incorrect';
  reasons: Array<{ code: string; message: string }>;
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getKeywords(s: string): Set<string> {
  const stopwords = new Set(['a', 'an', 'the', 'is', 'are', 'am', 'was', 'were', 'be', 'been', 'being',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'do', 'does', 'did',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
    'how', 'say', 'that', 'this', 'and', 'or', 'but', 'not', 'no', 'yes']);
  return new Set(
    normalize(s).split(' ').filter(w => w.length > 1 && !stopwords.has(w))
  );
}

export function evaluateEnglishAnswer(userAnswer: string, expectedEnglish: string): EnglishEvaluation {
  const normUser = normalize(userAnswer);
  const normExpected = normalize(expectedEnglish);

  // Exact match
  if (normUser === normExpected) {
    return { grade: 'correct', reasons: [{ code: 'exact_match', message: 'Correct!' }] };
  }

  // Check if expected contains the user answer or vice versa
  if (normExpected.includes(normUser) || normUser.includes(normExpected)) {
    return { grade: 'correct', reasons: [{ code: 'contains_match', message: 'Correct!' }] };
  }

  // Keyword overlap scoring
  const expectedKw = getKeywords(expectedEnglish);
  const userKw = getKeywords(userAnswer);

  if (expectedKw.size === 0) {
    // No meaningful keywords to compare
    return { grade: 'incorrect', reasons: [{ code: 'no_match', message: 'Not quite.' }] };
  }

  let matchCount = 0;
  for (const kw of expectedKw) {
    if (userKw.has(kw)) matchCount++;
  }

  const overlap = matchCount / expectedKw.size;

  if (overlap >= 0.8) {
    return { grade: 'correct', reasons: [{ code: 'keyword_match', message: 'Correct!' }] };
  }
  if (overlap >= 0.5) {
    return { grade: 'flawed', reasons: [{ code: 'partial_match', message: 'Close! Check the exact meaning.' }] };
  }

  return { grade: 'incorrect', reasons: [{ code: 'no_match', message: 'Not quite.' }] };
}
