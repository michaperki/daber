// Shared hybrid scorer: combines CNN probabilities with on-device KNN prototypes.
// Used by both /write Practice and the flashcards HandwritingLetterInput so
// calibration samples improve recognition everywhere.

import { HEBREW_CLASSES, ProtoMap } from "./engine";

export type Ranked = { letter: string; prob: number };

export type ScoringResult = {
  ranked: Ranked[]; // sorted descending by prob
  top: string;
  topProb: number;
  margin: number; // top - second
};

export type ScoringOptions = {
  cnnProbs: Record<string, number>; // letter -> CNN prob (may be empty → pure KNN)
  protos: ProtoMap;
  calibCounts: Record<string, number>;
  knnVec: Float32Array;
  expectedLetter?: string; // optional prior shifting toward expected glyph
};

export function alphaFor(count: number): number {
  if (count <= 0) return 0;
  if (count >= 8) return 0.8;
  return 0.3 + (count - 1) * (0.5 / 7);
}

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function softmax(scores: number[]): number[] {
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - max));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}

export function scoreCandidates(opts: ScoringOptions): ScoringResult {
  const { cnnProbs, protos, calibCounts, knnVec, expectedLetter } = opts;
  const letters = HEBREW_CLASSES;
  const beta = expectedLetter ? 0.15 : 0;

  const combined: number[] = [];
  for (const L of letters) {
    const p = Math.max(1e-8, cnnProbs[L] ?? 1e-8);
    const logp = Math.log(p);
    const count = calibCounts[L] || 0;
    const a = alphaFor(count);
    const proto = protos[L] ? dot(knnVec, protos[L]) : 0;
    const prior = expectedLetter && L === expectedLetter ? beta : 0;
    combined.push(logp + a * proto + prior);
  }

  const probs = softmax(combined);
  const ranked: Ranked[] = letters
    .map((L, i) => ({ letter: L, prob: probs[i] }))
    .sort((a, b) => b.prob - a.prob);

  return {
    ranked,
    top: ranked[0].letter,
    topProb: ranked[0].prob,
    margin: ranked[0].prob - (ranked[1]?.prob ?? 0),
  };
}
