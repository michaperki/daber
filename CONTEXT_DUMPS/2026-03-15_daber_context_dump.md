# Daber Context Dump — 2026-03-15

This document summarizes all changes made during this session, with file-level pointers, rationale, and operational notes.

## Shipped Changes

- Session flow: manual advance + TTS cancellation
  - Daber/app/session/[sessionId]/page.tsx
    - Removed auto-advance in `submit()` so feedback stays visible until the user taps “next prompt”.
    - `nextItem()` now cancels any ongoing TTS before fetching the next item.
    - Cancels TTS when starting a new recording to avoid overlapping audio.
    - Stabilized the initial fetch effect by trimming deps to avoid unintended auto-advance.

- Real mic amplitude visualizer
  - Daber/app/components/StatusStrip.tsx
    - Added `level?: number` prop and scaled bars based on live RMS from `useMicRecorder`.
  - Daber/app/session/[sessionId]/page.tsx
    - Passed `level={mic.level}` into `StatusStrip`.

- Mic device dropdown overflow fix
  - Daber/app/session/[sessionId]/page.tsx
    - Refactored device row markup to use `device-row`, `device-label`, `mic-select` classes.
  - Daber/app/globals.css
    - Added responsive styles to keep the select within viewport.

- TTS LRU cache (server-side)
  - Daber/app/api/tts/route.ts
    - In-memory LRU (100 entries / 20MB) keyed by `{voice}:{text}`.
    - Logs `tts_generated` vs `tts_cache_hit` events.

- STT text passthrough gated by env
  - Daber/app/api/stt/route.ts
    - JSON `{ text }` passthrough allowed only if `ALLOW_STT_TEXT_PASSTHROUGH=1`; otherwise 403.

- Rate limiting (in-memory token bucket)
  - Daber/lib/rateLimit.ts
  - Daber/app/api/stt/route.ts — `RL_STT_PER_MIN` (default 20)
  - Daber/app/api/tts/route.ts — `RL_TTS_PER_MIN` (default 40)

- TTS prefetch in session
  - Daber/app/session/[sessionId]/page.tsx
    - Prefetches correction Hebrew and (if enabled) prompt English TTS after loading an item to reduce latency.

- Library progress, accuracy, and CSS
  - Daber/app/library/page.tsx
    - Computes per-lesson progress (unique items attempted / total) and accuracy (% correct) and displays both.
  - Daber/app/globals.css
    - Added library/pack styles (`.lib-*`, `.pack-*`, status badges, progress bar, chips, etc.).

- Roadmap
  - Daber/ROADMAP.md
    - Added sections for structured vocab/conjugations & generator plans; clarified visualizer note; updated priorities.

- Lexicon scaffolding (optional; gated)
  - Daber/prisma/schema.prisma
    - Added `Lexeme`, `Inflection` models; optional `LessonItem.lexeme_id`, `LessonItem.features`.
  - Daber/prisma/seed.ts
    - When `SEED_LEXEMES=1`, creates/link minimal lexeme/inflection for targets and associates with lesson items.

## Env Vars Introduced

- ALLOW_STT_TEXT_PASSTHROUGH=1 (dev only)
- RL_STT_PER_MIN=20 (default if unset)
- RL_TTS_PER_MIN=40 (default if unset)
- SEED_LEXEMES=1 (optional for seed)

## Migration / Commands

- Apply schema updates:
  - `npm run prisma:generate`
  - `npm run db:push`
- Optional re-seed with lexemes:
  - `SEED_LEXEMES=1 npm run seed`

## Known Behavior After Changes

- Drill session now stays on feedback until the user taps “next prompt”.
- TTS cancels on Next and at recording start to prevent overlap.
- Visualizer bars reflect actual input level.
- Library shows progress and accuracy per lesson.
- TTS/STT routes rate-limited; STT text passthrough disabled unless explicitly enabled.

## Notes / Rationale

- Manual advance ensures users can read the transcript and feedback; it aligns with the desire for tighter, learner-controlled pacing.
- Server TTS caching + client prefetch reduce perceived latency and cost while preserving output quality.
- Gated STT passthrough defends production while keeping a frictionless dev path.
- Rate limiting is minimal, in-process; can be swapped out for a shared store if horizontally scaling.
- Lexicon scaffolding is optional; no runtime impact unless seeded. It supports future work on features/weakness tracking and dynamic generation.

## Open Questions

- Do we want a minimum feedback dwell time when (re)introducing auto-advance?
- Should we expose quick toggles for “manual next” and “speak prompt” directly on the drill screen?
- Any preference for dynamic sentence generation guardrails before using an LLM (e.g., template-first + verify deterministic target)?

