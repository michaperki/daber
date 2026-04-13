# Architecture

## High-level

```
 ┌───────────────────────────────┐          ┌─────────────────────────────────┐
 │       Browser (Preact)        │  HTTPS   │      Heroku web dyno (Node)     │
 │                               │◄────────►│                                  │
 │  • Canvas + recognizer        │          │  • Fastify HTTP server           │
 │  • localStorage calibration   │          │  • Serves /api/*                 │
 │  • Vocab drill UI             │          │  • Serves built SPA (static)     │
 │  • Debounced sync client      │          │  • Prisma client                 │
 └───────────┬───────────────────┘          └───────────────┬─────────────────┘
             │                                              │
             │                                              │
             │                                              ▼
             │                               ┌─────────────────────────────────┐
             │                               │    Heroku Postgres              │
             │                               │                                  │
             │                               │  • device_calibration(blob)     │
             │                               │  • device_progress(blob)        │
             │                               │  • (later) lexeme/inflection    │
             │                               └─────────────────────────────────┘
             │
             ▼
 ┌───────────────────────────────┐
 │  Build-time content pipeline  │
 │                               │
 │  packages/content/data/v2/*   │
 │       ↓ (YAML parse)          │
 │  packages/content/dist/       │
 │    vocab.json / vocab.ts      │
 └───────────────────────────────┘
```

Three deployable pieces: the SPA, the API, Postgres. The content pipeline is build-time only — it runs on your laptop (or in CI) and commits generated artifacts or has the API generate them on boot.

## Repo layout

```
Daber/
├── apps/
│   ├── web/                    # Vite + Preact + TS SPA
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   ├── public/
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── app.tsx              # Tab shell
│   │       ├── recognizer/
│   │       │   ├── features.ts      # canvas → 64×64 unit vector
│   │       │   ├── knn.ts           # KNN scoring
│   │       │   ├── centroid.ts      # centroid scoring
│   │       │   ├── augment.ts       # ±1px shifts
│   │       │   ├── final-forms.ts   # ך/ם/ן/ף/ץ helpers
│   │       │   └── index.ts         # public API: predictTop(vec, k, mode)
│   │       ├── canvas/
│   │       │   ├── DrawCanvas.tsx
│   │       │   └── strokes.ts       # path state, undo, redraw
│   │       ├── storage/
│   │       │   ├── calibration.ts   # load/save localStorage
│   │       │   ├── prefs.ts
│   │       │   ├── device.ts        # device UUID
│   │       │   └── sync.ts          # debounced PUT, GET on boot
│   │       ├── ui/
│   │       │   ├── tabs.tsx
│   │       │   ├── CalibrateTab.tsx
│   │       │   ├── RecognizeTab.tsx
│   │       │   ├── PracticeTab.tsx
│   │       │   ├── VocabTab.tsx
│   │       │   ├── LettersGrid.tsx
│   │       │   └── Prototypes.tsx
│   │       ├── state/
│   │       │   └── signals.ts       # @preact/signals stores
│   │       └── content.ts           # re-exports from packages/content
│   └── api/                    # Fastify + Prisma + Postgres
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── server.ts
│       │   ├── db.ts
│       │   └── routes/
│       │       ├── calibration.ts
│       │       ├── progress.ts
│       │       └── health.ts
│       └── prisma/
│           ├── schema.prisma
│           └── migrations/
│
├── packages/
│   └── content/
│       ├── package.json
│       ├── tsconfig.json
│       ├── data/v2/            # ← YAML source of truth (already copied)
│       │   ├── verbs/
│       │   ├── nouns/
│       │   ├── adjectives/
│       │   ├── adverbs/
│       │   ├── pronouns/
│       │   ├── prepositions/
│       │   └── concepts/
│       ├── src/
│       │   ├── build.ts            # YAML → flat vocab
│       │   ├── schema.ts           # Zod schemas (ported from v2-schemas.ts)
│       │   ├── extract.ts          # POS-specific extraction
│       │   └── index.ts            # re-exports built vocab
│       └── dist/                   # generated at build time
│           └── vocab.json
│
├── docs/                       # ← you are here
├── reference/                  # ← read-only snapshots from the prior apps
│
├── package.json                # workspaces root (npm or pnpm)
├── tsconfig.base.json
├── .gitignore
├── .env.example
├── Procfile                    # Heroku web + release
├── app.json                    # Heroku app manifest (optional)
└── README.md
```

## Stack choices

| Layer | Choice | Alternatives considered | Why |
|---|---|---|---|
| Frontend framework | Preact + TS | React, Svelte, plain HTML | Small bundle, componentized, minimal tax over hand-written JS |
| Bundler | Vite | Next.js, Parcel | Fast, trivial config, HMR, no server-side rendering needed |
| State | `@preact/signals` | Zustand, Context, plain stores | Fine-grained reactivity, zero boilerplate |
| Backend framework | Fastify | Express, Next.js API, Hono | Small, fast, great TS story, plugin system fits Prisma cleanly |
| ORM | Prisma | Drizzle, raw SQL, Kysely | Already in `hebrew_drills`, reusable schema, migrations work |
| Database | Postgres (Heroku) | SQLite, MongoDB | Already deployed in `hebrew_drills`, parity with future content queries |
| Deployment | Heroku | Fly.io, Render, Railway, Vercel | User already familiar, existing Procfile pattern |
| Content auth | YAML | JSON, TOML, Markdown | Already curated in YAML, editor muscle memory |
| Monorepo | npm workspaces | pnpm, Turborepo, Nx | Simplest, no new tooling |

