
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

  The current shell is small and route-based: onboarding/calibration, lessons home, lesson
  entry, drill, completion, and song entry live in apps/web/src/app.tsx:43 and apps/web/src/
  app.tsx:107.

  Important existing assets worth keeping:

  - The app already has lesson sessions with core exposure, authored phrase handwriting, and
    mixed review in apps/web/src/session_planner.ts:252.
  - Authored phrases are already converted into drill items in apps/web/src/
    session_planner.ts:161.
  - Song lessons can already generate ordinary lessons from teachable units and lyric unlocks in
    packages/content/src/song_to_lesson.ts:149.
  - The current drill UI already supports multi-word phrase targets at a basic letter-by-letter
    level in apps/web/src/ui/VocabTab.tsx:529.
  - Progress already tracks cells, seen words, and lessons in apps/web/src/storage/
    progress.ts:32.

  The biggest mismatch is not infrastructure. It is product shape: the current app still feels
  like Missions / Free practice / Songs, shown in apps/web/src/ui/LessonsHome.tsx:32, rather
  than a daily path or song journey.

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
  3. Choose the blended IA
     Build Path as the landing screen and Journey as the lesson/song detail view. Keep Atelier
     ideas for later, mostly as secondary entry points like Write, Songs, Review, Me.
  4. Create a V2 app shell
     Add a new learner shell with bottom navigation and route structure around:
     /path, /journeys, /journey/:id, /session/:id, /review, /me.
     Keep old routes temporarily as fallbacks while migrating.
  5. Build a real design system from the wireframes
     Convert the wireframe tokens into app CSS: paper/ink palette, typography, buttons, chips,
     section headers, bottom nav, progress trails, Hebrew text handling. Do not copy the inline
     JSX style approach.
  6. Refactor current screens into wireframe-aligned surfaces
     Replace LessonsHome with a daily Path screen.
     Replace LessonEntry with a Journey map/lesson overview.
     Replace the completion screen with a calmer recap.
     Keep DrawCanvas, recognizer, storage, content, and session planner under the hood.
  7. Promote phrases to first-class progress
     Right now phrase items exist, but progress is mostly word/cell/lesson oriented. Add phrase-
     level progress and review eligibility so the Review screen can become real instead of
     cosmetic.
  8. Add destination screens incrementally
     Start with a song/lyrics destination screen using existing songLessons data. Real audio
     playback can come later. The important product move is that completing prep visibly unlocks
     or advances the destination.
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
