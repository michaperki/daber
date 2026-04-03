**LLM Vocab Context Strategy — Mini Morph**

Updated: 2026-04-01

—

**Scope**
- Audit how Mini Morph builds/sends “known vocab” to the local LLM and validates outputs.
- Quantify current lexeme coverage and mini allowlist scale.
- Evaluate options to provide better vocab context within a small context window (dicta17‑q4 via Ollama).
- Recommend a pragmatic near‑term strategy to get reliable, natural sentences for Mike ASAP.

—

**A. Current State Audit**

- What getUserVocabScopeForLexemeSet returns
  - Returns `{ knownLemmas, allowedTenses }` for a given user limited to an allowlist of lexeme IDs.
  - Resolution path:
    - Collect user `ItemStat` rows → resolve to `LessonItem` linked to a `lexeme_id` within the allowlist → fetch those `Lexeme.lemma` values → de‑dup and strip niqqud.
    - Tense permissions: start with `present`; add `past`/`future` if user has any `FeatureStat` rows with those tenses.
  - Code: `Daber/lib/generation/local_llm.ts:64` (function head)…`:79` (return).

- What the LLM prompt receives as “known vocab”
  - Prompt construction mixes target lemmas with a random sample of known lemmas to a cap of ~45 total entries.
    - Targets: deduped `targetLemmas`.
    - Context: random sampling from `knownLemmas` excluding targets; then `targets ∪ sample` is stringified into “Provided lemmas (targets + context): …”.
    - Fixed instructions include: “use only from the provided lemmas plus basic function words,” “no nikkud,” “mark את with definite DO,” and a JSON schema for items.
    - Code: `Daber/lib/generation/local_llm.ts:82`…`:108` (buildBatchPrompt); used in `generateBatch` at `Daber/lib/generation/local_llm.ts:125`.

- What the validator enforces (post‑LLM)
  - Script sanity: Hebrew only in `hebrew`, Latin only in `english`.
  - Target presence: at least one inflected form from the target lexeme must appear in the Hebrew string.
  - Governance: if verb governance requires a preposition, ensure the marker is present (maps through `PREP_DISPLAY_MAP`).
  - Tense gate: reject items containing forms that match disallowed tenses (user hasn’t unlocked) for the target lexeme.
  - Vocab whitelist: every token must be either a known lemma’s inflection or a function word (with common prefix handling ה/ו/ב/ל/מ/כ/ש). The whitelist is built from `knownLemmas` only plus a built‑in function‑word allowlist.
    - Code: whitelist assembly `Daber/lib/generation/local_llm.ts:201`…`:211`; token check `Daber/lib/generation/local_llm.ts:228`…`:241` (passesWhitelist); applied at `Daber/lib/generation/local_llm.ts:191`.

- Counts and scale (observed)
  - Mini allowlist size: 50 IDs today (10 custom `mini_*` + 40 Wikidata IDs). Source: `Daber/data/mini_allowlist.json`.
  - Mini custom lexemes (seeded): 10
    - Verbs: לכתוב (mini_lex_write), לדבר (mini_lex_speak), לקרוא (mini_lex_read), לשמוע (mini_lex_hear)
    - Nouns: ספר (mini_lex_book), גלידה (mini_lex_icecream), שיר (mini_lex_song)
    - Adjectives: גדול (mini_lex_big), חדש (mini_lex_new), חכם (mini_lex_smart)
    - Source: `scripts/seed_mini_morph.ts`.
  - Green lexemes: ~82 curated Wikidata lexemes with glosses. Source of truth: `Daber/data/green_lexemes.json` (IDs), `Daber/data/green_glosses.json` (pos + gloss); noted in `docs/agent/STATE.md`.
  - Lesson item scale: prior audit shows 2,936 LessonItems total; only 78 are lexeme‑linked (majority are phrases). Source: `docs/DB_AUDIT.md`.
  - RDS (prod) counts — 2026‑04‑01:
    - Top lessons: `vocab_green_gen` (194), `vocab_mini_morph` (153), `vocab_all_gen` (140), `user_vocab_01` (110), CC lessons ~23–30.
    - Total `Lexeme`: 468.
    - Mini lexemes present: 10 (mini_lex_write/book/big/speak/icecream/new/read/hear/song/smart).

