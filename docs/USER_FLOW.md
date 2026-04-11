# User Flow

Two flows matter: the one-time **onboarding** and the recurring **daily steady state**. Everything else is a variation on one of these.

## First run (onboarding)

```
┌───────────────────────────────────────────┐
│  Open Daber for the first time            │
└─────────────────┬─────────────────────────┘
                  │
                  ▼
┌───────────────────────────────────────────┐
│  Client mints device UUID, stores in      │
│  localStorage                              │
└─────────────────┬─────────────────────────┘
                  │
                  ▼
┌───────────────────────────────────────────┐
│  Welcome screen                            │
│  "Draw each Hebrew letter once so Daber    │
│   learns your handwriting."                │
│                                            │
│  [Start]        [I have a device code]     │
└─────────────────┬─────────────────────────┘
                  │                       │
                  │                       ▼
                  │        ┌──────────────────────────────┐
                  │        │ Paste existing device code    │
                  │        │ → GET /api/calibration/:code  │
                  │        │ → local store = server blob   │
                  │        │ → localStorage device = code  │
                  │        └──────────┬───────────────────┘
                  │                   │
                  ▼                   ▼
┌───────────────────────────────────────────┐
│  Calibrate tab                             │
│  Target: א   [Save Sample]  Setup: 0/27    │
│  Letters grid shows counts                 │
└─────────────────┬─────────────────────────┘
                  │ draw → save → auto-advance
                  │ (repeat 27 times)
                  ▼
┌───────────────────────────────────────────┐
│  "Setup complete for all 27 letters."      │
│  Toast: "Practice and Vocab unlocked"      │
└─────────────────┬─────────────────────────┘
                  │
                  ▼
┌───────────────────────────────────────────┐
│  Practice tab becomes the default landing  │
└───────────────────────────────────────────┘
```

### Notes on onboarding

- **Setup uses a minimum of 1 sample per letter, not 5.** The `samples-per-letter` target (default 5) is a nudge for continued calibration, not a gate. 1/letter is enough to get started; Vocab will top them up organically.
- Onboarding is skippable with a device code, which is the only way to get onto a second device.
- If the user quits mid-onboarding, reopening puts them back on the Calibrate tab with the nudge "Setup: N/27 — next letter: {L}".
- No email, no password, no terms-of-service modal. The app is for you.

## Steady state (daily use)

```
┌───────────────────────────────────────────┐
│  Open Daber                                │
└─────────────────┬─────────────────────────┘
                  │
                  ▼
┌───────────────────────────────────────────┐
│  Background: GET /api/calibration/:id      │
│             GET /api/progress/:id          │
│  Merge strategy for MVP: server wins       │
│  (last-write-wins; no merge conflicts)     │
└─────────────────┬─────────────────────────┘
                  │
                  ▼
┌───────────────────────────────────────────┐
│  Landing: Practice tab                     │
│  Target: random calibrated letter          │
└─────────────────┬─────────────────────────┘
                  │
      ┌───────────┼───────────┐
      ▼           ▼           ▼
 ┌─────────┐ ┌──────────┐ ┌─────────┐
 │ Warm-up │ │  Vocab   │ │ Fix-up  │
 │         │ │  session │ │         │
 │ 5–10    │ │  N words │ │ Back to │
 │ single  │ │  letter- │ │ Calib.  │
 │ letters │ │  by-     │ │ to add  │
 │ until   │ │  letter  │ │ samples │
 │ warm    │ │          │ │ for a   │
 │         │ │          │ │ confused│
 │         │ │          │ │ letter  │
 └────┬────┘ └─────┬────┘ └────┬────┘
      │            │           │
      └────────────┼───────────┘
                   ▼
┌───────────────────────────────────────────┐
│  Any correct letter in Practice or Vocab   │
│  → append feature vector to calibration    │
│  → debounce 2s → PUT /api/calibration/:id  │
└───────────────────────────────────────────┘
```

### The three sub-flows

**Warm-up (Practice tab)**
- Goal: loosen up, 2–3 minutes
- Target is a random letter from the calibrated set
- Lift pen → auto-judge → accept or shake
- Run until you feel the recognizer is tracking today's pen
- No session end — just leave when ready

**Vocab session (Vocab tab)**
- Goal: recall practice, ~10 minutes
- Pick a random word from the lexicon
- English prompt shown ("peace / hello")
- Draw the Hebrew spelling one letter at a time
- Correct letters append to an on-screen Hebrew output (RTL)
- "I don't know" reveals the answer mid-word
- Backspace rolls back one accepted letter
- Skip → new word
- Auto-calibration happens transparently: each correct letter becomes a new sample
- Session end = user closes the tab (no explicit "End session" button in MVP)

**Fix-up**
- Goal: targeted calibration for a letter the recognizer is getting wrong
- Enter via the Calibrate tab, click the letter tile in the grid
- Add 2–3 fresh samples
- Go back to Vocab

### Sync behavior

- GET on app start, server wins if the server has a newer timestamp (MVP: always server wins on first load)
- PUT is debounced 2 seconds after the last change
- On network failure:
  - Show a subtle offline indicator (not a modal)
  - Continue local-only
  - On next successful PUT, server is overwritten with local state
- The client does not attempt merge. This is fine because one user uses one device at a time (mostly).

### Device handoff

1. On laptop, open Settings → "Your device code" → copy (short form: `ab12cd` + full UUID behind a click)
2. On phone, open Daber (first run) → "I have a device code" → paste
3. Phone pulls server blob, localStorage is replaced, user is dropped onto the Practice tab
4. From here on, both devices PUT to the same UUID; whichever was last to write wins

## Edge cases to think about

- **What if the server is empty but the client has data?** Happens the first time sync is wired up. Client PUTs on next change, server populates.
- **What if the client is empty but the server has data?** Happens on device handoff. Client GETs on start, localStorage is filled.
- **What if both change simultaneously?** Last write wins. MVP does not merge. Acceptable for single-user.
- **What if the server is down during onboarding?** Calibration still works locally. Sync retries on next change.
- **What if localStorage is cleared?** Server blob is still there as long as the device code is remembered. If the device code is also lost, it's a fresh start.
- **What if the user wants a clean slate?** Settings → Reset (wipes localStorage, client then PUTs an empty blob → server is cleared).
