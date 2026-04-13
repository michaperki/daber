import { z } from 'zod';

// Minimal Zod shapes for MVP extraction; intentionally permissive.

export const ExampleSchema = z.object({
  he: z.string().min(1),
  en: z.string().min(1),
});

export const VerbEntrySchema = z.object({
  lemma: z.string().min(1),
  gloss: z.string().min(1),
  present: z
    .object({
      m_sg: z.string().optional(),
      f_sg: z.string().optional(),
    })
    .partial()
    .optional(),
});

export const NounEntrySchema = z.object({
  lemma: z.string().min(1),
  gloss: z.string().min(1),
  forms: z
    .object({
      sg: z.string().optional(),
      base: z.string().optional(),
    })
    .partial()
    .optional(),
});

export const AdjectiveEntrySchema = z.object({
  lemma: z.string().min(1),
  gloss: z.string().min(1),
  forms: z
    .object({
      m_sg: z.string().optional(),
      f_sg: z.string().optional(),
      base: z.string().optional(),
    })
    .partial()
    .optional(),
});

export const SimpleEntrySchema = z.object({
  lemma: z.string().min(1),
  gloss: z.string().min(1),
});

export const FileSchema = z.object({
  pos: z.enum(['verb', 'noun', 'adjective', 'adverb', 'pronoun', 'preposition']).optional(),
  type: z.literal('concept').optional(),
  entries: z.array(z.unknown()),
});

export type VocabRow = { he: string; en: string; pos: string; variant?: string };
