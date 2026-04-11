# Verb Governance — Design Proposal (Daber)

Last updated: 2026-03-31

## Why this matters
Conjugation grids alone aren’t enough for production. Hebrew verbs often govern specific complements: definite direct objects with את, or prepositional phrases like על/ב/ל/עם/מ(־)/אל. Without this, learners produce ungrammatical output (e.g., "אני מטפל הילד" instead of "אני מטפל בילד"). This document proposes a minimal, durable way to store and surface governance for verbs and outlines how to populate and use it.

---

## Investigation — Current State

- Storage (Prisma)
  - `Daber/prisma/schema.prisma` has a `Lexeme` table with: `id`, `lemma`, `language`, `pos`, `gloss?`, `features? (Json)`, and related `Inflection[]`.
  - No dedicated field for subcategorization/governance. `features` is general-purpose and has been used for provenance and ad‑hoc hints.

- Lexeme/Inflection reality
  - Wikidata seeding (`scripts/lexicon/seed_wikidata_bulk.ts`) stores lexicalCategory Q‑ids into `Lexeme.pos` (verbs are `Q24905`), and pushes raw forms into `Inflection.form` with Q‑feature ids in `Inflection.features`.
  - Some authored artifacts already bundle prepositions into forms (e.g., "לִצעוֹק עַל", "לִקבּוֹע תוֹר ל…", "לֵהַרִים אֵת") via admin patch routes. This is inconsistent as a governance carrier and shouldn’t be relied on.

- UI surfaces
  - Intros: `buildIntroFor()` chooses a canonical verb base (infinitive or heuristic `ל*` form) and shows English from `Lexeme.gloss`.
  - Dictionary: `/dictionary/[lexemeId]` shows a display form and the forms list; no governance hints.

Conclusion: We need an explicit, queryable governance field attached to `Lexeme`, ideally verb‑only, that is simple to display and safe to use in future generation/validation.

---

## Schema Proposal

Goal: Keep it simple, explicit, and future‑proof. Avoid over‑modeling.

Two options considered:
1) `Lexeme.verb_governance Json?` — a single JSON payload with 1..n frames. Pros: minimal migration, easy to read and render, batch‑populatable, no joins. Cons: no DB‑level constraints beyond JSON shape.
2) Dedicated `VerbGovernance` table + `VerbGovernanceFrame` child rows. Pros: normalized, constrained. Cons: heavier migration/queries, overkill for our current needs and tiny payloads.

Recommendation: Option (1) — a `Json` column on `Lexeme` named `verb_governance` with a disciplined app‑side schema. This mirrors the existing use of `Lexeme.features` but keeps governance separate and semantically clear.

Prisma migration sketch:

```prisma
// schema.prisma
model Lexeme {
  id              String        @id
  lemma           String
  language        String
  pos             String
  gloss           String?
  features        Json?
  verb_governance Json?         // NEW: verb subcategorization/governance
  inflections     Inflection[]
  lessonItems     LessonItem[]
  generatedDrills GeneratedDrill[]
}
```

Type shape (app‑side TypeScript):

```ts
export type HebPrep = 'et' | 'b' | 'l' | 'al' | 'im' | 'min' | 'el' | 'none';

export type VerbGovernanceFrame = {
  prep: HebPrep;           // primary complement marker
  role?: 'do' | 'io' | 'comp'; // direct/indirect/complement (optional)
  sense_en?: string;       // short sense label if multiple preps map to different meanings
  frame_he?: string;       // e.g., "חושב על ___" (optional but nice for display)
  example_he?: string;     // short example (optional)
};

export type VerbGovernance = {
  transitivity: 'transitive' | 'intransitive' | 'both';
  frames: VerbGovernanceFrame[]; // one or more
  notes?: string;                // optional editor note
};
```

Notes
- `prep` values
  - `et` = definite direct object marker את
  - `b`=ב, `l`=ל, `al`=על, `im`=עם, `min`=מ/מן, `el`=אל, `none`=no complement
  - Extendable if we later need rare ones (e.g., עבור, כלפי).
