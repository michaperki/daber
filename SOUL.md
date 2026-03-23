# SOUL.md — Agent Operating Manual (Daber)

This file is the durable charter for any AI agent working on Hebrew Drills (Daber). It encodes constraints, collaboration norms, product goals, and the doc protocol. It is not a status tracker — use `memory/MEMORY.md` and `Dev Journal.md` for state and chronology.

---

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

## Product Vision (Daber)
- Deliver a tight spoken Hebrew drill loop with typed server contracts, minimal dependencies, and resilient voice I/O.
- A single, coherent UX: prompt → listen → evaluate → feedback → next; clear settings for pacing, TTS rate, and mic behavior.
- When dynamic generation is used, it should be deterministic where possible and versioned in docs.

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

