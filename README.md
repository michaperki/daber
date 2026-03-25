# Hebrew Drills (Daber)

Single Next.js app for a spoken Hebrew drill loop. The canonical app and API live under `Daber/`.

## Docs
- Root charter: `SOUL.md`
- Project state: `memory/MEMORY.md`
- Current reality: `STATE.md`
- Journal: `Dev Journal.md`
- Roadmap: `ROADMAP.md` (moved from `Daber/ROADMAP.md`)
- AI setup: `AI_SETUP.md`

## Getting Started
- Install deps: `npm install`
- Database: set `DATABASE_URL` and `OPENAI_API_KEY` in `Daber/.env`
- Push schema: `npm run db:push`
- Seed lessons: `npm run seed` (also imports your `Mike_Hebrew_Vocab.md` as "My Vocab 01")
- Dev server: `npm run dev` and open http://localhost:3000

## Simulation & Diagnostics
- Seed realistic dataset (Citizen Cafe + mastery):
  - `cd Daber && npm run db:push`
  - `SEED_CC=1 npm run seed`
  - `cd .. && ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/seed_mastery.ts`

- Run a 25-pick simulation (default SRS path):
  - `ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/simulate_vocab_session.ts --count 25 --mode db --due off --random 1`

- Variants (diagnostic; in-app uses blend+adaptive by default):
  - Due authored items only: `--mode db --due item --random 0`
  - Feature-driven/dynamic generator: `--mode lex --due feature --random 1`

Output:
- Console per-pick summary with phase and selection path.
- JSONL at `scripts/out/drill_run_<timestamp>.jsonl` with an `explain` object (lesson scope, candidate pool sizes, selection path, pick source, family-base swap).

API debug (dev only): append `?debug=1` to `GET /api/sessions/:id/next-item` to include `explain` in the response.

## Commands
- Dev: `npm run dev`
- Build/Start: `npm run build` / `npm run start`
- Prisma: `npm run prisma:generate` / `npm run db:push` / `npm run seed`
- Evaluator sanity: `npm run test:evaluator`

## Structure
- `Daber/app/*` — pages, components, API routes
- `Daber/lib/*` — DB, evaluator, client hooks, contracts
- `Daber/prisma/*` — Prisma schema + seed
- `Daber/data/*` — lesson JSON
- `archive/` — context dumps and older docs (write‑once)

## Notes
- STT `/api/stt` uses OpenAI Whisper (audio only); TTS `/api/tts` uses `gpt-4o-mini-tts` with browser TTS fallback on failure.
- Subset review sessions are supported from `/retry` (select items and start).
- The session UI always shows the English prompt and strips "How do I say…".

## Word Families
- New items are introduced once per family, not per conjugation/form.
- `LessonItem.family_id` groups forms; `FamilyStat` marks a family as introduced.
- When a family is first introduced, the API prefers a `family_base` item (e.g., infinitive).
- Generated items are automatically grouped: `family_id = 'lex:<lexeme_id>'`; `family_base` set when the item matches the bare lemma.

## Utility Scripts
- `ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/smoke_family_intro.ts` — validate family intro behavior.
- `ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/count_cc_standalone.ts` — count & sample CC bare-form items.
- `ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/tag_cc_families.ts --out cc_family_tags.json` — LLM tagger (dry-run JSON); requires `OPENAI_API_KEY`.
- `ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/apply_cc_family_links.ts --in cc_family_tags.json` — apply high-confidence tags to DB (`DATABASE_URL`).
