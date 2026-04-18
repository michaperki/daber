
• Recommendation
  Use the existing app infra. Do not rebuild from scratch.

  The right move is a new product shell and UX layer on top of the current app foundation: keep
  the Preact/Vite app, content pipeline, recognizer, canvas, sync/storage, lesson/session
  planner, and API. Replace much of the current learner-facing UI and IA in place.

  The wireframes are a strong product-direction reset, but they are not an implementation base.
  They are static React/Babel prototypes with inline styles and placeholder data. Treat them as
  a spec, not code to port directly.

  What The Wireframes Say
  The new north star is clear in wireframes/src/app.jsx:110: phrases first, songs as
  destinations, handwriting as a peer, calm progress, and curated exposure.

  The three IA directions are:

  - Path: one opinionated daily plan: warm-up → new words → write → phrase → arrive. Lowest
    cognitive load. See wireframes/src/app.jsx:185.
  - Atelier: practice and songs as peer workspaces. More freedom, more risk of choice paralysis.
    See wireframes/src/app.jsx:207.
  - Journey: songs are the map, with stations like Words → Write → Phrase → Line → Play. Most
    emotionally aligned with “I’m working on this song.” See wireframes/src/app.jsx:229.

  The wireframes themselves already suggest the best blend: Path home + Journey song map in
  wireframes/src/app.jsx:322.

  Where The App Is Now
  The current app is more capable than the old docs imply. README.md:7 still says “No code yet,”
  but the app now has real routes, sessions, storage, content, and sync.

  The learner-facing redesign has started. Commit cb3f893 implements the first V2 experience
  layer: a Path landing screen, Journey list, Journey detail map, Review and Me tabs, bottom
  navigation, and paper/ink design tokens. The route shell now keeps onboarding/calibration and
  drill behavior intact while adding /path, /journeys, /journey/:id, /session/:id, /review, and
  /me in apps/web/src/app.tsx.

  Important existing assets worth keeping:

  - The app already has lesson sessions with core exposure, authored phrase handwriting, and
    mixed review in apps/web/src/session_planner.ts:252.
  - Authored phrases are already converted into drill items in apps/web/src/
    session_planner.ts:161.
  - Song lessons can already generate ordinary lessons from teachable units and lyric unlocks in
    packages/content/src/song_to_lesson.ts:149.
  - The current drill UI already supports multi-word phrase targets at a basic letter-by-letter
    level in apps/web/src/ui/VocabTab.tsx:529.
  - Progress now tracks cells, seen words, lessons, and phrase-level attempts in
    apps/web/src/storage/progress.ts.

  The biggest remaining mismatch is not infrastructure. It is depth: the new shell now looks and
  routes like Path + Journey, and phrases now accrue progress and feed Review. The remaining
  product gap is mainly handwriting depth: the app still uses guided letter-by-letter recognition
  rather than true freeform whole-word or phrase scoring.

  Main Risk
  The wireframes assume a more natural handwriting experience: whole word or phrase writing,
  gentle shape/proportion/order scoring, and a full-bleed canvas. The current engine is still
  fundamentally letter-by-letter. That is manageable, but it should be made explicit.

  Near-term: keep the current recognizer and make the UI feel closer to the ideal.

  Do not promise true freeform whole-word scoring until a spike proves it. The wireframes call
  this out too: “Spike the writing engine” in wireframes/src/app.jsx:323.

  Plan

  1. Stabilize the baseline — COMPLETE
     Fix the local root build first. npm run build currently gets through content and web, then
     API TypeScript fails because prisma.strokeSample is used in apps/api/src/routes/
     strokes.ts:28, but the generated Prisma client does not expose it. Likely fix: regenerate
     Prisma client and make sure the root/local build path runs Prisma generation before API
     compile.
     Completed: API build now runs Prisma generation before tsc, and stroke_sample access no
     longer depends on the missing generated delegate. npm run build passes.
  2. Declare the new product direction — COMPLETE
     Update the stale docs so the app is no longer described as only a handwriting MVP. The new
     short thesis should be: phrases first, handwriting as a core modality, songs as
     destination/reward.
     Completed: README, docs/VISION.md, and docs/ROADMAP.md now describe the phrase/song/
     handwriting direction and the migration path toward the wireframe ideal.
  3. Choose the blended IA — COMPLETE
     Build Path as the landing screen and Journey as the lesson/song detail view. Keep Atelier
     ideas for later, mostly as secondary entry points like Write, Songs, Review, Me.
     Completed: the first implementation uses Path as the home surface and Journey as the
     lesson/detail model. Atelier remains deferred as secondary workspace ideas.
  4. Create a V2 app shell — COMPLETE
     Add a new learner shell with bottom navigation and route structure around:
     /path, /journeys, /journey/:id, /session/:id, /review, /me.
     Keep old routes temporarily as fallbacks while migrating.
     Completed: apps/web/src/app.tsx now defines the new routes, preserves the legacy lesson,
     practice, completion, and song routes, and adds bottom navigation for Path, Journeys,
     Review, and Me.
  5. Build a real design system from the wireframes — COMPLETE
     Convert the wireframe tokens into app CSS: paper/ink palette, typography, buttons, chips,
     section headers, bottom nav, progress trails, Hebrew text handling. Do not copy the inline
     JSX style approach.
     Completed: apps/web/src/styles.css defines the first paper/ink token pass, apps/web/src/
     app.module.css defines the learner shell and bottom nav, and apps/web/src/ui/
     redesign.module.css holds the shared Path/Journey primitives.
  6. Refactor current screens into wireframe-aligned surfaces — COMPLETE FOR V2 SLICE
     Replace LessonsHome with a daily Path screen.
     Replace LessonEntry with a Journey map/lesson overview.
     Replace the completion screen with a calmer recap.
     Keep DrawCanvas, recognizer, storage, content, and session planner under the hood.
     Completed: LessonsHome is now a data-backed Path screen, LessonEntry is now a Journey
     station map, Journeys/Review/Me screens exist, completion is now a calmer recap, and the
     song destination screen now presents prep state plus lyrics.
  7. Promote phrases to first-class progress — COMPLETE
     Right now phrase items exist, but progress is mostly word/cell/lesson oriented. Add phrase-
     level progress and review eligibility so the Review screen can become real instead of
     cosmetic.
     Completed: ProgressV1 now has a phrases bucket; phrase handwriting attempts and skips call
     bumpPhrase; free review sessions pull due authored phrases before weak cells; Review shows
     phrase due items ahead of words.
  8. Add destination screens incrementally — COMPLETE FOR FIRST SONG/LYRICS PASS
     Start with a song/lyrics destination screen using existing songLessons data. Real audio
     playback can come later. The important product move is that completing prep visibly unlocks
     or advances the destination.
     Completed: SongLessonEntry is now a destination surface with prep/open state, teaching target
     counts, lyrics, and routes back into the prep journey. Completion routes finished lessons
     toward the destination.
  9. Spike handwriting ideal separately
     Prototype full-word/freeform scoring behind a route or flag. If it works, wire it into the
     new handwriting screens. If it does not, keep the polished letter-by-letter interaction and
     avoid blocking the redesign on recognition research.

  Build From Scratch?
  No. A scratch rebuild would throw away the exact parts that are hardest and least related to
  the redesign: recognizer behavior, calibration, sync, content extraction, song lesson
  conversion, progress storage, and session planning.

  But I would not try to gently polish the existing UI into the wireframes either. The current
  UI components are small enough that the practical path is:

  keep the infra, replace the experience layer.

  That gives you the speed of a rebuild where it matters visually, without re-solving storage,
  recognition, content, and deployment.

  Next Phase — UX Polish + Earned Progress (supersedes §9 as the immediate next step)

  Step 9 (freeform spike) was originally framed as the next numbered step, but REDESIGN.md also
  says it must not block the redesign and that letter-by-letter is the fallback. So the spike
  runs on its own track (D below) while three non-blocking tracks move the visible product
  closer to the wireframes.

  A. Handwriting UX polish — same engine
     Goal: the drill looks and feels like wireframes Variant C (full-bleed canvas, floating
     controls) without touching the recognizer.
     - apps/web/src/ui/DrillScreen.tsx — replace the top "Back" row with a floating exit pill.
     - apps/web/src/ui/VocabTab.tsx — hoist DrawCanvas to full-bleed; float the current prompt
       (Hebrew word + English cue) as a top pill; float the action row (reveal, skip, undo,
       check) as a center-bottom toolbar. Demote the tile row to a small progress strip.
     - apps/web/src/ui/study.module.css — add tokens/classes for the floating pill, toolbar,
       and a ghost-word layer rendered behind the canvas at ~8% opacity.
     - Calibration, reveal, skip, final-form forgiveness, tier suggestions all unchanged.
     Acceptance: on a 390px viewport, the drill matches HandC in layout; behavior is
     byte-identical to the current engine (same predictions, same audio, same progress writes).

  B. Station semantics — tighten the Journey map
     Goal: Words / Write / Phrase / Review / Arrive reflect what the learner did, not a
     heuristic over session indices.
     - apps/web/src/session_planner.ts — give each stage an explicit `station` field
       (`words`, `write`, `phrase`, `review`). Either split `core_exposure` into a meet-then-
       write pair or add a `write` station that advances on the first successful handwriting
       attempt for each core item. Persist station-level counts, not just stage-level.
     - apps/web/src/storage/progress.ts — extend `LessonStageProgress` (or add a sibling
       `stations` map) so `station === 'write'` is countable independent of `core_exposure`.
     - apps/web/src/storage/mutations.ts — `markLessonSessionProgress` should advance the
       station the current item belongs to, not the overall index.
     - apps/web/src/ui/LessonEntry.tsx — replace `activeStation` heuristic with a direct
       stage→station lookup; show the first incomplete station as active.
     - apps/web/src/ui/JourneysScreen.tsx — same lookup for the trail dots.
     Acceptance: step through a lesson in dev; each station lights exactly once, at the moment
     the learner crosses its threshold. No station ever lights without a corresponding user
     action being recorded in progress.

  C. Review scheduling — earn the "Review" tab
     Goal: the Review queue shows items that are actually due, in a defensible order, mixing
     phrases and weak cells.
     - apps/web/src/session_planner.ts — replace the current phrase-review predicate
       (`attempted > clean || clean < 2 || last_seen > 24h`) with tiered due logic:
       (i) failed on last attempt, (ii) no clean streak yet (`clean < 2`), (iii) stale > 48h
       and clean streak < 3, (iv) stale > 7d regardless. Score = phrase weakness + mean
       weakness of source cells.
     - Free-review session composition: budget 40% phrases, 40% weak cells, 20% stale cells
       (replacing "stuff phrases first, backfill with cells").
     - apps/web/src/ui/ReviewScreen.tsx — per item, show a "why due" chip (`Needs work`,
       `Stale`, `New`) drawn from the same due-tier it matched.
     Acceptance: with seeded progress (one failed, one stale, two clean), the Review screen
     lists the failed and stale items first with the correct chips; starting daily review
     yields a session whose first items match.

  D. Freeform spike — parallel, non-blocking (inherits §9)
     Goal: answer whether whole-word/phrase scoring is viable before we bet the redesign on it.
     - Route: `/spike/write`, dev-only flag. Input is a 2–3 word prompt.
     - Scoring: deterministic (no ML). Shape via DTW against template strokes, proportion via
       bbox ratio against target, order via per-stroke direction and count.
     - Success criteria (all must hold): (i) accepts a correctly written target in ≥90% of 20
       samples/word, (ii) rejects a wrong target in ≥90% of 20 samples/word, (iii) holds for
       three different target words of 2–4 letters.
     - If met: wire the spike canvas into (A). If not: document the failure modes and keep
       the polished letter-by-letter drill from (A).

  Deferred backlog (not in this phase — visible in wireframes, not yet built):
     - Onboarding 3-step (welcome → goal → calibration tiles).
     - Phrase practice "translate-this + word bank + say it" surface.
     - Progress calendar heatmap, metrics tiles, mastery list.
     - Songs library grid (Ready / Up next / Locked).
     - Hebrew typography pass (Frank Ruhl Libre for titles; `.heb` class for RTL prompts).
     - Persistent resume bar on Journeys home.

  Execution order: (A) and (B) first, (C) immediately after (both depend on station semantics
  being coherent), (D) in parallel throughout. Ship as one phase when A+B+C land; fold in D
  only if its success criteria are met.