- Likely failure mode today (Mini Morph local LLM)
  - When a user has little/no history inside the mini allowlist, `knownLemmas` is empty → the whitelist contains only function words (plus zero inflections) → any sentence containing the target word (or any content noun) is rejected by `passesWhitelist`.
  - Even with some history, `knownLemmas` tends to be small; the random sample into the prompt is thin, and validator still rejects natural nouns/adjectives not in the whitelist.
  - Net effect: `generateBatch` frequently returns zero validated items even when the LLM produces plausible sentences. The combined gates (tense + governance + whitelist) exacerbate this.
  - Code alignment for this behavior: whitelist from known only (`Daber/lib/generation/local_llm.ts:201`…`:211`), check at `:191`.

—

**B. Options Analysis — Supplying Vocab Context**

- Full dump of all known lemmas
  - Idea: include every lemma the user “knows” (non‑mini) in the prompt.
  - Token cost: high at scale (hundreds to thousands of lemmas). With a 1k context, you’ll quickly crowd out instructions and model headroom.
  - Accuracy: high ceiling — the LLM has a large buffet of safe words; naturalness improves.
  - Effort: low (change sampling to full set), but may require splitting across batches/continuations for larger users.
  - Risks: overlong prompts on small models degrade output and latency; randomness still needed to avoid repetition.

- Frequency‑tiered sampling (recommended core + random remainder)
  - Idea: always include a fixed small “core pack” of high‑value words (pronouns already allowed; add core nouns/adjectives/common verbs) + randomly sample N more from user‑known lemmas; cap total ~45.
  - Token cost: modest and predictable (stable ~45 lemmas). Works within 1k context comfortably.
  - Accuracy: good balance — the model can build natural frames with common nouns/adj while staying in‑bounds.
  - Effort: low/medium — add a static core list and adjust the sampling logic; optional per‑category quotas (e.g., 10 nouns, 5 adjectives, 10 verbs, rest random).
  - Suggested N: 10–20 from the user set, keeping total ≤45 (e.g., 25 core + 10–15 random + 5–10 targets).

- Category summaries (meta hints instead of word list)
  - Idea: tell the model “user knows basic pronouns, prepositions, colors, numbers, common verbs,” without listing words.
  - Token cost: minimal.
  - Accuracy: weak — small local models don’t reliably self‑constrain to unseen lexicon from category hints; drift risk high; whitelist will then reject many outputs.
  - Effort: very low, but impact likely poor for Hebrew morphology targets.

- Expand Mini Morph lexeme set (add content anchors)
  - Idea: fold 30–50 foundational, single‑token lexemes (esp. nouns/adjectives) from earlier color levels directly into Mini Morph so items and user history naturally populate `knownLemmas` and the whitelist.
  - Token cost: neutral (affects data, not prompt length).
  - Accuracy: improves naturalness; gives the generator sensible content words to combine with verb targets.
  - Effort: medium — choose candidates with glosses, ensure inflection coverage; seed base items; update allowlist.
  - Note: Function words are already allowed globally; value comes from content words that improve sentence plausibility.

- Hybrid (core pack + sampling + targeted expansion)
  - Idea: combine a fixed high‑frequency core list in the prompt, random sampling from user‑known lemmas, and a gradual expansion of Mini Morph with 20–30 content lexemes from Green.
  - Token cost: modest.
  - Accuracy: best near‑term tradeoff; both prompt and data help the LLM stay in‑bounds and sound natural.
  - Effort: medium; staged rollout possible.

—

**C. Recommendation**

- Near‑term (today): Frequency‑tiered sampling + whitelist inclusion of targets (DONE)
  - Prompt context:
    - Always include target lemmas.
    - Add a fixed “core pack” of ~25 high‑value content lemmas Mike already knows (single‑token nouns/adjectives/common verbs; pronouns are already globally allowed).
    - Sample 10–15 more lemmas from the user’s known set (biased toward the current lesson color or recent items if desired) to reach ~45 total entries.
    - Keep temperature low (0.2), `num_ctx` ~1024; stick to `he_to_en` initially for Hebrew output quality.
  - Validation tweak (code): include target lexeme forms in the whitelist for the current batch to prevent self‑rejection when the target isn’t in `knownLemmas`. This preserves the guardrails while unblocking new targets.
    - Where to change: replace whitelist seed with `known ∪ targets` forms before `passesWhitelist` in `generateBatch` (`Daber/lib/generation/local_llm.ts:156`…`:191`).
  - Why this first: single user, small local model, and we need reliable output now. This keeps token budget steady and dramatically reduces drop‑to‑zero batches.

