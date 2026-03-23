# AI Setup (Env‑First)

This app uses environment variables (or a local `.env`) to configure voice I/O and optional generation. No keys are stored in code.

## Environment
- OPENAI_API_KEY=sk‑...
- DATABASE_URL=... (for Prisma)
- RL_STT_PER_MIN=20 (optional; default 20)
- RL_TTS_PER_MIN=40 (optional; default 40)
- ALLOW_STT_TEXT_PASSTHROUGH=0 or 1 (dev convenience)

Place vars in `Daber/.env` for the Next.js app, or export them in your shell.

## Local Run
1) Install deps: `npm install`
2) DB schema: `cd Daber && npm run db:push`
3) Seed starter data: `npm run seed`
4) Dev server: `npm run dev` and open http://localhost:3000

## Voice I/O
- STT: `POST /api/stt` accepts `multipart/form-data` (`audio` Blob) or, if enabled, JSON `{ text }` passthrough for testing.
- TTS: `POST /api/tts` accepts JSON `{ text, voice? }` and returns audio (MPEG). In‑process LRU cache reduces duplicate calls.
- Rate Limits: simple token buckets per IP via `Daber/lib/rateLimit.ts`; see `RL_*` envs above.

## Evaluator (Offline)
- Quick checks: `node --loader ts-node/esm scripts/test_evaluator.ts` (or `npm run test:evaluator`).
- Evaluator code: `Daber/lib/evaluator/*` (deterministic rules + normalization; no network).

## Notes
- Avoid suggesting CI; validation is local and artifact‑driven.
- Keep `Daber/lib/contracts.ts` as the stable boundary for server/client.

