# Curriculum & Mastery Plan

This document describes the lightweight curriculum design and progression logic for Daber. It favors clarity over complexity and is intended for a single‑user, adaptive workflow.

## Principles

- Chapters control breadth; per‑lemma tiers control depth.
- Cells are the unit of curricular mastery (not linguistic theory).
- Keep algorithms simple: no heavy SRS, no feature flags.
- The system should feel alive via small, timely suggestions; you remain in control.

## Structure

- Chapters (breadth): YAML groupings (e.g., verbs/core_actions.yaml, adjectives/core.yaml, nouns/core_people_objects.yaml). Chapters define which lemmas are in scope.
- Per‑lemma tiers (depth): a small, fixed sequence per verb that unlocks fuller expression as you stabilize current forms.
- Cell states: `introduced → practicing → mastered`, with simple streak thresholds that you already have.

## Verb Tiers (Per‑Lemma)

Four tiers per verb, no micro‑steps:

1) Present
- Cells: `lemma`, `present_m_sg`, `present_f_sg`, `present_m_pl`, `present_f_pl`
- Readiness for next tier uses only the 4 present cells (ignore the `lemma` cell for readiness).

2) Past (full)
- Cells: all 9 person/number/gender forms (`past_1sg`, `past_2sg_m`, `past_2sg_f`, `past_3sg_m`, `past_3sg_f`, `past_1pl`, `past_2pl_m`, `past_2pl_f`, `past_3pl`).

3) Future (full)
- Cells: all 9 person/number/gender forms (`future_*`).

4) Imperative
- Cells: `imperative_sg_m`, `imperative_sg_f`, `imperative_pl_m`, `imperative_pl_f`.

## Readiness Rule (When to Suggest Next Tier)

- Threshold: suggest the next tier when at least two‑thirds of the current tier’s cells are in `practicing` or `mastered`.
  - Tier 1 → 2: ≥ 3 of 4 present cells are practicing/mastered.
  - Tier 2 → 3: ≥ 6 of 9 past cells are practicing/mastered.
  - Tier 3 → 4: ≥ 6 of 9 future cells are practicing/mastered.
- Timing: evaluate after you complete any verb cell for that lemma. If the threshold just became true, queue a suggestion.
- Rate limiting: surface at most one suggestion per session.
- Content guard: only suggest tiers whose cells exist in the dataset (both `*_he` and `*_en` labels present). Skip until content lands.

## UI Surface (Minimal)

- Inline prompt after the triggering completion:
  - Text example: “Past forms for ‘לכתוב’ are ready. Unlock 9 forms now?”
  - Actions: `[Unlock]` `[Later]`.
- Unlock: adds that tier’s cells for the lemma to the active introduced set (effective immediately), and shows a brief toast (“Past unlocked for לכתוב”).
- Later: snoozes further prompts for that lemma for this session.
- Scope: this is a local, per‑user overlay on top of the baseline curriculum; it does not edit the YAML repository.

## Selector Philosophy (Simple & Intentional)

- State weights only: `introduced` > `practicing` > `mastered`, with light recency/difficulty bias.
- Basic guardrails:
  - Breadth floor: ensure at least 3 distinct lemmas in any 10 items.
  - Depth cap: avoid more than 3 cells from the same lemma back‑to‑back.
  - Novelty budget: introduce ≤ 2–4 new cells per session.
- No complex SRS or due‑date math.

## Chapters as Breadth

- Chapters define the candidate lemma pool. You unlock/lock chapters manually via curriculum files.
- Per‑lemma suggestions operate only within the active chapter set. This keeps depth focused and sessions coherent.

## What We Keep vs Remove

- Keep: cell‑based mastery, chapters as breadth, the 4 verb tiers, the readiness rule above, and the minimal suggestion UI.
- Remove/simplify: global tense waves for all verbs (other than present for starters); avoid feature flags and complex scheduling.

## Notes for Other POS (Future)

- Adjectives: treat the 4 forms (`m_sg`, `f_sg`, `m_pl`, `f_pl`) as a single tier; suggestions not needed initially.
- Nouns: treat `sg` and `pl` as a single tier; suggestions not needed initially.

## Rationale

This design gives you intentional breadth via chapters and organic depth via per‑lemma tiers. The 2/3 readiness threshold leverages your existing cell states, avoids perfectionism, and keeps the experience moving without opaque automation or heavy scheduling.

