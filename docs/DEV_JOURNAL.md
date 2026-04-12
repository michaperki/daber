# Dev Journal (Non‑UI)

This journal tracks the non‑UI implementation so a UI agent can plug in quickly without re‑reading design docs. It focuses on concrete integration points, shapes, and caveats.

Last updated: 2026‑04‑11

## What exists now

- Root workspaces + scripts (`package.json`, `tsconfig.base.json`, `.env.example`).
- Content pipeline in `packages/content` to build `dist/vocab.json` from YAML.
- API service in `apps/api` with Prisma models and four endpoints.
- Web logic (no UI) in `apps/web/src`:
  - `recognizer/` — pure functions for feature extraction + KNN/Centroid.
  - `storage/` — localStorage blobs + sync client + device ID.
- Procfile + app.json wired for Heroku (web dyno serves built SPA if present).

## Content

- Build script: `npm -w packages/content run build`.
- Output: `packages/content/dist/vocab.json` with rows `{ he, en, pos }` (~996 expected).
- MVP extractor rules per docs: verb=lemma; noun=sg/base; adj=m_sg/base; others=lemma. Dedupe by `he`, sort by `he`.
- Import helper: `import { vocab } from '@daber/content/src/index'` (requires build step).

## API

- Endpoints:
  - `GET/PUT /api/calibration/:deviceId` → payload `{ version:1, samples: Record<letter, base64[]>, updated_at }`.
  - `GET/PUT /api/progress/:deviceId` → payload `{ version:1, prefs, stats, seen_words, updated_at }`.
  - `GET /health` → `{ ok:true }`.
- Validation: `zod` on PUT; last‑write‑wins. Server stores JSONB verbatim (client’s `updated_at`).
- Env: `PORT`, `CORS_ORIGIN`, `DATABASE_URL`.
- Production: serves `apps/web/dist` if present; SPA fallback to `index.html`.

## Recognizer (pure)

- Feature extraction:
  - `extractFeaturesFromStrokes(strokes: Stroke[]): Float32Array` → 64×64 grayscale (unit‑normalized).
  - Rasterization is pure (no DOM); scales strokes into a 64×64 grid with 2px padding; 1px lines.
- Ranking:
  - `predictTop(vec, { mode, k, augment, prototypes })`.
  - `mode: 'knn' | 'centroid'`.
  - KNN: averages distances of top‑k samples per letter; optional 3×3 pixel shifts.
  - Centroid: averages samples per letter, compares `L2` to centroids.
- Final forms:
  - Helpers in `final-forms.ts` (`toBaseForm`, `isFinalForm`, `baseToFinal`). UI can decide when to collapse/expand.

## Storage + Sync

- Calibration blob (`storage/calibration.ts`):
  - Types: `CalibrationV1` with `samples` as base64 strings.
  - `addSample(cal, letter, vec)` quantizes 0..1 → `Uint8Array` and appends.
  - `toPrototypes(cal)` converts base64 → `Float32Array[]` per letter for recognizer.
- Progress blob (`storage/progress.ts`): MVP prefs + counters.
- Device ID (`storage/device.ts`): `getOrCreateDeviceId()` stores UUID v4 in localStorage.
- Sync client (`storage/sync.ts`):
  - `get/putCalibration(deviceId, payload)` and same for progress.
  - Debounced PUT helpers: `schedulePutCalibration`, `schedulePutProgress` (2s default).
  - API base: `/api` (override with `VITE_API_BASE_URL` at build time if needed).

## Integration points for the UI agent

- Stroke capture → features → prediction:
  1) Capture strokes as `Stroke[]` ({x,y,t?}).
  2) `const vec = extractFeaturesFromStrokes(strokes)`.
  3) `const preds = predictTop(vec, { mode, k, augment, prototypes })` where `prototypes = toPrototypes(loadCalibration())`.
- Accept flow (Practice/Vocab):
  - On accept, call `addSample(cal, targetLetter, vec)`, then `schedulePutCalibration(deviceId, cal)`.
  - Update `progress` counters and call `schedulePutProgress`.
- On app boot:
  - Load local blobs; derive `deviceId` via `getOrCreateDeviceId()`.
  - Optionally call `getCalibration/getProgress` to hydrate from server if remote exists.
- Vocab data:
  - Ensure `packages/content` is built; import `{ vocab }` and pick random rows.

## Known gaps / TODOs

- Canvas component and tab UI (intentional — out of scope here).
- Robust rasterization (anti‑alias, stroke width adapt, center‑of‑mass re‑centering). Current version is simple and works with prototype data; refine after UX feedback.
- No persistence quotas/limits enforced for samples per letter; UI should offer a cap (pref exists).
- Error handling surfaces (network failures) are silent; UI should show lightweight toasts or icons.
- No tests yet; structure is test‑friendly (pure functions). Add small unit tests later if desired.

## Local dev notes

- DB: `docker run --name daber-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_USER=postgres -e POSTGRES_DB=daber -p 5432:5432 -d postgres:16`.
- API dev: `npm -w apps/api run dev` (needs deps installed).
- Content build: `npm -w packages/content run build`.
- Root build (UI skipped): `npm run build`.

## Hand‑off checklist for UI

- Wire a DrawCanvas and tabs per docs, but consume only:
  - `extractFeaturesFromStrokes`, `predictTop`, `toPrototypes`.
  - `loadCalibration/saveCalibration/addSample`, `loadProgress/saveProgress`.
  - `getOrCreateDeviceId`, `schedulePutCalibration`, `schedulePutProgress`.
- Add a minimal `vite.config.ts` with proxy `/api → :3000` for dev.
- Add index.html + basic tab shell; serve from Vite in dev; API from Fastify.

