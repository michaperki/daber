Setup & Vocab Mode (Implemented)

Summary
- First‑run guidance to enter at least one sample for every Hebrew letter (27 including finals) with a live progress indicator.
- Vocab mode: letter‑by‑letter practice from an English prompt; accepted letters auto‑augment calibration.

Current State Findings
- Letters/classes: `CLASSES` covers 27 Hebrew forms including finals.
- First‑run setup: the UI nudges the next incomplete letter and shows `Setup: N/27 letters collected` below Calibrate controls.
- Calibration store: `localStorage` under `hebrew_calibration_v1` with structure `{ version, samples: { letter: [Uint8Array(4096)] } }`. Export/import converts to/from base64 JSON. Preferences live in `hebrew_prefs_v1`.
- Recognition: single‑letter. Centroid (averaged prototype per class) and KNN (over augmented samples). Prediction runs once on pen lift or live (in Recognize).
- UI: tabs for Calibrate, Recognize, Practice (single‑letter), and Vocab. Calibration tiles show per‑letter counts. Controls include Delete Last and Clear Letter.
- Mobile/iOS: works in an HTML viewer; data persists per‑app sandbox. Use Export/Import to move data between devices.

Vocabulary (current set)
- Ten words (only letters within these words are required for Vocab to work well):
  1) שלום — peace / hello
  2) שומר — guard
  3) שיר — song
  4) שירות — service
  5) מותר — permitted
  6) יותר — more
  7) תשלום — payment
  8) לומר — to say
  9) מישור — plain
  10) רושם — impression

User Flow
1) Setup in Calibrate
   - Prompt: “Calibrate: draw each letter once.”
   - Progress: shows N/27 and highlights the next incomplete letter.
   - Actions: Draw → Save Sample; Next/Prev; Clear Letter (undo all for one).
   - Completion: progress changes to “Setup complete for all letters.”

2) Vocab (Letter‑by‑Letter)
   - Prompt: English word (from the set above).
   - Canvas: draw one Hebrew letter at a time; recognition triggers on lift.
   - Acceptance: if top‑1 matches the expected next letter with sufficient margin (same threshold as Practice), the letter is appended to output.
   - Controls: “I don’t know” (reveal answer), “Backspace” (remove last accepted letter), “Skip” (new word). Enter also skips.
   - Auto‑calibration: on correct acceptance, append the feature vector to that letter’s calibration samples.

Expandability
- Word set is defined statically and easy to extend in code.
- Next: freeform whole‑word input with segmentation; spaced repetition; difficulty levels.

Data Model & State
- `calibration.samples` holds per‑letter samples; Vocab appends to this on correct answers.
- `hebrew_prefs_v1` stores recognizer preferences and UI settings, including the confidence threshold used by Practice/Vocab acceptance.
- Vocab set is currently a static array in code (see below).

UI/Controls (Implemented)
- New “Vocab” tab with English prompt, live Hebrew output, and controls (I don’t know / Backspace / Skip). Enter also skips.
- Calibrate shows setup progress and jumps to the next incomplete letter after saving.

Acceptance Criteria
- Setup nudges until every letter has at least one sample; progress persists across reloads.
- Vocab accepts input letter‑by‑letter, shows feedback, and reveals on request.
- Correctly accepted letters are appended to `calibration.samples` immediately.
- No backend is required; all state persists in `localStorage` and is exportable.

Configuration & Code Pointers
- Letters: `CLASSES` in `app.js:2`.
- Setup list: `PILOT_LETTERS` (currently the full `CLASSES`).
- Vocab list with English: `PILOT_WORDS` in `app.js:20`.
- Acceptance threshold: Practice “Threshold” input; shared by Vocab.
- Storage keys: `hebrew_calibration_v1` (samples), `hebrew_prefs_v1` (prefs).

Out of Scope (for now)
- Backend sync or accounts; whole‑word segmentation; full keyboard/IME; spaced repetition scheduling; multi‑device sync.
