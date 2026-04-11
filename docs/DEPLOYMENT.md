# Deployment

Target: **Heroku**, single app, single dyno, Heroku Postgres.

Why Heroku: you already have muscle memory from `hebrew_drills/Daber`, and the Procfile / release-phase pattern is ideal for a small monorepo.

## App topology

```
                            Heroku app: daber-mvp
  ┌──────────────────────────────────────────────────────────────────┐
  │                                                                   │
  │  Web dyno (Node 24)                                               │
  │  ┌─────────────────────────────────────────────────────────────┐ │
  │  │  node apps/api/dist/server.js                                │ │
  │  │                                                               │ │
  │  │  ┌──────────────────┐   ┌──────────────────────────────────┐│ │
  │  │  │ Fastify routes   │   │ Static file serving              ││ │
  │  │  │  /api/*          │   │  apps/web/dist/**                ││ │
  │  │  │  /health         │   │  (SPA fallback to index.html)    ││ │
  │  │  └──────────────────┘   └──────────────────────────────────┘│ │
  │  └─────────────────────────────────────────────────────────────┘ │
  │                                                                   │
  │  Addons                                                           │
  │  ┌─────────────────────────────────────────────────────────────┐ │
  │  │ heroku-postgresql:mini  →  $5/month  →  $DATABASE_URL        │ │
  │  └─────────────────────────────────────────────────────────────┘ │
  │                                                                   │
  └───────────────────────────────────────────────────────────────────┘
```

One dyno serves both the API and the SPA. Same origin = no CORS headaches for the frontend.

## Required files

### `Procfile` (root)

```
release: npx -w apps/api prisma migrate deploy
web: node apps/api/dist/server.js
```

The release phase runs Prisma migrations before each deploy, so schema changes never require manual `heroku run` steps.

### `app.json` (optional, root)

Useful if you want to deploy to review apps or use the Heroku button. Not required for the MVP.

```json
{
  "name": "Daber",
  "description": "Hebrew handwriting practice with continuous personalization",
  "addons": ["heroku-postgresql:mini"],
  "env": {
    "NODE_ENV": { "value": "production" },
    "CORS_ORIGIN": { "value": "https://daber-mvp.herokuapp.com" }
  },
  "buildpacks": [{ "url": "heroku/nodejs" }]
}
```

### Root `package.json` scripts

```json
{
  "name": "daber",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "engines": { "node": "24.x" },
  "scripts": {
    "build": "npm run build:content && npm run build:web && npm run build:api",
    "build:content": "npm -w packages/content run build",
    "build:web": "npm -w apps/web run build",
    "build:api": "npm -w apps/api run build",
    "heroku-postbuild": "npm run build",
    "start": "node apps/api/dist/server.js"
  }
}
```

Heroku runs `heroku-postbuild` automatically after `npm install` on deploy, so `npm run build` fires in the right order.

### `.node-version` or engines field

Heroku reads `engines.node` from `package.json`. We pin to `24.x` to match `hebrew_drills`.

## First-time setup (from a clean machine)

```bash
# 1. Create the app
cd /mnt/c/Users/PerkD/documents/dev/Daber
heroku create daber-mvp

# 2. Add Postgres
heroku addons:create heroku-postgresql:mini

# 3. Set env vars (most are auto-set)
heroku config:set NODE_ENV=production
heroku config:set CORS_ORIGIN=https://daber-mvp.herokuapp.com
# DATABASE_URL is set automatically by the Postgres addon
# PORT is set automatically by Heroku

# 4. Push code
git push heroku main

# 5. Verify
heroku logs --tail
heroku open
```

On the first push, Heroku will:
1. Detect `heroku/nodejs` buildpack
2. Run `npm install --workspaces`
3. Run `heroku-postbuild` → `npm run build` → content → web → api builds
4. Run the release phase → `prisma migrate deploy`
5. Start the web dyno → `node apps/api/dist/server.js`

## Local dev vs production

