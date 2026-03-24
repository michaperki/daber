# Dev Journal — Daber

Chronological notes on meaningful work, decisions, and lessons. Keep entries concise and practical.

## 2026-03-24 — Bulk vocab import + mastery seeding

- Imported ~2,400 vocab items from 7 color-coded Citizen Cafe class levels (blue, light_blue, lime, orange, pink, red, yellow) into Heroku DB.
- Fixed `import_vocab_folder.ts` to group by level+lesson (was mixing all levels under a single "green" prefix).
- Created `seed_mastery.ts` to bulk-seed `ItemStat` records via raw SQL. Known levels get `correct_streak: 2` (free recall), green gets `correct_streak: 0` (recognition). First version was per-item upserts over the internet (~10 min); rewrote to 2 batch SQL queries (~2 seconds).
- Condensed home page quick-start: removed redundant "browse all" button, switched from flex row to 3-col CSS grid. Fixes horizontal scroll on mobile.
- Key decision: pre-seed mastery from class history rather than making Mike re-learn 2,400 known words. Wrong answers naturally demote words back to recognition via existing SM-2 streak reset.

## 2026-03-23 — Deployed to Heroku
- App is live and accessible on mobile. The #1 blocker is resolved.
- Priorities reordered: bug fixes and stabilization move up now that real mobile use will surface issues.
- Next focus: fix known bugs (library filters, vocab page path, mobile UX), then word lifecycle phases.

## 2026-03-23 — Product direction and pedagogy brainstorm
- Added "Target User" section to SOUL.md — the most important section. Build for Mike, not hypothetical users.
- Added "Current Product State" to SOUL.md capturing what works (drill flow, timing) and what doesn't (not deployed, no word introduction phase, mechanical generation, poor TTS Hebrew).
- Added "Pedagogy Model — Word Lifecycle" to SOUL.md: Introduction → Recognition → Guided Production → Free Recall. Currently only phase 4 exists.
- Added "Sentence Generation Vision" to SOUL.md: constraint-based generation mixing known + target words before reaching for ML.
- Added verb-specific pedagogy guidance: infinitive first, then conjugations gradually, interleaved with familiar words.
- Reordered ROADMAP.md priorities: deploy to mobile is #1, word lifecycle is #2, verb intro flow is #3.
- Updated MEMORY.md with product state snapshot and pedagogy model reference.
- Key insight: SRS should drive *drill type and phase*, not just *review timing*.

## 2026-03-23 — PWA baseline + phase-aware session
- PWA: Added `Daber/public/manifest.webmanifest`, linked in `app/layout.tsx` with theme color and icon for installability.
- Session phases: Introduced optional `phase` in `NextItemResponse` (contracts) and compute in `next-item` route from `ItemStat` (streak 0 → recognition, else free recall).
- Client: `session/[sessionId]/page.tsx` now respects `phase` to select he→en (recognition) vs en→he (free recall) per item.

## 2026-03-24 — Word families (intro gating)

- Schema: Added `family_id` (string) and `family_base` (boolean) to `LessonItem`; added `FamilyStat` table for family-level intro state. Applied to Heroku Postgres.
- Phase logic: `next-item` computes phase with family awareness — if no `ItemStat` exists but the item’s family is in `FamilyStat`, phase is `recognition` (skip intro); else `intro`.
- Base preference: When introducing a family, selection swaps to the family’s `family_base` item (if available in the current lesson scope).
- Intro seen: `/api/sessions/[id]/seen` now upserts `FamilyStat` for the item’s family so future forms skip intro.
- Generator: New generated items set `family_id = 'lex:' + targetLexemeId`; mark `family_base=true` when the item is the bare lemma.
- POC linking: Present‑tense basics — `fam_ktov` (ptb01_005–008, base=ptb01_005) and `fam_lmd` (ptb01_009–010, base=ptb01_009).
- Smoke (Prisma): First pick resolves to base→intro; subsequent family items→recognition.
- CC items: 2,653 total; 640 bare-form candidates; 612 unique forms. LLM tagger produced `{form, lemma, pos, confidence}`; applied links for confidence ≥ 0.8.
  - Apply result: 348 LessonItems updated across 337 pairs; total CC items with `family_id`: 590/2,653 (~22%).
- Scripts: `scripts/smoke_family_intro.ts`, `scripts/count_cc_standalone.ts`, `scripts/tag_cc_families.ts`, `scripts/apply_cc_family_links.ts`.

