# Infra Notes — Queues, Rate Limits, Caches

Queues
- Current: in‑process memory queue with fire‑and‑forget scheduling of generation jobs.
- API: `scheduleGenerationJob(payload, handler)` in `Daber/lib/infra/queue.ts`.
- Env: `GEN_QUEUE_BACKEND=memory` (default). `redis` is a placeholder and falls back to memory until Redis client is wired.
- Design (Redis): use a single list key `q:gen` with JSON jobs; producer `RPUSH`, worker `BLPOP` with visibility timeout or simple pop for single instance; track in‑flight in a set for observability.

Rate limits
- Current: in‑memory token bucket keyed by `scope:ip` in `Daber/lib/rateLimit.ts`.
- Env: `RL_BACKEND=memory` (default). `redis` placeholder for multi‑instance; use Lua script for atomic refill+consume.

Audio cache (future)
- TTS cache is in‑process LRU (client prefetch + server mem cache). For multi‑instance, use object storage keyed by normalized text (e.g., `tts:he:<sha1>`), with short headers JSON for provenance.

DB indexes
- Added for hot paths:
  - ItemStat(user_id, next_due)
  - FeatureStat(user_id, next_due)
  - FeatureStat(user_id, pos, tense, person, number, gender)

Deployment
- Heroku single dyno OK with memory backends. For multiple dynos, set `GEN_QUEUE_BACKEND=redis` and provide `REDIS_URL` when wired.

