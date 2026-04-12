# Vocab Delivery System

This doc describes how vocab selection works today (proto behavior), answers the progression questions, and proposes a curriculum path we can implement with our existing YAML. It also flags where the lexicon should grow next.

## Current Behavior (MVP parity)

- Source of words
  - Built at build-time from `packages/content/data/v2/*` into a flat array of `{ he, en, pos }`.
  - Verbs are exported as their lemma (infinitive). Nouns use singular/base; adjectives use m_sg/base; adverbs/pronouns/prepositions use lemma. Concepts are intentionally excluded.
- Selection
  - The Vocab tab picks a random word from the flat list (uniform random).
  - There is no unit, theme, or spaced-repetition schedule yet.
- Delivery and acceptance
  - English prompt is shown; the user draws the Hebrew one letter at a time.
  - On each pen‑up, the app predicts; if `top‑1 === expectedChar` and `margin ≥ threshold`, the letter is accepted, appended to the output, and the canvas clears for the next letter.
  - After the full word is completed, a brief ✓ appears and a new random word is chosen.
- Calibration coupling
  - On every accepted letter, the feature vector is auto‑saved into calibration for that letter. This gradually personalizes the recognizer without explicit calibration time.
  - Practice tab (single letter) targets only calibrated letters. Vocab does not currently filter by calibration coverage — it can present words containing uncalibrated letters, though acceptance is naturally harder until those letters are seen and saved.
- Progression and concepts
  - No explicit progression: verbs are shown as infinitives because that’s how we extract them, but there is no gating or staged unlock.
  - Concepts (e.g., accusative את) are not delivered at all in MVP; the extractor skips the `concepts/` directory.

## Answers to your questions

- Is there progression (infinitive → conjugations → examples only after success)?
  - Not currently. The system is a flat random sampler. Verbs are lemmas (infinitive) by design of the extractor, but there is no gating or staged unlock.
- Are concepts only given after being introduced?
  - No. Concepts are not delivered in MVP.
- Is vocab delivery based on calibrated letters?
  - Vocab: no (random words, independent of calibration coverage). Practice (single letters): yes (only from letters with ≥1 sample). Auto‑calibration from accepted vocab letters gradually improves coverage.

## Proposed Curriculum (buildable with current YAML)

A light‑weight curriculum can be layered on top of our existing data without new DB tables. The rules live in the frontend and content build.

1) Stage‑gated by letter coverage
- Compute `letterSet(word)` at build time (unique letters for each word).
- Eligibility rule for the Vocab picker:
  - Stage A (default): words where all letters have ≥1 sample; if too restrictive, allow ≥80% coverage and treat missing letters as “learning moments”.
  - Stage B: after `pilot_wizard_done` (≥1 sample per letter), remove coverage gating entirely.
- Rationale: avoids immediate frustration on first run; once the recognizer has a foothold across the alphabet, let auto‑calibration drive learning.

2) Theme‑based units from existing YAML folders
- The `v2/` folders already encode themes:
  - verbs/{core_actions,motion,communication,cognition_perception}
  - nouns/{core_people_objects,food_drink,places,time_date}
  - adjectives/{core,colors}
  - adverbs/{time_frequency}
  - pronouns/core
  - prepositions/core
- Build `units.json` with entries like `{ key: 'verbs.core_actions', label, size, words[] }`.
- Picker strategy:
  - Default: uniform across enabled units.
  - “Unit focus” mode: bias 70% toward the active unit, 30% from others to keep variety.
- UI: a minimal selector in Settings to toggle active units (the UI agent can add later).

3) Verb progression (light)
- Keep verbs as lemmas in Vocab until the user shows basic mastery.
- Unlock conjugation drills (later feature L2) per‑verb after N correct lemma completions (e.g., N=3 across days). This uses `seen_words` counters we already sync.
- Examples: show a single minimal example sentence below the prompt after the first correct completion for that word; before that, hide it to avoid cognitive load. The YAML already has examples to surface.

4) Spaced repetition scaffolding (opt‑in later)
- Start recording `seen_words[word].count/last_seen_at` (already in ProgressV1) and add a simple “due” score (e.g., SM‑2 or even a 3‑bucket scheduler).
- Picker combines: `eligibility ∧ (freshness ∨ due)`.

5) Concept intros (later)
- Keep concepts out of the main flow for MVP. Later, introduce a passive “info chip” when a selected word’s example contains a concept (e.g., accusative את). No gating, just a nudge: “This word often appears with את”.

## Minimal build changes to enable curriculum

- Content build additions (non‑breaking):
  - Add `letters` to each row in `vocab.json` (unique set of glyphs).
  - Emit `units.json` with word indices per theme.
- Frontend selection rules:
  - Compute calibration coverage quickly: `coverage(word) = min(samples[letter]?.length > 0)`.
  - Picker chooses from `eligible(words)`; if empty, gradually relax coverage threshold.
  - Track per‑word stats in `seen_words` (already present) to later enable simple SRS.

## Where to expand the lexicon

Quick counts from the current YAML snapshot (approximate, by entries):
- Nouns ~86
- Adjectives ~41
- Verbs ~26
- Prepositions ~21
- Pronouns ~15
- Adverbs ~10

Recommendations:
- Verbs: expand “core_actions” and “motion/communication” to ~60–80 lemmas total. Verbs drive a lot of practice variety and will unlock a future conjugation mode.
- Adverbs: grow time/frequency (e.g., תמיד, לעתים, לעיתים קרובות, עכשיו, אחר כך…) to ~30. Adverbs improve example naturalness.
- Prepositions: ensure a strong core (ל, על, ב, עם, אצל, לפני, אחרי, בין, מעל, מתחת, בלי, בגלל…). Target ~35 with good examples; suffix tables for those that take them can wait.
- Pronouns: round out core (אני, אתה/את, הוא/היא, אנחנו, אתם/אתן, הם/הן) with possessives and demonstratives later.
- Adjectives: add frequent opposites and everyday descriptors to ~60 (גדול/קטן, ארוך/קצר, קר/חם, חדש/ישן, ראשון/אחרון…).
- Nouns: keep adding everyday items and places; aim for high‑utility lists (kitchen, clothing, school, city features) before low‑frequency items.

## Acceptance criteria for “Curriculum v0”
- Content build emits `vocab.json` rows with `letters` and `pos`, and `units.json`.
- Vocab picker:
  - Onboarding: only words whose letters are ≥80% covered by calibration (soft gate).
  - Steady state: unit‑biased random; fallback to global random if active unit is exhausted in a session.
- UI (later): a simple toggle for unit(s) and a small “why this word?” hint (“letters you’ve calibrated”, “core actions unit”).

---

Implementation details for the UI agent live in docs/DEV_JOURNAL.md. This document sets the policy; DEV_JOURNAL outlines the hooks and data fields to implement it.

