# Features

This document is the source of truth for what's in the MVP and what's deferred. If a feature isn't listed here, it isn't in scope. If a feature is listed under "Later", don't build it yet — even if it's "almost free".

## MVP (Phase 0)

The MVP is feature-parity with the current `HebrewHandwritingWeb` app, modularized into Preact components, wired to a sync backend, and deployed to Heroku.

### F1. Canvas drawing

**Purpose**: the one drawing surface all modes share.

**Behavior**:
- Single square canvas sized to viewport width (up to 420px)
- Pointer events unify mouse / touch / stylus
- `touch-action: none` on the canvas so the browser doesn't scroll/zoom while drawing
- Stroke width scales with canvas size (~3.6% of side)
- Undo (last stroke), Clear (whole canvas)
- Keyboard: Space = clear, Ctrl/Cmd+Z = undo

**Acceptance**:
- Works on desktop Chrome, mobile Safari, mobile Chrome
- No accidental page scroll while drawing on mobile
- Undo removes only the last stroke, not the whole canvas

### F2. Calibrate tab

**Purpose**: the first-run personalization loop and the ongoing "fix a confused letter" tool.

**Behavior**:
- Shows a target letter and a Save Sample button
- 27 Hebrew letters (including finals: ך ם ן ף ץ)
- After save, auto-advance to the next incomplete letter
- Letter grid on the right with per-letter sample counts
- First-run progress: "Setup: N/27 letters collected"; when all 27 have at least 1 sample, changes to "Setup complete"
- Jump to any letter by clicking its tile in the grid
- Delete Last (last sample for current letter), Clear Letter (all samples for current letter)
- Samples-per-letter is a configurable target (default 5)
- Export Calibration (downloads a JSON), Import Calibration (uploads a JSON), Reset (wipes all samples with confirmation)
- Keyboard: Enter = save, ← / → = prev/next letter

**Acceptance**:
- First-time user can draw all 27 letters in one sitting without ever opening a menu
- Samples persist across page reloads (via sync, see F8)
- Import merges OR replaces — this is a deliberate choice we'll make; current prototype replaces

### F3. Recognize tab

**Purpose**: a debug / feel-check surface. Draw something, see what the recognizer thinks.

**Behavior**:
- Top-5 predictions as letter + percentage bars
- Top-1 margin displayed separately as confidence proxy
- Mode toggle: KNN or Centroid (live)
- KNN `k` input (default 5)
- Augment toggle (±1px shifts of every stored sample)
- Live prediction as you draw (debounced) OR predict once on pen-up

**Acceptance**:
- Toggling mode / k / augment re-runs prediction immediately against the current canvas
- No lag on desktop; debounce keeps mobile responsive

### F4. Practice tab (single letter)

**Purpose**: warm-up drill. App picks a random calibrated letter, you draw it.

**Behavior**:
- Random letter from calibrated set as target
- On pen-up, recognize
  - If top-1 matches target AND margin ≥ threshold: green flash, new letter, increment correct + total
  - Otherwise: red shake, increment total only
- Running score: "Correct: C / T (pct%)"
- Threshold input (default 0.10) — also used by F5
- Skip button to pick a new target without scoring
- Reset Score button

**Acceptance**:
- Acceptance is silent-fast: no "Next" button needed on correct
- Rejection shakes but leaves the canvas so you can wipe and retry

### F5. Vocab tab (letter-by-letter)

**Purpose**: recall practice from English prompts. Currently the core daily loop.

**Behavior**:
- English prompt at top ("peace / hello")
- You draw one Hebrew letter at a time
- On correct letter (top-1 match + margin ≥ threshold):
  - Append to Hebrew output display (right-to-left)
  - **Auto-calibrate**: push the feature vector into `calibration.samples[letter]`
  - Clear canvas, expect next letter
- On wrong letter: red shake, keep expected letter
- Controls: "I don't know" (reveal full word), Backspace (remove last accepted letter), Skip (new word)
- Word list: pulled from `packages/content/data/v2/*.yaml` via build step (~996 entries initially)
- Keyboard: Enter = skip, Space = clear canvas

**Acceptance**:
- Completing a word shows brief "✓ Correct" and advances
- Auto-calibration is transparent — no UI, just silently more samples

### F6. Letter grid + prototypes sidebar

**Purpose**: at-a-glance state. How calibrated am I? What does my "average" letter look like?

**Behavior**:
- 27-tile grid showing letter + sample count
- Active letter highlighted
- Tiles are clickable to jump-to-letter (Calibrate tab only)
- Below the grid: tiny 64×64 centroid renders per calibrated letter

**Acceptance**:
- Prototypes visibly sharpen as samples are added
- Count updates immediately after save

### F7. KNN + Centroid recognizer

**Purpose**: the math. See `RECOGNIZER.md` for details.

**Behavior**:
- 64×64 grayscale feature vector, unit-normalized for cosine similarity
- Centroid mode: one averaged prototype per class, cosine-score against all
- KNN mode: cosine-score against every stored sample, take top `k` by similarity, sum-per-class, argmax
- Augmentation: ±1px shifts of every stored sample at recognizer-build time
- Softmax temperature to turn raw cosines into probabilities
- Final-form normalization: ך→כ, ם→מ, ן→נ, ף→פ, ץ→צ when matching mid-word

