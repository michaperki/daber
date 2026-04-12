import { signal } from '@preact/signals';
import type { LetterGlyph, Stroke } from '../recognizer/types';

export type StrokeSamples = Record<LetterGlyph, Stroke[][]>;

export const strokeSamples = signal<StrokeSamples>({} as StrokeSamples);

