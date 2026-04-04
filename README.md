# Daber (Hebrew Drills)

Lean Hebrew vocabulary drill app. Select a level, drill 20 items, get graded.

## Getting Started
1. Install deps: `npm install`
2. Set `DATABASE_URL` in `Daber/.env` (Postgres)
3. Push schema: `cd Daber && npx prisma db push`
4. Seed data: `npm run seed` (imports Citizen Cafe vocab)
5. Dev server: `npm run dev` — opens at http://localhost:3000

## Structure
```
Daber/
  app/
    page.tsx              — home (level picker)
    layout.tsx            — root layout
    drill/
      HebrewKeyboard.tsx  — phonetic onscreen keyboard
      [sessionId]/
        page.tsx          — drill UI (prompt → answer → feedback)
        summary/page.tsx  — session results
    api/
      levels/route.ts     — GET: list levels with item counts
      drill/
        start/route.ts    — POST: create session for a level
        [sessionId]/
          next/route.ts   — GET: next drill item
          answer/route.ts — POST: grade answer, update SM-2 stats
          summary/route.ts— GET: session results
  lib/
    db.ts                 — Prisma singleton
    contracts.ts          — Zod schemas
    types.ts              — shared types
    sentences.ts          — sentence generation (disabled)
    evaluator/            — 4-layer Hebrew/English evaluator
  prisma/
    schema.prisma         — database schema
```

## Docs
- Charter: `SOUL.md`
- Known issues: `TODO.md`
- Project memory: `memory/MEMORY.md`
