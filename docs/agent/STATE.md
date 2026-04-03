# STATE.md — What’s Actually Built (Daber)

Role: Honest, always-current snapshot of the running codebase. Descriptive, not aspirational.

Last reviewed: 2026-04-01 (local LLM prompt core-pack + whitelist target inclusion; Mini seeded on RDS)

—

Temporary scaffolding and feature flags
- RL_STT_PER_MIN / RL_TTS_PER_MIN
  - Where: Daber/app/api/stt/route.ts, Daber/app/api/tts/route.ts
  - What: In‑process per‑IP token bucket rate limits.
  - Why: Prevents accidental hammering during dev.
  - Keep or kill: Temporary for single-instance; replace with shared store if scaling.
- RL_BACKEND
  - Where: Daber/lib/rateLimit.ts
  - What: Select rate limit backend. `redis` placeholder falls back to in‑memory until Redis client is wired.
  - Why: Prepare for multi‑instance deployments.
  - Keep or kill: Keep; wire to Redis when infra lands.
- SESSION_DUE_CAP
  - Where: Daber/app/api/sessions/[sessionId]/next-item/route.ts
  - What: Session item cap (base). ‘adaptive’ pacing can extend up to a hard 25.
  - Why: Keeps sessions tight; supports adaptive end/extend prompts.
  - Keep or kill: Keep (tunable UX control).
- GEN_QUEUE_THRESHOLD
  - Where: Daber/app/api/sessions/route.ts
  - What: Triggers background LLM generation when undrilled generated queue is low and no pending batch.
  - Why: Keeps a buffer of fresh content.
  - Keep or kill: Keep, but consider centralized job control when scaling.
- GEN_QUEUE_BACKEND
  - Where: Daber/lib/infra/queue.ts
  - What: Selects job queue backend (`memory` default; `redis` placeholder). Session creation schedules generation via queue.
  - Why: Prepare a path to externalize background jobs.
  - Keep or kill: Keep; wire to Redis when infra lands.
- SEED_LEXEMES / SEED_CC / SEED_CC_PREFIX
  - Where: Daber/prisma/seed.ts
  - What: Data seeding toggles (structured lexicon, Citizen Cafe imports).
  - Why: Developer bootstrap.
  - Keep or kill: Keep as seed-time flags only.

Debug/dev-only endpoints and tools
- /api/sessions/[id]/next-item?debug=1
  - Adds explain payload (selection path, pools) in response; used by scripts/simulate_vocab_session.ts.
  - Dev-only (mini morph): `?forceLlm=1` attempts on-the-fly local LLM generation for a known mini lexeme; on success serves it, else falls back. Response includes `llm_debug` in dev when `debug=1` or `forceLlm=1`.
- Admin lexicon tools
  - /admin/lexicon/validate (page)
  - /api/admin/lexicon/{sync, family, export, fix}
  - Note: fix route includes hard-coded IDs for quick DB patching (temporary scaffolding).

Stubbed or partial implementations
- “Guided production”
  - Current: Guided is a distinct phase with typed Hebrew input and normal grading.
  - Shipped: Server computes lightweight hints and client renders them in guided mode.
    - Hints: baseForm (lemma), firstLetter (of target form), definiteness (noun article cue).
  - Missing: Additional hint types and per‑hint analytics.
 
Per-user stats — SHIPPED (2026-03-29)
 - Identity: anonymous UUID stored in `localStorage` as `daber.uid` and as a cookie for server components.
 - Session: `Session.user_id` set on creation.
 - Stats: `ItemStat` and `FamilyStat` use composite primary keys with `user_id`; `FeatureStat` has a `user_id` column. All reads/writes are scoped by `user_id`.
 - Dashboard: server reads include both current UUID and legacy `null` sessions to preserve history.
 - Admin: `/admin/users` lists display label (if set), userId, sessions, attempts, accuracy, last active.

