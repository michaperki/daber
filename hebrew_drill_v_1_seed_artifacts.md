# Hebrew Drill Teacher — V1 Seed Artifacts

## 1. Product brief

### Summary
A mobile-first, voice-driven Hebrew practice app that runs short, structured drills. The learner hears an English prompt, answers in spoken Hebrew, receives immediate corrective feedback, hears the correct Hebrew aloud, and moves to the next item.

### V1 goal
Prove that a strict spoken drill loop is useful, repeatable, and meaningfully better than ordinary AI voice chat for active language production.

### Core promise
Fast, structured Hebrew speaking drills with immediate corrected repetition.

### Target user
Early-to-intermediate Hebrew learners who want active speaking practice and benefit from tight repetition and correction.

### V1 wedge
Not a full tutor. Not open conversation. Not a content library. V1 is a single strong loop:

prompt -> spoken answer -> evaluation -> corrected repetition -> next prompt

---

## 2. PRD

### Problem
Existing language tools are often too passive, too chatty, or too unstructured. Learners need frequent production practice with immediate correction, but ordinary voice assistants drift into casual conversation and overpraise flawed answers.

### Objective
Build a narrow V1 that delivers reliable, useful spoken Hebrew drills with minimal friction.

### Non-goals
- Open-ended conversation practice
- Full pronunciation scoring
- Grammar lectures
- Multi-language support
- Social features
- Gamification beyond very light session stats

### Success criteria
V1 is successful if:
- the user can complete a spoken drill session end-to-end without confusion
- feedback feels immediate and credible
- corrected repetition is consistently delivered
- the user wants to repeat the session

### Core user story
As a Hebrew learner, I want to hear a prompt in English, answer in Hebrew out loud, and get immediate correction so I can practice recall quickly and improve through repetition.

### Functional requirements
1. User can start a drill session.
2. System presents one prompt at a time by audio and text.
3. User answers by voice.
4. System transcribes the answer.
5. System grades the answer as correct, flawed, or incorrect.
6. System speaks the correct Hebrew form.
7. System advances automatically to the next prompt.
8. System shows a session summary at the end.
9. System stores attempt data for future review.

### UX requirements
- Minimal taps during session
- Very short feedback cycle
- No freeform assistant chatter during drills
- Clear state visibility: listening, evaluating, next prompt
- Reliable repetition of the correct answer every round

### V1 scope
- Hebrew only
- Speaking drills only
- One lesson family to start: present tense basics
- Session length: 10–20 items
- Grading: correct / flawed / incorrect
- Basic session summary

### Risks
- STT may mis-transcribe Hebrew
- LLM may over-credit flawed answers
- Feedback may feel robotic if pacing is off
- Content quality may be uneven if lesson items are not tightly authored

---

## 3. User flow

### Entry
1. User opens app
2. User taps Start Drill
3. User sees one available pack: Present Tense Basics
4. User taps Begin

### In-session loop
1. App speaks and displays one English prompt
2. App enters listening state
3. User answers in Hebrew
4. App transcribes audio
5. App evaluates response
6. App speaks brief feedback and the correct Hebrew
7. App immediately delivers next prompt

### End session
1. App shows totals for correct, flawed, incorrect
2. App shows hardest items
3. App offers retry missed items

---

## 4. Screens

### Home
- Title
- Start Drill button
- Optional small progress summary

### Drill setup
- Lesson pack title
- Number of items
- Begin button

### Drill screen
- Current English prompt
- Status indicator: Listening / Evaluating / Speaking
- Optional transcript preview after answer
- Minimal controls: pause, repeat prompt, exit

### Session summary
- Correct count
- Flawed count
- Incorrect count
- Missed items list
- Retry button

---

## 5. Lesson content schema

```json
{
  "id": "present_improve_3fs",
  "lesson_id": "present_tense_basics_01",
  "english_prompt": "How do I say: she is improving?",
  "target_hebrew": "היא משתפרת",
  "transliteration": "hi mishtaperet",
  "accepted_variants": [
    "היא משתפרת",
    "hi mishtaperet"
  ],
  "near_miss_patterns": [
    {
      "type": "wrong_gender",
      "examples": ["הוא משתפר", "hu mishtaper"]
    }
  ],
  "tags": ["present", "singular", "3rd_person", "feminine", "hitpael"],
  "difficulty": 1,
  "hint": null
}
```

