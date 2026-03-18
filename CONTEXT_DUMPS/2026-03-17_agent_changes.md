# Daber Context Dump — 2026-03-17 (Agent Changes)

## Summary
We expanded evaluation with Hebrew‑tense pronoun rules and lexicon verification, added feature+item SRS scheduling (including a blended due mode and session cap), broadened dynamic generation to past/future with deterministic English prompts, surfaced due CTAs, and improved observability and TTS resilience.

## Highlights
- Evaluation & Hebrew Nuance
  - Pronoun omission rules respect tense: past allows omission; present/future generally require pronouns.
  - Phrase‑level checks: if a transcript includes a valid lexeme form (via Inflection), return precise reasons when features differ (tense/person/number/gender).
  - Pronoun–verb agreement: if a pronoun is spoken, validate agreement with the verb form and flag mismatches.

- Scheduling
  - FeatureStat (existing) + ItemStat (new) maintain SM‑2 fields with next_due and counters.
  - Due modes: feature, item, and blend (tries feature first, then item, then fallback). Session attempts can be capped via `SESSION_DUE_CAP`.
  - Progress adds a “feature mastery (lowest)” view with % correct per feature bundle.

- Generators
  - Added past and future strategies for verbs (Hebrew targets verified by Inflection; English prompts use a deterministic past map and “will …” future).
  - Present/adjective outputs now include the correct Hebrew pronoun in the target (e.g., "הוא ...").
  - Expanded the irregular English past‑tense map (do/did, go/went, write/wrote, etc.).

- UX & Infra
  - Home: “review due (features)” CTA; Settings: due mode selector.
  - Browser TTS fallback available when server TTS fails; respects playback rate.
  - Logging includes durations for STT/TTS and evaluator for latency tracking.

## Files Changed (Representative)
- Evaluator: `Daber/lib/evaluator/deterministic.ts`, `Daber/app/api/attempts/route.ts`
- Scheduling: `Daber/prisma/schema.prisma`, `Daber/app/api/sessions/[sessionId]/next-item/route.ts`
- Generators: `Daber/lib/drill/generators.ts`
- Client: `Daber/lib/client/{api.ts,settings.tsx}`, `Daber/app/session/[sessionId]/page.tsx`, `Daber/app/StartDueButton.tsx`, `Daber/app/page.tsx`
- Infra: `Daber/app/api/{stt,tts}/route.ts`
- Docs: `Daber/ROADMAP.md`

## How to Use
- DB: `npm run db:push` (to apply ItemStat).
- Due sessions: Pick due mode in Profile or click the Home “review due (features)” button.
- Generators: Ensure lexicon inflections exist for past/future to see those forms; otherwise present/adjectives remain active.
- TTS fallback: Enable “use browser TTS if server TTS fails” in Profile.

## Next Ideas
- Content hygiene tool: flag LessonItems whose linked Inflections don’t match target features; quick admin flow to repair or unlink.
- Phrase verification: jointly validate pronoun + verb pairs against Inflection to catch mixed‑person errors more robustly across edge cases.
- Expanded irregular map and phrasal verb coverage; refine English templates for better pedagogy.

*** End of 2026-03-17 Context Dump ***
