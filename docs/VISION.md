# Vision

## What Daber is

**Daber is a Hebrew learning app organized around phrases, handwriting, and songs.**

The learner works through useful Hebrew phrases and short sentences, writes by hand as a core practice mode, reviews what is due, and arrives at songs or other source material as a payoff. The app should feel like one calm daily path rather than a catalog of flashcards.

Handwriting remains a core advantage. The browser-side recognizer calibrates to the learner's writing, stores samples locally, and can sync them between devices. That infrastructure should be reused. The product direction, however, is now broader than the original handwriting-only MVP: writing supports phrase recall, phrase recall unlocks songs, and songs give the learning loop a human reason to continue.

## Who it's for

You (Mike), first and only, for the MVP. A single intermediate Hebrew learner who:

- Already knows the alphabet and can read
- Wants phrases, handwriting, and songs to reinforce each other
- Uses a laptop and a phone, wants progress to follow across both
- Values a clean tool they can live with for a long time over a splashy MVP

The MVP is not built for anyone else. When the multi-user moment comes, the architecture can grow (accounts, per-user blobs, shared content), but that's explicitly out of scope until the single-user version proves its daily habit value.

## Core value propositions

1. **Phrases first.** The atomic unit of progress is a phrase or short sentence. Words and forms exist so the learner can understand and produce something usable.
2. **Songs as destinations.** Songs, clips, poems, and dialogs are the reason for the climb. The learner prepares, then arrives.
3. **Handwriting as a peer.** Writing is not buried in settings or diagnostics. It sits beside reading, listening, and phrase practice as a first-class mode.
4. **Personalization without friction.** The recognizer starts with calibration and improves as the learner writes. The model is local and personal, not just generic.
5. **Content you trust.** The V2 YAML lexicon and song-lesson data are curated, not scraped. YAML stays the source of truth.
6. **Zero cloud dependency where possible.** The recognizer runs in the browser. Local state keeps the app usable offline; the backend earns its keep through sync and training/sample capture.

## Guiding principles

- **Keep the existing foundation.** Preact, Fastify, Prisma, sync, content builds, the canvas, and recognizer stay unless there is a concrete reason to replace them.
- **Replace the learner experience.** The current Missions / Free practice / Songs surface should move toward a Path home and Journey-style song maps.
- **Write with current recognition first.** Make the letter-by-letter and phrase-writing flow feel close to the ideal before betting the redesign on true freeform whole-word scoring.
- **No noisy gamification.** Progress can include a streak, review queue, recap, and trail, but not loud XP theater.
- **YAML is the source of truth.** Content edits happen in YAML, not in DB admin UI. The DB is a runtime query cache.
- **Backend earns its keep.** Every new endpoint has to justify itself against the "just do it client-side" option.

## Deliberately out of scope (for now)

These are good ideas. They are all deferred. Revisit after the MVP is a daily habit.

- **Accounts, auth, multi-user.** Device ID only. Single "user" implicit.
- **True freeform whole-word scoring.** Spike it separately before making it central to the redesigned UI.
- **Heavy SRS.** Start with simple due/review behavior from existing progress.
- **Full audio/TTS stack.** A destination screen can ship before complete playback or speech features.
- **OpenAI / LLM features.** Not needed. Writing recognition is deterministic.
- **Grammar explainers as the main product.** Notes are useful; grammar lectures are not the core.
- **Sharing, social, leaderboards.** Not the point.
- **Admin UI for YAML.** Editing YAML is the admin UI.

## What success looks like

- I open Daber and know the next useful thing to do.
- I work through a short phrase-first path that includes writing, review, and a clear destination.
- I can see where I am inside a song journey and why each word or phrase matters.
- I calibrate once and the recognizer stops tripping on my handwriting within a week.
- I can switch from laptop to phone mid-session and pick up where I left off.
- When I add a new word to the YAML and push, it shows up in the app after the next deploy without any manual import/export dance.
- The app feels worth opening daily before any full-word recognition or AI features are added.
