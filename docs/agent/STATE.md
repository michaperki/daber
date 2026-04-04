# STATE.md — What's Actually Built (Daber)

Role: Honest, always-current snapshot of the running codebase. Descriptive, not aspirational.

Last reviewed: 2026-04-04 (post-rebuild checkpoint)

---

## Architecture

The app was rebuilt from scratch on 2026-04-04 as a lean MVP. ~40 old files were removed.

**10 source files total:**
- 3 pages (home, drill, summary)
- 5 API routes (levels, start, next, answer, summary)
- 1 component (HebrewKeyboard)
- 1 lib module (evaluator suite: 5 files + types + db + contracts + sentences)

## Current Happy Path

1. Home page fetches `/api/levels`, renders colored buttons per CC level
2. Click a level → POST `/api/drill/start` → creates session with 20 items (due items first, then filler)
3. Drill page fetches next item → shows prompt with direction label
4. User types answer (Hebrew keyboard for en_to_he, native input for he_to_en)
5. Submit → POST `/api/drill/[sessionId]/answer` → 4-layer evaluator → SM-2 stat update
6. Feedback card shows grade + correct answer → Next
7. After all items → redirect to summary (accuracy %, correct/flawed/incorrect counts)

## Direction Logic
- `ItemStat.correct_streak < 2` → he_to_en (show Hebrew, type English)
- `ItemStat.correct_streak >= 2` → en_to_he (show English, type Hebrew with onscreen keyboard)

## Hebrew Keyboard
- Phonetic mapping: a=א b=ב d=ד g=ג h=ה k=כ l=ל m=מ n=נ p=פ q=ק r=ר s=ס t=ת v=ו w=ש y=י z=ז x=ח u=ט e=ע c=צ
- Shift+key = sofit form (ך ם ן ף ץ) — works on physical keyboard and onscreen toggle
- Space bar works on both physical and onscreen keyboard

## Evaluator (4 layers)
1. **Deterministic** — exact match, accepted variants, near-miss patterns, pronoun rules, feature-aware morphology, noun definiteness
2. **Levenshtein** — edit distance <= 1 → flawed
3. **Fuzzy Hebrew** — confusable letter pairs (כ/ח, ט/ת, ס/ש, א/ע, ק/כ, ו/ב) → flawed with hint
4. **Fallback** — incorrect with "Not quite."

English evaluator (for he_to_en): keyword overlap, present tense canonicalization, contraction expansion.

## SM-2 Spaced Repetition
- correct: streak+1, easiness via SM-2 formula, interval grows
- flawed: streak+1, easiness drops slightly
- incorrect: streak=0, interval=0 (immediate review)
- New items: initial easiness ~2.5

## Data
- ~2,400 LessonItems from 7 Citizen Cafe levels (blue through yellow)
- Stored in Postgres on Heroku (`?connection_limit=5`)
- Schema has more tables than the MVP uses (Lexeme, Inflection, SentenceBank, etc. — carried over)

## What's Disabled
- Sentence generation (OpenAI quota exceeded; `getSentence()` call removed from next route)
- Voice I/O (STT/TTS routes deleted)
- All admin, dictionary, library, progress, retry, profile, vocab pages (deleted)
- Local LLM generation pipeline (deleted)
- Background job queue (deleted)

## Known Bugs
See TODO.md for details:
- English prompt data quality: missing spaces, uncapitalized "i"
- Hebrew evaluation false-negatives (invisible Unicode in CC data)
- SentenceBank table missing on remote DB

## Environment Variables
- `DATABASE_URL` — Postgres connection (with `?connection_limit=5`)
- `OPENAI_API_KEY` — present but quota exceeded (unused at runtime)
- Seed-time: `SEED_CC`, `SEED_LEXEMES`
