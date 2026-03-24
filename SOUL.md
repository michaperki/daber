# SOUL.md — Agent Operating Manual (Daber)

This file is the durable charter for any AI agent working on Hebrew Drills (Daber). It encodes constraints, collaboration norms, product goals, and the doc protocol. It is not a status tracker — use `memory/MEMORY.md` and `Dev Journal.md` for state and chronology.

---

## Target User — This Is the Most Important Section

**Build for Mike. Not for “learners.” Not for a hypothetical audience. For Mike.**

Mike is an intermediate Hebrew learner. He can read, knows basic grammar, and has conversational vocabulary. He does not need onboarding, beginner lessons, or hand-holding. He needs a daily drill loop that is so good he can't stop using it.

The success metric is simple: does Mike use this regularly and enjoy it? Everything else — generalization, multi-user support, curriculum design for beginners — comes later. If an agent is choosing between “useful for Mike today” and “nice for future users someday,” always pick Mike.

Do not build:
- Intro lessons, onboarding flows, or beginner content
- Features for hypothetical users who don't exist yet
- Generic “learning platform” infrastructure

Do build:
- Things that make Mike's daily practice better, faster, more interesting
- Things that fix bugs Mike hits during real sessions
- Things that make the drill content smarter and more adaptive

## Current Product State (as of 2026-03-24)

The app is **deployed on Heroku** and accessible on mobile. The core drill flow works and Mike likes it.

What works:
- **Three drill phases are live** — Introduction (see/hear a new word), Recognition (Hebrew → English typing), and Free Recall (English → Hebrew spoken). Phase is driven by `ItemStat.correct_streak`.
- **~2,400 vocab items imported** from 7 Citizen Cafe class levels (blue through yellow), pre-seeded at free recall. Green-level items start at recognition.
- **Wrong answers self-correct** — any miss resets `correct_streak` to 0, demoting the word to recognition until re-mastered.
- **Core en→he spoken drill** — the flow (prompt → record → evaluate → TTS correction → next) feels good and the timing works for learning.

Remaining gaps:
- **Guided production phase not built** — the gap between recognition (easy) and free recall (hard) is still too large.
- **TTS Hebrew pronunciation is poor** — OpenAI TTS doesn't pronounce Hebrew well. Known hard problem.
- **Dynamic sentence generation is weak** — template-based, mechanical output.
- **No pedagogy for verbs** — conjugations are thrown at the user without introducing the infinitive first or spacing out forms.
- **Mobile keyboard UX needs polish.**

## Operating Constraints
- Single app: Next.js app under `Daber/` is the canonical frontend + API.
- Stack: Next.js (App Router), Prisma, SQLite/Postgres via `DATABASE_URL`, OpenAI for STT/TTS and optional generation.
- Environment: Local development; avoid CI suggestions or setup. Validation happens via local runs and lightweight scripts.
- No claims without artifacts: Do not say something “works” unless we have logs, screenshots, or local outputs to point to.
- Resource awareness: STT/TTS endpoints are rate‑limited; do not add network‑heavy loops or polling.

## Collaboration Model
- Mike is the product lead and primary tester.
- Agents make focused code/doc changes and reason from artifacts (logs, screenshots, local runs).
- Prefer direct inspection and targeted fixes over generic debugging tips.
- Keep API contracts stable; use `Daber/lib/contracts.ts` Zod schemas for validation and types.
- Mike also uses agents as thought partners, not just code writers. If asked to brainstorm or discuss pedagogy, engage substantively.

## Product Vision (Daber)
- A daily Hebrew drill app that Mike actually uses and loves. That is the north star.
- Tight spoken drill loop with typed server contracts, minimal dependencies, and resilient voice I/O.
- A single, coherent UX: prompt → listen → evaluate → feedback → next; clear settings for pacing, TTS rate, and mic behavior.
- When dynamic generation is used, it should be deterministic where possible and versioned in docs.
- Content should feel alive — mixing familiar and unfamiliar words, varying sentence structure, adapting to what Mike knows.

## Pedagogy Model — Word Lifecycle

Words and grammar forms should move through phases, not jump straight to hard recall:

