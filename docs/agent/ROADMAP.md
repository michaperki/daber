# Roadmap — High‑Impact Improvements (Daber)

Purpose: capture focused, high‑ROI enhancements for the drill loop, evaluator quality, and UX. Aligned with stable API contracts in `Daber/lib/contracts.ts` and minimal dependencies. **Every priority is evaluated against one question: does this make Mike's daily practice better?**

## Priorities at a Glance (ordered by impact)
1. ~~**Deploy to mobile**~~ — **SHIPPED** (Heroku, 2026-03-23).
2. ~~**Beta user readiness**~~ — **SHIPPED** (2026-03-29)
   - Anonymous per-device UUIDs in localStorage + cookie; `Session.user_id` populated.
   - Stats are per-user (ItemStat/FeatureStat/FamilyStat), fully scoped server-side.
   - Admin `/admin/users` shows UUIDs, sessions, attempts, accuracy, last active.
3. **Fix existing bugs** — Stabilize what exists now that real mobile use will surface issues.
   - Done: library filters wired, vocab page no runtime FS, settings button links to Profile, iOS keyboard, footer nav.
 - Remaining: revert volume slider (873e746); “I said it right” button on correct answers; mobile keyboard UX polish.
  - Shipped: “I said it right” button hidden on correct; mic lifecycle fix on iOS (release on `visibilitychange`/`pagehide`).
4. **Word lifecycle phases** — **SHIPPED (v1)**. Intro, recognition, guided production, and free recall are live. ~2,400 known vocab pre-seeded at free recall from Citizen Cafe class history.
5. **Content assemblies** — **SHIPPED**:
   - Green vocab drill: curated ~88 lexeme allowlist with listen-only prompts. Mike uses this for daily practice.
   - Song packs: Ma Na'aseh chorus live. Plan to expand to verse chunks and more songs.
6. **Verb introduction flow** — **PARTIALLY SHIPPED** (2026-03-25): “new word” intros now use the infinitive; conjugations surface later via recognition/guided/free recall. Same‑family spacing guard shipped; next: broader scheduling across sessions.
7. **Smarter sentence generation** — Constraint-based: mix known words with target words for natural, varied sentences. See SOUL.md “Sentence Generation Vision.”
8. **SRS drives drill type** — **PARTIALLY SHIPPED**. `correct_streak` now drives phase (intro/recognition/guided/free_recall). Wrong answers demote to recognition. FeatureStat not yet wired to phase selection.

## Near‑Term High‑Leverage
- Family progression spacing — After infinitive intros, schedule present forms (3sg m → 3sg f → 1sg → 3pl m) and space follow‑ups across sessions; interleave familiar content.
- Feature‑blend due selection — Blend `ItemStat` and `FeatureStat` so weak features (number/gender/person/tense) steer picks when requested.
- Admin family tooling — Quick actions to set `family_base` and `family_id` on `/admin/lexicon/validate` to accelerate coverage.
- Guided production hints — SHIPPED (v1): insert‑pronoun CTA, base‑form + first‑letter hints, and a noun definiteness chip in guided mode.
- English normalization pass — Scripted cleanup of CC/generated English prompts (drop leading “the”, lower‑case nouns, remove adjective parentheticals) with dry‑run and apply switches.
9. **TTS Hebrew quality** — Hard problem. Investigate alternatives when time allows.

## Previous Priorities (many shipped)
- Feature‑aware feedback chips on Prompt/Feedback.
- Evaluator normalization coverage + tests.
- Auto‑resume listening + TTS rate control.
- “Drill my weak spots” CTA on Home.
- Mic guidance for permissions/devices.
- Broaden dynamic generators (past/future, nouns) and simple learner model.

---

## Quick Wins
- Feature chips
  - Surface `LessonItem.features` on Prompt and Feedback.
- Auto‑resume listening
  - Re‑arm mic after feedback playback (default ON).
