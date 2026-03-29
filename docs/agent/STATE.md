# STATE.md — What’s Actually Built (Daber)

Role: Honest, always-current snapshot of the running codebase. Descriptive, not aspirational.

Last reviewed: 2026-03-29

—

Temporary scaffolding and feature flags
- RL_STT_PER_MIN / RL_TTS_PER_MIN
  - Where: Daber/app/api/stt/route.ts, Daber/app/api/tts/route.ts
  - What: In‑process per‑IP token bucket rate limits.
  - Why: Prevents accidental hammering during dev.
  - Keep or kill: Temporary for single-instance; replace with shared store if scaling.
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
- SEED_LEXEMES / SEED_CC / SEED_CC_PREFIX
  - Where: Daber/prisma/seed.ts
  - What: Data seeding toggles (structured lexicon, Citizen Cafe imports).
  - Why: Developer bootstrap.
  - Keep or kill: Keep as seed-time flags only.

Debug/dev-only endpoints and tools
- /api/sessions/[id]/next-item?debug=1
  - Adds explain payload (selection path, pools) in response; used by scripts/simulate_vocab_session.ts.
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
 
- Global vs per-user stats
  - ItemStat, FeatureStat, FamilyStat are global, not per user. user_id exists on Session but is unused across stats.
  - Intentional simplification for single-user; will need scoping later.

New content assemblies
- Green vocab drill
  - Curated allowlist of ~88 Wikidata lexemes (`Daber/data/green_lexemes.json`).
  - Session via lesson_id `vocab_green`; home page has "start green drill" button.
  - Listen-only prompts — no auto-generated English. Generator checks `isGreen` flag.
  - Supports Wikidata POS Q-ids (e.g. `Q24905`) in addition to plain POS strings.
- Song packs
  - Ma Na'aseh (Hadag Nahash) chorus lesson at `/songs/ma-naaseh`.
  - Bootstrap API creates lesson (`song_ma_naaseh_chorus_v1`, type `song`) + 12 items on first access.
  - Plan: expand to verse chunks.

Wikidata lexicon infrastructure
- Bulk seeding pipeline: `scripts/lexicon/seed_wikidata_bulk.ts` queries Wikidata by token (with Hebrew prefix stripping), ingests Lexeme + Inflection rows.
- Resumable via `scripts/out/wd_seed_state.json`; handles 429 rate limits with backoff.
- Runners: `run_wd_seed_forever.sh` (watchdog), `seed_wd_batch_once.sh` (one-shot).
- Dictionary UI: `/dictionary` (search + list) and `/dictionary/[lexemeId]` (forms + examples).

TTS volume boost
- `useTTS.ts` always sets `audio.volume = 1`. When `localStorage.ttsGain > 1`, creates a WebAudio GainNode chain (up to 3×). No AudioContext at gain=1.
- Settings slider for ttsGain exists in `SettingsCard.tsx` but is marked for removal — redundant with native volume; the boost tool is sufficient.
- Keep or kill: kill the slider (revert 873e746); keep the useTTS.ts boost.

UI changes (since 2026-03-25)
- Footer nav: 4 links (home, dict, library, profile); progress moved to profile.
- iOS/mobile: custom HebrewKeyboard hidden on touch/coarse-pointer devices; native keyboard used.
- Emoji: `deriveEmojiFromFeatures()` prefers item grammatical features over prompt-parsing heuristic.

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
- Stats are global (not per user). Acceptable for current single-user use; will need scoping before multi-user.
 
- Minimal error surfacing: many server write paths are fire-and-forget; failures won’t block UX but reduce fidelity.
- React Strict Mode dev double-invoke is mitigated via guards; revisit if more effects are added.
- "I said it right" override button appears even when grade is `correct` (should only show for incorrect/flawed).
- Volume slider in settings (873e746) is redundant; to be reverted. The useTTS.ts GainNode boost (0633388) is sufficient.

Assumptions made
- Family-first intros: prefer introducing lemmas via family_base (infinitive/adjective m.sg./noun sg); then progress within family.
- Session pacing: client requests adaptive pacing; base cap via SESSION_DUE_CAP with extend/end thresholds.
- Single-user environment: global FeatureStat/ItemStat are acceptable; admin tools currently have no auth. **Under review**: people are organically trying the app. Need to decide on profiles/identity before stats collide.
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
- Voice I/O: Daber/app/api/stt/route.ts, Daber/app/api/tts/route.ts; client hooks under Daber/lib/client/audio/*
- Session UI: Daber/app/session/[sessionId]/page.tsx
- Admin tools: Daber/app/admin/*, Daber/app/api/admin/lexicon/*
