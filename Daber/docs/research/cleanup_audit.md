# Cleanup Audit — Daber codebase

Date: 2026-04-03

Note: The requested docs `docs/agent/SOUL.md`, `docs/agent/STATE.md`, and `docs/research/vocab_pipeline_buildout.md` are not present in this repo. Findings below rely on code inspection and repository structure. Where those docs were referenced (e.g., deprecated drills list), I note assumptions and direct evidence from the code instead.

## A. Dead Drills

- Observed drill-related directories and files
  - `app/drill`: redirect-only
    - Files: `app/drill/page.tsx` (redirects to `/`)
    - Imported/referenced: no external imports reference this path; this route is reachable at `/drill` but only redirects.
    - STATE.md mention: unavailable
    - Verdict: keep (tiny redirect to preserve legacy links) or safe to delete if `/drill` isn’t used anywhere externally.

  - `app/session/[sessionId]/page.tsx`: main session UI for all drills
    - Files: full client UI, renders the active session with phases: intro, recognition, guided, free_recall.
    - Imported/referenced: used by Next route `/session/[sessionId]` and called from multiple start buttons.
    - Reachable: yes (primary drill experience).
    - Verdict: keep (active).

  - `lib/minimorph/local_llm_mini.ts`: Mini‑Morph generation/cache integration
    - Imported/referenced: from `app/api/sessions/[sessionId]/next-item/route.ts` and `app/api/sessions/route.ts` (prefetch).
    - Reachable: yes; active when lessonId is `vocab_mini_morph` and `LOCAL_LLM_ENABLED=true`.
    - Note: path bug — reads `path.join(process.cwd(), 'Daber', 'data', 'mini_allowlist.json')` but repo stores it at `data/mini_allowlist.json`.
    - Verdict: keep (active); file path needs light fix (outside audit scope).

  - Legacy drill directories (e.g., `app/drills/minimorph`, `app/drills/green`, `app/drills/listen`)
    - Not present in this repo. No `app/drills/*` directories exist; only `app/drill/` (singular) exists and redirects home.
    - Grep for imports from `drills/` returned none.
    - STATE.md mention: unavailable.
    - Verdict: N/A — already deleted/not present.

  - Related packs/pages
    - `app/vocab/*`: simple vocab viewer with `useTTS` (active route at `/vocab`). Verdict: keep.
    - `app/songs/*`: song pack prototype (`/songs/ma-naaseh`), uses `/api/song-packs/...` bootstrap. Verdict: keep.
    - `app/conjugations/page.tsx`: tables view, linked from profile. Verdict: keep.

## B. TTS / Audio State

- Components and hooks
  - `lib/client/audio/useTTS.ts` (core TTS)
    - Caches blobs in-memory; fetches `/api/tts`; on failure falls back to `window.speechSynthesis` so user still hears audio.
    - `prefetch(text)`: returns `false` if server TTS fails (used to gate UI gracefully).
  - `lib/client/audio/useAudioCoordinator.ts`
    - Single coordinator to avoid resource collisions (cancels mic when playing TTS and vice versa). Exposes `playTTS`, `prefetchTTS`, `record`, `stopRecording`, SFX beeps.
  - `lib/client/audio/useMicRecorder.ts`
    - Manages mic warmup, recording, silence auto‑stop, and live input level for UI waveform.
  - `lib/client/audio/useSFX.ts`
    - Lightweight WebAudio beeps for mic start/stop and grading.
  - UI components: `app/components/AudioPlayButton.tsx`, `StatusStrip.tsx`, `MicControls.tsx`.

- API routes
  - `app/api/tts/route.ts`
    - Uses `getOpenAI()` and `openai.audio.speech.create({ model: 'gpt-4o-mini-tts' })`.
    - Server‑side LRU cache (100 entries / 20 MB) to reduce calls.
    - On error: returns `{ error }` with 500.
  - `app/api/stt/route.ts`
    - Uses `openai.audio.transcriptions.create({ model: 'whisper-1' })` for both multipart and raw body.
    - On error: returns `{ error }` with 500.