- `transitivity` captures whether a verb can take a direct object (את) and/or is primarily prepositional/intransitive. `both` covers verbs like "לכתוב" that take a direct object and optionally an indirect object with ל.
- We intentionally avoid LFG‑style features or full valency modeling; this is for learner display + soft constraints.

---

## Sample Governance Data (10 verbs)

Representative coverage: transitive+את, specific preposition, multiple prepositions (different senses), intransitive, and both (ditransitive‑like).

1) לאהוב — to love (someone/something)
```json
{
  "transitivity": "transitive",
  "frames": [
    { "prep": "et", "role": "do", "frame_he": "לאהוב את ___", "sense_en": "to love (someone/something)" }
  ]
}
```

2) לכתוב — to write (something) to (someone)
```json
{
  "transitivity": "both",
  "frames": [
    { "prep": "et", "role": "do", "frame_he": "לכתוב את ___", "sense_en": "write (the letter)" },
    { "prep": "l",  "role": "io", "frame_he": "לכתוב ל___",  "sense_en": "write to (someone)" }
  ]
}
```

3) לחשוב — to think (about)
```json
{
  "transitivity": "intransitive",
  "frames": [
    { "prep": "al", "role": "comp", "frame_he": "לחשוב על ___", "sense_en": "think about" }
  ]
}
```

4) לטפל — to take care of, to treat
```json
{
  "transitivity": "intransitive",
  "frames": [
    { "prep": "b", "role": "comp", "frame_he": "לטפל ב___", "sense_en": "take care of / treat" }
  ]
}
```

5) לחכות — to wait (for)
```json
{
  "transitivity": "intransitive",
  "frames": [
    { "prep": "l", "role": "comp", "frame_he": "לחכות ל___", "sense_en": "wait for" }
  ]
}
```

6) לדבר — to speak/talk (with/about)
```json
{
  "transitivity": "intransitive",
  "frames": [
    { "prep": "im", "role": "comp", "frame_he": "לדבר עם ___", "sense_en": "talk with" },
    { "prep": "al", "role": "comp", "frame_he": "לדבר על ___", "sense_en": "talk about" }
  ]
}
```

7) להתקשר — to call (someone)
```json
{
  "transitivity": "intransitive",
  "frames": [
    { "prep": "el", "role": "comp", "frame_he": "להתקשר אל ___", "sense_en": "call (to)" },
    { "prep": "l",  "role": "comp", "frame_he": "להתקשר ל___",  "sense_en": "call (to)" }
  ],
  "notes": "Modern usage strongly prefers ל over אל in speech."
}
```

8) להקשיב — to listen (to)
```json
{
  "transitivity": "intransitive",
  "frames": [
    { "prep": "l", "role": "comp", "frame_he": "להקשיב ל___", "sense_en": "listen to" }
  ]
}
```

9) לצעוק — to shout (at)
```json
{
  "transitivity": "intransitive",
  "frames": [
    { "prep": "al", "role": "comp", "frame_he": "לצעוק על ___", "sense_en": "shout at" }
  ]
}
```

10) לרוץ — to run
```json
{
  "transitivity": "intransitive",
  "frames": [
    { "prep": "none", "role": "comp", "frame_he": "לרוץ", "sense_en": "run" }
  ]
}
```

Additional high‑value candidates observed in authored content: לשכוח את, לשלוח את … ל, לפתוח את, למצוא את, לקרוא את/ל, לשמוע את, לכעוס על. These can be populated using the same shape as above.

---

## Population Strategy

Scale estimate
- Active, learner‑facing verbs today are modest. Green + Mini drills + a handful of CC verbs likely total < 100 unique verb lemmas in regular rotation. Manual pass is feasible.
- The Wikidata‑seeded lexicon is larger (hundreds to thousands of lexemes) but not all are in active drills. We can phase governance coverage.

Approach
1) Phase 1 (manual, curated)
   - Target: all verbs used by Green and Mini drills, plus any verb that appears in `buildIntroFor()` flows during Mike’s sessions (log‑driven list).
   - Entry: admin JSON paste into `Lexeme.verb_governance` via a small one‑off admin route or psql/Prisma script (no UI required initially).
   - QA: quick spot check in `/dictionary` (add a governance block, see UI section).

