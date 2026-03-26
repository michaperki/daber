# Lexicon build plan (public resources → Daber DB)

This plan matches the reality that Daber currently has a **phrase book** (LessonItems) and only a small lexeme/inflection layer.

Goal:
- Build/seed a **dictionary layer** from **public resources**.
- Join the existing phrase book into that dictionary.

## Phases

### Phase 1 — Public-source ingestion spike (no migrations required)
Deliverables:
- A script to take a set of Hebrew tokens and fetch candidate dictionary entries from a public source.
- Store results as inspectable artifacts (JSONL) so we can assess coverage before touching DB.

Implemented:
- `scripts/lexicon/wiktionary_fetch.ts`
  - Uses MediaWiki API for en.wiktionary.org
  - For each token, fetches wikitext and detects if a Hebrew section exists and what POS headers appear
  - Outputs JSONL

Why Wiktionary first:
- Bulk accessible via dumps (later), but the API is fastest to spike.
- Open licensing (CC BY-SA / GFDL) but requires attribution/share-alike awareness.

Next step inside Phase 1:
- Extend extractor to parse a *small subset* of templates for Hebrew verbs/nouns/adjectives into structured entries.

### Phase 2 — Canonical DB models (Word/Phrase join)
Once we have confidence in coverage + extraction quality:
- Add DB tables (Prisma): `Word`, `Phrase`, `PhraseWord`.
- Backfill phrases from LessonItems.
- Backfill words from dictionary sources.
- Build linking pipeline:
  - tokenization -> candidate word matches -> join table

### Phase 3 — Lemma/inflection correctness
Add one of:
- morphology engine (e.g., Hspell / MILA if licensed)
- or Wiktionary dump parsing with more complete template support

Output:
- lemma pages with conjugation tables
- weakness tracking by lemma + inflection features

## How this connects to UX
- Library has both:
  - phrase packs (existing)
  - words dictionary (new)
- Word page:
  - lemma + forms
  - example phrases containing any form
  - weaknesses