### Required item fields
- id
- lesson_id
- english_prompt
- target_hebrew
- accepted_variants
- tags
- difficulty

### Optional item fields
- transliteration
- hint
- near_miss_patterns
- audio_override

---

## 6. Grading spec

### Grade classes

#### Correct
Use when the response matches the intended form closely enough in meaning and morphology.
Examples:
- exact Hebrew target
- accepted transliteration variant
- minor transcript noise that preserves the intended form

#### Flawed
Use when the learner shows clear understanding but makes a recoverable error.
Examples:
- wrong gender or number inflection
- missing article or small function word where meaning remains clear
- hesitation or slight pronunciation issue that still leaves the target identifiable
- STT ambiguity where likely intended answer is correct but not high confidence

#### Incorrect
Use when the response fails to convey the target form.
Examples:
- wrong pronoun/verb pairing
- wrong tense
- wrong verb entirely
- unrelated response
- no usable speech

### Important rule
Do not collapse flawed into correct. The middle bucket exists to prevent false praise.

### Feedback format
- Correct: "Correct. [target_hebrew]"
- Flawed: "Close, but not quite. [target_hebrew]"
- Incorrect: "Not quite. [target_hebrew]"

Optional short reason:
- "Wrong gender. [target_hebrew]"
- "Wrong tense. [target_hebrew]"

### Evaluation order
1. Normalize transcript
2. Check exact match against target and accepted variants
3. Check near-miss rules
4. If still ambiguous, send to constrained evaluator
5. Return one of the three grades with a short reason

---

## 7. Evaluation architecture

### Step 1: Normalize
Normalize transcript by:
- lowercasing
- trimming punctuation
- collapsing whitespace
- mapping common Hebrew script variants if needed
- optionally mapping transliteration variants

### Step 2: Deterministic match
Try:
- exact target match
- accepted variant match
- simple token-level equivalence

### Step 3: Near-miss rules
Check authored patterns such as:
- wrong gender
- wrong number
- wrong tense
- pronoun mismatch
- common lexical confusion

### Step 4: Constrained model fallback
If unresolved, call an evaluator with structured input and require structured output.

Example output:

```json
{
  "grade": "flawed",
  "reason": "wrong gender",
  "correct_hebrew": "היא משתפרת"
}
```

### Constraint on evaluator
The evaluator must not control session flow. It only returns a grade and short reason.

---

## 8. System architecture

### Components

#### Client
- Mobile-first web app
- Audio playback
- Microphone capture
- State display
- Session summary UI

#### Lesson engine
Deterministic state machine:
- idle
- prompting
- listening
- transcribing
- evaluating
- correcting
- advancing
- complete

#### Content store
Stores lesson packs and items.

#### STT service
Converts spoken Hebrew to transcript.

#### Evaluation service
Grades transcript against item data.

#### TTS service
Speaks prompts and correction.

#### Persistence layer
Stores sessions, attempts, and aggregate progress.

---

## 9. API sketch

### POST /sessions
Create a session.

Request:
```json
{
  "lesson_id": "present_tense_basics_01"
}
```

Response:
```json
{
  "session_id": "sess_123",
  "lesson_id": "present_tense_basics_01",
  "next_item_id": "present_improve_1s"
}
```

### GET /sessions/:sessionId/next-item
Returns the next lesson item.

Response:
```json
{
  "item_id": "present_improve_1s",
  "english_prompt": "How do I say: I am improving?"
}
```

### POST /attempts
Submit spoken answer for grading.

Request:
```json
{
  "session_id": "sess_123",
  "item_id": "present_improve_1s",
  "audio_url": "...",
  "transcript": "ani mishtaper"
}
```

Response:
```json
{
  "grade": "correct",
  "reason": null,
  "correct_hebrew": "אני משתפר",
  "next_item_id": "present_improve_3fs"
}
```

