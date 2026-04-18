# Roadmap

The wireframes reset the product direction. The app should move from the original handwriting-MVP surface toward a phrase-first, song-destination learning loop while keeping the existing app infrastructure.

The rule: **ship the smallest working slice of the redesign on top of the current foundation, then expand only where daily use proves it matters.**

## Phase 0 — Stabilize The Baseline

**Goal**: keep the current deployed app buildable and protect the hard parts we are not replacing.

Scope:
- Root `npm run build` succeeds locally and in Heroku build context.
- Prisma client generation is part of the API build path.
- Existing calibration, recognizer, canvas, progress, sync, authored lessons, and song-derived lessons keep working.
- Stale docs no longer claim the app is pre-scaffold or only a handwriting MVP.

Done when:
- `npm run build` passes.
- README and vision docs describe the phrase/song/handwriting direction.
- No unrelated UI migration has been mixed into the stabilization work.

## Phase 1 — Direction Shell

**Goal**: replace the learner-facing home/navigation model while preserving current routes as fallbacks.

Recommended direction:
- **Path home**: a single opinionated daily plan: review, new words, write, phrase, arrive.
- **Journey lesson view**: each song or source item is a map of stations: Words, Write, Phrase, Line, Play.
- **Atelier elements later**: Write, Songs, Review, and Me can become secondary tabs once the core loop is clear.

Done when:
- Opening the app lands on a daily path instead of the current Missions / Free practice / Songs list.
- A song lesson can be opened as a journey map.
- Existing lesson drills still run through the current session planner.

## Phase 2 — Wireframe Design System

**Goal**: convert the wireframe look into maintainable app CSS and components.

Scope:
- Paper/ink/accent tokens.
- Typography and Hebrew/RTL rules.
- Buttons, chips, section headers, bottom nav, progress trail, recap cards.
- A full-screen or canvas-dominant handwriting layout that still uses the current `DrawCanvas`.

Done when:
- The real app visually reads as the same product as the wireframes.
- Wireframe inline JSX styles have not been copied directly into production code.

## Phase 3 — Phrase And Review Model

**Goal**: make phrases first-class progress objects instead of incidental drill rows.

Scope:
- Phrase progress and review eligibility.
- Daily review queue based on existing progress before introducing complex SRS.
- Session recap that reports words, phrases, writing, and next review.

Done when:
- A phrase learned in a lesson can appear in review.
- The recap can explain what was learned without only counting generic items.

## Phase 4 — Destination Screens

**Goal**: make songs, clips, poems, or dialogs feel like earned destinations.

Scope:
- Song/lyrics screen from existing `songLessons` data.
- Locked/unlocked or prepared/unprepared state.
- Tap word or line for lightweight definition/notes where authored data exists.
- Audio can remain basic or absent until the destination screen proves useful.

Done when:
- Completing prep leads to a visible destination, not just a completion card.

## Phase 5 — Handwriting Ideal Spike

**Goal**: test whether the full-bleed/freeform handwriting ideal can be supported by recognition quality.

Options:
- Whole-word segmentation and scoring.
- Stroke order and proportion scoring.
- Hybrid CNN/KNN evaluation against captured stroke samples.
- Web Worker if recognition cost starts affecting mobile interaction.

Done when:
- We know whether freeform word writing is ready for the main flow or should remain a later research track.

## Later

- Inflection drills using the existing YAML paradigms.
- Full SRS with intervals/ease if simple review is not enough.
- PWA install polish.
- Per-letter confusion stats and calibration repair.
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

Phases are ordered but not rigid. The rule is just: **one product bet at a time, with the existing foundation kept buildable throughout.**
