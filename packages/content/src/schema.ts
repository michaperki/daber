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
      m_pl: z.string().optional(),
      f_pl: z.string().optional(),
    })
    .partial()
    .optional(),
  present_he: z
    .object({
      m_sg: z.string().optional(),
      f_sg: z.string().optional(),
      m_pl: z.string().optional(),
      f_pl: z.string().optional(),
    })
    .partial()
    .optional(),
  present_en: z
    .object({
      m_sg: z.string().optional(),
      f_sg: z.string().optional(),
      m_pl: z.string().optional(),
      f_pl: z.string().optional(),
    })
    .partial()
    .optional(),
  past_he: z.record(z.string(), z.string()).optional(),
  past_en: z.record(z.string(), z.string()).optional(),
  future_he: z.record(z.string(), z.string()).optional(),
  future_en: z.record(z.string(), z.string()).optional(),
  imperative_he: z.record(z.string(), z.string()).optional(),
  imperative_en: z.record(z.string(), z.string()).optional(),
});

export const NounEntrySchema = z.object({
  lemma: z.string().min(1),
  gloss: z.string().min(1),
  prompts: z
    .object({
      sg: z.string().optional(),
      pl: z.string().optional(),
    })
    .partial()
    .optional(),
  forms: z
    .object({
      sg: z.string().optional(),
      pl: z.string().optional(),
      base: z.string().optional(),
    })
    .partial()
    .optional(),
});

export const AdjectiveEntrySchema = z.object({
  lemma: z.string().min(1),
  gloss: z.string().min(1),
  prompts: z
    .object({
      m_sg: z.string().optional(),
      f_sg: z.string().optional(),
      m_pl: z.string().optional(),
      f_pl: z.string().optional(),
    })
    .partial()
    .optional(),
  forms: z
    .object({
      m_sg: z.string().optional(),
      f_sg: z.string().optional(),
      m_pl: z.string().optional(),
      f_pl: z.string().optional(),
      base: z.string().optional(),
    })
    .partial()
    .optional(),
  forms_en: z
    .object({
      m_sg: z.string().optional(),
      f_sg: z.string().optional(),
      m_pl: z.string().optional(),
      f_pl: z.string().optional(),
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

export const PromptSpanSchema = z.enum(['cell', 'phrase', 'sentence', 'note']);

export type PromptSpan = z.infer<typeof PromptSpanSchema>;
export type VocabRow = {
  he: string;
  en: string;
  prompt: string;
  span: Extract<PromptSpan, 'cell'>;
  pos: string;
  variant?: string;
  lemma?: string;
  alternates?: string[];
};
