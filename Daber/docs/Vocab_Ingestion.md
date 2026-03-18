# Vocab Ingestion Guidelines (Enhanced)

Scope: authoring and import of vocab, verbs, adjectives, and short phrases from lightweight Markdown into Daber’s Lexeme/Inflection schema and LessonItems.

Principles
- Keep source simple (no dependencies). Use Markdown with minimal markers.
- Prefer deterministic parsing; add explicit hints when ambiguity exists.
- Preserve the existing flashcard pairs while enriching structured data when possible.

Accepted Patterns
- Inline pair: `English = עברית`
- Split pair:
  English line
  =
  עברית line
- Present forms block for verbs:
  הווה:
  masc sg, fem sg, masc pl, fem pl
- Past forms block for verbs (active or passive):
  עבר:
  אני X, אתה X, את X, הוא X, היא X, אנחנו X, אתם X, אתן X, הם X, הן X
  עבר Passive:
  ... same layout ...
- Adjectives with four forms:
  English = masc sg, fem sg, masc pl, fem pl
- Noun forms:
  English = singular[, plural]

Heuristics
- Lines matching `^to\s` on the English side with a Hebrew infinitive (`^ל`) are treated as verbs; the Hebrew is used as lemma.
- A four‑form list on the right side implies adjective inflections.
- Equality pairs without clear inflection markers are treated as phrases or nouns.

Optional Author Hints
- Add one per section before the equals sign or blocks:
  @pos: verb|adjective|noun|phrase
  @lemma: <hebrew>
  @tags: comma,separated,tags
  Example:
  @pos: verb
  @lemma: לִשׂרוֹף
  to burn = לִשׂרוֹף
  הווה:
  שׂוֹרֵף, שׂוֹרֵפֵת, שׂוֹרפִים, שׂוֹרפוֹת

Import Behavior
- LessonItems: all parsed pairs materialize into `user_vocab_01`.
- Lexicon: when `SEED_LEXEMES=1`, verbs/adjectives/nouns create a `Lexeme` with `Inflection` rows for present/past blocks and adjective/noun forms.
- Linking: lesson items are linked to a lexeme if their target matches the lexeme lemma or any inflection form.

Notes
- Parser favors correctness over coverage; ambiguous cases remain as plain cards.
- Future: CSV/TSV import with explicit columns (pos, lemma, tense, person, number, gender) can bypass heuristics entirely.
