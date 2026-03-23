# MEMORY.md — Project State (Daber)

Role: Live project state, architecture snapshot, and current focus. Update this file at the end of each work session.

Last updated: 2026-03-23

---

## Architecture Snapshot
- Platform: Next.js (App Router) app in `Daber/`; API routes under `Daber/app/api/*`.
- Data: Prisma (SQLite/Postgres via `DATABASE_URL`). Dual SRS: `ItemStat` (per-item SM-2) + `FeatureStat` (per grammatical feature).
- Voice I/O: STT (`/api/stt`, Whisper), TTS (`/api/tts`, gpt-4o-mini-tts) with in-process rate limiting + LRU cache.
- Evaluator: 4-layer pipeline — deterministic → Levenshtein-1 → fuzzy Hebrew confusables → English evaluator (he→en). Code in `Daber/lib/evaluator/*`; tests via `scripts/test_evaluator.ts`.
- Drill generation: lexicon-driven generators for verbs (present/past/future), adjectives, nouns. Code in `Daber/lib/drill/generators.ts`.
- Drill directions: `en_to_he` (voice) and `he_to_en` (typed). Controlled by `drillDirection` setting.
- Session state machine: `Daber/lib/client/state/sessionMachine.ts` — pure reducer.
- Client settings: 15+ settings persisted to localStorage via `Daber/lib/client/settings.tsx`.

## Pages
`/` (dashboard), `/session/[id]` (drill), `/session/[id]/summary`, `/library`, `/progress`, `/retry`, `/vocab`, `/conjugations`, `/profile`, `/admin/lexicon/validate`.

## Current Focus
- Immediate: PWA installability (manifest + icons) and phase-aware session routing (recognition vs free recall).
- Next: library filter pills (UI exists, no logic), progress heatmap for feature mastery, session length cap.
- Backlog: user auth, confidence guardrails from STT, browser TTS fallback verification, CC import pipeline docs.

## Recent Changes (2026-03-23)
- PWA baseline: added `public/manifest.webmanifest` and head links; lightweight SVG icon.
- Phase-aware next-item: API now returns optional `phase` (recognition/free_recall) based on ItemStat; client session page routes UI accordingly.
- Organizational cleanup: updated MEMORY.md, Dev Journal, and Claude Code auto-memory to reflect actual project state.
- Wired `generateNounItem` into the strategies array (was dead code).
- Moved `CONVO.md` into `scraper/`.
- Library page: made filters functional (client-side) and linked settings gear to `/profile`.
- Vocab page: removed runtime FS read of `Mike_Hebrew_Vocab.md`; relies on DB-seeded vocab lesson.
- Recognition UX: auto-focus input after Hebrew TTS; mobile input attributes tuned.

## Pointers & Artifacts
- Contracts: `Daber/lib/contracts.ts`
- Voice I/O: `Daber/app/api/{stt,tts}/route.ts`
- Evaluator: `Daber/lib/evaluator/*`; tests: `scripts/test_evaluator.ts`
- Generators: `Daber/lib/drill/generators.ts`
- Seed data: `Daber/prisma/seed.ts`; lessons: `Daber/data/lessons/*`
- CC imports: `Daber/data/imports/*`; scraper: `scraper/cc_scraper.js`; importer: `scripts/import_citizen_cafe.ts`
- Oolpan schema ref: `Oolpan/README.md` (design artifact, not running code)

## Maintenance Notes
- At session start: skim `SOUL.md` and this file.
- At session end: update Current Focus and Recent Changes.
- Promote durable lessons from the journal into `SOUL.md` when they stabilize.
