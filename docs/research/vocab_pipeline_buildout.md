Mini Morph — Full Vocab Pipeline Buildout

Updated: 2026-04-03

—

Summary
- Mini Morph is the primary drill. Today it knows ~50 lexemes (10 custom + ~40 Wikidata) scoped via `Daber/data/mini_allowlist.json:1`.
- Earlier color levels (Red/Orange/Green) exist as imported lessons, mostly phrase-only items without lexeme links. Green has the cleanest lexeme coverage.
- Goal: make all earlier vocab available to Mini Morph; treat it as already studied; allow the LLM to use any of it when generating.

—

A. Current Vocab Inventory (updated with Phase 1 scope)

- Counts (RDS, prod snapshot)
  - Lessons by size (top): `vocab_mini_morph` (250 items), `vocab_green_gen` (194), `vocab_all_gen` (140), `user_vocab_01` (110). Source: DB query.
  - Total Lexeme: 475. Total Inflection: 7,513. Source: DB query.
  - Phrase-only LessonItems (no lexeme_id): 2,751. Source: DB query.

- Lexemes per level (distinct lexeme_id linked in lessons)
  - Red: 27
  - Orange: 25
  - Green: 74
  - Mini (lesson ‘vocab_mini_morph’): 50

- With “complete data” (lemma + gloss + pos + ≥1 inflection)
  - Red: 9
  - Orange: 3
  - Green: 52
  - Mini lesson: 50

- Mini overlap with earlier levels (distinct intersections by lexeme_id)
  - Mini ∩ Red: 4
  - Mini ∩ Orange: 3
  - Mini ∩ Green: 23

Notes
- Queries run with `psql` against the provided RDS URL; raw outputs archived locally during this analysis. File pointers: schema `Daber/prisma/schema.prisma:1`, mini allowlist `Daber/data/mini_allowlist.json:1`.
- POS distribution includes Wikidata Q‑IDs (e.g., `Q1084`, `Q24905`), plus plain tags like `noun`, `verb`, `adjective`; see `SELECT pos, COUNT(*) …` results.

—

B. What “Importing Earlier Vocab” Means

- Source formats by level
  - Green
    - Structured: curated lexeme set `Daber/data/green_lexemes.json:1` + `Daber/data/green_glosses.json:1` (POS + gloss). Good coverage; many linked into `vocab_green_gen`.
  - Also present as CC imports (`cc_practicetogo_green_*`, `cc_flashcards_*`) with item‑level strings and metadata (audio URLs), not lexeme-structured.
  - Best candidate for bulk Lexeme + Inflection correctness.
  - Red/Orange (and Blue/Yellow/Lime)
    - Present as CC imports in `Daber/data/imports/*.json` (e.g., `cc_vocab_red_l0.json`, `cc_vocab_orange_l11.json`). Items are phrase strings with metadata; not lexeme-structured.
    - Many items are multi-word phrases/sentences; not ideal direct lexeme candidates.

- Transform to Lexeme + Inflection
  - Identify single‑token vocabulary candidates from CC imports (filter out long phrases; prefer nouns/adjectives/verbs appearing frequently; use heuristics for “clean” forms).
  - Normalize tokens (strip nikud, punctuation; handle prefix articles ו/ה/ב/ל/מ/כ/ש when present in phrases).
  - Lookup or create Lexeme rows by lemma + POS; preferred path is Wikidata reconciliation (existing pipeline used for Green). Where an exact Wikidata lexeme exists, import gloss/POS and inflections; otherwise fall back to manual/curated entries.
  - Generate/minimize Inflection rows from Wikidata; de-duplicate by (form, tense, person, number, gender, binyan) + optional voice in `features`. See normalization patterns in scripts and schema in `Daber/prisma/schema.prisma:1`.
  - Link LessonItems to Lexeme by matching `target_hebrew` against imported `Inflection.form` or `lemma` (exact string, no nikud).

- Clean vs. messy levels
  - Clean now: Green (curated set; many lexemes already with glosses + inflections; `vocab_green_gen` links 167 items to lexemes).
  - Needs parsing/reconciliation: Red/Orange (and friends) — CC imports are phrase-centric; must filter/parse into lexeme candidates, then reconcile.
  - Manual curation remains for ambiguous cases (homographs, idioms, multi-word verbs with prepositions).

- Effort estimate (data counts observed)
  - Likely lexeme candidates from earlier colors: ~50–100 high‑frequency nouns/adjectives/verbs across Red/Orange.
  - Expect ~50–70% to map cleanly via Wikidata; ~30–50% require manual review/curation due to polysemy/forms.
  - Inflection backfill via existing Wikidata pipeline (already used for Green); idempotent scripts can be adapted.

—

C. Making Mini Morph the Single Drill

- Deprecate other drills
  - Hide/start buttons for legacy drills; keep content for reference but route primary CTA to Mini.
  - Selection remains in `/api/sessions/[id]/next-item` (blend mode); keep LLM hooks for Mini only. References: `Daber/app/session/[sessionId]/page.tsx:1`, next-item route.

