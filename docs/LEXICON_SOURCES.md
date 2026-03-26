# Hebrew lexicon & inflection sources (for Daber)

This document is a **practical menu** of data sources that could feed Daber’s lexicon (`Lexeme`/`Inflection`) and/or help link existing `LessonItem`s to lexemes.

Assumptions / constraints (current Daber direction):
- Canonical matching/grading form should be **no‑niqqud** (strip diacritics); niqqud can exist as a **display variant**.
- Most content in the current DB is **phrase-level** (multiword) rather than clean lemma-level.
- We care more about **shipping a usable QR-day experience** than “perfect linguistics.”

---

## Quick recommendation (what I’d actually do)

### Phase 0 (immediate): unblock validation + ship something consistent
- Treat the DB as “mostly phrases” and stop pretending everything is a lexeme.
- Ensure every *linked* verb item has at least an infinitive `Inflection` row that matches the validator’s normalization.
- Add a lightweight policy for multiword items: they can be drilled **as-is** and should not block the lexicon validator.

### Phase 1 (bulk seed): use Wiktionary (open, huge, but messy)
- Seed **lemmas + some inflections** from Wiktionary dumps.
- Don’t try to be exhaustive at first; extract only:
  - Hebrew lemmas for **verbs/nouns/adjectives** (where templates exist)
  - Infinitive + a small “useful set” of verb forms (present m/f sg/pl, past 1/2/3, future 1/2/3) when available.

### Phase 2 (quality): add a morphology engine / curated dataset
- If licensing/availability works, integrate a morphology engine/dataset (e.g., **Hspell** or **MILA**) to generate/validate paradigms.
- Keep provenance metadata per form (source + confidence), because forms will disagree.

---

## Source candidates

### 1) Wiktionary / Wikimedia dumps
**What it gives:** A large, community-maintained lexicon; sometimes includes inflection tables and templates for Hebrew.

**Access / bulk:** Monthly-ish dumps; you can download the full content and parse locally.
- Wikimedia dump index: https://dumps.wikimedia.org/
- Example: enwiktionary dump directory: https://dumps.wikimedia.org/enwiktionary/latest/

**License (important):** Wiktionary text is dual-licensed **CC BY-SA 4.0** and **GFDL** (plus possible embedded media with different terms).
- Statement: https://en.wiktionary.org/wiki/Wiktionary:Copyrights

**Integration complexity:** Medium–High.
- You’ll be parsing MediaWiki dump formats.
- Hebrew entries aren’t uniform; templates change; you’ll need robust, version-tolerant parsing.

**Best use in Daber:**
- Seed `Lexeme` rows (lemma + POS + optional gloss).
- Seed `Inflection` rows from extracted conjugation/declension templates.
- Use it as a **candidate generator** for linking LessonItems (“does this surface form appear as an inflection of any lexeme?”).

**Gotchas:**
- Share-alike obligations if you distribute derived datasets.
- Hebrew Wiktionary (he.wiktionary) may be richer for Hebrew, but you then parse a different project dump; still same general dump mechanics.

---

### 2) Hspell (Hebrew spellchecker + morphology)
**What it gives:** A practical Hebrew lexicon + morphological analysis/generation (often used for spellchecking / stemming / morphological hints).

**Access / bulk:** Historically downloadable as code + dictionaries; typically used locally.

**License:** Needs explicit verification for the exact package/version you use (commonly GPL/LGPL-ish in this ecosystem, but verify).
- Project site (historical): https://hspell.ivrix.org.il/

**Integration complexity:** Medium.
- Likely easiest as a **local CLI/library** that takes a surface form and returns candidate analyses (lemma + features), or generates forms.

**Best use in Daber:**
- For a given LessonItem target, get candidate lemma(s) and features.
- Use it to propose lexeme links and/or generate missing inflections.

