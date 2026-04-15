Drill Cell-Selection Simulator

Overview
- Purpose: simulate vocab/cell selection over time under different user behaviors.
- Scope: free practice cells and lesson-scoped cell pools.
- Fidelity: uses the legacy cell selector logic and the same cell progress transitions as the app.
- Not covered: the finite `session_planner.ts` lesson flow, authored phrase handwriting stages, or phrase ordering. Use `npm -w packages/content run report` to audit authored lesson phrase content.

Why
- Verify diversity (lemmas, cells) over 20/50/100 prompts.
- Detect loops, starvation of novelty, and POS bias.
- Compare behaviors: perfect answers, always reveal/skip, mixed performance.

Quick Start
- Build content (required): `npm -w packages/content run build`
- Run simulator:
  - Free practice, perfect user: `npm run sim -- --n 20,50,100 --behavior perfect --seed 123`
  - Always skip: `npm run sim -- --n 50 --behavior skip`
  - Always reveal: `npm run sim -- --n 50 --behavior reveal`
  - Mixed user: `npm run sim -- --n 100 --behavior mixed --seed 42`
  - Lesson scope: `npm run sim -- --n 50 --behavior perfect --lesson cafe_ordering_1`
- Lesson cell prompt transcript: `npm run sim -- --n 12 --lesson cafe_ordering_1 --behavior reveal --prompts --seed 7`
  - Every lesson: `npm run sim -- --all-lessons --n 25 --behavior mixed --seed 42`
  - Lesson inventory: `npm run sim -- --list-lessons`
- Show ordered sequence: add `--verbose`.

Args
- `--n`       Number of prompts (single or comma‑separated list). Default: 100
- `--behavior` One of `perfect`, `skip`, `reveal`, `mixed`. Default: `perfect`
- `--lesson`  Lesson id to scope selection; omit for free practice
- `--all-lessons` Run the same simulation once for every lesson in `lessons.json`
- `--list-lessons` Print lesson ids, titles, endpoint descriptions, and eligible cell counts
- `--seed`    Seed for deterministic RNG (optional)
- `--verbose` Print the ordered sequence of delivered items
- `--prompts` Print cell prompt rows: English prompt, Hebrew answer, selected cell, and simulated outcome

Reports
- Ordered sequence (with `--verbose`)
- Cell prompt transcript (with `--prompts`)
- Distinct lemmas and cells
- Repeat counts by exact item and by lemma
- POS distribution
- Loop/starvation heuristic and scope coverage

Implementation Notes
- Selector mirrors the cell-selection logic in `apps/web/src/content.ts` (guards, weighting, and the two-bucket novelty sampler).
- Progress transitions mirror `apps/web/src/storage/mutations.ts` (introduced → practicing on 3 clean, practicing → mastered on 5 clean, demote on miss).
- Content loaded from `packages/content/dist/{vocab,lessons}.json`.
- Current app lessons are planned by `apps/web/src/session_planner.ts`; this simulator intentionally does not model those staged sessions or authored phrases.

Interpreting Results
- Diversity improves when distinct cells/lemmas grow steadily across 20 → 50 → 100 and the stall/loop heuristic does not trigger early.
- Lesson-scoped runs should reach high coverage of the lesson’s cell pool without obvious loops.
