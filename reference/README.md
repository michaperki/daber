# Reference

**This directory is read-only.** Do not edit files here. These are snapshots of code and docs from the two prior prototypes, kept inside this repo so everything we need to port from is in one place.

When Phase 0 is complete and we're confident we've ported everything we need, this directory can be deleted. Until then, it's the source of truth for "how did the old app do X".

## Origin

```
reference/hebrewhandwritingweb/   ←  /mnt/c/Users/PerkD/documents/dev/HebrewHandwritingWeb/
reference/hebrew_drills/          ←  /mnt/c/Users/PerkD/documents/dev/hebrew_drills/Daber/
reference/hebrew_drills/docs/     ←  /mnt/c/Users/PerkD/documents/dev/hebrew_drills/docs/
```

The **source** directories are untouched. This is a byte-for-byte copy, not a symlink.

## Manifest

### `reference/hebrewhandwritingweb/`

The working single-file app we're rebuilding. Port its behavior first, then add sync on top.

| File | What | Port target |
|---|---|---|
| `index.html` | Tab shell, canvas, controls | `apps/web/index.html` + `apps/web/src/app.tsx` |
| `app.js` | All logic: canvas, recognizer, tabs, vocab, calibration | Split across `apps/web/src/{canvas,recognizer,storage,ui}/` |
| `styles.css` | Layout, tabs, canvas wrap, shake/accept animations | `apps/web/src/styles.css` (port verbatim, trim as needed) |
| `build.js` | Inlines everything into `standalone.html` for mobile sideload | Not ported — Vite build replaces this |
| `scripts/build_vocab.js` | YAML → `vocab-data.js` | Ported to `packages/content/src/build.ts` as TS |
| `README.md` | Current user-facing docs | Reference only — new README is in repo root |
| `docs/ROADMAP.md` | Original roadmap | Merged into `Daber/docs/ROADMAP.md` |
| `docs/mini-pilot.md` | Description of the Vocab + setup flow | Merged into `Daber/docs/USER_FLOW.md` and `FEATURES.md` |

**Not copied**: `standalone.html` (generated file), `data/v2/*` (those live in `packages/content/data/v2/` now — the canonical location), `data/vocab-data.js` + `data/vocab_words.json` (generated from YAML).

### `reference/hebrew_drills/`

The Next.js app from `hebrew_drills/Daber/`. We crib TypeScript patterns and the handwriting engine. We are **not** reusing the Next.js app shell itself.

| File | What | Port target |
|---|---|---|
| `handwriting/engine.ts` | Preprocessing (crop/pad/scale/normalize), final-form helpers | `apps/web/src/recognizer/features.ts` + `final-forms.ts` |
| `handwriting/scoring.ts` | Hybrid CNN + KNN scorer | Deferred — only port when the own-CNN work starts (Phase 4) |
| `handwriting/storage.ts` | Calibration localStorage helpers + serialization | `apps/web/src/storage/calibration.ts` |
| `HandwritingLetterInput.tsx` | A Preact/React-ish pattern for a calibrated input widget | Reference only — our `apps/web/src/ui/VocabTab.tsx` takes inspiration, not code |
| `write_page.tsx` | The Next.js `/write` page (Practice + Calibrate combined) | Reference only |
| `prisma/schema.prisma` | Full V2 content schema (Lexeme, Inflection, Example, etc.) | Deferred — only port when Phase 3 (inflection drills) starts. MVP schema is much simpler, see `docs/DATA_MODEL.md` |
| `docs/v2-authoring.md` | YAML schema + authoring guidelines | Reference for anyone editing the YAML |
| `docs/VERB_GOVERNANCE_DESIGN.md` | How verb governance is modeled in YAML + DB | Reference for Phase 3 |

**Not copied**: the entire Next.js app skeleton, Prisma migrations, API routes other than as references, the trained TFJS model file (we're training our own in Phase 4 if needed), Tailwind configs, the broader `hebrew_drills` scripts directory (v2-import/export/sync/verify — useful later, not needed for MVP).

## How to use this directory

1. **During porting**: open the reference file side-by-side with the target file. Copy logic, not syntax. The current code is JS; the target is TS.
2. **For understanding**: the `README.md` files and `docs/` here are the best description of why things were built the way they were. Read them before making non-trivial design decisions.
3. **For auditing**: if an MVP feature feels off, check the reference to see how the prototype behaved.

## When to delete

Delete `reference/` when all of the following are true:

- Phase 0 is deployed and working end-to-end
- No item in `docs/PLAN.md` has a "see reference/..." hint left
- You haven't opened anything in this directory for two weeks

Until then, leave it alone.
