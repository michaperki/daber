Mini Morph — Full Vocab Pipeline Buildout

Updated: 2026-04-03

—

Summary
- Mini Morph is the primary drill. Today it knows ~50 lexemes (10 custom + ~40 Wikidata) scoped via `Daber/data/mini_allowlist.json:1`.
- Earlier color levels (Red/Orange/Green) exist as imported lessons, mostly phrase-only items without lexeme links. Green has the cleanest lexeme coverage.
- Goal: make all earlier vocab available to Mini Morph; treat it as already studied; allow the LLM to use any of it when generating.

—

A. Current Vocab Inventory

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

