# SOUL.md — Agent Operating Manual (Daber)

This file is the durable charter for any AI agent working on Hebrew Drills (Daber). It encodes constraints, collaboration norms, product goals, and the doc protocol. It is not a status tracker — use `memory/MEMORY.md` for state.

Modifications or additions to SOUL.md are welcome but require Mike's approval. This is an evolving doc.

---

## Target User — This Is the Most Important Section

**Build for Mike. Not for "learners." Not for a hypothetical audience. For Mike.**

Mike is an intermediate Hebrew learner. He can read, knows basic grammar, and has conversational vocabulary. He does not need onboarding, beginner lessons, or hand-holding. He needs a daily drill loop that is so good he can't stop using it.

The success metric is simple: does Mike use this regularly and enjoy it? Everything else — generalization, multi-user support, curriculum design for beginners — comes later.

Do not build:
- Intro lessons, onboarding flows, or beginner content
- Generic "learning platform" infrastructure
- Heavyweight auth/login that adds friction before someone can drill

Do build:
- Things that make Mike's daily practice better, faster, more interesting
- Things that fix bugs Mike hits during real sessions
- Things that make the drill content smarter and more adaptive

## Current Product State (as of 2026-04-04)

The app was **rebuilt from scratch** as a lean MVP. Deployed on Heroku, accessible on mobile.

What works:
- **Level-based drill selection** — home page shows colored buttons for each CC level (green through yellow) plus "all"
- **Core drill flow** — prompt → type answer → evaluate → feedback → next → session summary
- **Phonetic Hebrew keyboard** — onscreen keyboard with intuitive letter mapping (a=א, b=ב, l=ל, etc.); shift for sofit forms
- **Skip button** — "I don't know" option that grades as incorrect (proper SR demotion)
- **Four-layer evaluator** — deterministic, levenshtein, fuzzy Hebrew (confusable letters), English evaluator
- **SM-2 spaced repetition** — streak-based phase progression with due-item prioritization
- **~2,400 vocab items** from 7 Citizen Cafe class levels

What was removed in the rebuild:
- Voice I/O (STT/TTS) — OpenAI quota exceeded, was poor quality anyway
- Admin pages, dictionary, library, progress, retry, profile, vocab pages
- Song packs, mini morph drill, LLM flashcards
- Dynamic sentence generation (template generators, local LLM pipeline)
- Complex session state machine, audio coordinator, mic recorder
- Settings system (15+ settings in localStorage)
- Footer nav, multiple start buttons
- Rate limiting, Redis infrastructure, background queues

What remains as known issues:
- English prompt data quality: some prompts have spacing issues ("iam" instead of "i am")
- Hebrew evaluation false-negatives: correct answers sometimes graded incorrect (likely invisible Unicode chars in CC import data)
- Sentence generation disabled (OpenAI quota exceeded)
- SentenceBank table may not exist on remote DB (needs `prisma db push`)

## Operating Constraints
- Single app: Next.js app under `Daber/` is the canonical frontend + API.
- Stack: Next.js 14 (App Router), Prisma, Postgres via `DATABASE_URL`, Tailwind CSS.
- Environment: Local development; avoid CI suggestions or setup.
- Resource awareness: Connection pool limited to 5 for Heroku Postgres.

## Collaboration Model
- Mike is the product lead and primary tester.
- Agents make focused code/doc changes and reason from artifacts.
- Keep API contracts stable; use `Daber/lib/contracts.ts` Zod schemas for validation and types.
- Mike also uses agents as thought partners, not just code writers.

## Pedagogy Model — Word Lifecycle

Words move through phases driven by `ItemStat.correct_streak`:
- **No ItemStat row** = new/intro (currently treated as recognition)
- **correct_streak = 0** = recognition (Hebrew → English, or low-streak items)
- **correct_streak < 2** = he_to_en direction
- **correct_streak >= 2** = en_to_he direction (Hebrew keyboard appears)

Wrong answers reset streak to 0, demoting the word back to recognition.

## UX Principles
- Reduce surface area; prefer explicit state and simple components.
- Fail safe: errors downgrade gracefully, never wedge the session.
- Make evaluation legible: clear "correct / flawed / incorrect" with reasons.

## Communication Rules
- Update `memory/MEMORY.md` for architecture snapshot and current focus.
- Keep this file for durable norms only.

---

## Doc Map

| File | Role |
|------|------|
| `SOUL.md` | Agent charter and durable norms |
| `memory/MEMORY.md` | Project state, architecture, current focus |
| `TODO.md` | Known issues and bugs |
| `README.md` | Getting started |

Pointers:
- Contracts: `Daber/lib/contracts.ts`
- Evaluator: `Daber/lib/evaluator/*`
- Schema: `Daber/prisma/schema.prisma`
