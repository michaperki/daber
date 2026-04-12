import type { Ranked, LetterGlyph } from './types';
import { predictByKnn, type KnnDb } from './knn';
import { predictByCentroid, type Prototypes } from './centroid';
import { predictByHybrid, getRawCnnProbs } from './hybrid';
export { getRawCnnProbs };

export type PredictMode = 'knn' | 'centroid' | 'hybrid';

export type PredictOpts = {
  mode: PredictMode;
  k?: number;
  augment?: boolean;
  prototypes: Prototypes; // per-letter calibration samples
  topN?: number;
  // Optional expected-letter prior (Hybrid mode uses this to bias toward the
  // expected glyph in Practice/Vocab flows). Ignored by KNN/Centroid.
  expectedLetter?: LetterGlyph;
};

export function predictTop(vec: Float32Array, opts: PredictOpts): Ranked[] {
  if (opts.mode === 'centroid') {
    return predictByCentroid(vec, opts.prototypes, {
      augment: opts.augment,
      topN: opts.topN ?? 5,
    });
  }
  if (opts.mode === 'hybrid') {
    return predictByHybrid(vec, opts.prototypes, {
      augment: opts.augment,
      topN: opts.topN ?? 5,
      expectedLetter: opts.expectedLetter,
    });
  }
  return predictByKnn(vec, opts.prototypes as KnnDb, {
    k: opts.k ?? 5,
    augment: opts.augment,
    topN: opts.topN ?? 5,
  });
}

// Convenience: top-1 prob minus top-2 prob. Used as the margin threshold for
// accept/reject in Practice + Vocab.
export function topMargin(ranked: Ranked[]): number {
  if (ranked.length < 2) return ranked.length === 1 ? ranked[0].prob : 0;
  return ranked[0].prob - ranked[1].prob;
}

export * from './types';
export * from './features';
export * from './final-forms';
export type { Prototypes } from './centroid';
export type { KnnDb } from './knn';
