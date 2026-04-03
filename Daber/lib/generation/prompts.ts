import { buildBatchPrompt, CORE_PROMPT_LEMMAS } from './local_llm';

export type PromptBuilderArgs = {
  targetLemmas: string[];
  knownLemmas: string[];
  allowedTenses: string[];
  direction: 'he_to_en' | 'en_to_he';
  context?: { glossByLemma?: Map<string, string> | Record<string, string> };
};

export type PromptBuilder = (args: PromptBuilderArgs) => string;

function normalizeGlossMap(gl?: Map<string, string> | Record<string, string>): Map<string, string> {
  if (!gl) return new Map();
  if (gl instanceof Map) return gl;
  const m = new Map<string, string>();
  for (const k of Object.keys(gl)) m.set(k, (gl as any)[k]);
  return m;
}

// Baseline: target-centric, short prompt
const baseline: PromptBuilder = (args) => buildBatchPrompt({
  targetLemmas: args.targetLemmas,
  knownLemmas: args.knownLemmas,
  allowedTenses: args.allowedTenses,
  direction: args.direction,
});

// Core-plus: same target-centric prompt, with inline gloss only for the target.
const core_plus: PromptBuilder = (args) => {
  const base = buildBatchPrompt({
    targetLemmas: args.targetLemmas,
    knownLemmas: Array.from(new Set([...(args.knownLemmas || []), ...CORE_PROMPT_LEMMAS])),
    allowedTenses: args.allowedTenses,
    direction: args.direction,
    glossByLemma: args.context?.glossByLemma || undefined,
  });
  return base;
};

export const PROMPT_TEMPLATES: Record<string, PromptBuilder> = {
  baseline,
  core_plus,
};
