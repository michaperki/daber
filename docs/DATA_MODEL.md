# Data Model

Three data worlds live here, and they stay separate:

1. **Content** — curated Hebrew lexicon in YAML, compiled to a typed module at build time
2. **Calibration** — handwriting samples, per device, synced as a blob
3. **Progress** — prefs, stats, seen-words, synced as a blob

For the MVP, neither the calibration blob nor the progress blob is ever queried column-wise. They're opaque JSON payloads that go in and come out whole. The Postgres schema reflects that.

Later phases (L2 inflection drills, L3 SRS, L5 stats) will need real queryable tables. See the "Later" section at the end.

---

## 1. Content (YAML v2)

The canonical source of truth lives in `packages/content/data/v2/`. This is a byte-for-byte copy of the same YAML used in `hebrew_drills/v2/`.

### Directory layout

```
packages/content/data/v2/
├── verbs/
│   ├── core_actions.yaml
│   ├── motion.yaml
│   ├── communication.yaml
│   ├── cognition_perception.yaml
│   └── all.yaml                # remainder
├── nouns/
│   ├── core_people_objects.yaml
│   ├── food_drink.yaml
│   ├── places.yaml
│   ├── time_date.yaml
│   └── all.yaml
├── adjectives/
│   └── all.yaml
├── adverbs/
│   └── all.yaml
├── pronouns/
│   └── all.yaml
├── prepositions/
│   └── all.yaml
└── concepts/
    ├── accusative_et.yaml
    ├── existential.yaml
    └── all.yaml
```

### Per-POS shapes (summary)

Full schemas live in `reference/hebrew_drills/docs/v2-authoring.md` and will be ported to Zod in `packages/content/src/schema.ts`. This is just the mental model.

**Verbs**
```yaml
pos: verb
entries:
  - lemma: לפתוח
    gloss: to open
    primary_prep: et
    present:   { m_sg, f_sg, m_pl, f_pl }
    past:      { 1sg, 2sg_m, 2sg_f, 3sg_m, 3sg_f, 1pl, 2pl_m, 2pl_f, 3pl }
    future:    { 1sg, 2sg_m, 2sg_f, 3sg_m, 3sg_f, 1pl, 2pl_m, 2pl_f, 3pl }
    imperative:{ sg_m, sg_f, pl_m, pl_f }
    governance:
      frames:
        - { prep: et, role: do, frame_he: "לפתוח את ___", sense_en: "open (something)" }
      transitivity: transitive
    examples:
      - { he: "הוא פותח את החלון", en: "he is opening the window" }
```

**Nouns**
```yaml
pos: noun
entries:
  - lemma: בית
    gloss: house
    gender: m
    forms: { sg: בית, pl: בתים }
    examples: [...]
```

**Adjectives**
```yaml
pos: adjective
entries:
  - lemma: גדול
    gloss: big
    forms: { m_sg: גדול, f_sg: גדולה, m_pl: גדולים, f_pl: גדולות }
    examples: [...]
```

**Adverbs / Pronouns**
```yaml
pos: adverb | pronoun
entries:
  - { lemma, gloss, examples }
```

**Prepositions**
```yaml
pos: preposition
entries:
  - lemma: על
    gloss: on
    suffixes: { 1sg: עליי, 2sg_m: עליך, ..., 3pl_f: עליהן }
    examples: [...]
```

**Concepts** (different shape — not lexemes)
```yaml
type: concept
entries:
  - key: accusative_et
    label: "Accusative את"
    description: "Marks definite direct objects."
    examples:
      - { he: "הוא קרא את הספר", en: "he read the book", anchor_lemma: לקרוא }
```

### Build-time extraction

`packages/content/src/build.ts` walks the YAML tree and produces:

**`packages/content/dist/vocab.json`** (MVP shape):
```json
[
  { "he": "שלום", "en": "peace / hello", "pos": "noun" },
  { "he": "לפתוח", "en": "to open", "pos": "verb" },
  ...
]
```

Rules (same as current `HebrewHandwritingWeb/scripts/build_vocab.js`):
- **Verb**: `he = lemma`
- **Noun**: `he = forms.sg ?? forms.base ?? lemma`
- **Adjective**: `he = forms.m_sg ?? forms.base ?? lemma`
- **Adverb / pronoun / preposition**: `he = lemma`
- **De-dupe** by `he`
- **Skip** entries with missing `he` or `gloss`
- **Sort** by `he.localeCompare(otherHe)`
- **Concepts directory is skipped** (different shape)

**Expected output size**: ~996 entries on first build (matches the current `HebrewHandwritingWeb/data/vocab_words.json` count).

### Later-phase extraction

When L2 (inflection drills) lands, `build.ts` will emit additional tables:

**`packages/content/dist/inflections.json`** (later):
```json
[
  {
    "lemma": "לפתוח",
    "pos": "verb",
    "form": "פתחה",
    "features": { "tense": "past", "person": 3, "number": "sg", "gender": "f" }
  },
  ...
]
```

**`packages/content/dist/concepts.json`** (later):
```json
[
  {
    "key": "accusative_et",
    "label": "Accusative את",
    "description": "...",
    "examples": [...]
  }
]
```

---

## 2. Calibration blob

**Lives in**: browser `localStorage` + Postgres (as a sync mirror)

