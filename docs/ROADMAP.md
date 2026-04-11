# Roadmap

The rule: **do not start a phase until the previous phase has proved its value in daily use.**

## Phase 0 — MVP (the thing we're planning now)

**Goal**: a deployed Daber at a URL you can open on your phone, feature-parity with the current `HebrewHandwritingWeb`, plus sync.

Scope: F1–F11 in `FEATURES.md`. Every feature listed there is MVP. Every feature NOT listed there is deferred.

Done when:
- Heroku app live
- First-run calibration of all 27 letters works on desktop and mobile
- Vocab letter-by-letter flow works end-to-end
- Sync survives a laptop-to-phone handoff
- You use it for 5 consecutive days without opening the console

Explicit non-goals for Phase 0: whole-word mode, inflection drills, SRS, sentence writing, own CNN, accounts, admin UI, TTS.

See `PLAN.md` for the step-by-step implementation checklist.

---

## Phase 1 — UX polish (only if Phase 0 is a habit)

**Goal**: make the MVP actually pleasant, not just functional.

Trigger: you've used Phase 0 daily for ≥ 2 weeks.

Candidates (pick 2–3, not all of these):

- **Per-letter stats in the Calibrate sidebar.** Show sample count + most-confused-as letter for each tile. Drives targeted calibration.
- **PWA install.** Vite PWA plugin, manifest, service worker. "Add to home screen" on iOS actually works now. Offline use works even if sync is down.
- **Focus sets.** Let the user pick a subset of letters for a session ("drill just ש / ס / ח / ה"). Useful when you've identified a confusion.
- **Vocab filters.** Restrict word list to only words whose letters are all calibrated. Tag words by part of speech and let user filter.
- **Undo for sync.** Local history of the last ~10 calibration mutations, with an undo button. Useful when Vocab accepts a misdrawn letter and poisons your samples.
- **Better first-run copy + illustrations.** The current onboarding is minimal. Small writeup + maybe an animated stroke hint per letter.

Done when: it feels nice enough that you'd show it to a friend.

---

## Phase 2 — Whole-word mode + basic SRS

**Goal**: unlock the two features that transform Daber from a letter drill into a real writing practice app.

Trigger: Phase 0 + Phase 1 are stable, you have a few thousand calibration samples.

### 2.1 Whole-word handwriting (L1)

- Draw an entire word on a single canvas
- **Greedy segmentation first**: find horizontal gaps between strokes, split at gaps that exceed a threshold
- Score each segment against the expected letter sequence
- Display the recognized letters as you lift the pen mid-word
- Accept when the full sequence matches

Deferred: Viterbi-over-boundaries, per-letter re-segmentation based on scoring feedback. These come if greedy turns out to be insufficient.

### 2.2 Basic SRS (L3)

- Track `seen_at`, `last_correct_at`, `ease`, `interval_days` per word
- Schedule reviews using SM-2 or FSRS
- Vocab tab picks "due" words first, then random unseen, then random seen
- Stats in Settings: "X words due today", "Y words mastered"

### 2.3 Web Worker (L6)

Likely needed by now because whole-word mode + larger sample sets strain the main thread. Move `extractFeaturesFromCanvas` + KNN scoring into a worker. Keep the API in `apps/web/src/recognizer/` identical so UI code doesn't change.

Done when: you can write full words from English prompts and the daily queue is driven by SRS.

---

## Phase 3 — Inflection drills + sentence mode

**Goal**: exercise the full YAML dataset. This is where the verb paradigms and noun/adjective forms start to matter.

Trigger: whole-word mode feels reliable. You want more variety.

### 3.1 Inflection drills (L2)

- New mode: "Write the past-3sg-f of לפתוח"
- Requires the YAML inflection paradigms in a query-friendly shape. Either:
  - Ship `packages/content/dist/inflections.json` as a flat array and filter client-side, or
  - Port the `hebrew_drills` Prisma schema for Lexeme/Inflection into `apps/api`, import via a script modeled on `v2-import.ts`
- Start with verbs (most paradigms), then nouns (sg/pl), then adjectives (agreement)
- Integrates with SRS: each form is a separate item with its own schedule

### 3.2 Sentence / phrase writing (L4)

- Multi-word canvas with word-boundary detection (larger horizontal gap)
- English prompt is a full phrase
- Uses the `examples` from each YAML entry
- Accepts when all words match

### 3.3 Grammar concept links (from YAML)

- `packages/content/data/v2/concepts/` is already curated. Surface these as mini-lessons.
- Each concept has a `description` + linked examples.
- Not a grammar explainer app — just a way to tag sentence drills with the concept they illustrate.

Done when: the daily loop includes letter, word, inflection, and sentence drills.

---

## Phase 4 — Own CNN model

**Goal**: train a small CNN on your own samples + maybe a public dataset, and switch the recognizer to the hybrid CNN + KNN scorer from `reference/hebrew_drills/handwriting/scoring.ts`.

Trigger: your calibration has ≥ 1000 samples per letter, or KNN accuracy has plateaued below what you want for whole-word mode.

### Subsystems

- **Sample collection endpoint (L9)**. `POST /api/samples { letter, png }`. Server stores PNGs in a blob store (Heroku doesn't support persistent disk, so this probably means S3 via a cheap Bucketeer or direct AWS).
- **Training pipeline.** Python (PyTorch or TF) or Node (TFJS-node). Likely Python — better libraries, notebook-friendly. Dataset = your samples + possibly HHD or Light Blue as priors (but see `reference/hebrew_drills` — that path didn't land, so freshness is fine).
- **Model export.** TFJS LayersModel format, ~2–3 MB quantized.
- **Frontend integration.** Port `reference/hebrew_drills/handwriting/scoring.ts` into `apps/web/src/recognizer/`. CNN probs + KNN prototype dot-product combined via `alphaFor(count) * proto + logp(cnn) + beta * (L === expected)`.
- **Model deployment.** Static file served by the web dyno. Versioned directory (`/models/v1/`, `/models/v2/`) so updates don't require cache-busting dance.

Done when: whole-word mode works well enough for real writing practice.

---

## Phase 5+ — Speculative

Ideas worth saving but not committing to:

- **Multi-user accounts.** Magic link auth, per-user blobs, maybe shared content.
- **TTS / audio.** "Listen and write" mode using the WebSpeech API or a real TTS provider.
- **Stroke order feedback.** Compare your stroke order + direction to a reference, not just the final rendered shape.
- **Export to Anki.** Dump seen words into a deck.
- **Kotel mode.** Random drill from the 613 mitzvot, or from Pirkei Avot, or some other canonical text. Pure vibes.
- **Mobile-native wrapper.** Capacitor or React Native Web — only if the PWA isn't good enough on iOS.

---

## Phase prioritization rule

At the end of each phase, ask:

1. **Am I using the current Daber daily?** If no, don't add features. Fix friction.
2. **What's the smallest next feature that would make me want to use it more?** That's the next phase.
3. **What am I avoiding because it's hard, not because it's unneeded?** That might be the next phase instead.

Phases are ordered but not rigid. If Phase 0 is stable and you want inflection drills more than you want SRS, swap them. The rule is just: **one phase at a time**.