- Client API wrapper
  - `lib/client/api.ts`
    - `apiTTS`: POST `/api/tts`; throws on non‑OK; `useTTS` catches and falls back to speech synthesis.
    - `apiSTTFromBlob`: POST `/api/stt`; throws on failure; caller shows toast.

- Failure mode (OpenAI quota/availability → 500)
  - TTS prefetch: `prefetchTTS` returns false → session UI sets `ttsAvailable=false` and:
    - Disables `AudioPlayButton` (with `title="Audio unavailable"`) on intro/recognition/feedback cards.
    - Shows visible text fallback for the Hebrew form and transliteration where relevant.
  - TTS on‑demand play: `useTTS.play` falls back to browser speech synthesis, so clicking “replay prompt” in free‑recall still works even if server TTS is down.
  - STT: no fallback; shows a toast error in session on failure (recording flow reverts to prompting).

- Graceful degradation coverage
  - Intro: audio button disabled + shows target Hebrew + optional transliteration. Consistent.
  - Recognition: prompt text switches to “Translate to English”; audio button disabled; adds "Audio unavailable" chip; shows target Hebrew + transliteration. Consistent.
  - Guided: no audio controls; unaffected.
  - Free recall (voice): “replay prompt” uses `playTTS(cleanedPrompt)`; if server TTS fails, browser TTS fallback speaks; no explicit "Audio unavailable" chip here, but controls remain functional due to fallback.
  - Feedback: for non‑recognition phases, an `AudioPlayButton` to play the correct Hebrew is shown and disabled when `ttsAvailable=false`.

- Redundancy / dead audio code
  - No duplicate visualizers/components found. The UI uses one `StatusStrip` (wave bars) sourced from `useMicRecorder` level.
  - No usage of non‑existent components like `AudioVisualizer`.
  - Empty dirs: `lib/stt/` and `lib/tts/` are present but empty — safe to delete.

## C. UI Issues in Mini‑Morph Session

- Card types (from `app/session/[sessionId]/page.tsx`)
  - `intro` (new word): plays/labels the target; user can mark seen/known.
  - `recognition` (he→en, typed): listen and translate to English.
  - `guided` (en→he, typed): type Hebrew; optional hints and pronoun helper.
  - `free_recall` (en→he, voice): record, review/edit, submit.

- TTS unavailable states
  - Intro: button disabled; shows Hebrew + transliteration; tooltip “Audio unavailable”.
  - Recognition: prompt text changes (“Translate to English”); button disabled; chip “Audio unavailable”; shows Hebrew + transliteration.
  - Guided: no TTS usage.
  - Free recall: replay prompt still functions via browser TTS fallback; not marked unavailable.
  - Feedback: for non‑recognition phases, the pronunciation button is disabled when `ttsAvailable=false`.

- Broken/non‑functional controls
  - None observed. When `ttsAvailable=false`, audio buttons are disabled with clear labeling; free‑recall replay remains functional via fallback.

- Rendered but invisible/deprecated
  - Debug badges (LLM) show in dev only; fine.
  - No conditional rendering based on removed feature flags detected.

## D. Dead Code Candidates

- API routes
  - `app/api/generate-drills/route.ts`: hard 404; background generation moved to queue/pipeline. Safe to delete.
  - `app/api/client-log/`: empty directory; no routes inside; safe to delete.

- Lib modules
  - `lib/stt/`, `lib/tts/`: empty directories; safe to delete.
  - `lib/infra/redis.ts`: placeholder returning `null`; used indirectly by `lib/infra/queue.ts` when backend is `redis`. Keep (harmless placeholder), or delete only if queue will never target Redis.
  - `lib/minimorph/local_llm_mini.ts`: active; keep. Note path bug to `Daber/data/...`.

- Components
  - No components identified as used only by deprecated drills.