| | Local | Production |
|---|---|---|
| Postgres | Docker container on `localhost:5432` | Heroku Postgres |
| API port | `3000` | `$PORT` (Heroku sets this) |
| Web port | `5173` (Vite dev) | served by API dyno |
| CORS | Vite proxies `/api` to `:3000` | same-origin, no CORS |
| HMR | Yes (Vite) | No (pre-built bundle) |
| Env file | `apps/api/.env` | Heroku config vars |

### Local Postgres via Docker

```bash
docker run --name daber-pg \
  -e POSTGRES_PASSWORD=dev \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=daber \
  -p 5432:5432 \
  -d postgres:16

# apps/api/.env
DATABASE_URL=postgresql://postgres:dev@localhost:5432/daber?schema=public
PORT=3000
CORS_ORIGIN=http://localhost:5173
```

## Release strategy

- **Single environment**: production only. No staging for MVP.
- **Branch**: `main` → Heroku `main` (via `heroku git:remote`)
- **Every push to `main` redeploys.** Small blast radius because it's just me.
- **Forward migrations only.** Never `prisma migrate reset` in production. If something breaks, roll forward with a new migration.
- **Rollback**: Heroku `heroku rollback` if a release is broken. Calibration blobs are safe because they're JSONB and any schema changes to the payload are handled client-side via the `version` field.

## Environment variables

| Var | Source | Purpose |
|---|---|---|
| `DATABASE_URL` | Heroku Postgres addon | Prisma connection string |
| `PORT` | Heroku | Fastify bind port |
| `NODE_ENV` | Config var | `production` |
| `CORS_ORIGIN` | Config var | Allowed origin (same-origin in prod, `http://localhost:5173` in dev) |

No secrets beyond `DATABASE_URL`. No API keys, no OAuth, no OpenAI.

## Monitoring

MVP: `heroku logs --tail` + Heroku's built-in metrics.

Later, if usage grows:
- **Papertrail** addon for searchable logs
- **Sentry** for error tracking (only if we're shipping to users, not for personal use)
- **Heroku Metrics** is fine for dyno load

## Backups

Heroku Postgres on the Mini tier includes automatic daily backups with 4 days of retention. Good enough for personal use.

To manually trigger:
```bash
heroku pg:backups:capture
heroku pg:backups
heroku pg:backups:download
```

## Cost estimate

- Web dyno (Eco): $5/month
- Heroku Postgres (Mini): $5/month
- Total: **~$10/month**

Vs. the hebrew_drills/Daber app which was on a similar tier. If you want to consolidate, you could point the existing `daber.herokuapp.com` app at this new repo, but that's risky because it would wipe the existing data. Safer to create `daber-mvp` (or whatever) as a fresh app.

## Custom domain (optional, later)

If you want `daber.yourdomain.com`:
```bash
heroku domains:add daber.yourdomain.com
# Add a CNAME from daber.yourdomain.com to the Heroku DNS target
heroku certs:auto:enable
```

Not in Phase 0.

## Failure modes and mitigations

- **Release phase fails** (e.g., a bad migration): Heroku keeps the old release running. Roll forward with a new commit.
- **Build fails**: Heroku fails the release before traffic shifts. No user impact.
- **Dyno crashes**: Heroku restarts automatically. Frontend is cached in the browser so brief outages are invisible unless a sync happens during the outage, in which case it retries.
- **Postgres down**: client detects failed sync, stays local-only, retries. Data stays on the devices.
- **Database corruption**: restore from the latest backup. Clients re-sync on next mutation.
- **Lost device ID**: import via another device's code. If no other device has it, start over (rare, only happens if both localStorage and the device code are lost).

## What's NOT set up in Phase 0

- No staging environment
- No review apps
- No CI/CD (direct push-to-main is enough)
- No custom domain
- No observability beyond `heroku logs`
- No rate limiting (single user)
- No CDN (web dyno serves the bundle directly)
- No SSL config (Heroku handles it automatically)
