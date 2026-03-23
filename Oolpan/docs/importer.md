Importer overview

What it does (manual mode)
- Uses curated inputs under `data/manual/`:
  - `lexicon.json` — lexemes with full fields (pos/root/binyan/gender/number/transliteration/notes) and their forms.
  - `sentences.json` — sentences with explicit token-to-form mapping.
- Creates SQL seed for the MVP schema in `db/schema.sql`:
  - inserts lexemes, senses, forms as defined manually
  - inserts sentences and sentence_tokens exactly as annotated
  - links audio assets and decks by matching sentences to `out/flashcards_normalized.json` or `out/practice_normalized.json` (if available)

Assumptions and boundaries
- No inference of lexemes/forms/tokens. Only items in `data/manual/*` are seeded.
- Frequency ranks are derived from token counts within the manual set.
- If an out/* match isn’t found, sentences are assigned to a fallback `Manual` deck and no audio is attached.
- User progress tables are not populated.

How to regenerate seed
- Prereq: Node.js available (no extra packages required).
- Command: `node scripts/seed_from_out.js`
- Output: `db/seed.sql`

How to load into Postgres
- Create schema: `psql -f db/schema.sql`
- Seed data: `psql -f db/seed.sql`

Extending the manual set
- Add or edit lexemes and forms in `data/manual/lexicon.json`.
- Add more sentences/tokens in `data/manual/sentences.json` and ensure `form_written` matches a form declared in the lexicon.
- Re-run `node scripts/seed_from_out.js` to regenerate `db/seed.sql`.