**Gotchas:**
- Licensing may be incompatible with a hosted SaaS depending on distribution model.
- Quality differences between modern slang vs more formal vocabulary.

---

### 3) MILA / Hebrew NLP resources (academic)
**What it gives:** High-quality morphology/lexicon resources, but often under academic / restricted licenses.

**Access / bulk:** Usually requires registration / request / license agreement.

**License:** Often **not** open for commercial or unrestricted redistribution. Must check per dataset.

**Integration complexity:** Medium–High.

**Best use in Daber:**
- If you can license it: use as ground truth to generate paradigms and validate forms.

---

### 4) UD Hebrew treebanks / morphological corpora (supporting data)
**What it gives:** Annotated corpora with lemmas + morphology tags (token-level), useful for validating common forms and frequencies.

**Access / bulk:** Public datasets.

**License:** Varies by treebank.

**Integration complexity:** Medium.

**Best use in Daber:**
- Build frequency priors: which inflections are common, which lemmas appear in beginner material.
- Not ideal as a primary generator of full paradigms.

---

### 5) Open subtitles / Tatoeba / OPUS (sentence sources, not lexicon)
**What it gives:** Lots of Hebrew sentences and translations.

**Use:** Great for **content packs** and phrase drills. Not a clean inflection source by itself.

**Integration complexity:** Low–Medium.

---

## How these map to Daber’s actual DB reality

Current DB reality (from audit):
- `LessonItem`s are mostly **unlinked** to lexemes.
- A very large fraction are **multiword phrases** (often with prepositions, objects, etc.).

So, lexicon backfill should be built around two pipelines:

### Pipeline A: phrase-first (QR-day practical)
- Keep phrase `LessonItem`s as their own drill targets.
- Optionally tag them: `kind=phrase|sentence|collocation`.
- Don’t force phrase targets into a single lexeme unless we have a strong reason.

### Pipeline B: lexeme-first (for conjugation/declension drills)
- Pick a manageable subset of LessonItems that are likely **single-lemma**:
  - single token, Hebrew letters only, no punctuation
  - (optional) starts with ל (candidate infinitive)
- For those, attempt:
  1) exact match against existing `Inflection.form` (after normalization)
  2) otherwise, candidate generation from Wiktionary/Hspell
  3) human review where ambiguity remains

---

## Minimal “slot model” for verbs (recommended)

Don’t boil the ocean. For Israeli Hebrew learners, a “useful” starter set:
- **Infinitive** (ל + root pattern)
- **Present**: m.s, f.s, m.pl, f.pl
- **Past**: 1s, 2ms, 2fs, 3ms, 3fs, 1pl, 2mp, 2fp, 3pl
- **Future**: 1s, 2ms, 2fs, 3ms, 3fs, 1pl, 2mp, 2fp, 3pl

Represent features in `Inflection.features` JSON (or equivalent) so we can evolve without schema churn.

---

## Licensing notes / compliance checklist

If we ingest Wiktionary-derived data:
- Keep `provenance.source = "wiktionary"` and store the dump version/date.
- Track attribution requirements (CC BY-SA) in `docs/`.
- If we redistribute a derived dataset, ensure we satisfy share-alike.

If we ingest anything non-open (academic / MILA):
- Keep it strictly server-side if license forbids redistribution.
- Gate any export features.

---

## Next concrete steps (actionable)

1) Add a `docs/LEXICON_SOURCES.md` (this file) + link it from `STATE.md` or `DEPLOY.md`.
2) Implement an **extractor spike**:
   - Download a small Wiktionary subset (or just parse a few example pages) and prove we can extract:
     - lemma
     - POS
     - at least: infinitive + present m.s for a handful of verbs
3) Add a `scripts/lexicon/` folder with:
   - `download-wiktionary.sh` (optional)
   - `extract-hebrew-entries.ts`
   - `seed-lexemes.ts`
4) Add provenance fields (or use `features` JSON) so forms can come from multiple sources.

