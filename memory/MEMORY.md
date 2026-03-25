# MEMORY.md — Project State (Daber)

Role: Live project state, architecture snapshot, and current focus. Update this file at the end of each work session.

Last updated: 2026-03-25

---

## Architecture Snapshot
- Platform: Next.js (App Router) app in `Daber/`; API routes under `Daber/app/api/*`.
- Data: Prisma (SQLite/Postgres via `DATABASE_URL`). Dual SRS: `ItemStat` (per-item SM-2) + `FeatureStat` (per grammatical feature).
- Voice I/O: STT (`/api/stt`, Whisper), TTS (`/api/tts`, gpt-4o-mini-tts) with in-process rate limiting + LRU cache.
- Evaluator: 4-layer pipeline — deterministic → Levenshtein-1 → fuzzy Hebrew confusables → English evaluator (he→en). Code in `Daber/lib/evaluator/*`; tests via `scripts/test_evaluator.ts`.
- Drill generation:
  - Legacy: lexicon-driven generators for verbs (present/past/future), adjectives, nouns `Daber/lib/drill/generators.ts` (kept as fallback).
  - New (v1): async LLM-powered content pipeline with validation `Daber/lib/generation/pipeline.ts` and API `Daber/app/api/generate-drills/route.ts`.
    - DB tables: `GeneratedBatch`, `GeneratedDrill` (created via `prisma db push`).
    - Generation: selects 3–4 target lexemes + 8–10 known words; prompts for 3–4 items/target; Hebrew always without nikkud.
    - Validation: second LLM pass fixes grammar (conjugation, agreement); drops if unfixable.
    - Post-processing: enforce at least one `en_to_he` per target (flip one `he_to_en` if needed); drop malformed pairs (requires Latin in `english`, Hebrew in `hebrew`).
    - Background trigger: `/api/sessions` starts a batch if undrilled generated queue < `GEN_QUEUE_THRESHOLD` (default 20) and no pending batch.
    - Session signal: `/api/sessions/[id]/next-item` includes `newContentReady` when a batch landed after `session.started_at`; client shows a toast (no polling).
    - Mixing: cross‑vocab sessions include lessons of type `vocab_generated`.
- Drill directions: `en_to_he` (voice) and `he_to_en` (typed). Controlled by `drillDirection` setting.
- Session state machine: `Daber/lib/client/state/sessionMachine.ts` — pure reducer.
- Client settings: 15+ settings persisted to localStorage via `Daber/lib/client/settings.tsx`.
 - Selection debug (dev): `GET /api/sessions/[id]/next-item?debug=1` returns `explain` with selection path, candidate sizes, family swaps, etc. No change to normal behavior.

## Pages
`/` (dashboard), `/session/[id]` (drill), `/session/[id]/summary`, `/library`, `/progress`, `/retry`, `/vocab`, `/conjugations`, `/profile`, `/admin/lexicon/validate`.

## Current Focus
- Word families shipped: intros happen once per family; expand coverage and base‑form linking.
- Canonical intros live: new words show infinitives (verbs), m.sg. (adjectives), and singular (nouns). Validate across lessons.
- Validate LLM drill quality in real usage; iterate on prompt/validator.
- Next: guided production polish; feature‑aware selection/grading; minor mobile keyboard polish.
- Backlog: user auth, STT confidence guardrails, CC import pipeline docs.

## Recent Changes (2026-03-24)
- Word families infrastructure:
  - `LessonItem.family_id` / `LessonItem.family_base`; `FamilyStat` table.
  - `next-item` phase logic checks family intro; `seen` marks family introduced.
  - Base-form preference when introducing families.
  - Generator sets `family_id = 'lex:<id>'`; marks `family_base` on bare-lemma items.
- POC: linked present‑tense basics (`fam_ktov`, `fam_lmd`); smoke test validated behavior.
- CC linking: identified 612 unique standalone forms; LLM-tagged `{form, lemma, pos, confidence}`; applied high-confidence links (≥0.8): 348 updates; total CC items with family_id now 590/2,653 (~22%).
- New scripts:
  - `scripts/smoke_family_intro.ts` — verifies family gating (Prisma).
  - `scripts/count_cc_standalone.ts` — counts/uniques of bare-form CC items.
  - `scripts/tag_cc_families.ts` — LLM tagger (dry‑run JSON only).
  - `scripts/apply_cc_family_links.ts` — applies links to DB (confidence thresholded).

