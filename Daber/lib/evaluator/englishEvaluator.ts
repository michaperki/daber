/**
 * Simple English answer evaluator for listening comprehension (Hebrew→English).
 * Compares user's English translation against expected English prompt.
 * Adds light morphological normalization so present progressive ≈ simple present.
 */

type EnglishEvaluation = {
  grade: 'correct' | 'flawed' | 'incorrect';
  reasons: Array<{ code: string; message: string }>;
};

function stripInstructionWrapper(s: string): string {
  // Remove leading "How do I say: ...?" if present (case-insensitive)
  return (s || '')
    .replace(/^\s*how\s+do\s+i\s+say[:\s-]*/i, '')
    .replace(/\?+\s*$/, '')
    .trim();
}

function expandContractions(s: string): string {
  // Normalize common be-verb contractions to help progressive detection
  return s
    .replace(/\bI'm\b/gi, 'I am')
    .replace(/\byou're\b/gi, 'you are')
    .replace(/\bhe's\b/gi, 'he is')
    .replace(/\bshe's\b/gi, 'she is')
    .replace(/\bit's\b/gi, 'it is')
    .replace(/\bwe're\b/gi, 'we are')
    .replace(/\bthey're\b/gi, 'they are');
}

function normalizeBasic(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function ingStem(word: string): string {
  // Very light -ing stemmer: writing→write, reading→read, studying→study, making→make
  let w = word.toLowerCase();
  if (!/ing$/.test(w)) return w;
  w = w.replace(/ing$/, '');
  if (/[^aeiou]y$/.test(w)) return w; // studying -> study (already ok after removing ing)
  if (/^.*(tt|ss|ll|pp|rr)$/.test(w)) return w; // doubled consonant forms already fine (e.g., running -> run after naive removal, but we don't handle doubles comprehensively)
  // restore trailing 'e' for make→making, write→writing
  if (!/[aeiou]$/.test(w)) return w + 'e';
  return w;
}

function sToBase(word: string): string {
  // Third-person singular → base; minimal irregulars
  const irregular: Record<string, string> = {
    'does': 'do', 'goes': 'go', 'has': 'have'
  };
  const w = word.toLowerCase();
  if (irregular[w]) return irregular[w];
  if (/ies$/.test(w)) return w.replace(/ies$/, 'y');
  if (/(ches|shes|xes|zes|ses|oes)$/.test(w)) return w.replace(/es$/, '');
  if (/s$/.test(w)) return w.replace(/s$/, '');
  return w;
}

function pastToBase(word: string): string {
  // Only for safety in canonicalization; we do NOT equate past with present
  const irregular: Record<string, string> = {
    'wrote': 'write', 'spoke': 'speak', 'read': 'read', 'heard': 'hear', 'went': 'go', 'did': 'do', 'was': 'be', 'were': 'be', 'had': 'have'
  };
  const w = word.toLowerCase();
  if (irregular[w]) return irregular[w];
  if (/ied$/.test(w)) return w.replace(/ied$/, 'y');
  if (/ed$/.test(w)) return w.replace(/ed$/, '');
  return w;
}

function canonicalPresentPair(s: string): string | null {
  // Try to canonicalize patterns to "<pronoun> <baseVerb>" for present tense
  // Accept both simple present and present progressive as the same canonical form
  const pronRe = /(i|you|he|she|we|they)/i;
  let t = expandContractions(s);
  t = stripInstructionWrapper(t);
  t = t.replace(/[?!.]/g, ' ');
  const words = normalizeBasic(t).split(' ').filter(Boolean);
  if (!words.length) return null;
  // Find first pronoun position
  let i = words.findIndex(w => /^(i|you|he|she|we|they)$/.test(w));
  if (i < 0 || i >= words.length - 1) return null;
  const pron = words[i];
  const next = words[i + 1] || '';
  const third = words[i + 2] || '';
  // Progressive: pron + (am|are|is) + V-ing
  if (/^(am|are|is)$/.test(next) && /[a-z]+ing$/.test(third)) {
    const base = ingStem(third);
    return `${pron} ${base}`;
  }
  // Simple present 3sg: he/she + V(s|es)
  if (/^(he|she)$/.test(pron) && /^[a-z]+(s|es|ies)$/.test(next)) {
    const base = sToBase(next);
    return `${pron} ${base}`;
  }
  // Simple present others: pron + base (avoid be-verb only)
  if (!/^(am|are|is)$/.test(next)) {
    const base = next; // assume already base or close
    return `${pron} ${base}`;
  }
  return null;
}

function getKeywords(s: string): Set<string> {
  const stopwords = new Set(['a', 'an', 'the', 'is', 'are', 'am', 'was', 'were', 'be', 'been', 'being',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'do', 'does', 'did',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
    'how', 'say', 'that', 'this', 'and', 'or', 'but', 'not', 'no', 'yes']);
  return new Set(
    normalizeBasic(stripInstructionWrapper(s)).split(' ').filter(w => w.length > 1 && !stopwords.has(w))
  );
}

export function evaluateEnglishAnswer(userAnswer: string, expectedEnglish: string): EnglishEvaluation {
  // Primary exact and canonical checks
  const normUser = normalizeBasic(stripInstructionWrapper(expandContractions(userAnswer)));
  const normExpected = normalizeBasic(stripInstructionWrapper(expandContractions(expectedEnglish)));

  // Exact match (after instruction removal/contractions)
  if (normUser === normExpected) {
    return { grade: 'correct', reasons: [{ code: 'exact_match', message: 'Correct!' }] };
  }

  // Present equivalence: he writes ≈ he is writing (and analogous for I/you/we/they)
  const canUser = canonicalPresentPair(userAnswer);
  const canExp = canonicalPresentPair(expectedEnglish);
  if (canUser && canExp && canUser === canExp) {
    return { grade: 'correct', reasons: [{ code: 'present_equivalence', message: 'Correct!' }] };
  }

  // Contains
  if (normExpected.includes(normUser) || normUser.includes(normExpected)) {
    return { grade: 'correct', reasons: [{ code: 'contains_match', message: 'Correct!' }] };
  }

  // Keyword overlap fallback
  const expectedKw = getKeywords(expectedEnglish);
  const userKw = getKeywords(userAnswer);

  if (expectedKw.size === 0) {
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
