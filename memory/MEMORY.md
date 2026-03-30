# MEMORY.md — Project State (Daber)

Role: Live project state, architecture snapshot, and current focus. Update this file at the end of each work session.

Last updated: 2026-03-30 (mini morphology drill + validation + hardening)

---

## Architecture Snapshot
- Platform: Next.js (App Router) app in `Daber/`; API routes under `Daber/app/api/*`.
- Data: Prisma (SQLite/Postgres via `DATABASE_URL`). Dual SRS: `ItemStat` (per-item SM-2) + `FeatureStat` (per grammatical feature).
- Identity & scoping: Anonymous per-device UUID in `localStorage` (`daber.uid`) + cookie; `Session.user_id` populated; stats are per-user.
  - `ItemStat` and `FamilyStat` use composite PKs with `user_id`; `FeatureStat` has a `user_id` column and all queries include it.
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
- Drill directions: recognition is he→en (typed); guided and free recall are en→he (typing/voice) based on phase.
- Session state machine: `Daber/lib/client/state/sessionMachine.ts` — pure reducer.
- Client settings: TTS speed and mic device/sensitivity/silence; most drill behaviors are default‑on (random order, blend due, adaptive pacing, review‑before‑submit, auto‑resume listening, browser TTS fallback).
 - Selection debug (dev): `GET /api/sessions/[id]/next-item?debug=1` returns `explain` with selection path, candidate sizes, family swaps, etc. No change to normal behavior.

## Pages
`/` (dashboard), `/session/[id]` (drill), `/session/[id]/summary`, `/library`, `/progress`, `/retry`, `/vocab`, `/conjugations`, `/profile`, `/dictionary`, `/dictionary/[lexemeId]`, `/songs/ma-naaseh`, `/admin/lexicon/validate`.

## Current Focus
- **LORE codified**: SOUL.md now includes a Long‑Term Direction (LORE) section; ROADMAP has concrete milestones.
- **Doc alignment**: keeping SOUL, MEMORY, STATE, ROADMAP, and Dev Journal in sync with shipped code.
- **Green vocab drill**: curated ~82 lexeme drill. Green generators now use gloss-based prompts ("How do I say …"); intros use `Lexeme.gloss`.
- **Card-generation integrity**: completed alignment of pronoun fallbacks (EN/HE), generator gating on complete morphology, CC family lemma+POS links, plural adjective gender normalization, and validation gates to skip inconsistent items.
  - Follow-up: fixed English wrapper duplication (strip leading "How do I say:") and prefer `Lexeme.gloss` across generator paths; filtered possessive-suffix noun forms from pools.
 - **Mini Morph Drill (vocab_mini_morph)**: 3-lexeme sandbox expanded. Phase 1: 6 lexemes — verbs (לכתוב, לדבר), nouns (ספר, גלידה), adjectives (גדול, חדש). Phase 2: 10 lexemes — add verbs (לקרוא, לשמוע), noun (שיר), adjective (חכם). Intros are canonical (verb=infinitive, noun=sg base, adj=m.sg). Variants included (verb present/past/future subsets; noun definite/plural; adj m/f sg/pl). Mini-only validation guards skip malformed items and log why. Debug meta (lexeme_id, family_id, pos, features) returned on `?debug=1`.
- **Selection default**: server now defaults to `due=blend` (feature then item) when unspecified by client.
- Next: revisit intro-card polish and orthographic quality (do not change pedagogy until integrity gates are stable in prod).
- **Song packs**: Ma Na'aseh chorus live; expand to verse chunks.
- **Pilot feedback**: with anonymous identity shipped, observe `/admin/users` for activity and accuracy. Decide if optional names/labels are needed later.
- Family coverage: intros once per family; broaden base‑form linking.
- Validate guided phase and hints in real sessions; polish scaffolds.
- Backlog: user auth/profiles, STT confidence guardrails, CC import pipeline docs.
 - Green intros: server uses `Lexeme.gloss` as the source of truth; UI renders English only when provided (never instruction text).

## Near‑Term High‑Leverage
- **Pilot flow polish**: Keep friction at zero; consider optional name label in settings that maps to the UUID for admin readability.
- **Revert volume slider** (commit 873e746): redundant UI; the useTTS.ts boost tool is sufficient. Users use native volume.
- **"I said it right" button**: should not appear when grade is `correct` — only for incorrect/flawed overrides.
 - Feature‑aware grading: deepen tense/voice mismatch reasons.
 - Infra groundwork: Redis rate limit + queue; DB indexes for hot queries.
- Family progression polish: basic same‑family spacing guard shipped; next up is cross‑session scheduling and staged conjugations.
- Feature‑blend due mode: incorporate `FeatureStat` into selection when `due=blend` to target weak number/gender/person/tense features across items.
- Admin family tools: on `/admin/lexicon/validate`, add actions to mark `family_base` and assign `family_id` for obvious lemmas.
- Guided hints: v1 shipped (base form, first letter, definiteness chip, pronoun insert). Consider more scaffolds and analytics.
- English cleanup pass: run `scripts/scan_normalize_english.ts` on generated/CC lessons to standardize articles/casing (dry‑run then `--apply`).
 - Orthography quality (queued after integrity): enrich WD verb forms (mater lectionis) and refine intro selection once data is consistent.