**Acceptance**:
- Matches the current `HebrewHandwritingWeb/app.js` behavior (this is a straight port)
- Mode/k/augment toggle from UI without a page reload

### F8. Sync backend (minimal)

**Purpose**: move calibration and progress between devices without accounts.

**Behavior**:
- On first run, the client mints a device UUID and stores it in localStorage
- Two blob endpoints, last-write-wins:
  - `GET  /api/calibration/:deviceId` → `{ version, samples: { letter: base64[] } }`
  - `PUT  /api/calibration/:deviceId`
  - `GET  /api/progress/:deviceId` → `{ prefs, stats, seenWords }`
  - `PUT  /api/progress/:deviceId`
- Client syncs on: app start (GET), and on calibration/progress change (debounced PUT, ~2s)
- On failure: stay local-only, show a small offline indicator, retry next change

**Acceptance**:
- Calibrate on laptop, open on phone (after entering same device ID or importing code), see samples
- App stays fully usable with the backend down
- No accounts UI

### F9. Device handoff via code

**Purpose**: get calibration onto a second device without QR, email, or accounts.

**Behavior**:
- Settings panel shows current device ID as a short code (first 6 hex of UUID, plus full UUID on click)
- "Use existing device code" input on first run — paste it to join an existing calibration
- That's it. No pairing, no auth. If someone guesses your UUID, they can read your handwriting samples (acceptable for a single-user app)

**Acceptance**:
- Flow from phone onboarding takes < 60 seconds if the code is already on the clipboard

### F10. Vocab build pipeline

**Purpose**: turn YAML into a typed module consumed by the frontend.

**Behavior**:
- `packages/content/data/v2/*.yaml` → `packages/content/src/vocab.ts` (or `.json`)
- Extracts `{ he, en, pos }` for nouns (sg), adjectives (m_sg), verbs / adverbs / pronouns / prepositions (lemma)
- De-duplicates by Hebrew spelling
- Runs at build time (or via `npm run build:content`)

**Acceptance**:
- Editing a YAML file + rebuilding shows the new word in the app
- ~996 words on first build (matches current `HebrewHandwritingWeb/data/vocab_words.json`)

### F11. Deployment

**Purpose**: one URL, works on phone, updates on push.

**Behavior**:
- Heroku app, Heroku Postgres addon
- Web dyno serves the built frontend + the API
- Release phase runs Prisma migrations
- `main` branch auto-deploys to production (no staging for MVP)

**Acceptance**:
- `git push heroku main` results in a working URL within 2 minutes
- DB schema changes don't require manual `heroku run` steps

---

## Later (not in MVP)

Each of these has a short rationale for why it's worth doing later and what it depends on.

### L1. Whole-word handwriting

Draw an entire word at once, segment strokes into letters, score the sequence. Blocked on: stroke-level capture (we have it), a segmenter (greedy first), a sequence scorer (Viterbi later). Payoff: feels more like real writing.

### L2. Inflection drills

"Past-3sg-f of לפתוח" → draw the form. Blocked on: nothing — the YAML already has the paradigms. Needs a small UI mode and a query helper. Deliberately deferred because it's worthless until letter-by-letter is a habit.

### L3. Spaced repetition

Track `seen_at`, `last_correct_at`, `interval`. Pick due words first. Blocked on: a backend table (trivial) and a scheduling function (SM-2 is fine). Payoff: actual learning progress over time.

### L4. Sentence / phrase writing

Multi-word canvas, word-boundary detection, phrase prompts. Blocked on: L1 being solid. Payoff: feels like real journaling.

### L5. Per-letter stats + confusion matrix

Track which letters you confuse most. Surface as a heat map. Blocked on: logging decisions server-side (lightweight). Payoff: knowing what to practice.

### L6. Web Worker for recognition

Move feature extraction + KNN search off the main thread. Blocked on: nothing, just effort. Payoff: responsive UI on mobile with large calibration sets.

### L7. PWA / offline install

Service worker, manifest, icon. Blocked on: Vite PWA plugin is easy. Payoff: install-to-home-screen on iOS and Android, works offline.

### L8. Own CNN model

Train a small CNN from scratch on your own calibration samples (once you have a few thousand) plus a public dataset as priors. Replace the TFJS CNN that `hebrew_drills/Daber` had. Blocked on: having enough data (collect via F2 + F5 over weeks), a training script, and a deploy path for the model file. Payoff: recognition good enough for whole-word mode.

### L9. Sample upload endpoint for training

`POST /api/samples` body `{ letter, png }` — server stores PNGs for offline training. Blocked on: storage choice (S3 or large Postgres blob or local volume). Payoff: captures training data from day one without the CNN being ready.

### L10. Admin / content editor UI

A protected page that lets you browse and edit the YAML-derived lexicon. Blocked on: needing it — the YAML editor is VS Code. Payoff: maybe never, honestly.

### L11. Accounts / multi-user

Email + password or magic link, per-user blobs. Blocked on: wanting to share the app. Payoff: others can use it.

### L12. TTS / audio

"Listen and write" mode. Blocked on: TTS provider choice (WebSpeech API first, maybe Anthropic voices later). Payoff: a different modality entirely.
