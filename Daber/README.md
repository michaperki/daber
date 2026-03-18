# Daber

Daber is the new app root for Hebrew Drills. It ships the drill session screen first and reuses V1 APIs while we incrementally build the rest.

Run
- Copy your env file: duplicate `.env` from the repo root into `Daber/.env` (or create `Daber/.env.local`) so Next can load secrets (e.g., `OPENAI_API_KEY`, `DATABASE_URL`).
- From this folder: `npm run dev`

Notes
- Uses V1-compatible endpoints implemented under `Daber/app/api/*` and Daber-local libs under `Daber/lib/*` via the `@/*` alias.
- The drill UI mirrors `model_frontend/hebrew_drill_screen.html` (fonts, spacing, colors).
- Mic capture uses MediaRecorder → `/api/stt` (Whisper) and auto-submits; TTS uses `/api/tts` with a small LRU cache.
- Summary page at `/session/[sessionId]/summary` calls `/api/sessions/[sessionId]/summary`.

Next
- Build the home/dashboard and library screens to match `model_frontend/*`.
- Migrate shared libs into `Daber/lib` (optional) once stable.
- Consider central settings context (transliteration, stay-on-flawed) and typed API wrappers.