## Module boundaries

### `apps/web/src/recognizer`

**Pure, side-effect-free.** Takes a Float32Array, returns predictions. No DOM, no localStorage. Easy to unit test, easy to move into a Web Worker later.

**Public API**:
```
predictTop(vec: Float32Array, opts: { k, mode, augment, prototypes, knnDb }): Ranked[]
extractFeaturesFromCanvas(canvas: HTMLCanvasElement): Float32Array  // thin wrapper
```

### `apps/web/src/canvas`

**DOM-touching**. The `DrawCanvas` component owns the canvas element, pointer events, stroke state, and the `onStrokeComplete(vec)` callback. It does not know about KNN, centroids, or letters.

### `apps/web/src/storage`

**The only module that touches localStorage and the network.** All calibration mutations go through `saveCalibration(state)`, which debounces a PUT to the backend. All boot-time loads go through `loadCalibration()` which may trigger a GET. The rest of the app treats calibration as an in-memory object.

### `apps/web/src/ui`

**Tab-level components.** Each tab is self-contained and consumes the recognizer + storage modules. Tabs never talk to each other directly — they share state via `state/signals.ts`.

### `apps/api`

**Boring Fastify server.** Two resources, four handlers, one Prisma client. No business logic beyond "blob in, blob out". Zod for request validation. Healthcheck for Heroku.

### `packages/content`

**Pure data + build/report scripts.** No runtime code. The frontend imports from `content/dist/vocab.json` (or a TS module), which is regenerated by `npm run build:content`. Authors can inspect corpus health with `npm -w packages/content run report`, which prints a human summary and writes `packages/content/dist/report.json`.

## Data flow: a correct vocab letter

```
1. User draws on canvas
2. onStrokeComplete → features.extractFeatures(canvas) → Float32Array
3. recognizer.predictTop(vec, { k: 5, mode: 'knn', ... prototypes })
4. top[0].letter === expected  &&  margin >= threshold
5. calibration.samples[expected].push(floatToU8(vec))
6. storage.saveCalibration(calibration)
   ├── localStorage.setItem(...)
   └── syncClient.schedulePut()  // debounced 2000ms
7. vocab.state.pos++, vocab.output += expected
8. UI re-renders, canvas is cleared
9. (2s later) syncClient fires PUT /api/calibration/:deviceId
   ├── Server: prisma.deviceCalibration.upsert({ ... })
   └── Client: marks last_synced_at
```

## Environment variables

```
# apps/api/.env
DATABASE_URL=postgresql://...          # Heroku sets this automatically
PORT=3000                               # Heroku sets this automatically
NODE_ENV=production
CORS_ORIGIN=https://daber.herokuapp.com # or custom domain

# apps/web/.env (build-time)
VITE_API_BASE_URL=/api                  # same-origin in prod, proxy in dev
```

## Dev workflow

```bash
# First-time setup
npm install                           # installs workspace deps
docker run --name daber-pg \
  -e POSTGRES_PASSWORD=dev \
  -e POSTGRES_DB=daber \
  -p 5432:5432 -d postgres:16
echo "DATABASE_URL=postgresql://postgres:dev@localhost:5432/daber" > apps/api/.env
npm -w apps/api run prisma:migrate    # initial migration

# Day-to-day
npm -w packages/content run build     # generate vocab from YAML
npm -w apps/api run dev               # Fastify on :3000, watches src
npm -w apps/web run dev               # Vite on :5173, proxies /api to :3000

# Add a word
vim packages/content/data/v2/nouns/core_people_objects.yaml
npm -w packages/content run build     # regenerate dist
# Vite HMR picks up the new vocab automatically
```

## Deployment topology

**Single Heroku app, single dyno, single Postgres addon.** The web dyno runs `node apps/api/dist/server.js`, which serves `/api/*` from Fastify and serves the built frontend (`apps/web/dist/`) for everything else.

Build sequence on Heroku:
1. `npm install --workspaces` (install all packages)
2. `npm run build` (root script that runs content → api → web builds in order)
3. Release phase: `npx prisma migrate deploy` (no data loss, forward migrations only)
4. Web: `node apps/api/dist/server.js`

See `docs/DEPLOYMENT.md` for the full story.

## What we are NOT building

- No BFF layer (frontend talks directly to `/api/*` on the same origin)
- No GraphQL (two endpoints, no schema overhead)
- No Redis (no caching needs, no session store — we're blob-in/blob-out)
- No CDN (Heroku web dyno serves the static bundle; it's small)
- No auth middleware (device UUID is the only identity)
- No background jobs (no work to defer)
- No observability stack (Heroku logs are enough for MVP)
- No feature flags
- No A/B testing
