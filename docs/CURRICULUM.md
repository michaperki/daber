# Curriculum & Mastery Plan

This document describes the lightweight curriculum design and progression logic for Daber. It favors clarity over complexity and is intended for a single‑user, adaptive workflow.

## Principles

- Chapters control breadth; per‑lemma tiers control depth.
- Cells are the unit of curricular mastery (not linguistic theory).
- Keep algorithms simple: no heavy SRS, no feature flags.
- The system should feel alive via small, timely suggestions; you remain in control.

## Structure

- Layers:
  - Breadth: which content is in scope (chapters/domains/POS).
  - Depth: how a lemma expands over time (tiers for verbs; simple for others).
  - Selection: how a session is composed (light, intentional rules).
- Chapters (breadth): YAML groupings (e.g., verbs/core_actions.yaml, adjectives/core.yaml, nouns/core_people_objects.yaml). Chapters define which lemmas are in scope.
- Per‑lemma tiers (depth): a small, fixed sequence per verb that unlocks fuller expression as you stabilize current forms.
- Cell states: `introduced → practicing → mastered`, with simple streak thresholds that you already have.

## Breadth (Chapters)

- Unit of a chapter: a small, coherent set that fits on one mental shelf.
  - Target size: ~12–18 lemmas total per chapter (aim 4–6 verbs, 8–12 nouns/adjectives).
  - POS mix per chapter:
    - Verbs: anchor expression (most chapters include 4–6 core verbs).
    - Nouns: scene content (people/objects/places tied to the theme).
    - Adjectives: qualities that fit the theme.
- Active chapters at once: 1–3. More feels noisy; fewer can feel narrow.
- How new content enters:
  - You activate a chapter in curriculum → its lemmas become eligible immediately.
  - Verbs enter at Tier 1 (present) only; deeper tiers are locked until suggested/unlocked per lemma.
  - Nouns and adjectives enter with their full forms (see below), no tiering.

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

- Mix & ratios (default): ~60% verbs, 25% nouns, 15% adjectives per session.
- New vs review: introduce 2–4 new cells per session; rest is review weighted by state and recency (`introduced` > `practicing` > `mastered`).
- Basic guardrails:
  - Breadth floor: touch ≥ 4 distinct lemmas every 10 items.
  - Depth cap: ≤ 3 consecutive items from the same lemma.
  - Chapter balance: if multiple chapters are active, see at least 2 in a session.
  - Warm‑up: open with 2–3 easy items (short nouns/adj or verb present forms).
- No complex SRS or due‑date math.

## Chapters as Breadth

- Chapters define the candidate lemma pool. You unlock/lock chapters manually via curriculum files.
- Per‑lemma suggestions operate only within the active chapter set. This keeps depth focused and sessions coherent.
- Adjust chapter activation anytime; the next session adapts automatically.

## What We Keep vs Remove

- Keep: cell‑based mastery, chapters as breadth, the 4 verb tiers, the readiness rule above, and the minimal suggestion UI.
- Remove/simplify: global tense waves for all verbs (other than present for starters); avoid feature flags and complex scheduling.

## Notes for Other POS (Future)

- Adjectives: a single tier — introduce `m_sg`, `f_sg`, `m_pl`, `f_pl` together; practice drives mastery; no suggestions needed initially.
- Nouns: a single tier — introduce `sg` and `pl` together; practice drives mastery; no suggestions needed initially.

## Rationale

This design gives you intentional breadth via chapters and organic depth via per‑lemma tiers. The 2/3 readiness threshold leverages your existing cell states, avoids perfectionism, and keeps the experience moving without opaque automation or heavy scheduling.
