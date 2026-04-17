# MASTER PROMPT V2 - SONG TO DIRECT HANDWRITING LESSON YAML

You are creating one final authored YAML file for a Hebrew handwriting lesson derived from a song's Hebrew lyrics and English translation.

Your output must be a single valid YAML document only.

Do not include:

- markdown fences
- commentary
- explanation
- analysis
- notes outside the YAML
- repeated copies of the input lyrics or translation

Do not echo the full input lyrics or full translation back into the output.

## Task

Produce one direct Daber handwriting lesson YAML in the exact schema below.

This is not a song-analysis document, not a research memo, and not a broad curriculum plan. The output should be ready for the repo's direct lesson importer.

The song is the destination, not the lesson. Teach a small set of reusable Hebrew items first, then bridge into fair song-derived phrase or sentence targets.

## Non-Negotiable Output Rules

- Return YAML only.
- Use valid YAML list markers: `-`, never `*`.
- Use two-space indentation for nested fields.
- Do not use tabs.
- Do not add extra top-level keys.
- Do not output source lyrics, source translation, or large lyric excerpts as metadata sections.
- Do not invent nested analysis structures such as `units`, `unit_type`, `base_form`, `family`, `ordinary_usage`, `lyric_unlocks`, `delivery`, or `critical_review`.
- The `id` must start with `song_`.
- `endpoint.kind` must be `song`.
- Use only the allowed form tokens listed below.

## Exact Top-Level Keys

The YAML must contain exactly these ten top-level keys, in this order:

1. `id`
2. `title`
3. `tagline`
4. `endpoint`
5. `phases`
6. `core`
7. `supporting`
8. `build_phrases`
9. `notes`
10. `authoring_principles`

If a section has no useful entries but is required by this prompt, use an empty list for list sections. For `core` and `supporting`, include only non-empty POS maps inside the section.

## Required YAML Shape

Use this shape exactly. Replace placeholders with real content.

```yaml
id: song_<short_ascii_slug>
title: <song or lesson title>
tagline: <short one-line lesson description>
endpoint:
  kind: song
  description: <what the learner will be able to handwrite by the end>

phases:
  - id: core_exposure
    title: <short title>
    goal: <short goal>
  - id: supporting_build
    title: <short title>
    goal: <short goal>
  - id: core_reinforcement
    title: <short title>
    goal: <short goal>

core:
  verbs:
    <Hebrew lemma>: [<allowed verb variant>]
  nouns:
    <Hebrew lemma>: [<allowed noun variant>]
  adjectives:
    <Hebrew lemma>: [<allowed adjective variant>]

supporting:
  verbs:
    <Hebrew lemma>: [<allowed verb variant>]
  nouns:
    <Hebrew lemma>: [<allowed noun variant>]
  adjectives:
    <Hebrew lemma>: [<allowed adjective variant>]

build_phrases:
  - he: <Hebrew target>
    en: <plain English meaning>
    prompt: <learner-facing production cue>
    span: phrase
    pieces: [<Hebrew piece>, <Hebrew piece>]
    drillable: true
    notes: <optional short author-only note>

notes:
  - id: <note_id>
    title: <short title>
    body: <short learner-facing explanation>
    kind: bound_form|literary_form|grammar_pattern|usage_note|lyric_note
    related_he: <optional Hebrew form or phrase>

authoring_principles:
  - <short principle>
```

Omit empty nested POS maps. For example, if there are no adjectives in `core`, do not include `core.adjectives`.

## Allowed Form Tokens

Use only these exact variant tokens in `core` and `supporting`.

Verb variants:

- `lemma`
- `present_m_sg`
- `present_f_sg`
- `present_m_pl`
- `present_f_pl`
- `past_1sg`
- `past_2sg_m`
- `past_2sg_f`
- `past_3sg_m`
- `past_3sg_f`
- `past_1pl`
- `past_2pl_m`
- `past_2pl_f`
- `past_3pl`
- `future_1sg`
- `future_2sg_m`
- `future_2sg_f`
- `future_3sg_m`
- `future_3sg_f`
- `future_1pl`
- `future_2pl_m`
- `future_2pl_f`
- `future_3pl`
- `imperative_sg_m`
- `imperative_sg_f`
- `imperative_pl_m`
- `imperative_pl_f`

Noun variants:

- `sg`
- `pl`

Adjective variants:

- `m_sg`
- `f_sg`
- `m_pl`
- `f_pl`

Do not invent aggregate, person-number, or negative-form tokens such as:

- `present_pl`
- `present_sg_2_f`
- `present_sg_1_m`
- `present_sg_2_f_neg`
- `sg_m`
- `feminine`
- `plural`

If the target would require a token that is not in the allowed list, move that target to `build_phrases` or `notes`, or omit it.

## Core Pedagogy

Choose a small, strong lesson.

Include an item only if it helps the learner handwrite useful Hebrew or a meaningful song payoff. Do not include low-value tokens just because they occur in the song.

Prefer:

