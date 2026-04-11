Hebrew Handwriting Web

Simple browser‑based tool to calibrate on your handwriting and recognize Hebrew letters as you draw.

Features
- Calibration: collect N samples per letter (defaults to 5). Click any tile in the letters grid to jump straight to that letter.
- First‑run setup: guides you to enter at least one sample for every Hebrew letter, with a live progress indicator.
- Recognition: top‑5 predictions plus a top‑1 confidence margin.
- Practice: draw the prompted letter; the app accepts silently when it's confident and shakes when it's not. A lightweight stepping stone toward the auto-recognize word mode.
- Vocab (letter‑by‑letter): practice writing words from an English prompt. Draw each letter in sequence; correct letters are accepted and also auto‑added to your calibration.
- Two recognizers: KNN (vote over k most similar samples) or Centroid (one averaged prototype per class). Toggle live.
- Shift augmentation: each stored sample is expanded with ±1px translations for more robust matching against pen‑position variance.
- Local persistence: saves calibration and preferences to `localStorage`. Export/import JSON supported.
- No backend, no installs — open `index.html` in a browser.
- Fix mistakes quickly: "Delete Last" removes the most recent sample for the current letter; "Clear Letter" deletes all samples for just that letter.

Using the full YAML dataset
- This repo now includes the curated YAML from `hebrew_drills/v2` under `data/v2/` (nouns, verbs, adjectives, adverbs, pronouns, prepositions).
- Generate a large vocab list for the Vocab tab by running: `node scripts/build_vocab.js`.
  - This writes `data/vocab-data.js` (global `window.VOCAB_WORDS`) and `data/vocab_words.json`.
  - The app auto‑uses this list when present; otherwise it falls back to a small built‑in pilot list.
  - No server required. The dataset is loaded via a plain `<script>` include to work on `file://`.
  - Tip: Use `node scripts/build_vocab.js --core-only` to include only the curated P0 files (skips each POS’s `all.yaml`).

How to use
1) Open `index.html` in a modern browser (Chrome/Edge/Firefox/Safari).
2) Go to the Calibrate tab. Draw the prompted letter and click "Save Sample" until you reach the target count. It auto-advances to the next letter.
3) Repeat for as many letters as you like (ideally all 27 forms including finals).
4) Switch to Recognize to see predictions as you write. Draw a letter — prediction runs once when you lift the pen.
5) Switch to Practice once you've calibrated enough letters. The app picks a random calibrated letter and you draw it. On lift, it accepts silently (green flash, new letter) if the top-1 prediction matches and the margin is above the threshold, or shakes red if not. Use Skip to move on, Reset Score to zero the counter, and tune Threshold to set how confident the recognizer has to be to accept (default 10%).

Keyboard shortcuts
- Enter: save sample (calibrate) / predict once (recognize) / skip letter (practice)
- Space: clear canvas (in practice mode, this is your "retry" key)
- Left / Right arrows: previous / next letter (calibrate)
- Ctrl/Cmd+Z: undo last stroke
- Click any tile in the letters grid: jump to that letter
- "Delete Last" button: remove the most recent sample for the current letter
 - "Clear Letter" button: remove all saved samples for the current letter

Vocab mode (implemented)
- Find it under the Vocab tab. The app shows an English prompt and expects the Hebrew spelling, one letter at a time.
- Controls: I don't know (reveal), Backspace (remove last accepted letter), Skip (new word). Enter also skips.
- Acceptance uses the same confidence margin as Practice (tunable in Practice panel).
- Correct letters are auto‑added to calibration to continually personalize recognition.
- Current word list (with English glosses):
  - שלום — peace / hello
  - שומר — guard
  - שיר — song
  - שירות — service
  - מותר — permitted
  - יותר — more
  - תשלום — payment
  - לומר — to say
  - מישור — plain
  - רושם — impression

Recognizer details
- KNN mode (default): compares your stroke against every stored sample using cosine similarity, takes the k most similar, and sums their similarities per letter. The top letter wins. `k` is tunable in the Recognize panel.
- Centroid mode: compares against one averaged prototype per letter. Faster but less robust when you draw a letter multiple distinct ways.
- Augment: applies ±1px shifts (x and y) to every stored sample at recognizer-build time. Roughly 5× the effective sample count. Toggle off to compare.
- Top-1 margin: difference between the best and second-best predictions. Use this as a proxy for confidence — a margin near 0 means the recognizer is genuinely torn.
- Input normalization: crops to ink bounding box, pads, rescales to 64×64, and converts to grayscale (ink emphasized), unit-normalized for cosine similarity.

Mobile testing
- Build a single self-contained file with `node build.js`. This inlines `styles.css`, `app.js`, and (if present) `data/vocab-data.js` into `standalone.html` in the project root (no dependencies needed, just Node).
- **Android**: email `standalone.html` to yourself → open the attachment → "Open with" Chrome. JavaScript runs normally from the local file.
- **iOS**: more painful. Safari does not reliably execute JS on `file://` URLs, and the Files app preview often strips behavior. Options:
  1) Save `standalone.html` to iCloud Drive → open from Files app. Works sometimes, fails often.
  2) Use a code editor app that supports HTML preview (Koder, Textastic).
  3) **Recommended**: host it temporarily. The fastest way is GitHub Pages — one `git push` to a `gh-pages` branch and you get a URL. Surge (`npx surge .`) is also ~30 seconds. Neither counts as "real" deployment.
- Calibration is stored in browser `localStorage`, which is per-browser and per-origin. Calibration done on your laptop does NOT carry over to your phone. Either:
  1) Use the Export Calibration button on your laptop, email the JSON to yourself, import it on the phone, or
  2) Calibrate fresh on the phone (recommended — the recognizer works best on data that matches the drawing device anyway, because stroke pressure and finger vs stylus affect shapes).
- The canvas resizes to fit the viewport width on mobile (up to ~420px square). Larger tap targets and iOS safe-area insets are handled in the mobile media query.

Notes
- Works best with 5–10 diverse samples per letter. If the recognizer is confusing two letters, add samples to the under-represented one, or delete bad samples and redraw them.
- All data stays in the browser. Export JSON to move calibration between devices.
- If you regenerate `standalone.html` after editing, re-run `node build.js`.

Current storage behavior (incl. iOS HTML viewer)
- Calibration is stored in `localStorage` under keys `hebrew_calibration_v1` (samples) and `hebrew_prefs_v1` (UI prefs). This storage is per-browser and per-origin.
- On iOS when using an HTML viewer (e.g., Koder/Textastic preview), data persists inside that app’s WebView sandbox. It is not shared with Safari and can be cleared if the app is reinstalled or storage is reset.
- Size footprint is small (tens of KB typical). The iOS `localStorage` limit (~5MB) is ample for this app.
- To move or back up calibration between devices, use Export/Import (JSON). No backend is required for single-device use.

See docs/mini-pilot.md for details of the setup and Vocab implementation, plus configuration pointers.
