# apps/api

**Placeholder.** Scaffolded in Phase 0, Step 3 (`docs/PLAN.md`).

This will be a Fastify + Prisma + Postgres service with exactly four endpoints:
- `GET /api/calibration/:deviceId`
- `PUT /api/calibration/:deviceId`
- `GET /api/progress/:deviceId`
- `PUT /api/progress/:deviceId`

Plus `GET /health` for Heroku.

See:
- `docs/ARCHITECTURE.md` — stack and module boundaries
- `docs/DATA_MODEL.md` — the two Prisma models + payload shapes
- `docs/DEPLOYMENT.md` — Heroku setup
- `docs/PLAN.md` — Step 3 for the build sequence