- TTS rate
  - User‑selectable playback rate (0.85×/1×/1.15×).
- Mic guidance
  - Help banner when no inputs or unlabeled devices are detected.
- Normalization/tests
  - Romanization tweaks (ch→kh, tz→ts) and hyphen/emdash cleanup; add tests.

Shipped (2026‑03‑16)
- Review before submit (default ON) with editable transcript and on‑screen Hebrew keyboard.
- Emoji gender/number hint chip beside prompt (avoids mutating text string).
- Vocab page splits multi‑form entries into single‑form cards with hints; adds dynamic drill CTA.
- Dynamic generator improvements: pick a single English alternative; correct phrasal verb “‑ing” (picking up), preserve and append parentheticals.
- Persist features to generated items; store features on attempts; weakness‑targeted selection by `(number, gender)`.
- Weakness targeting integrated for lexicon drills.
- Evaluator normalization strips zero‑width chars and additional punctuation (hyphen/slash).
- Mic device handling stabilized (no update‑depth loop); enumerates on mount and `devicechange`; defers restoring saved device until devices load.
 - Feature chips surfaced on client (Prompt/Feedback) from `LessonItem.features`.
 - Auto‑resume listening default ON and TTS speed control (client + session flow).
 - Home adds “Drill my weak spots” CTA (lexicon mode + focus=weak).
 - Mic guidance banner when inputs/labels are missing.
 - Normalization expanded (romanization ch→kh, tz→ts; hyphen/emdash) + tests added.
 - Feature‑aware grading: if a pronoun is heard, detect person/number/gender mismatches vs target features and grade as flawed with targeted reasons.

## Evaluator & Grading
- Expand deterministic near‑miss rules (`Daber/lib/evaluator/deterministic.ts`)
  - Article/function‑word slips where meaning remains intact → `flawed` with reason.
  - Wrong pronoun + right verb → `flawed` (when authored or heuristically detected).
  - Wrong tense (when authored in `near_miss_patterns`).
  - Distinguish `accepted_variant` vs `near_miss` for clearer feedback labels.
- Better normalization (`Daber/lib/evaluator/normalize.ts`)
  - Romanization variants (e.g., ch→kh, tz→ts), zero‑width and dash variants; consider final‑form equivalence when needed.
- Confidence guardrails
  - Use STT `confidence` (from `/api/stt`) to bias ambiguous cases toward `flawed` with a “low confidence” reason.
- Tests (`scripts/test_evaluator.ts`)
  - Add cases for punctuation/spacing noise, romanization variants, article omissions, wrong pronoun/tense when authored, and confidence‑driven outcomes.

## Voice I/O Reliability
- Auto‑resume listening (default ON)
  - After correction playback ends, re‑arm the mic automatically.
- Waveform from live mic level
  - Drive `StatusStrip` bars from `useMicRecorder().level` for immediate visual feedback (shipped).
- Browser TTS fallback
  - If server TTS fails, fall back to `speechSynthesis` to keep the loop unblocked offline/without API.
- Device UX guidance
  - Help banner on session page when devices are missing/unlabeled (permissions/HTTPS/OS input hints).

## Structured Vocab & Drill Generation
- Vocab ingestion 2.0 (parts of speech)
  - Extend `Daber/lib/authoring/parseVocab.ts` and the seeding flow to capture Part of Speech (POS) and optional features: e.g., verbs (lemma/infinitive + binyan), nouns (gender/number), adjectives (agreement).
  - Suggested schema additions (Prisma):
    - `Lexeme { id, lemma, pos, features(Json) }`
    - `Inflection { id, lexeme_id, tense/aspect, person, number, gender, form, transliteration? }`
  - Keep `Lesson`/`LessonItem` as the delivery layer; either materialize items from lexicon or generate on the fly.
  - Authoring input: support inline metadata in Markdown lines or a CSV/TSV with columns for `pos, lemma, tense, person, number, gender` to seed structured data.
