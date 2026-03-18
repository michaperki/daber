import { Grade, Reason, LessonItemLike } from '../types';
import { normalizeTranscript } from './normalize';
import { deterministicEvaluate } from './deterministic';

export type Evaluation = {
  grade: Grade;
  reasons: Reason[];
  normalized: string;
};

export function evaluateAttempt(item: LessonItemLike, rawTranscript: string | null | undefined): Evaluation {
  const normalized = normalizeTranscript(rawTranscript || '');

  // Step 1-2: deterministic
  const det = deterministicEvaluate(item, rawTranscript || '');
  if (det) return { grade: det.grade, reasons: det.reasons, normalized };

  // Step 3: simple near-miss heuristic: tiny edit distance → flawed, low confidence
  if (normalized && levenshtein(normalized, normalizeTranscript(item.target_hebrew)) <= 1) {
    return { grade: 'flawed', reasons: [{ code: 'probable_match_low_confidence', message: 'Close, but say it again like this.' }], normalized };
  }

  // Step 4: constrained model fallback skipped in prototype; default incorrect
  return { grade: 'incorrect', reasons: [{ code: 'ambiguous_transcript', message: 'Not quite.' }], normalized };
}

// Tiny Levenshtein for small strings; early exit > 1
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 2; // beyond threshold we care about
  const dp = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    let prev = j - 1;
    let cur = j;
    for (let i = 1; i <= a.length; i++) {
      const temp = dp[i];
      if (a[i - 1] === b[j - 1]) {
        dp[i] = prev;
      } else {
        dp[i] = Math.min(prev + 1, dp[i] + 1, dp[i - 1] + 1);
      }
      prev = temp;
      cur = dp[i];
    }
  }
  return dp[a.length];
}
