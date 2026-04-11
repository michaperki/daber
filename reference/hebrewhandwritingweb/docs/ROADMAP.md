Roadmap and Next Steps

Overview
- The core single-letter recognizer, first-run setup, and Vocab (letter-by-letter) are implemented. Below is a pragmatic roadmap to improve UX, recognition quality, and portability.

Data & UX
- Per-letter stats: show sample counts, top confusions, and acceptance rates to guide practice.
- Focus sets: allow selecting subsets of letters for targeted sessions and setup.
- Vocab progression: tag words by difficulty, filter to calibrated letters, add streaks.

Recognition & Performance
- Whole-word mode: segment a stroke stream into letters and score sequences (e.g., Viterbi over boundaries), starting with greedy segmentation.
- Web Worker: move recognition to a worker to keep the UI responsive during heavy comparisons.
- Fast paths: cache per-letter centroids and small KNN subsamples for speed; expose controls to trade accuracy vs speed.

Persistence & Portability
- Merge-on-import: append samples instead of replacing the entire calibration to make sharing safer.
- IndexedDB migration: optional for larger datasets and future versioned migrations.
- PWA: manifest + service worker for installability and offline stability, especially on iOS.

Instrumentation
- Local session logs for mismatches; quick export button for a “bug bundle” (canvas snapshot + features + predictions).
- Light A/B toggles for thresholds and k in KNN to refine defaults.

Codebase Evolution
- Consider a framework once the UI grows (wizards, routing, component state):
  - Preact/React + Vite for componentized UI with minimal bundle size.
  - Or Svelte for simple reactivity and small output.
- Keep canvas + recognition as plain modules; wrap with components/hooks.
- Add Playwright tests for critical flows (calibrate one letter, vocab accept, export/import).

Nice-to-haves
- Long-press letter tiles to clear that letter; per-letter thresholds; adjustable canvas size.
- Theming and accessibility passes (contrast, focus states, screen reader labels).