- Short‑term (this week): Targeted Mini expansion (20–30 items)
  - Add a handful of high‑yield content lexemes (esp. nouns/adjectives) into Mini Morph sourced from the Green set (single‑token; Latin gloss present; inflections complete). Seed base + sg/pl (nouns) and m.sg/f.sg/m.pl/f.pl (adjectives), and a few simple present‑tense verb frames.
  - This organically grows `knownLemmas`, improving both prompts and whitelist coverage.

- Defer category summaries: not recommended as a primary constraint mechanism for small Hebrew models; use only as adjunct metadata if needed.

—

**D. (Optional) Starter core pack for prompts**

If we adopt the recommended plan, here is a concrete 30‑lemma “core pack” to include in prompts (ids/lemmas/glosses use existing Mini or obvious single‑token Green‑level vocabulary Mike knows). These are content anchors; pronouns/prepositions remain globally allowed.

- Verbs (10)
  - mini_lex_write — לכתוב — verb — to write
  - mini_lex_speak — לדבר — verb — to speak
  - mini_lex_read — לקרוא — verb — to read
  - mini_lex_hear — לשמוע — verb — to hear
  - lex: לאהוב — verb — to love (Green)
  - lex: ללכת — verb — to go (Green)
  - lex: לעשות — verb — to do/make (Green)
  - lex: לרצות — verb — to want (Green)
  - lex: לראות — verb — to see (Green)
  - lex: לקנות — verb — to buy (Green)

- Nouns (12)
  - mini_lex_book — ספר — noun — book
  - mini_lex_icecream — גלידה — noun — ice cream
  - mini_lex_song — שיר — noun — song
  - lex: בית — noun — house/home (Green)
  - lex: זמן — noun — time (Green)
  - lex: כסף — noun — money (Green)
  - lex: מים — noun — water (Green)
  - lex: עבודה — noun — work/job (Green)
  - lex: חנות — noun — store (Green)
  - lex: עיר — noun — city (Green)
  - lex: רחוב — noun — street (Green)
  - lex: חבר — noun — friend (m.) (Green)

- Adjectives (8)
  - mini_lex_big — גדול — adjective — big
  - mini_lex_new — חדש — adjective — new
  - mini_lex_smart — חכם — adjective — smart
  - lex: יפה — adjective — beautiful (Green)
  - lex: קטן — adjective — small (Green)
  - lex: טוב — adjective — good (Green)
  - lex: קשה — adjective — hard/difficult (Green)
  - lex: יקר — adjective — expensive (Green)

Notes
- “lex:” entries reference existing Green‑level single‑token vocabulary known from current content; specific DB IDs (e.g., `wd:L…`) are available under `Daber/data/green_lexemes.json` and `Daber/data/green_glosses.json`.
- This pack is for prompt inclusion only; Mini data expansion can adopt a similar set gradually.

—

**Appendix — Pointers and File References**

- getUserVocabScopeForLexemeSet: `Daber/lib/generation/local_llm.ts:64`
- buildBatchPrompt: `Daber/lib/generation/local_llm.ts:82`
- generateBatch (prompt + validation pipeline): `Daber/lib/generation/local_llm.ts:114`
- Tense filter and governance checks: `Daber/lib/generation/local_llm.ts:170`
- Whitelist assembly: `Daber/lib/generation/local_llm.ts:201`
- passesWhitelist: `Daber/lib/generation/local_llm.ts:228`
- Mini integration (cache + batch): `Daber/lib/minimorph/local_llm_mini.ts:96`
- Mini allowlist (current): `Daber/data/mini_allowlist.json:1`
- Green lexeme set and glosses: `Daber/data/green_lexemes.json:1`, `Daber/data/green_glosses.json:1`
- Seeded Mini lexemes and items: `scripts/seed_mini_morph.ts:1`

—

**Next Steps (execution checklist)**
- Implement prompt core‑pack + sampling (cap ~45); seed with the 30 items above.
- In `generateBatch`, build whitelist from `known ∪ targets` to avoid self‑blocking new targets.
- Run a 50‑target mini smoke test (present tense only) and record `valid_count / batch_size` and common rejection reasons.
- If drop rate remains high, increase core nouns/adjectives by +10 and bias sampling toward user’s recent lesson.
