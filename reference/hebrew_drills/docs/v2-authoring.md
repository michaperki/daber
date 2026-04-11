# V2 Authoring — YAML as Source of Truth

Purpose: Make curated V2 content file-first for easy review, diffing, and promotion into the DB.

Authoring layer = YAML. Runtime = Prisma/Postgres. One importer syncs files → DB.

## Directory Layout

v2/
- verbs/{core_actions,motion,communication,cognition_perception}.yaml + all.yaml (remainder)
- nouns/{core_people_objects,places,food_drink,time_date}.yaml + all.yaml (remainder)
- adjectives/{core,colors}.yaml + all.yaml (remainder)
- adverbs/time_frequency.yaml + all.yaml (remainder)
- prepositions/core.yaml + all.yaml (remainder)
- pronouns/core.yaml
- concepts/{existential,accusative_et}.yaml + all.yaml (remainder)

We maintain small themed files for P0 and keep `all.yaml` as the remainder per POS. The importer supports multiple files per POS.

## Schemas (shape summary)

- Verbs
  - pos: verb
  - entries[]: { lemma, gloss, primary_prep, governance?, present{}, past{}, future{}, imperative?, examples[] }
  - Paradigm keys use shorthands: present (m_sg/f_sg/m_pl/f_pl), past/future (1sg/2sg_m/…/3pl), imperative (sg_m/sg_f/pl_m/pl_f)
  - Partial paradigms allowed (at least one form per section)

- Nouns
  - pos: noun; entries[]: { lemma, gloss, gender?, forms: { sg?, pl? }, examples[] }

- Adjectives
  - pos: adjective; entries[]: { lemma, gloss, forms: { m_sg?, f_sg?, m_pl?, f_pl? }, examples[] }

- Pronouns / Adverbs
  - pos: pronoun|adverb; entries[]: { lemma, gloss, examples[] }

- Prepositions
  - pos: preposition; entries[]: { lemma, gloss, suffixes?, examples[] }
  - suffixes (optional): person/number/gender keys (1sg, 2sg_m, …, 3pl_f)

- Concepts (different shape)
  - type: concept; entries[]: { key, label, description, examples[] }
  - examples: { he, en, anchor_lemma? }

See `scripts/v2-schemas.ts` for exact Zod definitions.

## Tooling

- Export (DB → YAML): `npm run v2:export`
  - Options: `--dir <verbs|nouns|…|concepts>`, `--db remote|local`
  - Use `--db remote` to export from the deployed/Heroku DB (requires network).

- Import (YAML → DB): `npm run v2:import` (dry‑run), `npm run v2:import:apply` (write)
  - Options: `--dir <…>` or `--file v2/<dir>/all.yaml`
  - Flow: validates, checks references, upserts lexemes + V2, expands paradigms, upserts examples, upserts concepts + joins.

- Sync (destructive within V2 scope): `npm run v2:sync` (dry‑run), `npm run v2:sync:apply` (apply)
  - What it prunes:
    - Removes `V2Lexeme` rows not present in YAML
    - For kept V2 lexemes, prunes `Inflection` rows to exactly those expanded from YAML
    - Prunes `Example` rows whose `source` matches current YAML file(s) and whose `hebrew_canon` is not listed in YAML
    - Prunes `ConceptExample` joins not listed in YAML
  - What it does NOT delete (by default):
    - `Lexeme` rows themselves
    - Note: we currently prune all `Example` rows for V2 lexemes that are not present in YAML (strict mode). This guarantees exact match.

- Split helper: `npx ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/v2-split.ts`
  - Creates themed files for P0 and removes moved entries from `all.yaml`.

- Ensure examples (P0): `npx ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/v2-ensure-examples.ts`
  - Adds minimal examples to reach 2 per entry where missing.

## Authoring Guidelines

- Keep Hebrew unpointed; importer strips niqqud during dedupe.
- Prefer minimal, idiomatic examples with one clear target per entry.
- P0 standard: at least 2 examples per entry (verbs/nouns/adjectives/adverbs/prepositions).
- Verbs without imperative are fine; importer supports partial paradigms.
- Nouns: set `gender` when known; omit if unsure (see “Reviews” below).
- Prepositions: only add `suffixes` for those that actually take pronominal suffixes.

## Review & Quick Checks

Run `npx ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/v2-audit-yaml.ts`.
Writes `scripts/out/v2_yaml_audit.json` with entries missing:
- Verbs: missing imperative/present/past/future/examples/gloss
- Nouns: missing gender/sg/pl/examples/gloss
- Adjectives: incomplete forms/examples/gloss
- Prepositions: missing suffixes/examples/gloss

Low‑hanging fruit:
- Ensure noun `gender` and 2× examples.
- Fill verb imperatives when natural; otherwise leave blank.
- Prepositions like "עד", "למרות" have no suffixes — examples suffice.

## Typical Edit/Sync Loop

1) Export current DB → YAML: `npm run v2:export -- --db remote`
2) Edit YAML (commit in small PRs)
3) Dry‑run import: `npm run v2:import`
4) Apply when clean: `npm run v2:import:apply`
5) Keep PRs focused (e.g., "add noun genders wave 1").

## Notes

- DB remains the runtime store for queries and integrity; YAML is the curated source of truth.
- Schema validation happens before any DB writes; importer prints a summary and duplicates per lemma/dir.
- Concept examples differ from lexeme examples; keep shapes distinct to avoid ambiguity.