### GET /sessions/:sessionId/summary
Response:
```json
{
  "correct": 7,
  "flawed": 2,
  "incorrect": 1,
  "hardest_items": [
    {
      "item_id": "present_improve_3fs",
      "correct_hebrew": "היא משתפרת"
    }
  ]
}
```

---

## 10. Data model

### lessons
- id
- title
- language
- level
- type

### lesson_items
- id
- lesson_id
- english_prompt
- target_hebrew
- transliteration
- accepted_variants
- near_miss_patterns
- tags
- difficulty

### sessions
- id
- user_id
- lesson_id
- started_at
- ended_at
- correct_count
- flawed_count
- incorrect_count

### attempts
- id
- session_id
- lesson_item_id
- raw_transcript
- normalized_transcript
- grade
- reason
- correct_hebrew
- created_at

---

## 11. Milestone plan

### Milestone 1
Single working session:
- one lesson pack
- 10 items
- text-first plus optional audio playback
- transcript-based grading
- session summary

### Milestone 2
Full voice loop:
- microphone capture
- STT integration
- TTS prompt and correction
- deterministic state machine

### Milestone 3
Credible grading:
- near-miss logic
- constrained evaluator fallback
- retry missed items

---

## 12. Open questions
- Which STT/TTS providers are best for Hebrew quality and latency?
- Should transliteration be user-visible in V1 or hidden?
- Should flawed answers count as partial credit in stats?
- How much transcript text should be shown back to the learner?
- Should V1 keep lesson order fixed or adaptive?

## 13. Immediate next build step
Implement the thinnest end-to-end prototype for one lesson pack with 10 present-tense items and basic correct/flawed/incorrect grading.

---

## 14. First lesson pack: Present Tense Basics 01

### Lesson goal
Teach and drill high-frequency present-tense subject/verb forms through short English-to-Hebrew production prompts.

### Design notes
- Keep prompts extremely simple
- Reuse a small set of verbs across pronouns
- Prefer high-confidence, common forms
- Keep evaluation easy in V1 by avoiding too many equally valid alternatives
- Use both masculine and feminine forms where relevant

### Target lesson size
10 items

### Lesson metadata
```json
{
  "id": "present_tense_basics_01",
  "title": "Present Tense Basics 01",
  "language": "he",
  "level": "beginner",
  "type": "speaking_drill",
  "description": "Short present-tense production drills using common verbs and pronouns."
}
```

### Item 1
```json
{
  "id": "ptb01_001",
  "lesson_id": "present_tense_basics_01",
  "english_prompt": "How do I say: I am improving?",
  "target_hebrew": "אני משתפר",
  "transliteration": "ani mishtaper",
  "accepted_variants": ["אני משתפר", "ani mishtaper"],
  "near_miss_patterns": [
    {"type": "wrong_gender", "examples": ["אני משתפרת", "ani mishtaperet"]}
  ],
  "tags": ["present", "1st_person", "singular", "masculine", "improve"],
  "difficulty": 1
}
```

### Item 2
```json
{
  "id": "ptb01_002",
  "lesson_id": "present_tense_basics_01",
  "english_prompt": "How do I say: I am improving? (female speaker)",
  "target_hebrew": "אני משתפרת",
  "transliteration": "ani mishtaperet",
  "accepted_variants": ["אני משתפרת", "ani mishtaperet"],
  "near_miss_patterns": [
    {"type": "wrong_gender", "examples": ["אני משתפר", "ani mishtaper"]}
  ],
  "tags": ["present", "1st_person", "singular", "feminine", "improve"],
  "difficulty": 1
}
```

### Item 3
```json
{
  "id": "ptb01_003",
  "lesson_id": "present_tense_basics_01",
  "english_prompt": "How do I say: he is improving?",
  "target_hebrew": "הוא משתפר",
  "transliteration": "hu mishtaper",
  "accepted_variants": ["הוא משתפר", "hu mishtaper"],
  "near_miss_patterns": [
    {"type": "wrong_gender", "examples": ["היא משתפרת", "hi mishtaperet"]},
    {"type": "missing_pronoun", "examples": ["משתפר", "mishtaper"]}
  ],
  "tags": ["present", "3rd_person", "singular", "masculine", "improve"],
  "difficulty": 1
}
```

