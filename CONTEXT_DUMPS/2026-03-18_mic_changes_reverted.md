# Mic Process Changes — Attempted, Observed Issues, and Revert Notes (2026‑03‑18)

Context: We attempted to improve mic/TTS/SFX orchestration, reliability under rapid user actions, and observability. This log documents exactly what was tried, what we observed, and the final decision to revert mic process code to its prior, simpler behavior.

What we attempted
- Orchestration
  - Cancel TTS before arming mic; cancel mic before playing any TTS.
  - Suppress grade SFX while correction TTS plays (only beep on TTS failure).
- SFX
  - Added `useSFX` with AudioContext resume on first gesture + per‑beep resume; configurable gain.
  - Start/stop/grade tones wired from the session page (opt‑in, later default ON).
- Mic cleanup hardening (useMicRecorder.ts)
  - Added logging at key lifecycle points (start/stream/recorder/voice/auto‑stop/cancel/cleanup).
  - Added `runId` per recording; exit RAF/intervals for stale runs.
  - Tracked all intervals in a Set; cleared them on cleanup.
  - Added cancel fallback timer to force cleanup if `MediaRecorder.onstop` didn’t fire promptly.
  - Guarded cancel during startup: handled cancel after `getUserMedia` and before `MediaRecorder.start()`.
- Observability
  - Client logger `logClientEvent` and `/api/client-log` for server‑side ingestion of client events.

What we observed in the field
- Improvements
  - Overlap between grade SFX and correction TTS was reduced.
  - Initial “lingering buzz” cases decreased when clicking Next mid‑record.
- Regressions
  - Intermittent stuck state where the mic appeared to “hum” and the mic button wouldn’t re‑arm.
  - Logs showed cancel races during startup and post‑cleanup, e.g. `mic_recorder_onstop` followed by `mic_cleanup_*` and then an unexpected `mic_cancel_fallback` or repeated `mic_auto_stop_max`.
  - Additional complexity made the state space larger; rare browser timing (MediaRecorder/start/stop) still leaked into edge cases.

Decision
- Revert mic process code to the previous, simpler implementation to restore stability while we re‑design a smaller, explicit state machine for recording.

What we reverted
- `Daber/lib/client/audio/useMicRecorder.ts`
  - Removed all client logging, runId, interval Set, cancel fallback timer, and extra guards.
  - Restored simple flow: `getUserMedia` → `MediaRecorder.start()` → RAF level loop → interval‑based auto‑stop → `onstop` resolves → `cleanup()`.
- `Daber/app/session/[sessionId]/page.tsx`
  - Removed `mic.cancel()` before playing TTS and before Next (kept TTS cancel).

What remains (non‑mic‑process)
- SFX hook (`useSFX`) and settings toggle still exist and can be switched off if needed.
- Client logging utilities and `/api/client-log` endpoint remain in the codebase but are unused by the reverted mic hook.

Follow‑ups (proposed)
- Introduce a tiny, explicit recorder state machine (Idle → Arming → Recording → Stopping → Idle) to serialize operations and absorb rapid user actions.
- Add a single owner for interval/RAF to avoid split responsibilities; prefer one timer and one cancel path.
- Consider a bounded promise queue for record requests to ensure only the latest run can resolve and all others cancel.
- Keep SFX independent from mic lifecycle (no coupling except at start/stop taps).

Rollback timestamp
- Completed at 2026‑03‑18.

