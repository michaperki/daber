import { z } from 'zod';

export const zReason = z.object({ code: z.string(), message: z.string() });
export type Reason = z.infer<typeof zReason>;

export const zGrade = z.enum(['correct', 'flawed', 'incorrect']);
export type Grade = z.infer<typeof zGrade>;

export const zDrillPhase = z.enum(['intro', 'recognition', 'guided', 'free_recall']);
export type DrillPhase = z.infer<typeof zDrillPhase>;

export const zLessonItem = z.object({
  id: z.string(),
  english_prompt: z.string(),
  target_hebrew: z.string(),
  transliteration: z.string().nullish(),
  features: z.record(z.string(), z.string().nullable()).nullish()
});
export type LessonItem = z.infer<typeof zLessonItem>;

export const zCreateSessionRequest = z.object({
  lessonId: z.string(),
  userId: z.string().optional(),
  subset: z.array(z.string()).optional()
});
export type CreateSessionRequest = z.infer<typeof zCreateSessionRequest>;

export const zCreateSessionResponse = z.object({
  session: z.object({ id: z.string(), lesson_id: z.string(), started_at: z.any() })
});
export type CreateSessionResponse = z.infer<typeof zCreateSessionResponse>;

export const zNextItemResponse = z.object({
  done: z.boolean(),
  item: zLessonItem.optional(),
  index: z.number().optional(),
  total: z.number().optional(),
  offerEnd: z.boolean().optional(),
  offerExtend: z.boolean().optional(),
  phase: zDrillPhase.optional(),
  // Canonicalized surfaces for intro card
  intro: z.object({ hebrew: z.string(), english: z.string().optional() }).optional(),
  // True if new generated content arrived since session start
  newContentReady: z.boolean().optional()
});
export type NextItemResponse = z.infer<typeof zNextItemResponse>;

// Generation (server-triggered) — simple contracts for optional manual triggers
export const zGenerateDrillsRequest = z.object({
  userId: z.string().optional(),
  targets: z.number().int().min(1).max(8).optional(),
  itemsPerTarget: z.number().int().min(1).max(6).optional(),
  background: z.boolean().optional()
});
export type GenerateDrillsRequest = z.infer<typeof zGenerateDrillsRequest>;

export const zGenerateDrillsResponse = z.object({
  ok: z.literal(true),
  batchId: z.string(),
  started: z.boolean().optional(),
  created: z.number().optional(),
  itemIds: z.array(z.string()).optional()
});
export type GenerateDrillsResponse = z.infer<typeof zGenerateDrillsResponse>;

export const zAttemptResponse = z.object({
  grade: zGrade,
  reason: z.array(zReason).optional(),
  correct_hebrew: z.string()
});
export type AttemptResponse = z.infer<typeof zAttemptResponse>;

// Requests (server validation)
export const zAttemptRequest = z.object({
  sessionId: z.string(),
  lessonItemId: z.string(),
  rawTranscript: z.string().optional(),
  direction: z.enum(['en_to_he', 'he_to_en']).optional(),
  phase: zDrillPhase.optional()
});
export type AttemptRequest = z.infer<typeof zAttemptRequest>;

export const zOverrideRequest = z.object({
  sessionId: z.string(),
  lessonItemId: z.string()
});
export type OverrideRequest = z.infer<typeof zOverrideRequest>;

export const zSummaryResponse = z.object({
  sessionId: z.string(),
  lessonId: z.string(),
  counts: z.object({ correct: z.number(), flawed: z.number(), incorrect: z.number() }),
  total: z.number()
});
export type SummaryResponse = z.infer<typeof zSummaryResponse>;

export const zSTTResponse = z.object({ transcript: z.string(), confidence: z.number() });
export type STTResponse = z.infer<typeof zSTTResponse>;

export const zSTTTextRequest = z.object({ text: z.string() });
export type STTTextRequest = z.infer<typeof zSTTTextRequest>;

export const zTTSRequest = z.object({ text: z.string(), voice: z.string().optional() });
export type TTSRequest = z.infer<typeof zTTSRequest>;

// Misc utility contracts
export const zOkResponse = z.object({ ok: z.literal(true) });
export type OkResponse = z.infer<typeof zOkResponse>;

export const zMarkSeenRequest = z.object({ lessonItemId: z.string() });
export type MarkSeenRequest = z.infer<typeof zMarkSeenRequest>;