### Item 4
```json
{
  "id": "ptb01_004",
  "lesson_id": "present_tense_basics_01",
  "english_prompt": "How do I say: she is improving?",
  "target_hebrew": "היא משתפרת",
  "transliteration": "hi mishtaperet",
  "accepted_variants": ["היא משתפרת", "hi mishtaperet"],
  "near_miss_patterns": [
    {"type": "wrong_gender", "examples": ["הוא משתפר", "hu mishtaper"]},
    {"type": "missing_pronoun", "examples": ["משתפרת", "mishtaperet"]}
  ],
  "tags": ["present", "3rd_person", "singular", "feminine", "improve"],
  "difficulty": 1
}
```

### Item 5
```json
{
  "id": "ptb01_005",
  "lesson_id": "present_tense_basics_01",
  "english_prompt": "How do I say: I am writing?",
  "target_hebrew": "אני כותב",
  "transliteration": "ani kotev",
  "accepted_variants": ["אני כותב", "ani kotev"],
  "near_miss_patterns": [
    {"type": "wrong_gender", "examples": ["אני כותבת", "ani kotevet"]}
  ],
  "tags": ["present", "1st_person", "singular", "masculine", "write"],
  "difficulty": 1
}
```

### Item 6
```json
{
  "id": "ptb01_006",
  "lesson_id": "present_tense_basics_01",
  "english_prompt": "How do I say: I am writing? (female speaker)",
  "target_hebrew": "אני כותבת",
  "transliteration": "ani kotevet",
  "accepted_variants": ["אני כותבת", "ani kotevet"],
  "near_miss_patterns": [
    {"type": "wrong_gender", "examples": ["אני כותב", "ani kotev"]}
  ],
  "tags": ["present", "1st_person", "singular", "feminine", "write"],
  "difficulty": 1
}
```

### Item 7
```json
{
  "id": "ptb01_007",
  "lesson_id": "present_tense_basics_01",
  "english_prompt": "How do I say: he is writing?",
  "target_hebrew": "הוא כותב",
  "transliteration": "hu kotev",
  "accepted_variants": ["הוא כותב", "hu kotev"],
  "near_miss_patterns": [
    {"type": "wrong_gender", "examples": ["היא כותבת", "hi kotevet"]},
    {"type": "missing_pronoun", "examples": ["כותב", "kotev"]}
  ],
  "tags": ["present", "3rd_person", "singular", "masculine", "write"],
  "difficulty": 1
}
```

### Item 8
```json
{
  "id": "ptb01_008",
  "lesson_id": "present_tense_basics_01",
  "english_prompt": "How do I say: she is writing?",
  "target_hebrew": "היא כותבת",
  "transliteration": "hi kotevet",
  "accepted_variants": ["היא כותבת", "hi kotevet"],
  "near_miss_patterns": [
    {"type": "wrong_gender", "examples": ["הוא כותב", "hu kotev"]},
    {"type": "missing_pronoun", "examples": ["כותבת", "kotevet"]}
  ],
  "tags": ["present", "3rd_person", "singular", "feminine", "write"],
  "difficulty": 1
}
```

### Item 9
```json
{
  "id": "ptb01_009",
  "lesson_id": "present_tense_basics_01",
  "english_prompt": "How do I say: we are studying?",
  "target_hebrew": "אנחנו לומדים",
  "transliteration": "anachnu lomdim",
  "accepted_variants": ["אנחנו לומדים", "anachnu lomdim"],
  "near_miss_patterns": [
    {"type": "wrong_number", "examples": ["אני לומד", "ani lomed"]},
    {"type": "wrong_gender_number", "examples": ["אנחנו לומדות", "anachnu lomdot"]}
  ],
  "tags": ["present", "1st_person", "plural", "study"],
  "difficulty": 2
}
```