Note: SOUL.md unchanged (requires approval).

## 2026-03-23 — Organizational cleanup
- Updated `memory/MEMORY.md` to reflect actual project state (was stale — still said "establish root docs").
- Backfilled this journal with entries for 03-15 and 03-17 shipped work.
- Wired `generateNounItem` into drill strategies (was dead code in `generators.ts`).
- Moved `CONVO.md` from repo root to `scraper/` (it's a scraper input artifact).
- Set up Claude Code auto-memory with project facts and conventions.

## 2026-03-17 — Evaluator, SRS, and generators expansion
- Evaluator: Hebrew pronoun rules by tense (optional in past, required in present/future). Phrase-level lexicon verification cross-checks heard forms against Inflection table for precise mismatch reasons.
- SRS: Added `ItemStat` (per-item SM-2) alongside `FeatureStat`; new "due" modes (feature, item, blend) with session cap via `SESSION_DUE_CAP`.
- Generators: past/future verb strategies using Inflection; present/adjectives now include correct Hebrew pronoun in targets; expanded irregular English map for past tense.
- UX: "Review due (features)" CTA on Home; due mode in Settings; browser TTS fallback setting; STT/TTS/eval duration metrics logged.

## 2026-03-16 — Major feature batch
- Review before submit (default ON) with editable transcript and on-screen Hebrew keyboard.
- Emoji gender/number hint chip beside prompt.
- Vocab page splits multi-form entries; adds dynamic drill CTA.
- Dynamic generator improvements: single English alternative, phrasal verb "-ing" fix, parenthetical preservation.
- Persist features to generated items and attempts; weakness-targeted selection by (number, gender).
- Client can request `focus=weak`; profile toggle "target my weak spots".
- Evaluator normalization: strips zero-width chars, additional punctuation.
- Feature chips surfaced on Prompt/Feedback from `LessonItem.features`.
- Auto-resume listening setting and TTS speed control.
- Home "Drill my weak spots" CTA (lexicon mode + focus=weak).
- Mic guidance banner when inputs/labels missing.
- Normalization expanded (romanization ch→kh, tz→ts; hyphen/emdash) + tests.
- Feature-aware grading: pronoun detection, person/number/gender mismatch → flawed with targeted reasons.

## 2026-03-15 — Session UX, library, and safety
- Session UX: manual advance only; Next cancels ongoing TTS; TTS cancels at recording start.
- Waveform visualizer reflects real mic amplitude via `useMicRecorder().level`.
- Library: per-pack progress and accuracy surfaced; pack UI styling.
- Performance: server TTS LRU cache; client TTS prefetch for prompt/correction.
- Safety: STT JSON passthrough gated by env; in-memory rate limits on STT/TTS.
- DX: optional lexicon scaffolding (Lexeme/Inflection) behind `SEED_LEXEMES`.
- Validation: Zod request schemas wired to API routes (attempts, stt, tts).
- Toast system introduced; footer fixed positioning with route highlighting.
- Settings: "Random order" (default ON) and "Use dynamic drills (lexicon)" toggles.
- Vocab ingestion: enhanced parser extracts POS and inflections from `Mike_Hebrew_Vocab.md`; seed links items to lexemes.
- Dynamic drills: lexicon-driven generators (adjectives + present verbs); API supports `mode=lex`; Library hides generated lessons.

## 2026-03-23 — Root AI docs scaffolded
- Added root docs: `SOUL.md`, `memory/MEMORY.md`, `AI_SETUP.md`, and this journal.
- Moved `Daber/ROADMAP.md` to root as `ROADMAP.md` and updated references.
- Archived `CONTEXT_DUMPS/` under `archive/CONTEXT_DUMPS/`.
## 2026-03-23 — Library filters, settings link, vocab page
- Library: wired settings gear to `/profile`; filters are now functional (all, beginner, intermediate, verbs, pronouns, completed) with client-side state.
- Vocab: removed hardcoded FS read of `../Mike_Hebrew_Vocab.md`; page now relies on DB lesson (`user_vocab_01`) and shows a gentle empty state.
- Session (recognition mode): improved mobile typing UX (input attributes) and auto-focus after Hebrew TTS.

## 2026-03-23 — Intro phase (exposure) added
- Server: next-item now returns `phase: 'intro'` for items with no `ItemStat` yet (truly new).
- Client: session page renders an Intro card for new items with Hebrew + transliteration and a quick "hear" button; continue leads into recognition (he→en) for the same item.
- Contracts unchanged (uses existing `zDrillPhase`), evaluator/tests unaffected.
 - Seen event: Added `/api/sessions/[id]/seen` and client `apiMarkSeen()`; tapping "start practice" marks the item as seen by upserting `ItemStat` (streak 0) so it won’t re-enter Intro next time.
2026-03-24 — Cross-lesson vocab sessions

- Home “start drill” now creates a session with lesson_id `vocab_all` (virtual lesson), enabling drills to pull across all lessons of type `vocab`.
- Updated next-item selection to respect cross-lesson sessions: due-item and default selection now query across all vocab lessons instead of a single lesson when `lesson_id === 'vocab_all'`.
- Session creation API upserts the `vocab_all` lesson on demand.
- Lesson-specific sessions from the library remain unchanged.

## 2026-03-24 — POS data cleanup + generator safety + UX polish

**Lexeme POS cleanup (3 layers):**
- Layer 1: Manually reclassified 26 of 54 “nouns” in the Heroku Lexeme table — adverbs (4), prepositions (4), adjectives (6), expressions (6), phrases (6). Nouns: 54 → 28.
- Layer 2: Changed `parseVocab.ts` catch-all POS from `noun` to `untagged`. Prevents mass misclassification when ~2,400 CC vocab items are eventually parsed into Lexeme/Inflection tables.
- Layer 3: `generateNounItem()` now skips multi-word nouns that lack a `definite_form` in features. Single-word nouns work as before.

**Compound noun (סמיכות) support:**
- Added `definite_form` field in Lexeme features for construct-state pairs (e.g., `מצב רוח` → `מצב הרוח`).
- Generator uses stored definite form instead of blindly prepending ה. Reclassified מצב רוח and פרורי לחם back to `noun` with correct definite forms.

**Audio play/replay button:**
- New `AudioPlayButton` component: circular button shows play icon when idle, animated waveform bars during playback.
- Replaced standalone “hear”/”hear again” buttons on both intro card and listen-and-translate card with inline play button.
- StatusStrip waveform animates during TTS playback in recognition mode.

**Dynamic drill quick-start:**
- Removed “use dynamic drills (lexicon)” checkbox from settings/profile page.
- Added “dynamic drill” button to home page quick-start grid (6 buttons, 2 rows of 3).

**TS fix:** Cast `JsonValue` → `Record<string, string | null>` in next-item route (pre-existing type error).

## 2026-03-24 — LLM drill pipeline v1 (async generation)

- DB: Added `GeneratedBatch` and `GeneratedDrill` Prisma models to track batches and per-item metadata (drill_type, difficulty, grammar_focus).
- API: New `POST /api/generate-drills` to trigger a batch; uses OpenAI (gpt-4o-mini) with strict JSON and v1 drill types only (he_to_en, en_to_he). Grammar exposure hardcoded to: present/past/future, definite articles, construct state, possession; level: intermediate.
- Pipeline: `Daber/lib/generation/pipeline.ts` selects 3–4 target lexemes (weak/new) + 8–10 known lemmas, calls LLM, validates, persists items into `vocab_all_gen` lesson, links `GeneratedDrill` rows.
- Session trigger: `/api/sessions` now fires a background generation job when the undrilled generated queue is below threshold (ENV `GEN_QUEUE_THRESHOLD`, default 20) and no batch is pending.
- UX: `/api/sessions/[id]/next-item` includes `newContentReady` if generated items landed since `session.started_at`; session page shows a toast (no polling).
- Picker: Cross‑vocab sessions now include lessons of type `vocab_generated` in selection.

## 2026-03-24 — LLM drill pipeline v1 follow‑ups

- Validator pass: second LLM call checks grammar (conjugation, agreement, word form) and auto‑corrects or drops items.
- Unpointed Hebrew: prompt mandates no nikkud; nikkud stripped on save to avoid mixed styles.
- Direction mix enforcement: for each target, ensure at least one `en_to_he` by flipping one `he_to_en` when missing.
- Robust en_to_he handling: detect swapped `english`/`hebrew` and correct; final guard drops any item where `english` isn’t Latin or `hebrew` isn’t Hebrew.
- Dev inspection: `/api/generate-drills` returns raw JSON and parsed items only when `NODE_ENV !== 'production'`.
- Session toast flag: replaced function property hack with a `useRef` to fix prod type check.