2) Phase 2 (semi‑auto with validation)
   - LLM assist to draft governance for remaining high‑frequency verbs, then human verify.
   - Prompt sketch (system + user):
   ```
   You are a Hebrew linguistics assistant. For the given Hebrew verb lemma, provide its typical object governance in Modern Hebrew for learner use. Choose from prepositions: et, b, l, al, im, min, el, or none. If multiple prepositions reflect different senses, include multiple frames with short sense labels. Return strict JSON matching this TypeScript type:
   type VerbGovernance = { transitivity: 'transitive' | 'intransitive' | 'both'; frames: Array<{ prep: 'et'|'b'|'l'|'al'|'im'|'min'|'el'|'none'; role?: 'do'|'io'|'comp'; sense_en?: string; frame_he?: string; example_he?: string }>; notes?: string }.

   Lemma: לחשוב
   Gloss (EN): to think
   Known forms (examples): חושב, חושבת, חשבתי, נחשוב …
   Constraints: prefer common spoken usage; avoid rare/literary forms; for את note it marks definite direct objects.
   Output: JSON only.
   ```
   - Validation pass: reject if preps outside whitelist, or if `both` is set without an `et` frame.

3) Phase 3 (bulk)
   - If desired, mine governance heuristically from authored strings that already include prepositions (e.g., forms containing " על", " ב", " ל") as weak signals for a review queue; do not auto‑trust.

Data source note
- Public sources like Pealim, Wiktionary, and Morfix indicate governance in their examples, but licensing/API constraints limit automated ingestion. Given small scope, manual + LLM‑assist with human validation is preferred.

---

## UI — Minimal Display on Verb Intros & Dictionary

Principles
- Keep it glanceable. Learner should see the complement marker right when the verb is introduced.
- Do not overwhelm with metalinguistic terms; show the Hebrew marker and an optional one‑line hint for את.

Intro card (session)
- Current: big Hebrew base form (infinitive), English gloss, subtle hint line.
- Proposed addition for verbs with governance:
  - Next to the Hebrew lemma (or below), show the primary marker in parentheses: e.g., "לאהוב (את)", "לחשוב (על)", "לטפל (ב)".
  - If multiple frames exist with distinct senses, show the most common one on the intro; tap/hover could reveal "גם: עם / על" later (future polish).
  - For את, include a one‑time per‑session hint in the small hint line: "את marks definite direct objects".

Dictionary page
- Add a "governance" block under the forms list when `verb_governance` exists.
  - Render each frame as a pill: "(את) לאהוב את ___", "(על) לחשוב על ___". If `sense_en` exists, append in small gray text.

Wire points
- Source data: `Lexeme.verb_governance`.
- Intro composition: `buildIntroFor()` can fetch the lexeme and append ` (על)` etc. No change to SRS logic.
- No code changes are included in this doc; this is the design for a future patch.

---

## Interaction with Future Generation

- Constraint: When generating en→he or he→en sentences for verbs with governance, ensure the Hebrew side includes the governed complement (e.g., לחשוב → include על before the object; transitive verbs → use את before definite objects in examples).
- Validation: reject/repair generated items that misuse governance (e.g., *"אני חושב הסרט"* without על; or missing את before a definite noun).
- Selection bias: prefer example pools that exercise the governed frame(s) to reinforce usage without over‑repetition.

---

## Rollout Plan (No code in this task)
1) Add `Lexeme.verb_governance Json?` via migration.
2) Populate Phase 1 verbs (Green + Mini + top CC verbs) manually using the samples above as a template.
3) Add UI render:
   - Intro: parenthetical marker next to Hebrew base.
   - Dictionary: governance block.
4) Start using governance as a soft validation in generation (enforce complements).
5) Expand coverage with LLM‑assist + human validation (Phase 2).

Scope of this document
- This task delivers the design and examples only. No code has been changed.