- Treat earlier vocab as “already studied”
  - Strategy: seed stats rather than modify core drill logic.
    - For each imported lexeme family, create a `family_base` LessonItem if missing (auto-created today for generated lessons) and insert a `FamilyStat` row to mark introduced.
    - For each linked LessonItem form, insert `ItemStat` rows per user with `correct_streak >= 3` (or phase threshold) and `next_due` spaced out to land in free recall. See `Daber/prisma/schema.prisma:1` for `ItemStat`/`FamilyStat` keys.
  - Alternative: drill-time skips
    - Adjust server selection to skip intro for families with any `FamilyStat` row. This is effectively what the base-family intro logic already does in lexicon mode.

- LLM generation pipeline changes
  - Expand Mini allowlist to include the full set of imported lexemes once reconciled (not just Green + 10 mini). Current allowlist: 50 (`Daber/data/mini_allowlist.json:1`).
  - `getUserVocabScopeForLexemeSet` builds `knownLemmas` from `ItemStat` within an allowlist and adds tense permissions from `FeatureStat` (present/past/future). File: `Daber/lib/generation/local_llm.ts:64`.
  - Whitelist bottleneck: with a larger allowlist and seeded `ItemStat`, the whitelist will include many more lemmas → validator admits natural nouns/adjectives. Recent change also includes current targets in whitelist to avoid self‑blocking.
  - Prompt: keep core-pack + sampled known lemmas, capped (~45), as documented in `docs/research/llm_vocab_context_strategy.md`.

—

D. Scope Estimate and Plan

- Small (days)
  - Expand Mini allowlist with existing clean Green lexemes (already partially done).
  - Link more LessonItems to existing Lexeme rows where exact form matches exist.
  - Seed per-user `FamilyStat`/`ItemStat` for Green lexemes to set “already known” state.

- Medium (1–2 weeks)
  - Parse CC imports for Red/Orange to extract clean single‑token candidates; reconcile against Wikidata; create Lexeme + Inflection rows.
  - Seed user stats for imported families/items to place them in free recall.
  - Update allowlist to include reconciled lexemes; rerun Mini LLM smoke tests; adjust prompt/whitelist biasing as needed.

- Large (weeks+)
  - Rebuild the vocabulary pipeline end‑to‑end with new sources (e.g., full Wikidata harvest, additional dictionaries, better gloss curation with governance), cross‑lesson dedupe, and richer family governance.
  - Add admin review UIs and background jobs for continuous ingestion.

Recommended phased approach
1) Start Small: lock in Green coverage (allowlist + stats seed). Validate Mini sessions feel rich and natural with broader whitelist.
2) Medium: import Red/Orange lexemes via reconciliation and seed stats. Prioritize high-frequency lemma families (verbs/nouns/adjectives) that improve sentence naturalness.
3) Iterate: monitor LLM validation accept rates; adjust core-pack and whitelist bias. Expand to additional colors incrementally.
4) Consider Large: only after Mini with full early vocab runs smoothly and there’s appetite for broader ingestion.

—

Appendix — Raw Query Results (highlights)
- Lesson scale (top 10): `vocab_mini_morph|250`, `vocab_green_gen|194`, `vocab_all_gen|140`, `user_vocab_01|110`, then CC lessons 23–30.
- Lexeme total: 475; Inflection total: 7,513; Phrase-only items: 2,751.
- Lexeme by level (distinct, linked): Red 27 | Orange 25 | Green 74 | Mini lesson 50.
- Complete-data lexemes by level: Red 9 | Orange 3 | Green 52 | Mini lesson 50.
- Overlap: Mini∩Red 4 | Mini∩Orange 3 | Mini∩Green 23.

—

Phase 2 — Implementation Plan (past levels only; Green is current)

Light Blue dataset (provided locally; not yet in DB)
- File: vocab/light_blue.json
- Structure: array of items with fields
  - id (number), lesson (string), level="Light Blue", english_text, hebrew_text, subject, segment, audio_text
- Quick inventory (local parse)
  - Items: 308 total
  - Single-token hebrew_text (no spaces): 14 unique
  - Single-token forms matching existing DB Inflection by exact form: ~1 (סודות)
  - Implication: most items are phrases; lexeme extraction requires tokenization + reconciliation

Light Blue import plan
- Stage A: direct single-token items
  - Normalize hebrew_text (trim, strip nikud if present)
  - For the 14 single-token candidates:
    - Attempt Lexeme match by exact lemma; else Inflection match by form
    - On hit: collect lexeme_id; on miss: enqueue for Wikidata lookup
  - Seed any missing Lexeme rows and 1+ Inflections via Wikidata
- Stage B: phrase token extraction (expand coverage)
  - Tokenize phrases on whitespace and modest punctuation; strip common prefixes (ו/ה/ב/ל/מ/כ/ש)
  - Filter tokens to likely vocabulary (length≥3, not pronouns/prepositions/particles already allowed by function-word list)
  - Attempt DB match (Inflection.form or Lexeme.lemma)
  - For misses, run Wikidata lexeme search; manually curate ambiguous cases