### Item 10
```json
{
  "id": "ptb01_010",
  "lesson_id": "present_tense_basics_01",
  "english_prompt": "How do I say: they are studying?",
  "target_hebrew": "הם לומדים",
  "transliteration": "hem lomdim",
  "accepted_variants": ["הם לומדים", "hem lomdim"],
  "near_miss_patterns": [
    {"type": "wrong_gender", "examples": ["הן לומדות", "hen lomdot"]},
    {"type": "wrong_number", "examples": ["הוא לומד", "hu lomed"]}
  ],
  "tags": ["present", "3rd_person", "plural", "masculine", "study"],
  "difficulty": 2
}
```

### Authoring guidance for V1 lesson items
- Prefer prompts with one clearly expected answer
- Avoid too many synonyms in the first lesson pack
- Avoid forms that are highly confusable in STT unless deliberately testing them
- Use high-frequency verbs only
- Explicitly mark female-speaker prompts when first-person gender matters

### Notes on accepted variants
For V1, accepted_variants should stay narrow. It is better to under-accept and classify borderline cases as flawed than to over-accept and give false praise.

### Suggested future expansions of this pack
- Add feminine plural forms
- Add you singular / you plural forms
- Add more verbs: eat, go, want, understand, remember
- Add mixed review ordering
- Add adaptive retries for flawed and incorrect items

---

## 15. V1 grading policy

### Purpose
The grading policy exists to make feedback feel credible. In V1, the system should prefer honest correction over generosity. False praise is more damaging than mild strictness.

### Core principle
When uncertain, do not mark correct by default.

Preferred fallback order:
- correct only with strong evidence
- flawed when the learner likely had the right idea but execution was off
- incorrect when form or meaning is not recoverable

### What counts as evidence
Evidence can come from:
- transcript exact match
- transcript match to accepted variants
- authored near-miss patterns
- confidence from STT
- constrained evaluator output

No single weak signal should be enough to mark correct.

### Grade definitions

#### Correct
Mark correct only when:
- target meaning is correct
- core morphology is correct
- subject/verb alignment is correct
- tense is correct
- there is high confidence the learner actually produced the intended form

Examples:
- exact match: "היא משתפרת"
- accepted transliteration: "hi mishtaperet"
- tiny transcript noise with clear preservation of form

#### Flawed
Mark flawed when the learner was clearly aiming at the target but made a contained error.

Typical flawed cases:
- wrong gender
- wrong number
- pronoun omission when the target is otherwise identifiable
- slight word-ending loss in transcript
- understandable but visibly hesitant production
- probable correct answer with low STT confidence
- pronunciation issue that preserves intended word identity

Flawed should be used aggressively in V1. It is the main anti-yes-man bucket.

#### Incorrect
Mark incorrect when:
- wrong tense
- wrong verb
- wrong person/pronoun with no sign of target understanding
- response too incomplete to recover
- unrelated answer
- silence / unusable audio
- transcript too corrupted to infer intent

### Policy by error type

#### 1. Pronoun omission
Example:
- target: "היא כותבת"
- learner: "כותבת"

Default V1 policy: flawed, not correct.
Reason: in real spoken Hebrew omission may be natural in context, but V1 prompts are testing explicit mappings and should remain slightly strict.

#### 2. Gender mismatch
Example:
- target: "אני כותבת"
- learner: "אני כותב"

Policy: flawed.
Reason: close semantic intent, wrong morphology.

#### 3. Number mismatch
Example:
- target: "אנחנו לומדים"
- learner: "אני לומד"

Policy: incorrect if person/number target changed substantially.
Reason: this usually indicates failure on the core mapping.

#### 4. Tense mismatch
Example:
- target present, learner gives past or future

Policy: incorrect.
Reason: tense is central to the lesson target.

#### 5. Wrong verb but correct frame
Example:
- target: "הוא כותב"
- learner: "הוא לומד"

Policy: incorrect.
Reason: lexical target missed.

#### 6. Missing article or minor function word
Only relevant in later sentence packs.

Policy: flawed if meaning and structure remain clear.

#### 7. Hesitation / restart
Example:
- learner says a false start then self-corrects

Policy:
- correct if final produced form is clearly correct
- flawed if final output remains messy or confidence is low