- Verb conjugation coverage
  - Author or import present/past/future (and participles) with person/number/gender grids, tied to `Lexeme` → `Inflection` entries.
  - Track learner weaknesses by feature dimensions (e.g., `tense=past`, `gender=f`, `person=3`, `number=pl`).
- Dynamic sentence generation
  - Add a generation pipeline `Daber/lib/drill/generators.ts` with typed interfaces to compose prompts from slots (pronoun + verb inflection [+ optional object/noun]).
  - Start with deterministic templates; optionally add an LLM‑assisted generator with strict constraints to produce short, graded sentences.
  - Generated items should still resolve to a single intended Hebrew target (or small accepted set) to keep evaluation reliable.
- Words and phrases tracks
  - Support separate “words” (infinitives, nouns, adjectives) drills and “phrases” drills. Expose both in Library and allow mixed sessions.

## Session Flow & Content
- Manual advance (shipped)
  - Keep prompts on screen until user taps “next”; ensure TTS stops immediately when advancing.
- Optional auto‑advance (future opt‑in)
  - If reintroduced, add a minimum dwell time (e.g., 600–800ms) and only auto‑advance after correction playback completes.
- Adaptive next‑item selection (`Daber/app/api/sessions/[sessionId]/next-item/route.ts`)
  - Prefer "unseen first", then weight recently `flawed` items inside a session for quick reinforcement.
- Per‑session length cap
  - Add a setting (e.g., 10–20 items) to stop sessions at a cap even if the lesson has more; mark `ended_at` and show summary.
- Prefetch next prompt audio
  - When `speakPrompt` is on, prefetch next English prompt audio early to remove audible delay.
- Authoring pipeline v2 (`Daber/lib/authoring/parseVocab.ts`)
  - Support CSV/TSV import in addition to the Markdown pattern; add a small CLI to emit normalized lesson JSON templates with transliteration slots and empty near‑miss stubs.

## Data, Progress, and Review
- Activity deltas
  - On `Daber/app/progress/page.tsx`, add a small callout with +/‑ deltas vs prior period (sessions, items, accuracy).
- Mastery weights
  - Weight mastery by recency (time‑decay) so old correctness degrades, nudging spaced retrieval.
- Hardest items deep‑link
  - From “hardest items”, link into `/retry` with those item IDs pre‑selected.
- Per‑lesson stats in library
  - Show per‑lesson accuracy and optionally a tiny bar/sparkline from attempts in `library` view.

## Platform & Safety
- Contracts on server responses
  - Optionally validate outbound payloads in API routes against Zod schemas (from `Daber/lib/contracts.ts`) before sending to catch drift early.
- Rate limiting
  - In‑memory token buckets on `/api/stt` and `/api/tts` shipped; consider shared store if scaling horizontally.
- Logging enrichment (`Daber/lib/log.ts`)
  - Include durations (STT/TTS/eval) and a coarse “lag budget” metric to detect regressions; keep DB write failures non‑fatal.
- Seed content
  - Add 1–2 more small present‑tense packs under `Daber/data/lessons/` so users can loop without repeating the same pack immediately.

## Nice to Haves
- Session state machine
  - Introduce `Daber/lib/client/state/sessionMachine.ts` to encode states (prompting, listening, transcribing, evaluating, correcting, advancing, complete) and transitions, reducing UI edge cases.
- Keyboard controls
  - Space to start/stop recording; arrows to retry/next in `MicControls` for desktop users.
- Unified error surface
  - Add a tiny toast/alert primitive and reuse for STT/TTS/transient network errors across pages.

## Notes & Constraints
- Keep Zod contracts stable; avoid breaking changes to `Daber/lib/contracts.ts`.
- Avoid new dependencies unless truly necessary; gate any install via `package.json` and user approval.
- Tests: `npm run test:evaluator` for evaluator sanity (no network).

