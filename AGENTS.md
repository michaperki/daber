# Agents Guide

Scope: Entire repository.

Purpose: Help coding agents work effectively on this project. The app is consolidated under `Daber/` as the single canonical frontend + API.

Principles
- Keep the core API contracts stable. Use the Zod schemas in `Daber/lib/contracts.ts` for runtime validation and types.
- Prefer small, focused components with explicit props over implicit state.
- Avoid adding dependencies unless necessary; if needed, update `package.json` but gate installs to user approval.
- Single app only. No V1/V2 split. All UI lives under `Daber/app/*` and consumes the existing API.
-- Docs live at the repo root: read `SOUL.md`, `memory/MEMORY.md`, `Dev Journal.md`, and `ROADMAP.md`.

Code Style
- TypeScript strictness; explicit prop types; no `any`.
- Server/client boundary: components under `Daber/app/**` default to client components only where needed (`"use client"`).
- No inline comments inside code blocks unless essential; add rationale in Markdown docs instead.

Folders
- `Daber/lib/contracts.ts` — Zod schemas + TypeScript types for API contracts.
- `Daber/lib/client/api.ts` — Typed client wrappers for API calls.
- `Daber/lib/client/state/sessionMachine.ts` — Optional session state machine scaffold if used.
- `Daber/lib/client/settings.tsx` — React context for UI settings (e.g., transliteration, retry‑on‑flawed).
- `Daber/app/components/*` — Shared UI components.
- `Daber/app/session/[sessionId]/page.tsx` — Main session page that composes components.

Testing
- Run `npm run test:evaluator` for evaluator sanity checks (no network).
- Keep pages mountable without STT/TTS; use typed API wrappers and guard network errors gracefully.

Notes
- Avoid suggesting or setting up CI. Validation is local and artifact‑driven.
