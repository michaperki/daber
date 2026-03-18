# Daber Context Dump — 2026-03-16 (Agent Changes)

## Summary
We iterated on the core drill UX, vocab handling, and dynamic generation. Major additions: review-before-submit with on-screen Hebrew keyboard, emoji gender/number cues, stronger normalization, dynamic vocab improvements (alternative selection + parentheticals), feature vectors for generated items, weakness‑targeted generation, UI polish for CTAs, and robust mic device handling.

## Changes (by area)

- Session UX
  - Review before submit (default ON): editable transcript, Submit/Record again/Clear.
  - Emoji hint chip rendered beside the prompt (not merged into the text) to indicate gender/number.
  - Settings surfaced in Profile and persisted: `reviewBeforeSubmit`, `targetWeakness`.
  - Files: `Daber/app/session/[sessionId]/page.tsx`, `Daber/app/components/PromptCard.tsx`, `Daber/app/components/TranscriptEditor.tsx`, `Daber/app/components/HebrewKeyboard.tsx`, `Daber/app/profile/SettingsCard.tsx`, `Daber/lib/client/settings.tsx`.

- Styling
  - CTA styles for submit/resume buttons to match app: `.btn-start`, `.btn-resume`.
  - Editor/keyboard and chip styles added.
  - Files: `Daber/app/globals.css`.

- Evaluator robustness
  - Normalization strips zero‑width chars and additional punctuation (hyphen, slash) before grading.
  - Files: `Daber/lib/evaluator/normalize.ts`.

- Vocab page improvements
  - Splits multi‑form Hebrew entries into distinct cards with emoji hints (m/f sg, m/f pl).
  - Adds “start dynamic drill” CTA for `user_vocab_01`.
  - Files: `Daber/app/vocab/page.tsx`, `Daber/app/vocab/VocabClient.tsx`.

- Dynamic generation (lexicon mode)
  - Persist feature vectors to generated items: verbs (present) get `{ pos, tense, person, number, gender }`; adjectives get `{ pos, number, gender }` via `LessonItem.features`.
  - Weakness targeting: when enabled, biases selection toward frequently missed `(number, gender)` in last 30 days.
  - English prompt building improvements:
    - Picks a single sensible alternative from lists like “pick up, to lift, to raise”.
    - Applies “-ing” to the first word only (phrasal verbs: “pick up” → “picking up”).
    - Preserves parentheticals and appends them at the end: “They are picking up (the rice, the cake, etc)”.
  - Emoji derivation prefers generated item IDs/features; falls back to English heuristics for authored items.
  - Files: `Daber/lib/drill/generators.ts`, `Daber/app/api/sessions/[sessionId]/next-item/route.ts`, `Daber/app/session/[sessionId]/page.tsx`.

- Client API
  - `apiNextItem` supports `focus=weak` param when lexicon drills + “target my weak spots” is ON.
  - Files: `Daber/lib/client/api.ts`.

- Attempts & schema
  - Added `Attempt.features Json?` and stored features for generated items (from `LessonItem.features` or parsed ID) to enable future analytics and weakness targeting.
  - Files: `Daber/prisma/schema.prisma`, `Daber/app/api/attempts/route.ts`.

- Mic device handling
  - Avoids maximum update depth loops when selecting devices.
  - Enumerates devices on mount and listens to `devicechange` to refresh.
  - Restores saved device only after the device list loads and when none is selected.
  - Files: `Daber/lib/client/audio/useMicRecorder.ts`.

## How To Use
- Review before submit: enabled by default; edit transcript with the on-screen Hebrew keyboard; Submit to grade.
- Emoji hint: shown as a chip beside the prompt (e.g., 👩, 👨👩, 👩👩).
- Vocab page: multi‑form entries appear as separate cards with hints; start dynamic drill from the CTA.
- Weakness targeting: enable “use dynamic drills (lexicon)” and “target my weak spots” in Profile; dynamic drills will preferentially select missed `(number, gender)` forms.
- Mic selection: use dropdown; “refresh” enumerates devices; changes do not cause render loops.

## Notes
- Weakness targeting currently aggregates across all sessions; user‑scope can be added when user identity is introduced.
- Feedback shows a small heuristic chip when features are not surfaced; can be upgraded to display exact features client‑side.

## Follow‑ups / Next Steps
- Expose `LessonItem.features` to client for exact feature chips in Prompt/Feedback.
- Add “Drill my weak spots” CTA on Home to start a lexicon session with `focus=weak`.
- Scope weakness aggregation by `user_id` when available.
- Add mic-permission guidance when enumerateDevices returns 0 (no labels until permission).
- Extend generator to cover more POS/tense with feature‑aware English templates.

*** End of 2026‑03‑16 Context Dump ***
