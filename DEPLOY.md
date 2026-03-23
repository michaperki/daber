Deploying Daber to Heroku

Overview
- Single Next.js app (frontend + API) runs as one Heroku web dyno.
- Postgres via Heroku Postgres add‑on.
- Release phase runs Prisma `db:push` + `seed` automatically.

Requirements
- GitHub repo connected to Heroku (or use CLI).
- OpenAI API key with billing.

Steps
1) Create app and Postgres
   - heroku create daber-hebrew
   - heroku addons:create heroku-postgresql:hobby-dev -a daber-hebrew

2) Config vars
   - heroku config:set OPENAI_API_KEY=... -a daber-hebrew
   - Optional:
     - RL_STT_PER_MIN=20
     - RL_TTS_PER_MIN=40
     - ADMIN_ENABLED=0

3) Deploy
   - Connect GitHub in the Heroku dashboard and deploy main
   - Or via CLI: git push heroku main

What the repo already does
- Procfile
  - web: npm run start
  - release: npm run db:push && npm run seed
    (applies schema and seeds idempotently on each deploy)
- package.json
  - heroku-postbuild runs Prisma generate so the client works at runtime
  - build/start scripts target the `Daber/` app

Post‑deploy
- Open the app: heroku open -a daber-hebrew
- Drill a pack, verify STT/TTS works
- On mobile, add to home screen (PWA manifest is included)

Notes
- HTTPS is required for mic access; Heroku provides it.
- If you prefer manual seeding only, remove the `release` step in Procfile and run:
  - heroku run npm run db:push -a daber-hebrew
  - heroku run npm run seed -a daber-hebrew

