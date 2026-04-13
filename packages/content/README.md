# packages/content

**Canonical location for all Hebrew lexicon content.** YAML lives under `data/v2/`. A build script (not yet written) compiles it into `dist/vocab.json` for consumption by the frontend.

Scaffolded in Phase 0, Step 2 (`docs/PLAN.md`).

## Directory

```
packages/content/
├── data/v2/          # ← copied from HebrewHandwritingWeb, which mirrored hebrew_drills/v2
│   ├── verbs/
│   ├── nouns/
│   ├── adjectives/
│   ├── adverbs/
│   ├── pronouns/
│   ├── prepositions/
│   └── concepts/
├── src/              # ← to be created in Phase 0
│   ├── build.ts      # YAML → dist/vocab.json (TS port of build_vocab.js)
│   ├── schema.ts     # Zod schemas (optional, see Step 2)
│   ├── extract.ts    # per-POS extraction rules
│   └── index.ts      # re-exports the built vocab
└── dist/             # ← generated, gitignored
    └── vocab.json
```

## Editing content

1. Edit a YAML file under `data/v2/...`
2. `npm -w packages/content run build`
3. The frontend picks up the new entry on next dev-server reload or next build

## Reference docs

- `reference/hebrew_drills/docs/v2-authoring.md` — authoring guidelines and schemas
- `reference/hebrew_drills/docs/VERB_GOVERNANCE_DESIGN.md` — verb governance modeling

## What lives here vs. the API

This package is **build-time-only** for the MVP. It emits a static JSON file that gets bundled into the frontend. The backend does not read YAML and does not store lexicon data in Postgres (yet).

When Phase 3 (inflection drills) lands, the build script will emit additional JSON artifacts (`inflections.json`, `concepts.json`), or the API will grow a Prisma-backed content mirror. The YAML stays canonical either way.

## Introspection report

Purpose: a read‑only content report to make the current state of the YAML corpus legible. This is not a linter and never fails the build.

- Run: `npm -w packages/content run report`
- Stdout: human‑readable summary (totals, key shapes, per‑verb completeness)
- JSON: `packages/content/dist/report.json` for downstream tooling

What it reports:
- Totals: number of YAML files and entries per POS; total extractor rows
- Verbs completeness: count of entries with `present_he/_en`, `past_he/_en`, `future_he/_en`, `imperative_he/_en`; Hebrew block coverage (0–4 blocks present)
- Adjectives: count with `forms`, `forms_en`
- Prepositions: count with `suffixes_en`
- Key shapes: distinct key sets found per block (e.g., `past_he` keys `1sg/2sg_m/.../3pl`) with counts and example lemmas
- Parallelism: per‑verb Hebrew/English mismatches for each tense block pair
- Per‑verb detail: compact indicators, e.g. `לכתוב: [lemma ✓] [present ✓] [past ✓] [future ·] [imperative ·]`
- Anomalies: files/entries that failed schema parsing, missing `lemma`, unknown top‑level keys, structurally odd blocks

Behavior:
- Uses the existing Zod schemas in `src/schema.ts` and the file walking/parsing in `src/extract.ts`
- Skips `concepts/` files
- Never exits non‑zero for data issues; it only reports them
