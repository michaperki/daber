export type Reason = { code: string; message: string };
export type Grade = 'correct' | 'flawed' | 'incorrect';

export type NearMissPattern = {
  type: 'wrong_gender' | 'wrong_number' | 'wrong_gender_number' | 'missing_pronoun' | string;
  examples: string[];
};

export type LessonItemLike = {
  id: string;
  english_prompt: string;
  target_hebrew: string;
  transliteration?: string | null;
  accepted_variants: string[];
  near_miss_patterns: NearMissPattern[];
  features?: Record<string, string | null> | null;
};