**Structure**:
```ts
type Calibration = {
  version: 1;
  samples: Record<LetterGlyph, Uint8Array[]>;  // per-letter, each is 4096 bytes
  updated_at: string;  // ISO timestamp (client-set)
};
```

Where `LetterGlyph` is one of the 27 Hebrew classes:
```
א ב ג ד ה ו ז ח ט י ך כ ל ם מ ן נ ס ע ף פ ץ צ ק ר ש ת
```

Each sample is a **64×64 grayscale feature vector plus 3 geometry features, quantized to 8-bit** (Uint8Array of length 4099). Older 4096-dim samples are padded on load for backward compatibility. See `RECOGNIZER.md` for how these are produced.

To prevent unbounded growth and model drift from stale mistakes, per-letter samples are capped at 30; the oldest are dropped as new ones are added.

**Serialization** (over the wire and to localStorage):
- Each `Uint8Array` → base64 string
- JSON body: `{ version: 1, samples: { "א": ["base64...", "base64..."], ... }, updated_at }`
- Typical size: 5 samples × 27 letters × 4096 bytes × base64 overhead ≈ 750 KB
- Max size we should anticipate: 20 samples × 27 letters × 4096 × base64 ≈ 3 MB (still within reasonable Postgres row limits)

**Localstorage key**: `daber_calibration_v1`

**Postgres row** (see schema below) stores the blob as JSONB, keyed by `device_id`.

---

## 3. Progress blob

**Lives in**: browser `localStorage` + Postgres

**Structure** (MVP):
```ts
type Progress = {
  version: 1;
  prefs: {
    mode: 'knn' | 'centroid';
    k: number;
    augment: boolean;
    samples_per_letter: number;
    practice_threshold: number;  // 0..1
    pilot_wizard_done: boolean;
  };
  practice_stats: {
    correct: number;
    total: number;
  };
  vocab_stats: {
    correct_letters: number;
    total_letters: number;
    words_completed: number;
  };
  seen_words: Record<HebrewWord, { count: number; last_seen_at: string }>;
  updated_at: string;
};
```

**Localstorage key**: `daber_progress_v1`

**Size**: tiny (KB range). Fine as JSONB.

**Later additions** (L3 SRS):
- `review_schedule: Record<HebrewWord, { interval_days, ease, due_at }>`
- Migration strategy: bump `version: 2`, client writes new shape, server accepts either. Since it's a blob, no server-side migration needed.

---

## 4. Postgres schema (MVP)

Two tables. Both store opaque blobs keyed by `device_id`.

```prisma
// apps/api/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model DeviceCalibration {
  device_id   String   @id
  payload     Json                        // { version, samples: {letter: [b64]} }
  updated_at  DateTime @default(now()) @updatedAt
  created_at  DateTime @default(now())

  @@map("device_calibration")
}

model DeviceProgress {
  device_id   String   @id
  payload     Json                        // { version, prefs, stats, seen_words }
  updated_at  DateTime @default(now()) @updatedAt
  created_at  DateTime @default(now())

  @@map("device_progress")
}
```

That's it. Two columns each: `device_id` (primary key) and `payload` (JSONB). No foreign keys, no joins, no indexes beyond the primary key.

**Endpoint contract**:

```
GET /api/calibration/:deviceId
  → 200 { version, samples, updated_at }
  → 404 if no row (client treats as empty)

PUT /api/calibration/:deviceId
  body: { version, samples, updated_at }
  → 200 { updated_at }
  → 400 on schema validation failure

GET /api/progress/:deviceId
PUT /api/progress/:deviceId
  (same shape, same semantics)

GET /health
  → 200 { ok: true }
```

**No merge logic, no timestamps-on-server, no conflict resolution.** Last PUT wins. Client's `updated_at` is stored as-is.

**Zod validation on PUT**:
```ts
const CalibrationSchema = z.object({
  version: z.literal(1),
  samples: z.record(z.string(), z.array(z.string())),  // letter → base64[]
  updated_at: z.string().datetime(),
});
```

---

## 5. Later: real content queries in Postgres

When L2 (inflection drills) lands, we'll want the YAML in the DB for queries like "give me 10 random past-tense conjugations I haven't seen". The `hebrew_drills` Prisma schema already has the shape we want (see `reference/hebrew_drills/prisma/schema.prisma`):

- `Lexeme` (id, lemma, language, pos, gloss, features, verb_governance)
- `Inflection` (lexeme_id, form, tense, aspect, person, number, gender, binyan)
- `Example` (lexeme_id, hebrew, hebrew_canon, english)
- `V2Lexeme` (metadata wrapper)
- `GrammarConcept` / `ConceptExample`

We'll port that schema verbatim when needed, and add a `v2-import` script that reads `packages/content/data/v2/*.yaml` and upserts the DB. The YAML remains canonical.

**Not doing this in the MVP** because the MVP frontend only needs the flat `vocab.json`, which is cheaper to generate at build time and ship as a static asset.

## 6. Backups

Heroku Postgres has automatic daily backups on the Hobby tier and above. For the MVP, that's enough. The calibration blob is also continuously mirrored to localStorage, so the worst case is "restore DB from yesterday, re-sync from whatever device has the latest local copy".

No separate backup strategy needed in Phase 0.
