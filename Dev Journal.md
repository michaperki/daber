# Dev Journal — Daber

Chronological notes on meaningful work, decisions, and lessons. Keep entries concise and practical.

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