- Drill UX:
  - Removed automatic TTS playback on item load and feedback; manual replay via play buttons.
  - Mic no longer blocked by TTS; recording cancels any playing TTS so retries are immediate.
  - Guarded against overlapping audio: play buttons disable during playback; `useTTS` ignores concurrent calls.
  - Files: `Daber/app/session/[sessionId]/page.tsx`, `Daber/app/components/AudioPlayButton.tsx`, `Daber/lib/client/audio/useTTS.ts`, `Daber/app/vocab/VocabClient.tsx`.

## Recent Changes (2026-03-23)
- PWA baseline: added `public/manifest.webmanifest` and head links; lightweight SVG icon.
- Phase-aware next-item: API now returns `phase` (intro/recognition/free_recall) based on ItemStat; client renders an Intro card for new items, then routes into recognition.
- Organizational cleanup: updated MEMORY.md, Dev Journal, and Claude Code auto-memory to reflect actual project state.
- Wired `generateNounItem` into the strategies array (was dead code).
- Moved `CONVO.md` into `scraper/`.
- Library page: made filters functional (client-side) and linked settings gear to `/profile`.
- Vocab page: removed runtime FS read of `Mike_Hebrew_Vocab.md`; relies on DB-seeded vocab lesson.
- Recognition UX: auto-focus input after Hebrew TTS; mobile input attributes tuned.

## Recent Changes (2026-03-25)
- Canonical “new word” intros
  - API: `next-item` returns optional `intro { hebrew, english? }` when `phase='intro'`.
  - Rules: verbs→infinitive (lemma), adjectives→masc sg, nouns→singular (drop leading ה); compounds use stored definite form when available.
  - Client: intro card uses canonical `intro` for display and TTS; English drops leading “the”.
- Selection debug + simulation harness
  - `GET /api/sessions/[id]/next-item?debug=1` returns `explain` for selection path and candidate pools.
  - `scripts/simulate_vocab_session.ts` drives simulated sessions and writes JSONL traces.

## Ops / Dev Notes — DB Sync (Heroku)
- Schema (idempotent): set `DATABASE_URL` to Heroku and run `npm run db:push`.
- Data linking/seeding (idempotent):
  - Link authored families: `ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/link_authored_families.ts`
  - Apply CC family links: `ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/apply_cc_family_links.ts --in cc_family_tags.json`
  - Seed mastery: `ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/seed_mastery.ts`
- Verify:
  - Schema tables: `ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/check_generated_tables.ts`
  - Family columns/rows: `ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/verify_db_state.ts`

## Pointers & Artifacts
- Contracts: `Daber/lib/contracts.ts`
- Generation: `Daber/lib/generation/pipeline.ts`, `Daber/app/api/generate-drills/route.ts`
- Voice I/O: `Daber/app/api/{stt,tts}/route.ts`
- Evaluator: `Daber/lib/evaluator/*`; tests: `scripts/test_evaluator.ts`
- Generators: `Daber/lib/drill/generators.ts`
- Seed data: `Daber/prisma/seed.ts`; lessons: `Daber/data/lessons/*`
- CC imports: `Daber/data/imports/*`; scraper: `scraper/cc_scraper.js`; importer: `scripts/import_citizen_cafe.ts`
- Families: `Daber/app/api/sessions/[sessionId]/next-item/route.ts` (phase logic), `Daber/app/api/sessions/[sessionId]/seen/route.ts` (intro seen)
- Family scripts: `scripts/count_cc_standalone.ts`, `scripts/tag_cc_families.ts`, `scripts/apply_cc_family_links.ts`, `scripts/smoke_family_intro.ts`
- Oolpan schema ref: `Oolpan/README.md` (design artifact, not running code)

## Ops / Dev Notes
- Env:
  - `DATABASE_URL` to Heroku Postgres; `OPENAI_API_KEY` for generation.
  - `GEN_QUEUE_THRESHOLD` (default 20) controls background batch trigger on session start.
- Local testing (no server):
  - `ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/run_generation_once.ts` (prints raw JSON and persisted rows)
  - `ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/call_generate_drills.ts` (invokes API handler; in non‑prod prints raw/items)
  - `ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/print_recent_generated.ts`
  - Session simulation with explain traces: `ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/simulate_vocab_session.ts --count 25 --mode db --due off --random 1`
    - Outputs JSONL to `scripts/out/drill_run_<timestamp>.jsonl`; add `--mode lex --due feature` to exercise generator path.


## Maintenance Notes
- At session start: skim `SOUL.md` and this file.
- At session end: update Current Focus and Recent Changes.
- Promote durable lessons from the journal into `SOUL.md` when they stabilize.