New content assemblies
- Green vocab drill
  - Curated allowlist of ~82 Wikidata lexemes (`Daber/data/green_lexemes.json`).
  - Session via lesson_id `vocab_green`; home page has “start green drill” button.
  - English glosses: `Lexeme.gloss` is the single source of truth. All 82 Green lexemes have a populated `gloss` field. `buildIntroFor()` reads `lexeme.gloss` directly — no JSON file lookups or derivation chains.
  - Generators use `lexeme.gloss` for `english_prompt` on Green items (e.g., “How do I say: to love?”) instead of hardcoded “Listen and type what you hear.”
  - Generated items link to lexemes (`LessonItem.lexeme_id`) for reliable intros/hints; older generated ids are parsed as a fallback.
  - Supports Wikidata POS Q-ids (e.g. `Q24905`) in addition to plain POS strings.
  - `green_glosses.json` is no longer referenced by any code (kept on disk as historical data).
- Song packs
  - Ma Na'aseh (Hadag Nahash) chorus lesson at `/songs/ma-naaseh`.
  - Bootstrap API creates lesson (`song_ma_naaseh_chorus_v1`, type `song`) + 12 items on first access.
  - Plan: expand to verse chunks.

- Mini Morph Drill — SHIPPED (2026-03-30), HARDENED (2026-03-30)
  - Lesson id: `vocab_mini_morph`. UI home has a "start mini morph drill" button.
  - Initial scope: exactly one verb (לכתוב), one noun (ספר), one adjective (גדול).
  - Phase 1 expansion (2026-03-30): added 3 lexemes — verb: לדבר; noun: גלידה; adjective: חדש. Hard allowlist expanded accordingly; validators unchanged.
  - Phase 2 expansion (2026-03-30): added 4 lexemes — verbs: לקרוא, לשמוע; noun: שיר; adjective: חכם. Allowlist updated; seed includes inflections and base/variant items.
  - RDS (prod) state — 2026-04-01: seeded 10 custom mini lexemes and items via `npx ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/seed_mini_morph.ts`.
  - Canonical intros (family_base items):
    - verb → infinitive (לכתוב)
    - noun → singular base (ספר)
    - adjective → masculine singular (גדול)
  - Variants included:
    - verb: selected present/past/future forms with pronouns
    - noun: definite singular (הספר), plural (ספרים)
    - adjective: m/f sg/pl (הוא גדול, היא גדולה, הם גדולים, הן גדולות)
  - Validation (mini only; selection-time):
    - English must be clean Latin; Hebrew must be clean Hebrew.
    - Item must link to a `lexeme_id` and the Hebrew surface (minus pronoun/ה) must exist in that lexeme's `Inflection` rows.
    - If `features.pos` present, it must match Lexeme.pos.
    - Verbs/adjectives must include a pronoun in `target_hebrew`.
    - Invalid picks are skipped and logged as `mini_morph_validation_skip`.
  - MINI_ALLOW lexeme filter now applied to ALL selection paths (feature-due, due-item, SRS). Previously only SRS was filtered, allowing non-mini items from `vocab_mini_morph_gen` to leak through.
  - English wrapper normalization: `englishFromCard()` strips any leading "How do I say:" before parsing/templating to avoid double-wrap prompts. Generators prefer `Lexeme.gloss` over `LessonItem.english_prompt`.
  - Debug: `?debug=1` adds `explain.meta` with `{ lexeme_id, family_id, pos, features }`.
  - Seed/sim/test: `scripts/seed_mini_morph.ts`, `scripts/simulate_mini_morph_session.ts`, `scripts/test_mini_morph.ts`.

Wikidata lexicon infrastructure
- Bulk seeding pipeline: `scripts/lexicon/seed_wikidata_bulk.ts` queries Wikidata by token (with Hebrew prefix stripping), ingests Lexeme + Inflection rows.
- Resumable via `scripts/out/wd_seed_state.json`; handles 429 rate limits with backoff.
- Runners: `run_wd_seed_forever.sh` (watchdog), `seed_wd_batch_once.sh` (one-shot).
- Dictionary UI: `/dictionary` (search + list) and `/dictionary/[lexemeId]` (forms + examples).

