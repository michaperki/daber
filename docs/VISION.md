# Vision

## What Daber is

**Daber is a Hebrew handwriting practice app that continuously personalizes to how you write.**

You draw letters and words on a canvas. A simple on-device recognizer tells you whether what you drew matches what was asked for. Every letter you get right becomes another calibration sample, so the recognizer gets a little better with every correct draw. Over time, the app knows your handwriting as well as you do.

It is a tool for **writing practice**, not a flashcard app, not a reading app, not a grammar explainer. Reading, listening, and explaining are all things other apps already do well. Daber's niche is the motor-memory side of Hebrew — forming letters, spelling words from memory, and writing inflected forms without looking them up.

## Who it's for

You (Mike), first and only, for the MVP. A single intermediate Hebrew learner who:

- Already knows the alphabet and can read
- Wants to drill handwriting as a way to cement vocab and grammar
- Uses a laptop and a phone, wants progress to follow across both
- Values a clean tool they can live with for a long time over a splashy MVP

The MVP is not built for anyone else. When the multi-user moment comes, the architecture can grow (accounts, per-user blobs, shared content), but that's explicitly out of scope until the single-user version proves its daily habit value.

## Core value propositions

1. **Personalization without friction.** Other handwriting tools ship with a generic recognizer. Daber starts pretending to know nothing and asks you to draw each of the 27 Hebrew letters once. After that, every correct draw silently becomes a new sample. The model is yours, not an average.
2. **Writing as the learning modality.** You cannot fake your way through writing something from memory. Recall is forced, motor memory is built, and the feedback loop is immediate.
3. **Content you trust.** The V2 YAML lexicon (verbs with full paradigms, nouns with plurals, adjectives with agreement, etc.) is curated, not scraped. It already exists and is reused as-is.
4. **Zero cloud dependency (optional).** The recognizer runs in the browser. Calibration lives in localStorage. A tiny backend exists only to sync between devices. You could turn off your WiFi and the app would still work.

## Guiding principles

- **Start laughably simple.** The MVP is the current `HebrewHandwritingWeb` app + sync. No feature creep.
- **One canvas.** There is exactly one drawing surface. Different modes change what it expects, not how it looks.
- **No modals, no wizards past first-run.** Tabs, progress text, inline feedback. That's it.
- **Every feature proves itself before getting more weight.** If single-letter practice isn't a daily habit, whole-word mode won't save it.
- **YAML is the source of truth.** Content edits happen in YAML, not in DB admin UI. The DB is a runtime query cache.
- **Backend earns its keep.** Every new endpoint has to justify itself against the "just do it client-side" option.

## Deliberately out of scope (for now)

These are good ideas. They are all deferred. Revisit after the MVP is a daily habit.

- **Accounts, auth, multi-user.** Device ID only. Single "user" implicit.
- **Whole-word handwriting with stroke segmentation.** Letter-by-letter is enough to prove the loop.
- **Inflection drills.** The YAML has the data. The UI for it does not.
- **Spaced repetition.** Random-from-seen is enough for the MVP.
- **Sentence writing.** Words first.
- **Own CNN model.** KNN is enough to prove the loop. Training comes after there's data to train on.
- **Audio / TTS.** Not in scope for a writing app. Maybe never.
- **OpenAI / LLM features.** Not needed. Writing recognition is deterministic.
- **Grammar explainers.** Other apps do this better.
- **Sharing, social, leaderboards.** Not the point.
- **Admin UI for YAML.** Editing YAML is the admin UI.

## What success looks like

- I calibrate once and the recognizer stops tripping on my handwriting within a week.
- I open Daber in the morning, do a 5-minute warm-up and a 10-minute vocab session, and close it.
- I can switch from laptop to phone mid-session and pick up where I left off.
- When I add a new word to the YAML and push, it shows up in the app after the next deploy without any manual import/export dance.
- Three months in, I decide whether to add whole-word mode based on whether I actually used the MVP.
