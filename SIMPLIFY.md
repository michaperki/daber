# Daber Simplification Plan

Goal: Fewer flags, fewer settings, fewer decisions. Same features, better defaults.

---

## 1. Kill (remove entirely) — SHIPPED 2026‑03‑25

### `ALLOW_STT_TEXT_PASSTHROUGH`
- **What**: Dev bypass that lets you POST raw text to STT instead of audio.
- **Why kill**: STATE.md calls it a "footgun." You're past needing it — app is deployed, STT works.
- **Files**: `Daber/app/api/stt/route.ts`, env vars, AI_SETUP.md.
- **Risk**: None. Only affects dev testing convenience you're not using.

### `NEXT_PUBLIC_LOG_CLIENT_EVENTS` + `/api/client-log`
- **What**: Client-side event forwarding to server for debug telemetry.
- **Why kill**: If you're not actively tailing these logs, it's dead code and an extra endpoint.
- **Files**: `Daber/lib/client/logClient.ts`, `Daber/app/api/client-log/route.ts`, env var.
- **Risk**: None. You lose telemetry you weren't reading.

### `drillDirection` setting
- **What**: User-facing setting for drill direction that was never wired.
- **Why kill**: Phase logic already decides direction. The setting is dead code.
- **Files**: `Daber/lib/client/settings.tsx` (remove the field), any UI that renders it.
- **Risk**: None. It does nothing today.

### Due mode selector (collapse to `blend`)
- **What**: 4-way setting (`off`/`item`/`feature`/`blend`) for how SRS drives picks.
- **Why kill the setting**: `blend` is strictly the best mode — it uses both word-level and grammar-level signals. The other three are just `blend` with information thrown away.
- **Action**: Hardcode `blend` behavior in `next-item`. Remove the due mode setting from Profile/Settings UI. Remove `--due` variants from simulation script (or keep for diagnostics but don't expose to user).
- **Files**: `Daber/app/api/sessions/[sessionId]/next-item/route.ts`, `Daber/lib/client/settings.tsx`, Settings/Profile page.
- **Risk**: Low. If blend has a bug where item-due and feature-due picks compete badly, you'd notice in daily use. But that's a bug to fix, not a reason to keep 4 modes.

---

## 2. Default to ON (remove toggles, keep features) — SHIPPED 2026‑03‑25

These are all good features that don't need to be optional. Just turn them on and remove the setting UI.

| Feature | Current | Change to |
|---------|---------|-----------|
| `focus=weak` (target weak spots) | Toggle in Profile | Always on — picker always prefers weak items when available |
| Adaptive pacing | Setting (`fixed`/`adaptive`) | Always adaptive — offer early end on struggle streak, extend on high accuracy |
| Browser TTS fallback | Toggle in Settings | Always on — fall back silently if server TTS fails |
| Auto-resume listening | Toggle in Settings | Always on — re-arm mic after feedback |
| Random order | Toggle (default ON) | Always on — remove the toggle |
| Review before submit | Toggle (default ON) | Always on — remove the toggle |

**Net effect**: ~6 fewer toggles in Settings/Profile. The app just does the right thing.

**Files**: `Daber/lib/client/settings.tsx` (remove these fields), Profile/Settings page (remove toggle UI), any API/client code that reads these settings (simplify to hardcoded `true`).

---

## 3. Keep as-is (load-bearing, low-cost)

| Flag/Feature | Why keep |
|---|---|
| `RL_STT_PER_MIN` / `RL_TTS_PER_MIN` | Protects your OpenAI bill |
| `SESSION_DUE_CAP` | Shapes session length — tunable, not a toggle |
| `GEN_QUEUE_THRESHOLD` | Controls LLM generation buffering |
| `SEED_CC` / `SEED_CC_PREFIX` / `SEED_LEXEMES` | Seed-time only, harmless |
| LLM generation pipeline | You like it, use it sometimes — keep but don't invest heavily right now |
| Rule-based generators | Still the workhorse while LLM pipeline is occasional |
| TTS speed control | Genuinely useful for drilling, not a "mode" — it's a preference |

---

## 4. Suggested execution order — COMPLETED 2026‑03‑25

Work through these in order so nothing breaks mid-way:

1. Kill `drillDirection` — done.
2. Kill `ALLOW_STT_TEXT_PASSTHROUGH` — done.
3. Kill client-log pipeline — done.
4. Default-ON the 6 toggles — done.
5. Collapse due modes to blend (client defaults) — done.
6. Update STATE.md — done.
7. Update ROADMAP.md — done.

---

## 5. Settings surface after cleanup

What remains in Settings/Profile:
- TTS playback speed (0.85×/1×/1.15×)
- Mic device selector
- That's probably it.

Everything else is the app doing the right thing by default.

---

## Notes

- The simulation script (`simulate_vocab_session.ts`) can keep its `--due` flag for diagnostics — it's a dev tool, not user-facing. But in prod, it's always blend.
- If you find that "always adaptive pacing" feels annoying (too many "want to keep going?" prompts), you can tune the thresholds rather than re-adding a toggle.
- The `debug=1` query param on next-item is fine to keep — it's invisible to normal use and useful for debugging.