TTS volume boost
- `useTTS.ts` always sets `audio.volume = 1`. When `localStorage.ttsGain > 1`, creates a WebAudio GainNode chain (up to 3×). No AudioContext at gain=1.
- No UI slider for gain (removed). To increase loudness beyond element volume, set `localStorage.ttsGain` to 1–3 in DevTools. Native device volume remains primary control.
- Keep: the `useTTS.ts` boost. No slider.

UI changes (since 2026-03-25)
- Footer nav: 4 links (home, dict, library, profile); progress moved to profile.
- iOS/mobile: custom HebrewKeyboard hidden on touch/coarse-pointer devices; native keyboard used.
- iOS mic lifecycle: session page now cools down the mic on `visibilitychange` and `pagehide` to release iOS mic access when leaving.
- Emoji: `deriveEmojiFromFeatures()` prefers item grammatical features over prompt-parsing heuristic.
 - Intro card: only renders the English line when `intro.english` is provided by the server; removes fallback to `english_prompt` to avoid showing instruction text as a translation in Green.
 - Keyboard shortcuts: space toggles mic in free recall; Enter submits typed answers in recognition/guided; Right arrow advances after feedback.

Actual happy path (today)
- Start a drill
  - Home StartOrContinue launches a session on ‘vocab_all’ (cross-pack) or a specific pack.
  - Session creation may kick a background generation batch if generated queue is low.
  - Selection/pacing: random order ON, due mode always blend (feature+item), lexicon mode optional, adaptive pacing with end/extend offers.
- Intro → Recognition → Guided → Free recall
  - next-item returns phase and optional intro surfaces for new items (canonical forms by POS), plus optional `hints` for guided.
  - Intro card: play Hebrew, show canonical English; actions: “start practice” (marks seen) or “Known” (marks known and advances).
  - Recognition: Hebrew audio prompt; user types English; graded via englishEvaluator.
  - Guided: English prompt; user types Hebrew; graded via main evaluator.
- Free recall: English prompt; user speaks; STT → evaluator; feedback with chips; auto-resume on non-correct.
  - Session stability: initial data load is guarded against React dev double-invoke; mic recording and submit paths are de-duplicated to prevent overlapping calls; auto-resume is gated to a single re-arm.
  - Family behavior: first encounter prefers family_base; after intro, family members are selected with a simple prioritization for reasonable next steps; a spacing guard avoids 3+ consecutive picks from the same family in a session.
  - Prompt normalization: render-time English prompts strip emoji and “How do I say” wrappers; a separate emoji hint chip is derived from the original prompt text or item ID to avoid duplicates.
- Generated content
  - Two sources: rule-based generators (adjectives/verbs/nouns) and LLM pipeline (generate-drills API / background job). Mixed into cross-vocab sessions.
  - Server TTS has in-process LRU cache; client prefetches prompt/correction audio.
- Library, Progress, Retry, Vocab
  - Library filters work client-side; progress per pack and accuracy shown.
  - Progress aggregates attempts; shows “feature mastery (lowest)” across FeatureStat.
  - Retry picks recent misses grouped by lesson.
  - Vocab page is flashcards for imported vocab; drill CTA if present.
- Admin (when enabled)
  - Lexicon validation UI to sync features / set family base / set family id.
  - Attempts page lists recent attempts for inspection (page is not gated; API writes are gated).

Known debt
- Rate limiting is in-memory per instance; ineffective across multiple replicas. Consider shared store.
- TTS cache is in-process only; memory pressure possible at larger sizes.
- LLM generation pipeline and background trigger assume single-writer semantics; multiple instances could duplicate work without coordination.
// removed: stats are now per-user
 
- Minimal error surfacing: many server write paths are fire-and-forget; failures won’t block UX but reduce fidelity.
- React Strict Mode dev double-invoke is mitigated via guards; revisit if more effects are added.
- "I said it right" override button appears even when grade is `correct` (should only show for incorrect/flawed).
- Volume gain slider removed. The useTTS.ts GainNode boost remains available via `localStorage.ttsGain`.
- English evaluator strictness (he→en): present progressive vs simple present. Example: user typed "he writes" for "הוא כותב" but expected English was "he is writing" → graded incorrect. Root cause: `englishEvaluator.ts` lacks morphological normalization (no stemming; "writing" ≠ "writes"). Plan: strip "How do I say" wrappers for he→en comparisons and add light verb normalization (ing/ed/s), or accept tense‑compatible variants when `features.tense==='present'`.

