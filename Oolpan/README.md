
A good Hebrew-learning DB should separate **content** from **user state**.

### Core tables

**users**

* id
* email
* name
* native_language
* target_language
* created_at

**lexemes**
A “dictionary entry,” not a flashcard.

* id
* language
* lemma
* transliteration
* pos (`verb`, `noun`, `adjective`, `particle`, etc.)
* root
* binyan
* gender
* number
* frequency_rank
* register
* notes

**senses**
For words with multiple meanings.

* id
* lexeme_id
* gloss
* example_hint

**forms**
Every inflected surface form.

* id
* lexeme_id
* written_form
* ניקוד_form
* transliteration
* tense
* person
* gender
* number
* state
* is_common
* metadata_json

For Hebrew this table matters a lot, since one lexeme can explode into many real forms.

**sentences**

* id
* hebrew_text
* hebrew_text_niqqud
* transliteration
* english_text
* difficulty
* source
* audio_url

**sentence_tokens**
Maps words inside a sentence to lexemes/forms.

* id
* sentence_id
* token_index
* surface_text
* lexeme_id
* form_id
* role_hint

### Learning content

**decks**

* id
* name
* description
* level
* course_order

**deck_items**
Can point to a lexeme, form, or sentence.

* id
* deck_id
* item_type (`lexeme`, `form`, `sentence`, `rule`)
* item_id
* position

**grammar_rules**

* id
* title
* category
* explanation
* examples_json

### User progress

**user_lexemes**
Tracks whether the user has seen / learned a word.

* id
* user_id
* lexeme_id
* status (`new`, `learning`, `known`, `suspended`)
* familiarity_score
* first_seen_at
* last_seen_at

**reviews**
Every flashcard/drill event.

* id
* user_id
* item_type
* item_id
* review_type (`recognition`, `production`, `listening`, `typing`)
* prompt
* response
* correct
* latency_ms
* grade
* created_at

**srs_state**
One row per user per learnable item.

* id
* user_id
* item_type
* item_id
* due_at
* stability
* difficulty
* reps
* lapses
* state

### Personalized generation

**lesson_sessions**

* id
* user_id
* mode (`flashcards`, `conversation`, `conjugation`, `listening`)
* started_at
* ended_at

**session_items**

* id
* session_id
* item_type
* item_id
* prompt_data_json
* result_data_json

**user_known_forms**
Useful if you want generated sentence practice based on what the user actually knows.

* id
* user_id
* form_id
* confidence

### Media

**audio_assets**

* id
* asset_type (`lexeme`, `form`, `sentence`)
* asset_id
* voice
* dialect
* url

### What I would optimize for

For a Hebrew app specifically, I’d make sure the schema handles:

* **lexeme vs form distinction**
* **roots and binyanim**
* **niqqud and unpointed text**
* **sentence-level practice**
* **user-linked vocab and SRS**

### Minimal MVP version

If you want the leanest useful schema:

* users
* lexemes
* forms
* sentences
* sentence_tokens
* reviews
* srs_state
* user_lexemes

That gets you:

* vocab cards
* conjugation cards
* sentence drills
* personalized review

### My preferred design principle

Do **not** make “flashcards” the core entity.
Make **language objects** the core entity, and let flashcards be one of many views over them.

That makes it much easier later to support:

* conversation drills
* grammar lessons
* listening mode
* writing correction
* generated examples

I can sketch the actual Postgres schema next.
