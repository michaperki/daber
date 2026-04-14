Drill Selection Simulator

Overview
- Purpose: simulate the exact vocab/cell selection a learner receives over time under different user behaviors.
- Scope: works for free practice and for lesson‑scoped drills.
- Fidelity: uses the same selector logic and cell progress transitions as the app.

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
  - Lesson prompt transcript: `npm run sim -- --n 12 --lesson cafe_ordering_1 --behavior reveal --prompts --seed 7`
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
- `--prompts` Print learner-facing prompt rows: English prompt, Hebrew answer, selected cell, and simulated outcome

Reports
- Ordered sequence (with `--verbose`)
- Prompt transcript (with `--prompts`)
- Distinct lemmas and cells
- Repeat counts by exact item and by lemma
- POS distribution
- Loop/starvation heuristic and scope coverage

Implementation Notes
- Selector mirrors `apps/web/src/content.ts` (guards, weighting, and the two‑bucket novelty sampler).
- Progress transitions mirror `apps/web/src/storage/mutations.ts` (introduced → practicing on 3 clean, practicing → mastered on 5 clean, demote on miss).
- Content loaded from `packages/content/dist/{vocab,lessons}.json`.

Interpreting Results
- Diversity improves when distinct cells/lemmas grow steadily across 20 → 50 → 100 and the stall/loop heuristic does not trigger early.
- Lesson‑scoped runs should reach high coverage of the lesson’s cells without obvious loops.