## Suggested Next Steps
1. Feature‑aware grading: incorporate `LessonItem.features` into evaluator rules for precise “wrong gender/number/person/tense/voice” reasons.
2. Generators: add past/future tense verbs and noun number/gender coverage with deterministic English templates.
3. Learner model: persist feature‑level mastery and adapt selection; surface a heatmap on Progress.
4. Browser TTS fallback (opt‑in) to unblock offline use.
5. DB indexes on `Attempt(lesson_item_id)` and `Attempt(session_id)` for analytics queries.

Next (post‑2026‑03‑16)
- Feature chips: Surface exact `LessonItem.features` in Prompt/Feedback (client) instead of heuristics.
- Dashboard: “Drill my weak spots” CTA to start a lex session with `focus=weak`.
- Weakness scope: Aggregate by `user_id` once user identity exists.
- Mic UX: add guidance when `enumerateDevices()` returns no inputs or labels (permission hint).
- Generators: broaden POS/tense coverage with feature‑aware English templates and deterministic outputs.
## Shipped (2026‑03‑15)
- Session UX: Manual advance only; Next cancels any ongoing TTS; TTS cancels at recording start to avoid overlap.
- Visualizer: Waveform reflects real mic amplitude via `useMicRecorder().level`.
- Library: Per‑pack progress and accuracy surfaced; pack UI styling added.
- Performance: Server TTS LRU cache; client TTS prefetch for prompt/correction.
- Safety: STT JSON passthrough gated by env; in‑memory rate limits on STT/TTS.
- DX: Optional lexicon scaffolding (Lexeme/Inflection) behind `SEED_LEXEMES` for future structured drills.

## Changelog

2026‑03‑29 — Identity isolation + admin users + mic lifecycle
- Anonymous device identity using UUID in localStorage + cookie.
- Per-user stat scoping through attempts, override, next-item, seen/known, generation.
- Admin `/admin/users` dashboard.
- iOS mic cleanup via `visibilitychange`/`pagehide` on session page.
- Heroku deploy now runs `prisma db push --accept-data-loss` before build to apply schema changes.

2026‑03‑17 — Agent updates
- Evaluation:
  - Hebrew pronoun rules by tense: pronoun optional in past (accepted), required in present/future (flawed if omitted).
  - Phrase‑level lexicon verification: if a valid Inflection form is heard but tense/person/number/gender differ from target, return precise flawed reasons.
  - Pronoun–verb agreement checks with targeted mismatch reasons.
- Scheduling:
  - Added ItemStat (per‑item SM‑2) alongside FeatureStat; new “due” modes (feature, item, blend) with a session cap via `SESSION_DUE_CAP`.
  - Progress shows “feature mastery (lowest)” with % correct.
- Generators:
  - Past and future verb strategies using Inflection for Hebrew forms.
  - Present/adjectives now include the correct Hebrew pronoun in targets.
  - Expanded irregular English map for past tense prompts; deterministic English for future (“will …”).
- UX/Infra:
  - “Review due (features)” CTA on Home; Settings include due mode.
  - Browser TTS fallback (setting) when server fails; STT/TTS/eval duration metrics logged.

2026‑03‑15 — Agent updates
- Validation: Added Zod request schemas and wired to API routes (`attempts`, `stt` JSON, `tts`).
- UI/UX: Introduced toast system; stabilized footer with fixed positioning and route highlighting; removed legacy `/drill` entry (redirect to home); adjusted session exit and summary CTAs (restart + retry missed).
- Settings: Added “Random order” (default ON) and “Use dynamic drills (lexicon)” toggles with persistence.
- Vocab ingestion: Enhanced parser to extract POS and inflections from `Mike_Hebrew_Vocab.md`; seed links lesson items to lexemes and stores `voice` in `Inflection.features`.
- Dynamic drills: Added lexicon‑driven generators (adjectives + present verbs); API supports `mode=lex`; generated items go to `<lessonId>_gen` with type `vocab_generated`; Library hides generated lessons and restricts progress to authored items.