Do not punish clean self-correction too harshly.

#### 8. Transcript uncertainty
If the STT transcript is shaky but the likely intended answer appears close:
- flawed by default
- correct only with high confidence

### Confidence policy

#### High confidence
Use correct only when two or more of these align:
- transcript closely matches target
- STT confidence is high
- deterministic matcher agrees
- constrained evaluator agrees

#### Medium confidence
Default to flawed.

#### Low confidence
Use flawed or incorrect depending on recoverability.
Never use correct on low confidence.

### Output policy
The evaluator should return:
- grade
- short reason code
- learner_normalized_text
- correct_hebrew
- should_advance

Example:
```json
{
  "grade": "flawed",
  "reason_code": "wrong_gender",
  "learner_normalized_text": "ani kotev",
  "correct_hebrew": "אני כותבת",
  "should_advance": true
}
```

### Reason codes
Suggested V1 reason codes:
- exact_match
- accepted_variant
- probable_match_low_confidence
- missing_pronoun
- wrong_gender
- wrong_number
- wrong_person
- wrong_tense
- wrong_verb
- incomplete_response
- silence
- unusable_audio
- ambiguous_transcript

### User-facing feedback mapping
Internal reason codes should map to short spoken feedback.

Examples:
- exact_match -> "Correct."
- accepted_variant -> "Correct."
- probable_match_low_confidence -> "Close, but say it again like this."
- missing_pronoun -> "Close. Say the full form like this."
- wrong_gender -> "Close, wrong gender."
- wrong_number -> "Not quite."
- wrong_tense -> "Not quite, wrong tense."
- wrong_verb -> "Not quite."
- incomplete_response -> "Say the full phrase like this."
- silence -> "Let’s try the next one."

Then always follow with the correct Hebrew.

### Anti-overpraise guardrails
- Never say correct just because semantic intent seems close
- Never say correct when morphology is wrong
- Never say correct when transcript confidence is low
- Prefer flawed over correct when ambiguity exists
- Prefer incorrect over flawed when the target feature of the lesson was missed

### Evaluation precedence
1. Silence / unusable audio check
2. Exact or accepted match check
3. Lesson-critical feature checks
4. Near-miss classification
5. Constrained evaluator fallback
6. Conservative downgrade if uncertainty remains

### Lesson-critical feature rule
Each lesson item should declare its critical features.

Example:
```json
{
  "critical_features": ["verb", "tense", "person", "gender"]
}
```

If a critical feature is wrong, the answer cannot be marked correct.

### V1 recommendation for harshness
Slightly strict is better than slightly generous.
The system should feel like a careful teacher, not a cheerleader.

### Open tuning knobs
These should be adjustable later:
- whether missing pronouns are flawed vs correct
- whether self-correction counts as correct
- whether low-confidence probable matches become flawed vs incorrect
- whether first-person gender mismatches are flawed vs incorrect in beginner packs

### Immediate implementation recommendation
Implement grading with this order:
1. deterministic exact/variant matcher
2. rule-based critical feature checker
3. near-miss rule classifier
4. constrained LLM fallback
5. conservative post-processor that downgrades weak corrects to flawed

---

## 16. Technical implementation plan for prototype

### Goal
Build the thinnest end-to-end prototype that proves the core spoken drill loop works in practice.

### Prototype success condition
A user can complete one 10-item Hebrew present-tense drill on mobile, speaking answers out loud and receiving immediate corrective repetition after each turn.

### Recommended V1 stack

#### Frontend
- Next.js web app
- Mobile-first UI
- Simple client state machine for drill session flow
- Browser audio playback and microphone capture

Reason:
- fastest path to a usable prototype
- easy deployment
- good fit for one-user early testing

#### Backend
- Next.js API routes or small Node service
- Minimal relational database or hosted Postgres
- JSON-authored lesson content loaded from repo or database

Reason:
- keep architecture boring
- optimize for iteration speed, not scale

#### Data store
Use Postgres for:
- lessons
- lesson_items
- sessions
- attempts

For earliest prototype, lesson content can live in JSON files and attempts can still persist to Postgres.

