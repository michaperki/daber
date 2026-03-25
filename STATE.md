# STATE.md — What’s Actually Built (Daber)

Role: Honest, always-current snapshot of the running codebase. Descriptive, not aspirational.

Last reviewed: 2026-03-25 (simplified settings)

—

Temporary scaffolding and feature flags
- ADMIN_ENABLED
  - Where: Daber/app/api/admin/lexicon/*, Daber/app/admin/*
  - What: Gates admin tools (validate/sync family links, quick fixes, attempts view).
  - Why: Quick protection for dev-only endpoints and pages.
  - Keep or kill: Temporary. Replace with real auth when users exist.
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
- Admin lexicon tools (all require ADMIN_ENABLED=1)
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

Assumptions made
- Family-first intros: prefer introducing lemmas via family_base (infinitive/adjective m.sg./noun sg); then progress within family.
- Session pacing: client requests adaptive pacing; base cap via SESSION_DUE_CAP with extend/end thresholds.
- Single-user environment: global FeatureStat/ItemStat are acceptable; ADMIN_ENABLED gates admin instead of auth.
- Accept typed recognition and guided phases to smooth difficulty before voice free recall.

Environment variables in use (runtime)
- DATABASE_URL, OPENAI_API_KEY
- ADMIN_ENABLED, RL_STT_PER_MIN, RL_TTS_PER_MIN, SESSION_DUE_CAP, GEN_QUEUE_THRESHOLD
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