- Data files
  - `data/green_glosses.json`, `data/green_lexemes.json`, `data/mini_allowlist.json`, `data/minimal-pairs.json`: used by session next‑item logic, song bootstraps, or seed; keep.
  - `data/imports/cc_vocab_*.json`: used by `prisma/seed.ts` under `SEED_CC=1`; keep (not runtime, but valid seed assets).

- Scripts
  - No `scripts/` directory present.

## E. OpenAI Dependency Map

- Central client
  - `lib/openai.ts`: `getOpenAI()` reads `process.env.OPENAI_API_KEY`; throws if missing.

- Call sites
  - TTS: `app/api/tts/route.ts` → `openai.audio.speech.create({ model: 'gpt-4o-mini-tts' })`
    - Failure handling: API returns 500; client `useTTS.play` falls back to browser TTS; UI degrades via `prefetchTTS` flag.
    - Cost: per unique text; server LRU + client LRU reduce repeat calls; prefetch doubles calls for each item (target Hebrew + optional prompt) if enabled.
  - STT: `app/api/stt/route.ts` → `openai.audio.transcriptions.create({ model: 'whisper-1' })`
    - Failure handling: returns 500; client shows toast; no fallback.
    - Cost: per recording submission.
  - LLM generation: `lib/generation/pipeline.ts` → `openai.chat.completions.create` (twice per generation batch: generation + validation)
    - Trigger: background during session creation when the generated content pool is low.
    - Failure handling: marks batch failed; user impact limited to fewer “generated” items; UI shows a “New sentences ready” toast when content arrives, but does not depend on it.
    - Cost: per background batch (configurable size; not per user action).

## F. Recommended Cleanup Order

- Delete first (zero‑risk)
  - Remove `app/api/client-log/` (empty).
  - Remove `lib/stt/` and `lib/tts/` (empty).
  - Remove `app/api/generate-drills/route.ts` (explicit 404 stub; background pipeline already in use).

- Refactor second (light fix before/while deleting)
  - Fix path in `lib/minimorph/local_llm_mini.ts` to read from `data/mini_allowlist.json` (not `Daber/data/...`).
  - In `app/api/sessions/[sessionId]/next-item/route.ts`, similar path to `Daber/data/green_glosses.json` should be `data/green_glosses.json`.
  - Consider removing `lib/infra/redis.ts` if Redis will not be wired; otherwise leave as placeholder.

- Keep but fix
  - TTS fallback UX parity: optionally add an “Audio unavailable” indication for the free‑recall replay button when server TTS is down (even though browser TTS fallback still works) to keep UX cues consistent.
  - Consider limiting TTS prefetch to one side (target only) or gating by a feature toggle in settings to reduce cost exposure when OpenAI quota is a concern.

- Prioritized list
  1) Delete: `app/api/client-log/`, `lib/stt/`, `lib/tts/`, `app/api/generate-drills/route.ts`.
  2) Refactor: fix `Daber/data/...` paths in `local_llm_mini.ts` and `next-item` route.
  3) Improve UX: optional “unavailable” hint on free‑recall replay; review prefetch policy.

## Appendix — Grep/Discovery Highlights

- No imports from `drills/` anywhere (`rg "import.*from.*drills/"` → none).
- Audio/TTS touchpoints
  - Hooks: `lib/client/audio/useTTS.ts`, `lib/client/audio/useAudioCoordinator.ts`, `lib/client/audio/useMicRecorder.ts`, `lib/client/audio/useSFX.ts`.
  - Components: `app/components/AudioPlayButton.tsx`, `StatusStrip.tsx`, `MicControls.tsx`.
  - API: `app/api/tts/route.ts`, `app/api/stt/route.ts`.
  - Pages: `app/session/[sessionId]/page.tsx`, `app/vocab/VocabClient.tsx`.
- OpenAI usages: `lib/openai.ts`, `app/api/tts/route.ts`, `app/api/stt/route.ts`, `lib/generation/pipeline.ts`.
- Flags/comments: No `TODO/HACK/FIXME/DEPRECATED/TEMP/STUB` markers found; no feature‑flag scaffolding.