#### Speech-to-text
Use a Hebrew-capable STT provider with low latency.
Selection criteria:
- Hebrew accuracy
- latency
- streaming support optional but not required for first prototype
- easy API integration

For prototype, batch transcription after each utterance is acceptable.

#### Text-to-speech
Use one Hebrew voice for teacher output.
Selection criteria:
- intelligible Hebrew pronunciation
- low latency
- stable API

For prototype, quality and clarity matter more than voice variety.

#### LLM usage
Use the model only for constrained fallback evaluation and optional short correction phrasing.
Do not use the LLM to drive session sequencing.

---

## 17. Prototype architecture

### Core components

#### A. Lesson content loader
Loads lesson pack metadata and item definitions.

Responsibilities:
- fetch lesson pack
- return ordered items
- expose accepted variants and near-miss rules

#### B. Session engine
Deterministic state machine.

States:
- idle
- loading
- prompting
- listening
- transcribing
- evaluating
- correcting
- advancing
- complete
- error

Responsibilities:
- track current item index
- prevent out-of-order transitions
- trigger prompt playback
- collect transcript
- request evaluation
- store result
- advance session

#### C. Audio input module
Handles microphone capture and submission.

Responsibilities:
- request microphone permission
- start recording after prompt ends
- stop recording on user action or silence timeout
- submit audio blob for transcription

#### D. Transcription module
Turns audio into text.

Responsibilities:
- send audio to STT provider
- receive transcript and optional confidence
- normalize transcript for evaluation

#### E. Evaluation module
Grades the response.

Responsibilities:
- exact/variant matching
- critical feature checks
- near-miss classification
- constrained fallback when ambiguous
- return grade and reason

#### F. Feedback module
Builds the spoken response.

Responsibilities:
- map reason code to short spoken feedback
- append correct Hebrew
- send text to TTS
- play audio response

#### G. Persistence module
Stores session and attempt data.

Responsibilities:
- create session record
- write attempt per item
- finalize session summary

---

## 18. Suggested build order

### Step 1: Text-only simulator
Build the drill loop without real audio.

Features:
- load lesson pack
- show English prompt
- type answer in text box
- run evaluation
- show feedback and correct Hebrew
- advance through 10 items
- show session summary

Why:
- fastest way to validate grading logic
- easiest way to debug content and edge cases
- avoids STT/TTS complexity initially

### Step 2: Add persistence
Persist:
- session start/end
- each attempt
- grades and reasons

Why:
- needed for testing quality and review later
- gives you real data on false positives and false negatives

### Step 3: Add TTS prompt and correction playback
Replace silent text loop with spoken teacher outputs.

Features:
- speak English prompt
- speak brief feedback + correct Hebrew

Why:
- validates the user experience feel before adding speech input

### Step 4: Add microphone capture + STT
Allow spoken answers.

Features:
- record audio after prompt
- transcribe answer
- show transcript optionally
- run evaluator on transcript

Why:
- this is the first real end-to-end experience

### Step 5: Add grading guardrails
Implement:
- confidence-aware downgrades
- transcript ambiguity handling
- reason codes
- retry logging

Why:
- this is where prototype becomes credible rather than demo-like

### Step 6: Add summary + retry missed items
Features:
- per-session counts
- hardest items
- retry flawed/incorrect items

Why:
- completes the learning loop

---

## 19. API/backend responsibilities by endpoint

### POST /sessions
Responsibilities:
- validate lesson_id
- create session row
- return first item metadata

### GET /sessions/:id/next-item
Responsibilities:
- return current or next item
- detect end of session

### POST /attempts/transcribe
Responsibilities:
- receive audio blob
- call STT provider
- return transcript and confidence

### POST /attempts/evaluate
Responsibilities:
- receive item_id and transcript
- load item rules
- run deterministic evaluator
- optionally run constrained fallback
- return grade, reason, correct_hebrew

### POST /attempts
Responsibilities:
- persist attempt
- update session counters
- return next item id or completion signal

### GET /sessions/:id/summary
Responsibilities:
- aggregate results
- return counts and missed items

---

## 20. Frontend state machine sketch