- Stage C: link + allowlist + known-stats
  - For every resolved lexeme_id:
    - Ensure Lexeme.gloss/POS populated; seed Inflection rows from Wikidata
    - Add to Mini allowlist (merge once per lexeme_id; keep custom mini lexemes)
    - Seed FamilyStat(family_id = `lex:<lexeme_id>`, user_id=Mike’s UUID)
    - Seed ItemStat per resolved family base and forms (correct_streak high enough for recall; next_due spaced)
  - Do NOT seed Green — keep as current level with normal intros

Early import order across past levels
- Start with Blue → Orange → Red based on token coverage and existing matches observed in DB (cleaner)
- Then Pink → Yellow → Lime (lower direct coverage; expect more reconciliation)
- Weave in Light Blue (this file) alongside Pink/Yellow after Stage A (single tokens) lands, then proceed with phrase token extraction for broader coverage.

Seeding details (per-user; no code yet)
- FamilyStat
  - family_id: `lex:<lexeme_id>`; user_id: Mike’s UUID (from `daber.uid` on device)
- ItemStat
  - For each linked LessonItem (when present) or for generated base+forms in `<lesson>_gen`:
    - Set `correct_streak` to threshold that maps to recall; set `next_due` into the future to avoid immediate re-intros
  - Alternative: add a server-side skip-intro guard when FamilyStat exists (already supported by current intro logic)

Allowlist growth notes
- `Daber/data/mini_allowlist.json` will grow substantially. Keep it deterministic and idempotent (merge + sort). The validator whitelist already includes targets to avoid self-blocking.


—

Phase 1 — Inventory (per-level classification and counts)

Clarification on scope
- Current level: Green — include in Mini allowlist, but do NOT seed stats as known. Green items should follow normal intro → SRS flow.
- Past levels: Blue, Yellow, Pink, Orange, Lime, Red (no Light Blue IDs found in DB) — treat as “already known”: import lexemes + inflections, add to Mini allowlist, seed FamilyStat/ItemStat.

Lesson IDs by classification (from DB)
- Past
  - Blue: cc_vocab_blue_l0, l1, l2, l3, l4, l5, l6, l7, l9, l10, l11, l13, l14, l15, l16, l17, l18, l19, l20
  - Yellow: cc_vocab_yellow_l0, l1, l2, l3, l4, l5, l6, l7, l8, l10, l11, l13, l14, l15, l16, l17, l18, l19, l20
  - Pink: cc_vocab_pink_l0, l1, l2, l3, l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15, l16, l17, l18, l19, l20
  - Orange: cc_vocab_orange_l0, l1, l2, l3, l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15, l16, l17, l18, l19, l20
  - Lime: cc_vocab_lime_l0, l1, l2, l3, l4, l5, l6, l7, l8, l9, l10, l11, l13, l14, l15, l16, l17, l18, l19, l20
  - Red: cc_vocab_red_l0, l1, l2, l3, l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15, l16, l17, l18, l19, l20
- Current
  - Green: cc_flashcards_l0, l1, l2, l3, l4, l5, l6, l7, l9, l10, l11, l13, l14, l15, l16, l17, l18; cc_practicetogo_green_l1, l2, l3, l4, l5, l6, l7, l9, l10, l11, l13, l14, l15, l16, l17, l18; vocab_green_gen
- Other (not in color pipeline)
  - minimal_pairs_01, present_tense_basics_01, song_ma_naaseh_chorus_v1, user_vocab_01, user_vocab_01_gen, vocab_all_gen, vocab_mini_morph

Per-level counts (DB snapshot)
- Distinct linked lexemes per level (LessonItems with `lexeme_id`), and those with inflections
  - Blue: 24 linked (24 with inflections)
  - Yellow: 14 linked (14 with inflections)
  - Pink: 22 linked (22 with inflections)
  - Orange: 25 linked (25 with inflections)
  - Lime: 5 linked (5 with inflections)
  - Red: 27 linked (27 with inflections)
  - Green (current): 74 linked (74 with inflections)

- Single‑token candidate forms observed in items (rough estimate of “vocab words” embedded in phrase‑only lessons)
  - Method: distinct `target_hebrew` with no spaces per color; compared to `Inflection.form` presence.
  - Blue: 43 tokens | 20 present in Inflection | 23 need lookup
  - Yellow: 55 tokens | 12 present | 43 need lookup
  - Pink: 64 tokens | 21 present | 43 need lookup
  - Orange: 72 tokens | 27 present | 45 need lookup
  - Lime: 27 tokens | 5 present | 22 need lookup
  - Red: 75 tokens | 27 present | 48 need lookup
  - Green (current): 99 tokens | 64 present | 35 need lookup

- Overlap with Mini (distinct lexeme_id intersections)
  - Mini∩Blue: 2 | Mini∩Yellow: 3 | Mini∩Pink: 2 | Mini∩Orange: 3 | Mini∩Lime: 1 | Mini∩Red: 4 | Mini∩Green: 23

Implications for Phase 2 sequencing (past levels only)
- Cleanest among past by coverage ratio (tokens_with_inflections / tokens): Blue (~47%), Orange (~38%), Red (~36%) → import these first.
- Pink/Yellow/Lime show lower coverage (≤33%) → expect more Wikidata reconciliation/manual curation.