Assumptions made
- Family-first intros: prefer introducing lemmas via family_base (infinitive/adjective m.sg./noun sg); then progress within family.
- Session pacing: client requests adaptive pacing; base cap via SESSION_DUE_CAP with extend/end thresholds.
- Anonymous identities: per-device UUID is sufficient for beta; no login required. Admin tools remain ungated.
- Accept typed recognition and guided phases to smooth difficulty before voice free recall.

Environment variables in use (runtime)
- DATABASE_URL, OPENAI_API_KEY
- RL_STT_PER_MIN, RL_TTS_PER_MIN, SESSION_DUE_CAP, GEN_QUEUE_THRESHOLD
- Seed-time: SEED_LEXEMES, SEED_CC, SEED_CC_PREFIX

Pointers (files)
- Contracts: Daber/lib/contracts.ts
- Next item selection: Daber/app/api/sessions/[sessionId]/next-item/route.ts
- Attempts (grading and stat updates): Daber/app/api/attempts/route.ts
- Rule generators: Daber/lib/drill/generators.ts
- LLM pipeline: Daber/lib/generation/pipeline.ts, Daber/app/api/generate-drills/route.ts
  - Fresh sentences button/route removed; background batch pipeline remains for OpenAI-backed generation.
  - Local on-the-fly module: Daber/lib/generation/local_llm.ts.
    - Scope: Only used inside the mini‑morph drill.
    - Serving path: wired in Daber/app/api/sessions/[sessionId]/next-item/route.ts for `vocab_mini_morph`.
      - On recognition/recall items, if a per‑session cache hit exists for the item’s lexeme, serve the LLM sentence instead of the static item.
      - Cache miss: serve the static item and opportunistically queue background generation.
    - Prefetch: Daber/app/api/sessions/route.ts triggers prefetch only for mini‑morph sessions via Daber/lib/minimorph/local_llm_mini.ts.
    - Old drills: LLM hooks removed from Daber/lib/drill/generators.ts; legacy selection is unchanged.
    - Dev observability: session UI shows a small "✨ generated" badge and a "Force LLM" button in development only. API responds with `llm_debug` when `debug=1` or `forceLlm=1` (dev only).
