import type { Ranked } from './types';

// Convenience: top-1 prob minus top-2 prob. Used as the margin threshold for
// accept/reject in Practice + Vocab.
export function topMargin(ranked: Ranked[]): number {
  if (ranked.length < 2) return ranked.length === 1 ? ranked[0].prob : 0;
  return ranked[0].prob - ranked[1].prob;
}

export * from './types';
export * from './features';
export * from './final-forms';
