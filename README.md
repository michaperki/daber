# Daber

A Hebrew handwriting practice app that calibrates to your handwriting and lets you write your way through vocab, inflections, and eventually sentences.

> **Status: planning / pre-scaffold.** No code yet. The MVP plan lives in `docs/`. Reference material from the prior prototypes (`HebrewHandwritingWeb`, `hebrew_drills`) is in `reference/`. Review the docs before the Phase 0 build begins.

## Why this repo exists

Two earlier prototypes gave us everything we need to start fresh cleanly:

- **`HebrewHandwritingWeb/`** — a working single-file KNN handwriting recognizer with Calibrate / Recognize / Practice / Vocab tabs. We are porting its behavior.
- **`hebrew_drills/`** (the Daber Next.js app) — a V2 YAML content pipeline, a TS reference implementation of the handwriting engine, a Prisma/Postgres schema, and a Heroku deployment story. We are reusing the YAML and cribbing from the TS engine.

Daber is the clean re-home: a small monorepo with a focused MVP, a sync-capable backend from day one, and a roadmap that keeps the concept simple while leaving upgrade paths open.

## Stack

- **Frontend**: Vite + Preact + TypeScript
- **Backend**: Fastify (or Next.js API routes) + Prisma + Postgres
- **Deployment**: Heroku (familiar; `hebrew_drills` already had this working)
- **Content**: YAML-as-source-of-truth under `packages/content/data/v2/`, compiled to a typed module at build time

## Directory map

```
Daber/
  apps/
    web/              # Vite + Preact + TS frontend (scaffold in Phase 0)
    api/              # Fastify + Prisma + Postgres (scaffold in Phase 0)
  packages/
    content/
      data/v2/        # Curated YAML lexicon (copied from HebrewHandwritingWeb)
  docs/               # Product, architecture, plan — read these first
  reference/          # Read-only snapshots from the prior prototypes
  scripts/
    cnn_hhd/          # Train small CNN on HHD and export TFJS
    export_calibration_png.cjs  # Export saved samples to PNGs
```

## Read the docs

In suggested order:

1. `docs/VISION.md` — what Daber is and is not
2. `docs/FEATURES.md` — MVP vs. later, with acceptance criteria
3. `docs/USER_FLOW.md` — onboarding and the daily steady-state loop
4. `docs/ARCHITECTURE.md` — monorepo layout, stack, module boundaries
5. `docs/DATA_MODEL.md` — YAML schema, sync blob schemas, Postgres tables
6. `docs/RECOGNIZER.md` — how the recognizer works (KNN/Centroid, Hybrid, features)
7. `docs/ROADMAP.md` — phased plan from MVP to sentence writing
8. `docs/PLAN.md` — Phase 0 implementation checklist (the concrete next actions)
9. `docs/DEPLOYMENT.md` — Heroku setup and local dev DB

## What's in `reference/`

Copies — not symlinks — of the files we'll be cribbing from. Do not edit these in place. See `reference/README.md` for the file manifest and what each one is good for.