- Voice I/O: Daber/app/api/stt/route.ts, Daber/app/api/tts/route.ts; client hooks under Daber/lib/client/audio/*
- Session UI: Daber/app/session/[sessionId]/page.tsx

Canonical intros — SHIPPED (2026-03-30)
- Intro form resolution uses lexeme + inflections to render the pedagogical base form by POS:
  - verbs: infinitive (`Inflection.tense='infinitive'` when present; fallback to lemma)
  - adjectives: singular masculine (`Inflection(number='sg', gender='m')` when present)
  - nouns: singular (indefinite); compounds use `features.definite_form` when necessary
- For families without a stored base item, the API auto-creates a `family_base` LessonItem in the generated lesson (`<lesson>_gen`) on first intro, sets `family_id='lex:<lexeme_id>'`, and marks `family_base=true`. Selection prefers this base when `FamilyStat` is absent.
- English prompts for lexicon-generated items align with the Hebrew slot (present/past/future/person/number/gender). Green items no longer mix lemma glosses with conjugated Hebrew.

Simulator safety — SHIPPED (2026-03-30)
- The green session simulator no longer submits attempts for `phase: 'intro'` (marks seen only), avoiding bogus `ambiguous_transcript` grades.

Session end logging — SHIPPED (2026-03-30)
- Attempts API no longer emits `session_ended` when the base lesson has zero items (common in lexicon mode with items under `<lesson>_gen`).
- Admin tools: Daber/app/admin/*, Daber/app/api/admin/lexicon/*
 - Users dashboard: Daber/app/admin/users/page.tsx

Card-generation integrity — SHIPPED (2026-03-30)
- Pronoun fallback alignment
  - English fallback uses neutral “they”; Hebrew fallback uses 3rd‑person plural “הם”. This avoids EN/HE divergence when features are partial.
  - Where: Daber/lib/drill/generators.ts (pronounFrom, pronounHeb).
- Morphology completeness gating (generators)
  - Verbs: require tense + person + number (and gender for 2sg/3sg) before generating a card.
  - Adjectives: require number + gender.
  - Nouns: require number.
  - Incomplete inflections are skipped when selecting forms for generated items.
  - Where: Daber/lib/drill/generators.ts (isCompleteVerbInf/isCompleteAdjInf/isCompleteNounInf).
- Validation gate for generated items
  - Generated cards are validated for script correctness, POS/features coherence, and pronoun presence (verbs/adjectives). Inconsistent items are skipped.
  - Where: Daber/lib/drill/generators.ts (validateGenerated).
- English source of truth for generators
  - Generators now prefer `Lexeme.gloss` for English prompts across paths; fall back to sanitized item English only when needed. Wrapper text ("How do I say:") is stripped before composition to prevent garbled prompts.
  - Where: Daber/lib/drill/generators.ts (englishFromCard / prompt builders).
- Noun pool cleanup
  - Possessive-suffixed noun forms (e.g., ״…ך", ״…יהם") are filtered from candidate pools for generated items to avoid unnatural targets.
  - Where: Daber/lib/drill/generators.ts (noun candidate filters).
- CC family linking hardened (lemma+POS)
  - Family IDs for CC imports now include POS: `lemma:<lemma>|pos:<pos>` and only link for {verb|noun|adjective}. Prevents cross‑POS contamination (e.g., verb form grouped under noun lemma).
  - Where: scripts/apply_cc_family_links.ts (consumes tags from scripts/tag_cc_families.ts).
- Inflection normalization improvement
  - Plural adjective gender inferred by suffix (ים → m, ות → f) to improve feature completeness.
  - Where: scripts/lexicon/normalize_inflections.ts.

Operational notes (post‑deploy)

Fixes — 2026-04-03
- Mini Morph TTS fallback
  - What: When `/api/tts` fails (any error), the UI disables the play button, shows a small “Audio unavailable” indicator, and renders the Hebrew text so the card remains usable. Recognition prompt copies update to “Translate to English” to avoid implying audio.
  - Where: Daber/app/session/[sessionId]/page.tsx (prefetch-based `ttsAvailable` state; disabled `AudioPlayButton`). Daber/lib/client/audio/useTTS.ts (`prefetch` returns boolean). Daber/lib/client/audio/useAudioCoordinator.ts (propagates `prefetch` boolean). Daber/app/components/AudioPlayButton.tsx (disabled state + muted icon).
  - Why: OpenAI TTS outages/credits caused silent failures with a clickable play button. Now failure is explicit and cards are still dismissible.
- Redundant audio visualizer removed
  - What: Recognition view no longer shows a second, separate waveform beside the play button. Only the play button morphs into the single AV while playing.
  - Where: Daber/app/session/[sessionId]/page.tsx (StatusStrip in recognition no longer mirrors TTS waveform).
  - Why: Avoid duplicate AV elements and confusing UX.

Fixes — 2026-03-31
- Hebrew 3pl feminine pronoun
  - What: Present-tense 3pl feminine now uses ״הן״ (not ״הם״) when gender is known.
  - Where: Daber/lib/drill/generators.ts (`pronounHeb`); scripts/expand_mini_from_green.ts (`hePron`); scripts/seed_mini_morph.ts (`hePron`).
- Noun emoji guard
  - What: Person emojis are suppressed for nouns and items without POS; verbs/adjectives unchanged.
  - Where: Daber/app/session/[sessionId]/page.tsx (`deriveEmojiFromFeatures`).
- Mini expansion noun possessive filter
  - What: Filters possessive-suffixed forms from noun sg/pl selection. Regex expanded to include bare ו ("his"). Added allowlist for rare nouns whose base ends with a bare ו; logs warnings for manual review.
  - Where: scripts/expand_mini_from_green.ts (`isPossessiveSuffix`, `endsWithBareVav`, `NOUN_BARE_VAV_ALLOWLIST`, `buildNounGrid`).
- Adjective m.sg sanity
  - What: Prefer m.sg forms that don’t look feminine; skip if only feminine-looking candidates exist; logs a warning.
  - Where: scripts/expand_mini_from_green.ts (`buildAdjGrid`).
- Verb grid diagnostics
  - What: Skip reasons for past/future now include the specific missing cells.
  - Where: scripts/expand_mini_from_green.ts (`buildVerbGrid`).

Local LLM prompt/whitelist — 2026-04-01
- Prompt context now includes a fixed core pack of high‑value lemmas (verbs/nouns/adjectives Mike knows) alongside targets and a small random sample of user‑known lemmas, capped ~45. Where: Daber/lib/generation/local_llm.ts (`CORE_PROMPT_LEMMAS`, `buildBatchPrompt`).
- Whitelist now includes current batch targets in addition to user‑known lemmas so new targets don’t self‑block validation. Where: Daber/lib/generation/local_llm.ts (`generateBatch`).

- DB snapshot (RDS) — 2026-04-01
- Top lessons (items): `vocab_green_gen` (194), `vocab_mini_morph` (250), `vocab_all_gen` (140), `user_vocab_01` (110), CC lessons ~23–30.
- Lexeme total: 468.

Design docs added
- Verb governance (verbs → complements)
  - File: docs/VERB_GOVERNANCE_DESIGN.md
  - Status: DESIGN ONLY — no code changes. Proposes `Lexeme.verb_governance Json?` with frames for את/ב/ל/על/עם/מ/אל/none, transitivity, and optional Hebrew frame strings (e.g., "חושב על ___"). Includes 10 sample verbs and a population strategy (manual first, LLM‑assist with validation later). UI proposal: show marker in parentheses on intro cards (e.g., "לאהוב (את)") and add a governance block to dictionary pages; add a one‑time hint for beginners that את marks definite direct objects.

Verb governance — SHIPPED (2026-03-31)
- Schema: added `Lexeme.verb_governance Json?` (Prisma). Migration created; apply with `npx prisma migrate dev --name add_verb_governance` and regenerate client.
- Seed script: `scripts/seed_verb_governance.ts`; npm: `npm run seed:governance`. Hard‑codes representative verbs; idempotent overwrite; logs updated vs missing lemmas.
  - Coverage expanded to include all lesson verbs in `Daber/data/lessons` (as of present_tense_basics_01): added `להשתפר`, `ללמוד`.
- Intro display: `buildIntroFor()` appends parenthetical primary marker for verbs with governance (e.g., "לאהוב (את)", "לחשוב (על)"). No beginner hint for את yet; dictionary UI unchanged.
- Normalize inflections for existing data:
  - `DATABASE_URL=… npx ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/lexicon/normalize_inflections.ts`
- Re‑tag and apply CC family links:
  - `npx ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/tag_cc_families.ts --out cc_family_tags.json`
  - `npx ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/apply_cc_family_links.ts --in cc_family_tags.json`

DB indexes — SHIPPED (2026-03-30)
- Added indexes to speed due/feature queries:
  - ItemStat(user_id, next_due)
  - FeatureStat(user_id, next_due)
  - FeatureStat(user_id, pos, tense, person, number, gender)

Selection blend default — SHIPPED (2026-03-30)
- Server defaults `due=blend` when unspecified, attempting FeatureStat-driven picks first, then falling back to ItemStat due.
- Where: Daber/app/api/sessions/[sessionId]/next-item/route.ts (dueMode default = 'blend').
- LOCAL_LLM_ENABLED / LOCAL_LLM_URL / LOCAL_LLM_MODEL
  - Where: Daber/lib/generation/local_llm.ts, Daber/lib/drill/generators.ts, Daber/app/api/sessions/route.ts
  - What: Enables on-the-fly local LLM generation via Ollama. URL and model configurable (defaults: http://127.0.0.1:11434, dicta17-q4).
  - Why: Offline, low-latency generation on RTX 4050 laptop.
  - Keep or kill: Keep; kill switch defaults off.
