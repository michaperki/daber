# MIC_SENTINEL_NOTES.md — iOS mic “green/orange dot” investigation (Daber)

Date started: 2026-03-25
Owner: Mike + AI (notes)

Purpose: a scratchpad for the **mic staying “in use” on iPhone Safari** (green/orange indicator in the status bar), and the smallest path to “QR-code-day production ready.”

This file is intentionally *practical* and can be merged later into:
- `STATE.md` (if there are feature flags / behavioral guarantees)
- `Dev Journal.md` (chronology of changes)
- `memory/MEMORY.md` (current focus + pointers)

Do **not** treat this as gospel; it’s hypotheses + an investigation plan.

---

## Problem statement (observed)
- On **iPhone Safari**, after granting mic permission / tapping to record, iOS shows the mic/active indicator (green/orange “bubble”).
- The indicator appears to persist **even when not actively recording**, and may persist when Safari is backgrounded.
- This is bad for trust + conversion (QR-day risk): users may think the app is listening.

Working assumption: the app is keeping an active audio capture resource alive (e.g., `MediaStream` track(s), `MediaRecorder`, or `AudioContext`) rather than releasing it.

---

## Why this happens on iOS (likely)
On iOS Safari, the mic indicator is typically driven by whether Safari still holds an **active audio capture**.
Common causes:
- Calling `navigator.mediaDevices.getUserMedia({ audio: true })` once and **keeping the stream around** to be “ready to record.”
- Stopping a `MediaRecorder` but **not stopping** the underlying stream tracks:
  - `stream.getTracks().forEach(t => t.stop())`
- Not handling lifecycle events:
  - user backgrounds the tab/app (`visibilitychange`, `pagehide`, `freeze`)
  - route changes / component unmount

Permission being granted alone generally should *not* keep the dot on — a live stream usually does.

---

## “Production-ready” target behavior (for April 30)
Minimum acceptable:
1. The mic indicator is on **only while actually recording**, or at most within a short explicit “arming” window.
2. If the user is idle for ~30–60 seconds, the app **releases** the mic automatically.
3. If the user backgrounds the page/app (switch apps, lock screen), the app **immediately releases** the mic.
4. Returning to the app requires an explicit action (tap) to reacquire.

Non-goals for QR day:
- perfect always-on voice UX
- continuous listening

---

## Quick repro checklist (fill in)
Device:
- [ ] iPhone model: ______
- [ ] iOS version: ______
Browser:
- [ ] Safari
Steps:
1) ______
2) ______
3) ______

Observed:
- [ ] mic indicator turns on at: (permission prompt / first tap / page load)
- [ ] indicator stays on when: (not recording / background / lock)
- [ ] indicator turns off when: (closing tab / force quit safari / after X seconds)

---

## Investigation plan (read-only first)
Goal: find exactly where the mic is acquired and why it’s not being released.

### Step 1 — Find the recorder code (2 minutes)
From `hebrew_drills/`:
```bash
cd Daber
rg -n "getUserMedia\(|MediaRecorder\b|AudioContext\b|webkitAudioContext\b|mediaDevices" .
```
Likely locations to inspect first (based on typical Next.js structure):
- `Daber/app/**/` client components/hooks that run the drill
- `Daber/lib/**` utilities/hooks

### Step 2 — Confirm the cleanup path exists (and is hit)
In the recorder module, verify there is a function that does **all** of:
- `mediaRecorder?.stop()` (if recording)
- `stream?.getTracks().forEach(t => t.stop())`
- clear refs: `stream = null`, `mediaRecorder = null`

Then check where it’s called:
- after a recording completes
- on error (upload fail / STT fail)
- on unmount / route change
- on background:
  - `document.visibilitychange` (if `document.hidden`)
  - `pagehide`
  - (optional) `freeze`

### Step 3 — Prove it with one temporary debug log
Add *temporary* logs around acquire/release (or a debug flag) so we can say: “yes, tracks were stopped.”

What to log:
- when `getUserMedia` is called
- `stream.getTracks().map(t => ({ kind: t.kind, readyState: t.readyState }))`
- when tracks are stopped

---

## Minimal patch plan (hand to Codex/Claude Code when ready)
The smallest fix that’s still trustworthy on iOS:

### 1) Stop tracks aggressively
Rule: **Never keep a stream alive between prompts.**
- Acquire mic only on “tap to record”
- Release mic immediately after recording stops (and on every error path)

### 2) Add background release (must-have)
If the user backgrounds Safari, release mic immediately:
- `visibilitychange` → if `document.hidden`, stop tracks
- `pagehide` → stop tracks

### 3) Add idle timeout (nice-to-have but recommended)
If the user is idle (not recording) for 30–60s, stop tracks as a backstop.

### 4) Acceptance test (what we can say ‘works’)
On iPhone Safari:
- Tap record → mic dot turns on
- Stop recording → mic dot turns off within ~1–2 seconds
- Background the app while dot is on → dot turns off immediately
- Return → requires tap to re-acquire mic

If any of those fail, we’re not “QR-ready.”

### 5) Code snippet (reference)
(Exact code will depend on how Daber stores refs, but the essence is this.)
```ts
function stopMic(stream?: MediaStream | null) {
  if (!stream) return;
  for (const track of stream.getTracks()) track.stop();
}

function attachLifecycleRelease(stopAll: () => void) {
  const onVis = () => { if (document.hidden) stopAll(); };
  const onHide = () => stopAll();
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('pagehide', onHide);
  return () => {
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('pagehide', onHide);
  };
}
```

### 6) If we *must* keep the stream alive (not recommended)
If you want “instant record start,” keep it alive for **at most** N seconds, then stop tracks.

---

## Risks / gotchas
- If we keep an `AudioContext` alive it can also keep the indicator/processing.
- Some apps re-request `getUserMedia` too eagerly; throttle re-acquisition.
- Ensure we don’t break the “feel” of the drill loop (avoid extra taps unless needed).

---

## Decisions (to log later)
- [ ] Choose idle timeout duration: 30s / 60s / 90s
- [ ] Decide if “arm mic” is explicit UI state vs automatic after prompt
- [ ] Decide if typed fallback appears when mic permission denied

---

## Links / pointers
- Charter: `SOUL.md` (constraints, QR-day bar = reliability + trust)
- State truth: `STATE.md`
- Chronology: `Dev Journal.md`
- Current focus: `memory/MEMORY.md`
