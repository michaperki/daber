READ MIKES_NOTES.md

# Daber

Daber is a Hebrew learning app built around phrases, handwriting, and songs.

The current direction is: learn useful Hebrew in phrases you can actually say, use handwriting as a first-class practice mode, and treat songs as destinations the learner earns their way toward. The existing app foundation already includes calibration, stroke recognition, content builds, lesson sessions, progress, sync, and Heroku deployment. The next product work is a redesigned learner experience on top of that foundation, not a rebuild from scratch.

> **Status:** active Preact/Fastify monorepo. The older docs describe the original handwriting-MVP foundation; the new wireframes in `wireframes/` describe the product direction now being adopted.

## Why this repo exists

Two earlier prototypes gave us everything we need to start fresh cleanly:

- **`HebrewHandwritingWeb/`** — a working single-file KNN handwriting recognizer with Calibrate / Recognize / Practice / Vocab tabs. We are porting its behavior.
- **`hebrew_drills/`** (the Daber Next.js app) — a V2 YAML content pipeline, a TS reference implementation of the handwriting engine, a Prisma/Postgres schema, and a Heroku deployment story. We are reusing the YAML and cribbing from the TS engine.

Daber is the clean re-home: a small monorepo with a sync-capable backend, a curated YAML content pipeline, and browser-side handwriting recognition. The redesign keeps those hard-won pieces and replaces the learner-facing information architecture around them.

## Product direction

- **Phrases first.** Words exist in service of usable phrases and short sentences.
- **Handwriting is a peer.** The writing canvas is part of the main learning loop, not a diagnostic side tool.
- **Songs are destinations.** Song lyrics, clips, and other source material are the payoff after prep, not the first instruction screen.
- **Calm progress.** Streaks, review, recap, and progress should be useful and quiet.
- **Existing infra stays.** Preact, Fastify, Prisma, content YAML, sync blobs, the canvas, and recognition modules remain the base.

## Stack

- **Frontend**: Vite + Preact + TypeScript
- **Backend**: Fastify (or Next.js API routes) + Prisma + Postgres
- **Deployment**: Heroku (familiar; `hebrew_drills` already had this working)
- **Content**: YAML-as-source-of-truth under `packages/content/data/v2/`, compiled to a typed module at build time

## Directory map

```
Daber/
  apps/
    web/              # Vite + Preact + TS frontend
    api/              # Fastify + Prisma + Postgres
  packages/
    content/
      data/v2/        # Curated YAML lexicon (copied from HebrewHandwritingWeb)
  docs/               # Product, architecture, plan — read these first
  reference/          # Read-only snapshots from the prior prototypes
  wireframes/         # New phrase/song/handwriting redesign directions
  scripts/
    cnn_hhd/          # Train small CNN on HHD and export TFJS
    export_calibration_png.cjs  # Export saved samples to PNGs
    sim_drill.js      # Selection simulator (see docs/SIMULATOR.md)
```

## Read the docs

In suggested order:

1. `docs/VISION.md` — what Daber is and is not
2. `wireframes/` — the new Path / Atelier / Journey design directions
3. `docs/ROADMAP.md` — current migration plan toward the wireframe ideal
4. `docs/ARCHITECTURE.md` — monorepo layout, stack, module boundaries
5. `docs/DATA_MODEL.md` — YAML schema, sync blob schemas, Postgres tables
6. `docs/RECOGNIZER.md` — how the recognizer works
7. `docs/FEATURES.md` — original handwriting-MVP feature baseline
8. `docs/USER_FLOW.md` — original onboarding and daily steady-state loop
9. `docs/DIAGNOSTICS.md` — Bench and Debug
10. `docs/DEPLOYMENT.md` — Heroku setup and local dev DB

## What's in `reference/`

Copies — not symlinks — of the files we'll be cribbing from. Do not edit these in place. See `reference/README.md` for the file manifest and what each one is good for.