```text
idle
  -> loading
  -> prompting
  -> listening
  -> transcribing
  -> evaluating
  -> correcting
  -> advancing
  -> prompting (next item)
  -> complete
```

### State rules
- Do not allow recording while prompt audio is still playing
- Do not advance until correction audio finishes or is skipped
- If transcription fails, go to error or retry path
- If evaluation fails, log and fall back to generic correction path if possible

---

## 21. File/module sketch

### Frontend
- `app/page.tsx` or home screen
- `app/drill/[lessonId]/page.tsx`
- `components/DrillScreen.tsx`
- `components/StatusIndicator.tsx`
- `components/SessionSummary.tsx`
- `lib/sessionEngine.ts`
- `lib/audioRecorder.ts`
- `lib/ttsPlayer.ts`
- `lib/api.ts`

### Backend
- `app/api/sessions/route.ts`
- `app/api/sessions/[id]/next-item/route.ts`
- `app/api/attempts/transcribe/route.ts`
- `app/api/attempts/evaluate/route.ts`
- `app/api/attempts/route.ts`
- `app/api/sessions/[id]/summary/route.ts`
- `lib/evaluator.ts`
- `lib/normalize.ts`
- `lib/lessons.ts`
- `lib/db.ts`

### Content
- `content/lessons/present_tense_basics_01.json`

---

## 22. Evaluator implementation strategy

### Phase 1 evaluator
Purely deterministic for the first 10-item pack.

Checks:
- normalized exact match
- accepted variant match
- known near-miss patterns
- critical feature mismatches

This may be enough for early internal testing.

### Phase 2 evaluator
Add constrained fallback model for unresolved cases.

Use only when:
- transcript partially matches multiple variants
- STT confidence is low but answer appears close
- deterministic rules do not clearly classify the response

### Post-processing rule
After model fallback:
- downgrade any weak correct to flawed if uncertainty remains

---

## 23. Logging and debugging plan

For each attempt, log:
- lesson_item_id
- raw transcript
- normalized transcript
- STT confidence if available
- deterministic match result
- fallback invoked or not
- final grade
- reason code

Why:
- essential for tuning yes-man behavior
- lets you inspect where grading is too generous or too harsh

### Review workflow
During prototype testing, manually inspect:
- all correct grades with low confidence
- all flawed grades caused by ambiguity
- all incorrect grades where transcript appears close

---

## 24. Recommended prototype constraints

To keep V1 buildable, avoid these in first implementation:
- live streaming partial transcripts
- open conversation mode
- multiple teacher voices
- dynamic lesson generation
- adaptive sequencing beyond retry missed items
- full pronunciation scoring

Keep the loop single-threaded and simple.

---

## 25. Key implementation decisions to lock early

### 1. Transcript visibility
Recommendation: show transcript briefly after each response, but de-emphasize it visually.
Reason: helps debugging STT errors without turning the app into a typing tool.

### 2. Record-stop behavior
Recommendation: start with tap-to-stop or short silence timeout.
Reason: easier than trying to infer perfect utterance boundaries immediately.

### 3. Prompt order
Recommendation: fixed order for first pack.
Reason: easier to debug and compare runs.

### 4. Retry behavior
Recommendation: end-of-session retry for flawed and incorrect items only.
Reason: simple and useful.

### 5. TTS language split
Recommendation: English for prompt, Hebrew for corrected form.
Reason: clean separation for beginner practice.

---

## 26. First engineering milestone

### Milestone definition
A mobile web page where the user can:
- start Present Tense Basics 01
- hear or read 10 prompts
- answer each one
- receive grade + correct Hebrew after each answer
- finish session and view summary

### Minimum acceptable implementation
Text input plus text output is acceptable first.
Audio can be layered in immediately after the loop works.

### Done criteria
- no broken state transitions
- every item returns a grade
- correct Hebrew is always shown or spoken
- session summary matches stored attempts
- flawed bucket is used meaningfully

---

## 27. Immediate next engineering step
Build the text-only drill simulator first, then use it to test and tune the first 10-item lesson pack before adding microphone and TTS.