## Recent Changes (2026-03-30)
- Card-generation integrity alignment:
  - Unified pronoun fallbacks: EN “they”, HE “הם”.
  - Generators require complete morphology (verbs/adjectives/nouns) before emitting items.
  - Validation gate skips mixed-script or POS/feature-inconsistent items.
  - CC family IDs include POS; only link for {verb|noun|adjective}.
  - Plural adjective gender inferred by suffix (ים/ות).
  - Follow-up scripts to run: normalize_inflections → tag_cc_families → apply_cc_family_links.

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

## Recent Changes (2026-03-29)
- Green vocab drill: curated ~88 Wikidata lexeme allowlist; listen-only prompts; home page entrypoint (`vocab_green`). Data: `Daber/data/green_lexemes.json`, `green_glosses.json`.
- Song packs: Ma Na'aseh chorus page at `/songs/ma-naaseh` with bootstrap API creating lesson + 12 items on first access.
- Wikidata lexicon seeding: bulk pipeline (`scripts/lexicon/seed_wikidata_bulk.ts`) populating Lexeme/Inflection tables from Wikidata. Resumable, rate-limit aware. Watchdog and batch runners.
- Dictionary UI: `/dictionary` with search + `/dictionary/[lexemeId]` detail (forms, examples).
- TTS volume boost: `useTTS.ts` sets `audio.volume=1` and optionally applies WebAudio GainNode when `ttsGain > 1`. Slider in settings to be reverted.
- Footer nav: simplified to 4 links (home, dict, library, profile); progress moved to profile page.
- iOS/mobile: custom HebrewKeyboard hidden on touch devices; native keyboard used instead.
- Emoji: `deriveEmojiFromFeatures()` uses item grammatical features; falls back to prompt parsing.

## Recent Changes (2026-03-25)
- Canonical “new word” intros
  - API: `next-item` returns optional `intro { hebrew, english? }` when `phase='intro'`.
  - Rules: verbs→infinitive (lemma), adjectives→masc sg, nouns→singular (drop leading ה); compounds use stored definite form when available.
  - Client: intro card uses canonical `intro` for display and TTS; English drops leading “the”.
 - Selection debug + simulation harness
  - `GET /api/sessions/[id]/next-item?debug=1` returns `explain` for selection path and candidate pools.
  - `scripts/simulate_vocab_session.ts` drives simulated sessions and writes JSONL traces.
 - Simplification pass
   - Removed STT text passthrough (JSON) from `/api/stt`; audio only.
   - Removed client‑log pipeline (`/api/client-log`, `lib/client/logClient.ts`).
   - Settings cleanup: removed dead/low‑value toggles (drillDirection, due mode selector, random order, focus weakness, adaptive pacing, auto‑resume listening, browser TTS fallback, review‑before‑submit). TTS speed and mic settings remain.
   - Session flow always requests `due=blend`, `random=1`, `pacing=adaptive`, and `focus=weak` when lexicon mode is enabled.
  - TTS fallback now always falls back to `speechSynthesis` if server TTS fails.
 - Session stability
   - Guarded initial item load against double-invoke; added in-flight guards to `startVoice` and `submitAnswer`; auto-resume is gated and reset per item.

## Ops / Dev Notes — DB Sync (Heroku)
- Schema (idempotent): set `DATABASE_URL` to Heroku and run `npm run db:push`.
- Data linking/seeding (idempotent):
  - Link authored families: `ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/link_authored_families.ts`
  - Apply CC family links: `ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/apply_cc_family_links.ts --in cc_family_tags.json`
  - Seed mastery: `ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/seed_mastery.ts`
- Verify:
  - Schema tables: `ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/check_generated_tables.ts`
  - Family columns/rows: `ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/verify_db_state.ts`
  - English cleanup (dry-run): `ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/scan_normalize_english.ts` (add `--apply` to write)

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
- Green drill: targets in `Daber/data/green_lexemes.json`; glosses live in DB (`Lexeme.gloss`, backfilled for 82). `green_glosses.json` is historical (not used at runtime).
- Song packs: `Daber/app/songs/ma-naaseh/page.tsx`, `Daber/app/api/song-packs/ma-naaseh/bootstrap/route.ts`
- Dictionary: `Daber/app/dictionary/page.tsx`, `Daber/app/dictionary/[lexemeId]/page.tsx`
- Wikidata seeding: `scripts/lexicon/seed_wikidata_bulk.ts`, `scripts/lexicon/run_wd_seed_forever.sh`
- TTS volume boost: `Daber/lib/client/audio/useTTS.ts` (GainNode logic)
- Oolpan schema ref: `Oolpan/README.md` (design artifact, not running code)
 - Green intros (2026-03-30): use `Lexeme.gloss` (single source); backfilled 82; generators updated to gloss-based "How do I say …" prompts; no JSON lookups at runtime.
 - Mini drill (2026-03-30): explicit seed + items (no generators). Validation/picking hooks are gated strictly to `lesson_id === 'vocab_mini_morph'`. Home page has a “start mini morph drill” button.

## Ops / Dev Notes
- Env:
  - `DATABASE_URL` to Heroku Postgres; `OPENAI_API_KEY` for generation.
  - `GEN_QUEUE_THRESHOLD` (default 20) controls background batch trigger on session start.
  - Deploy: Heroku `heroku-postbuild` runs `prisma db push --accept-data-loss` → `prisma generate` → `build`.
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
