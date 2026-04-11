# Phase 0 Implementation Plan

This is the concrete, ordered checklist to get from the current state (empty scaffold + docs) to a deployed MVP. **Nothing here is built yet.** Review the docs first, then give the go-ahead and I'll work through this list.

Each step is sized to be one agent-session of focused work (roughly ~1–3 hours of human equivalent). Steps are sequential unless marked `[parallel]`.

## Pre-flight (before any code)

- [ ] Review all docs in `docs/` and flag anything you want changed
- [ ] Confirm the directory name `Daber` is the one we want (it's already created)
- [ ] Confirm stack: Vite + Preact + TS, Fastify + Prisma + Postgres, Heroku, npm workspaces
- [ ] Confirm sync semantics: device-UUID blobs, last-write-wins, no accounts
- [ ] Decide: import in Calibrate merges samples or replaces them (current prototype replaces)

## Step 1 — Monorepo scaffold

**Output**: root `package.json` with workspaces, `tsconfig.base.json`, `.gitignore`, `.env.example`, empty `apps/web`, `apps/api`, `packages/content` package.jsons.

Tasks:
- [ ] Root `package.json` with `workspaces: ["apps/*", "packages/*"]`
- [ ] `tsconfig.base.json` with strict TS, `moduleResolution: "bundler"`, path aliases for `@daber/content`
- [ ] `.gitignore` (node_modules, dist, .env, .DS_Store)
- [ ] `.env.example` documenting `DATABASE_URL`, `PORT`, `CORS_ORIGIN`
- [ ] `git init && git add . && git commit -m "Initial scaffold"` (if you want this to be its own repo)
- [ ] Create GitHub repo `daber` and push (optional but recommended — remote backup)

**Acceptance**: `npm install` from the root succeeds, workspaces are linked.

## Step 2 — Content package

**Output**: `packages/content` that reads the YAML we already copied and emits `dist/vocab.json`.

Tasks:
- [ ] `packages/content/package.json` (deps: `yaml`, `zod`)
- [ ] `packages/content/tsconfig.json` extending root
- [ ] `packages/content/src/schema.ts` — port Zod schemas from `reference/hebrew_drills` (if we want validation) or just use `any` for MVP
- [ ] `packages/content/src/build.ts` — port from `reference/hebrewhandwritingweb/scripts/build_vocab.js`, TS-ified
- [ ] `packages/content/src/index.ts` — re-exports `vocab` from `dist/vocab.json` (or `require('./dist/vocab.json')`)
- [ ] `npm -w packages/content run build` — generates `dist/vocab.json`
- [ ] Sanity check: `dist/vocab.json` has ~996 entries

**Acceptance**: the content package exports a typed array of `{ he, en, pos }` that the frontend can import.

## Step 3 — API package

**Output**: `apps/api` with Fastify, Prisma, two blob endpoints, local Postgres via Docker.

Tasks:
- [ ] `apps/api/package.json` (deps: `fastify`, `@fastify/cors`, `@prisma/client`, `zod`, `@fastify/sensible`; devDeps: `prisma`, `typescript`, `tsx`)
- [ ] `apps/api/tsconfig.json`
- [ ] `apps/api/prisma/schema.prisma` — two models: `DeviceCalibration`, `DeviceProgress` (see `DATA_MODEL.md`)
- [ ] `apps/api/src/db.ts` — Prisma client singleton
- [ ] `apps/api/src/server.ts` — Fastify server, CORS, healthcheck, static file serving for `apps/web/dist` (for production)
- [ ] `apps/api/src/routes/calibration.ts` — GET + PUT with Zod validation
- [ ] `apps/api/src/routes/progress.ts` — GET + PUT with Zod validation
- [ ] Start Docker Postgres: `docker run --name daber-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=daber -p 5432:5432 -d postgres:16`
- [ ] `apps/api/.env` with `DATABASE_URL=postgresql://postgres:dev@localhost:5432/daber`
- [ ] `npm -w apps/api exec prisma migrate dev --name init`
- [ ] `npm -w apps/api run dev` — Fastify on :3000
- [ ] Manual test: `curl -X PUT localhost:3000/api/calibration/test-device -d '{"version":1,"samples":{},"updated_at":"2026-04-11T00:00:00Z"}' -H 'content-type: application/json'`

**Acceptance**: PUT + GET round-trip works, Postgres row is created, healthcheck returns 200.

## Step 4 — Web package scaffold

**Output**: `apps/web` as an empty Vite + Preact + TS SPA with the tab shell.

Tasks:
- [ ] `apps/web/package.json` (deps: `preact`, `@preact/signals`, workspace link to `@daber/content`; devDeps: `vite`, `@preact/preset-vite`, `typescript`)
- [ ] `apps/web/vite.config.ts` — Preact preset, proxy `/api` to `localhost:3000` in dev
- [ ] `apps/web/index.html`
- [ ] `apps/web/src/main.tsx` — mount point
- [ ] `apps/web/src/app.tsx` — tab shell with 4 tabs (empty panels for now)
- [ ] `apps/web/src/state/signals.ts` — starter signals (empty for now)
- [ ] Basic styles in `apps/web/src/styles.css` — port from `reference/hebrewhandwritingweb/styles.css`
- [ ] `npm -w apps/web run dev` — Vite on :5173

**Acceptance**: open `localhost:5173`, see 4 empty tabs, click between them.

## Step 5 — Port the canvas + recognizer (no UI logic)

**Output**: `apps/web/src/canvas/` and `apps/web/src/recognizer/` modules. Pure functions + one canvas component. No Calibrate/Practice/Vocab logic yet.

Tasks:
- [ ] `apps/web/src/canvas/DrawCanvas.tsx` — port canvas setup, pointer events, stroke state, undo/clear, `onStrokeComplete` callback. Based on `reference/hebrewhandwritingweb/app.js` lines ~97–218.
- [ ] `apps/web/src/recognizer/features.ts` — port `extractFeaturesFromCanvas` (lines ~220–296 of the reference `app.js`)
- [ ] `apps/web/src/recognizer/augment.ts` — port `augmentFeature` (lines ~348–369)
- [ ] `apps/web/src/recognizer/centroid.ts` — port `computePrototypes`
- [ ] `apps/web/src/recognizer/knn.ts` — port `buildKnnDb` + prediction
- [ ] `apps/web/src/recognizer/final-forms.ts` — port from `reference/hebrew_drills/handwriting/engine.ts` (lines 135–150)
- [ ] `apps/web/src/recognizer/index.ts` — public API: `predictTop(vec, opts)` combining both modes
- [ ] Unit tests (Vitest) for: feature extraction shape, unit-normalization, final-form helpers
- [ ] Sanity check in a scratch page: draw on canvas, log feature vector, log prediction (empty calibration → predictable behavior)

**Acceptance**: drawing on the canvas produces a Float32Array of length 4096 that sums to ~1 (unit-normalized). No errors.

## Step 6 — Storage + sync

**Output**: `apps/web/src/storage/` that handles localStorage, device UUID, debounced sync to the API.

Tasks:
- [ ] `apps/web/src/storage/device.ts` — mint + persist device UUID in localStorage
- [ ] `apps/web/src/storage/calibration.ts` — load/save calibration blob; base64 encode/decode per `DATA_MODEL.md`
- [ ] `apps/web/src/storage/prefs.ts` — load/save prefs
- [ ] `apps/web/src/storage/sync.ts` — on boot: GET both blobs, merge into in-memory state, server wins. On mutation: schedule a debounced (2s) PUT. On offline: retry next change.
- [ ] Wire up at app boot in `main.tsx`
- [ ] Manual test: mutate calibration in console, see PUT hit the API, restart app, see samples loaded back

**Acceptance**: a full PUT → GET roundtrip works for both calibration and progress, with localStorage mirror.

## Step 7 — Calibrate tab

**Output**: `apps/web/src/ui/CalibrateTab.tsx` and `LettersGrid.tsx`, fully functional.

Tasks:
- [ ] Letter list (27 classes constant)
- [ ] Target letter display, Save Sample button
- [ ] Auto-advance on save
- [ ] Samples-per-letter input
- [ ] Delete Last / Clear Letter buttons
- [ ] Export / Import (file input + download)
- [ ] First-run pilot progress ("Setup: N/27")
- [ ] Letters grid with counts, click to jump
- [ ] Prototypes sidebar rendering the centroids
- [ ] Keyboard shortcuts (Enter/←/→/Ctrl+Z)

**Acceptance**: from a fresh app state, user can complete all 27 letters and see the prototypes populate. All changes persist across reload AND sync to the API.

## Step 8 — Recognize tab

**Output**: `apps/web/src/ui/RecognizeTab.tsx`, a debug surface.

Tasks:
- [ ] Live / Predict Once toggle
- [ ] Mode select (KNN / Centroid)
- [ ] k input, Augment checkbox
- [ ] Top-5 prediction bars + top-1 margin display
- [ ] Debounced live prediction while drawing

**Acceptance**: toggle between modes, see predictions update immediately.

## Step 9 — Practice tab

**Output**: `apps/web/src/ui/PracticeTab.tsx`, single-letter random drill.

Tasks:
- [ ] Random target from calibrated letters
- [ ] Accept/shake on pen-up
- [ ] Running score
- [ ] Threshold input (shared prefs with Vocab)
- [ ] Skip / Reset Score buttons
- [ ] Auto-calibration on accept

**Acceptance**: draw a known letter, see green flash, score increments, next target appears. Sync fires in background.

## Step 10 — Vocab tab

**Output**: `apps/web/src/ui/VocabTab.tsx`, the core daily loop.

Tasks:
- [ ] Pick random word from `@daber/content`
- [ ] English prompt, Hebrew output (RTL)
- [ ] Letter-by-letter acceptance
- [ ] Auto-calibration on each accepted letter
- [ ] I don't know / Backspace / Skip controls
- [ ] Word completion feedback

**Acceptance**: complete a full vocab word, see all calibration samples grow in the letter grid, see sync fire.

## Step 11 — Settings / device handoff

**Output**: settings panel or modal with device code display + "use existing code" flow.

Tasks:
- [ ] Gear icon in header
- [ ] Show current device code (short form + full UUID)
- [ ] "Copy code" button
- [ ] First-run-only "I have a device code" input (in the welcome flow, not settings)
- [ ] Reset button (wipes localStorage + PUTs empty blobs)

**Acceptance**: copy code from laptop, paste on phone, see calibration appear.

## Step 12 — Production build + Heroku

**Output**: Daber at `https://daber-<something>.herokuapp.com` or a custom domain.

Tasks:
- [ ] Root `npm run build` — builds content → web → api in order
- [ ] `apps/api/src/server.ts` serves `apps/web/dist/` as static files in production
- [ ] `Procfile` — `release: prisma migrate deploy` + `web: node apps/api/dist/server.js`
- [ ] `app.json` (optional Heroku app manifest)
- [ ] Create Heroku app: `heroku create daber-mvp`
- [ ] Provision Postgres: `heroku addons:create heroku-postgresql:mini`
- [ ] Push: `git push heroku main`
- [ ] Verify release phase runs `prisma migrate deploy`
- [ ] Open the URL, run through onboarding, calibrate 1 letter, reload, verify sync
- [ ] Open on phone, paste device code from laptop, verify handoff

**Acceptance**: deployed URL works end-to-end from both devices.

See `docs/DEPLOYMENT.md` for the full setup details.

## Step 13 — Cut the reference files

**Output**: `reference/` is still present but marked as archived. `HebrewHandwritingWeb/` and `hebrew_drills/` can be ignored going forward.

Tasks:
- [ ] Add a top-level comment in `reference/README.md` noting "archived as of Phase 0 complete, do not modify"
- [ ] (Optional) Delete `reference/` entirely once you're confident nothing else needs porting. Or leave it in git history only.
- [ ] Leave `HebrewHandwritingWeb/` and `hebrew_drills/` in `~/documents/dev/` alone unless you want to commit the pending hebrew_drills cleanup separately

---

## Total estimated steps: 13

- Steps 1–4: scaffold and plumbing
- Steps 5–6: engine + sync (the hardest ports)
- Steps 7–10: the four tabs
- Step 11: handoff polish
- Step 12: deploy
- Step 13: cleanup

After Step 12 is green, Phase 0 is done. Phase 1 begins only after daily use proves the concept.

## When you're ready

Say the word and I'll start at Step 1. I'll pause between steps for review if you want, or work through several in one pass and summarize at the end. Your call.
