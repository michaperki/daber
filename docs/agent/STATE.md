# STATE.md — What’s Actually Built (Daber)

Role: Honest, always-current snapshot of the running codebase. Descriptive, not aspirational.

Last reviewed: 2026-03-30 (card-generation integrity)

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
- CC family linking hardened (lemma+POS)
  - Family IDs for CC imports now include POS: `lemma:<lemma>|pos:<pos>` and only link for {verb|noun|adjective}. Prevents cross‑POS contamination (e.g., verb form grouped under noun lemma).
  - Where: scripts/apply_cc_family_links.ts (consumes tags from scripts/tag_cc_families.ts).
- Inflection normalization improvement
  - Plural adjective gender inferred by suffix (ים → m, ות → f) to improve feature completeness.
  - Where: scripts/lexicon/normalize_inflections.ts.

Operational notes (post‑deploy)
- Normalize inflections for existing data:
  - `DATABASE_URL=… npx ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/lexicon/normalize_inflections.ts`
- Re‑tag and apply CC family links:
  - `npx ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/tag_cc_families.ts --out cc_family_tags.json`
  - `npx ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/apply_cc_family_links.ts --in cc_family_tags.json`