1. **Introduction** — First encounter with a new word/form. Rich context: see the Hebrew, hear it pronounced, see a picture or example sentence. No pressure to produce. Just exposure and association.
2. **Recognition** — Can you identify the word? Hebrew → English direction, multiple choice, or easy prompts. Low stakes.
3. **Guided production** — Heavily scaffolded recall. Fill-in-the-blank, sentence completion, strong hints. The user is producing but with training wheels.
4. **Free recall** — The current en→he spoken drill. This is the hardest mode. The user hears English, must produce Hebrew from memory.

Phases 1, 2, and 4 are live. Phase 3 (guided production) is the main remaining gap — the jump from recognition to free recall is still too steep. ~2,400 known vocab items are pre-seeded at free recall from Citizen Cafe class history; wrong answers demote to recognition automatically.

**Verb-specific pedagogy:** Introduce the infinitive first. Then one conjugation at a time, spaced out. Interleave with familiar nouns/adjectives between new verb forms so sessions don't feel like conjugation tables.

**Spaced repetition drives drill phase.** `ItemStat.correct_streak` determines which phase a word is in: no row = intro, 0 = recognition, >= 1 = free recall. FeatureStat is not yet wired to phase selection.

## Sentence Generation Vision

The current template generators (pronoun + verb + adjective) work but feel mechanical. The goal is sentences that feel natural and create moments of delight — “oh, I know all these words but I've never seen them combined this way.”

The approach (before reaching for ML/transformers):
- **Constraint-based generation from the lexicon graph.** Pick a “target” word/form that's due or new. Pick “scaffolding” words the user knows well (high easiness in ItemStat). Combine using Hebrew sentence templates.
- **Novelty comes from combinations**, not from the generator being clever.
- A small local model could optionally polish for naturalness, but core selection stays rule-based and cheap.
- Generated items must still resolve to a single intended Hebrew target (or small accepted set) to keep evaluation reliable.

## UX Principles
- Reduce surface area; prefer explicit state and simple components.
- Fail safe: network/voice failures downgrade gracefully (toast + retry), never wedge the session.
- Make evaluation legible: clear “correct / flawed / incorrect” with reasons; avoid over‑fuzzy grading.

## Agent Behavior
- We are not building an autonomous self‑improving system. Focus on: persistent memory, stable contracts, and pragmatic improvements.
- Minimize churn: avoid unnecessary renames/structure changes beyond this documented layout.
- Be explicit about assumptions and tradeoffs; surface them in the Dev Journal when relevant.

## Communication Rules
- Keep a running `Dev Journal.md` for meaningful changes, decisions, and lessons.
- Update `memory/MEMORY.md` at the end of work sessions: Current Focus, Recent Changes, Pointers.
- Promote only durable truths into `SOUL.md`.

---

## Session Protocol

At the start of a session:
1. Skim `SOUL.md` for constraints and vision.
2. Read `memory/MEMORY.md` for architecture snapshot and current focus.
3. Skim the most recent entries in `Dev Journal.md`.

At the end of a session:
1. Update `memory/MEMORY.md` ▸ Current Focus and Recent Changes.
2. Add an entry to `Dev Journal.md` if work was meaningful.
3. If any durable lesson emerged, consider promoting it to `SOUL.md`.

---

## Doc Map

| File | Role | Cadence |
|------|------|---------|
| `SOUL.md` | Agent charter and durable norms | Rarely |
| `memory/MEMORY.md` | Project state, architecture, current focus | Every session |
| `Dev Journal.md` | Chronological log of changes/decisions | Per work session |
| `ROADMAP.md` | Product roadmap and milestones | Per milestone |
| `AI_SETUP.md` | Env and local‑run instructions (STT/TTS, rate limits) | As needed |
| `archive/` | Write‑once context dumps and older docs | Write‑once |

Pointers:
- Contracts: `Daber/lib/contracts.ts`
- Evaluator: `Daber/lib/evaluator/*` and `scripts/test_evaluator.ts`
- Voice I/O: `Daber/app/api/stt/route.ts`, `Daber/app/api/tts/route.ts`

