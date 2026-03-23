# Daber Context Dump — 2026-03-15 (Agent Changes)

## Summary
- Hardened POST request validation with Zod.
- Cleaned up legacy drill flow and stabilized footer layout.
- Added toast system and route-aware footer highlighting.
- Introduced “Random Order” setting (default ON).
- Added optional lexicon-driven dynamic drills (adjectives + present verbs) gated by a setting; generated items are isolated in a sibling lesson to avoid skewing Library.
- Enhanced vocab ingestion to parse parts-of-speech and inflections; linked lesson items to lexemes during seed.

## Changes (by area)

- Validation & Contracts
  - Added request schemas:
    - Daber/lib/contracts.ts: zAttemptRequest, zSTTTextRequest, zTTSRequest
  - Wired into routes:
    - Daber/app/api/attempts/route.ts
    - Daber/app/api/stt/route.ts
    - Daber/app/api/tts/route.ts
  - Evaluator sanity tests pass: scripts/test_evaluator.ts

- UI/UX Cleanup
  - Removed stale drill entry flow; `/drill` now redirects home:
    - Daber/app/drill/page.tsx
  - Exit/summary routing and CTAs:
    - Daber/app/session/[sessionId]/page.tsx (exit → `/`)
    - Daber/app/session/[sessionId]/summary/page.tsx (restart same lesson + retry missed)
  - Footer stabilization + highlighting:
    - Daber/app/layout.tsx (app shell)
    - Daber/app/globals.css (fixed footer + toast styles)
    - Daber/app/FooterNav.tsx (active route highlight)
  - Toast system for consistent errors:
    - Daber/lib/client/toast.tsx
    - Daber/app/session/[sessionId]/page.tsx (uses toast for STT/TTS/network errors)

- Settings
  - Added toggles and persistence:
    - Random order (default true)
    - Use dynamic drills (lexicon) (default false)
    - Daber/lib/client/settings.tsx
    - Daber/app/profile/SettingsCard.tsx

- Vocab Ingestion & Seed
  - Enhanced parser to extract `cards` + structured `lexemes` with inflections (present, past, passive; adjectives’ four forms):
    - Daber/lib/authoring/parseVocab.ts
  - Seed imports enhanced vocab; when `SEED_LEXEMES=1`:
    - Upserts Lexeme/Inflection and links LessonItems to lexemes by form/lemma
    - Stores `voice` in `Inflection.features.voice`
    - Daber/prisma/seed.ts
  - Authoring guide:
    - Daber/docs/Vocab_Ingestion.md

- Lexicon‑Driven Dynamic Drills (opt‑in)
  - Generators for adjectives + present verbs with simple English rendering (am/is/are + adjective, am/is/are + verb‑ing):
    - Daber/lib/drill/generators.ts
  - API route supports `mode=lex` (only for `vocab` lessons) and `random=1`:
    - Daber/app/api/sessions/[sessionId]/next-item/route.ts
  - Client API supports query params:
    - Daber/lib/client/api.ts
  - Session page requests lex mode when the setting is enabled:
    - Daber/app/session/[sessionId]/page.tsx
  - Generated items are upserted under a sibling lesson `<lessonId>_gen` with `type: 'vocab_generated'` to avoid polluting library statistics.
  - Library hides generated lessons and restricts progress/accuracy to items of the same lesson:
    - Daber/app/library/page.tsx

## How To Use
- Random order: toggle in profile settings; sessions will request `?random=1` automatically.
- Dynamic drills: enable “use dynamic drills (lexicon)” in settings for vocab lessons.
- Seed with enhanced lexicon:
  - Ensure `SEED_LEXEMES=1` in `Daber/.env`
  - `npm run db:push` and `npm run seed`
- Dev:
  - `npm run dev`
- Evaluator sanity:
  - `npm run test:evaluator`

## Next Steps (Concept)
- Generators
  - Add past and future tense verb generators (regular + passive), reuse inflection features for pronoun mapping.
  - Add noun generators (sg/pl; gender) with simple subject templates.
  - Introduce light content controls (e.g., topical tags) to bias selection.
- Evaluation
  - Make grading morphology‑aware: reason codes for wrong tense/person/number/gender/voice using the target’s feature vector.
  - Expand normalization for romanization variants and spacing/punctuation noise; add tests.
- Session Flow
  - UI hint when lexicon mode is active; quick toggle on the session screen (optional).
  - Adaptive weighting: prefer recent misses by feature; small per‑session cap.
- Library/Progress
  - Separate “Dynamic” track visuals; optional metrics roll‑up without impacting authored pack progress.
  - Deep‑link from “hardest items” into a feature‑filtered retry.
- Authoring
  - Add CSV/TSV importer with explicit columns (`pos, lemma, tense, person, number, gender, voice`) to bypass heuristics.
  - Expand seed with more present‑tense packs and exemplar adjectives.
- Platform/Safety
  - Optional Zod validation for outbound responses.
  - Enrich logging with durations (STT/TTS/eval) and a simple lag budget metric.

## Notes
- No new external dependencies were added.
- All changes respect the existing contracts and keep pages mountable without STT/TTS.
