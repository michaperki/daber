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