- ordinary reusable Hebrew before lyric-specific payoff
- a few good nouns/verbs/adjectives over a broad token dump
- fair production targets over clever analysis
- contextual agreement exposure through phrases and sentences
- notes for idioms, literary forms, bound forms, and underconstrained lyric fragments

Avoid:

- comprehensive lyric token extraction
- broad inflection tables
- morphology spreadsheet behavior
- rare lyric-only forms as drill cells
- prompt text that gives the answer through grammatical labels

## Learner-Facing Prompt Rules

Every `build_phrases` item has two English fields:

- `en`: the plain meaning
- `prompt`: the cue shown to the learner

These are related but not identical. The prompt should be the actual production cue, not an instruction to use the interface.

Do not prefix prompts with:

- `Write the phrase:`
- `Write the sentence:`
- `Translate:`
- `Handwrite:`

The app already asks the learner to write. The prompt should feel like language.

Good prompt examples:

- `bubble`
- `inside a bubble`
- `black radio`
- `the bubbles are big`
- `I am ordering a cheesecake (male speaker)`
- `you are listening to the radio (addressing a woman)`
- `about the situation (definite)`

Bad prompt examples:

- `Write the phrase: inside a bubble`
- `bubble (singular form)`
- `black (masculine singular form)`
- `black (feminine form)`
- `black (plural form)`
- `present plural of sit`

Use parenthetical information only when it is necessary to make the Hebrew answer fair, such as speaker gender, addressee gender, definiteness, tense, or fixed-expression status. Prefer contextual phrase/sentence expansion over morphology labels.

## Fairness Rules

A drillable target must be fair from the learner's cue.

The prompt must constrain whatever matters for the expected Hebrew:

- person
- number
- gender, if the Hebrew answer would otherwise be underdetermined
- tense/aspect
- definiteness
- expected phrase vs sentence meaning
- required preposition, prefix, or object marker

Do not make the learner guess among equally natural Hebrew answers.

If a target is poetic, idiomatic, compressed, culturally loaded, or too underconstrained, put it in `notes` or omit it.

Recognition-only items should normally go in `notes`, not `build_phrases`. Use `build_phrases.drillable: false` only if a phrase must stay near the production sequence as an author breadcrumb; the app will not drill it.

## Core And Supporting Scope Rules

`core` and `supporting` define real lexicon-backed handwriting cells. Keep them curated.

Use `core` for the few items the lesson truly teaches.

Use `supporting` for items needed to make the build phrases fair or self-contained.

For nouns:

- Usually include only `sg`.
- Include `pl` only if a plural form is directly useful in the lesson or song payoff.
- Do not add plural clutter just to be complete.

For verbs:

- Choose only forms needed for the lesson.
- Do not include all present forms unless the lesson actually uses them.
- Do not include negative forms as variants; express negation in `build_phrases`.

For adjectives:

- Include isolated adjective cells sparingly.
- If agreement matters, add contextual `build_phrases` instead of relying on labels.
- Example: prefer `black radio`, `black shirt`, or `the balls are black` over `black (masculine singular form)`.

## Build Phrase Rules

`build_phrases` is the bridge from reusable Hebrew to song payoff.

Each item must have:

- `he`
- `en`
- `prompt`
- `span`
- `pieces`
- `drillable`

`span` must be either:

- `phrase`
- `sentence`

`pieces` should list Hebrew lemmas/chunks already taught or intentionally reinforced. It may contain one or more items.

Only include a production target if:

- it is worth handwriting
- it can be cued fairly
- the prompt is natural and minimal
- the Hebrew target is not an opaque lyric fragment unless the cue fully constrains it

Good build phrase sequence:

- lexical item: `bubble`
- phrase: `inside a bubble`
- phrase with adjective agreement: `black radio`
- sentence: `we are sitting in a cafe and talking about the situation`

## Notes Rules

Use `notes` for material that is pedagogically useful but should not become a production drill.

Good note candidates:

- idioms whose literal cue would not produce the real Hebrew
- bound forms
- literary forms
- rhetorical questions
- compressed lyric lines
- cultural references
- grammar observations that explain a lyric but are too advanced for production

Allowed `kind` values:

- `bound_form`
- `literary_form`
- `grammar_pattern`
- `usage_note`
- `lyric_note`

Keep note bodies short and learner-facing. Do not write a full analysis essay.

## YAML Validity Checklist

Before returning, silently verify:

1. The output is one YAML document.
2. The output has exactly the ten required top-level keys.
3. Lists use `-`, not `*`.
4. Nested fields are indented by two spaces.
5. `endpoint.kind` is `song`.
6. `id` starts with `song_`.
7. Every form token is from the allowed list.
8. No morphology-label prompts are present.
9. No `Write the phrase:` or `Write the sentence:` prompt scaffolding is present.
10. No source lyrics or translation are repeated as metadata sections.
11. No forbidden analysis structures are present.
12. Recognition-only content is in `notes` unless there is a strong reason for `drillable: false`.

## Final Instruction

Return only the final YAML file.
