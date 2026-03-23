-- Postgres schema for Hebrew-learning DB (MVP-oriented but extensible)

-- Users
CREATE TABLE IF NOT EXISTS users (
  id            BIGINT PRIMARY KEY,
  email         TEXT UNIQUE,
  name          TEXT,
  native_language TEXT,
  target_language TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Lexical layer
CREATE TABLE IF NOT EXISTS lexemes (
  id              BIGINT PRIMARY KEY,
  language        TEXT NOT NULL,
  lemma           TEXT NOT NULL,
  transliteration TEXT,
  pos             TEXT,
  root            TEXT,
  binyan          TEXT,
  gender          TEXT,
  number          TEXT,
  frequency_rank  INTEGER,
  register        TEXT,
  notes           TEXT
);
CREATE INDEX IF NOT EXISTS idx_lexemes_lemma ON lexemes(lemma);

CREATE TABLE IF NOT EXISTS senses (
  id         BIGINT PRIMARY KEY,
  lexeme_id  BIGINT NOT NULL REFERENCES lexemes(id) ON DELETE CASCADE,
  gloss      TEXT,
  example_hint TEXT
);

CREATE TABLE IF NOT EXISTS forms (
  id              BIGINT PRIMARY KEY,
  lexeme_id       BIGINT NOT NULL REFERENCES lexemes(id) ON DELETE CASCADE,
  written_form    TEXT NOT NULL,
  niqqud_form     TEXT,
  transliteration TEXT,
  tense           TEXT,
  person          TEXT,
  gender          TEXT,
  number          TEXT,
  state           TEXT,
  is_common       BOOLEAN,
  metadata_json   JSONB
);
CREATE INDEX IF NOT EXISTS idx_forms_written_form ON forms(written_form);

-- Sentences and token mapping
CREATE TABLE IF NOT EXISTS sentences (
  id                 BIGINT PRIMARY KEY,
  external_id        TEXT UNIQUE,
  hebrew_text        TEXT NOT NULL,
  hebrew_text_niqqud TEXT,
  transliteration    TEXT,
  english_text       TEXT,
  difficulty         INTEGER,
  source             TEXT,
  audio_url          TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sentence_tokens (
  id           BIGINT PRIMARY KEY,
  sentence_id  BIGINT NOT NULL REFERENCES sentences(id) ON DELETE CASCADE,
  token_index  INTEGER NOT NULL,
  surface_text TEXT NOT NULL,
  lexeme_id    BIGINT REFERENCES lexemes(id),
  form_id      BIGINT REFERENCES forms(id),
  role_hint    TEXT
);
CREATE INDEX IF NOT EXISTS idx_sentence_tokens_sentence_id ON sentence_tokens(sentence_id);

-- Content organization
CREATE TABLE IF NOT EXISTS decks (
  id           BIGINT PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  description  TEXT,
  level        TEXT,
  course_order INTEGER
);

CREATE TABLE IF NOT EXISTS deck_items (
  id         BIGINT PRIMARY KEY,
  deck_id    BIGINT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  item_type  TEXT NOT NULL CHECK (item_type IN ('lexeme','form','sentence','rule')),
  item_id    BIGINT NOT NULL,
  position   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_deck_items_deck ON deck_items(deck_id);

CREATE TABLE IF NOT EXISTS grammar_rules (
  id            BIGINT PRIMARY KEY,
  title         TEXT,
  category      TEXT,
  explanation   TEXT,
  examples_json JSONB
);

-- User progress
CREATE TABLE IF NOT EXISTS user_lexemes (
  id               BIGINT PRIMARY KEY,
  user_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lexeme_id        BIGINT NOT NULL REFERENCES lexemes(id) ON DELETE CASCADE,
  status           TEXT CHECK (status IN ('new','learning','known','suspended')),
  familiarity_score NUMERIC DEFAULT 0,
  first_seen_at    TIMESTAMPTZ,
  last_seen_at     TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_lexeme ON user_lexemes(user_id, lexeme_id);

CREATE TABLE IF NOT EXISTS reviews (
  id           BIGINT PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type    TEXT NOT NULL CHECK (item_type IN ('lexeme','form','sentence','rule')),
  item_id      BIGINT NOT NULL,
  review_type  TEXT CHECK (review_type IN ('recognition','production','listening','typing')),
  prompt       TEXT,
  response     TEXT,
  correct      BOOLEAN,
  latency_ms   INTEGER,
  grade        INTEGER,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);

CREATE TABLE IF NOT EXISTS srs_state (
  id         BIGINT PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type  TEXT NOT NULL CHECK (item_type IN ('lexeme','form','sentence','rule')),
  item_id    BIGINT NOT NULL,
  due_at     TIMESTAMPTZ,
  stability  NUMERIC,
  difficulty NUMERIC,
  reps       INTEGER,
  lapses     INTEGER,
  state      TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_srs ON srs_state(user_id, item_type, item_id);

-- Sessions + media
CREATE TABLE IF NOT EXISTS lesson_sessions (
  id         BIGINT PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode       TEXT CHECK (mode IN ('flashcards','conversation','conjugation','listening')),
  started_at TIMESTAMPTZ,
  ended_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS session_items (
  id                BIGINT PRIMARY KEY,
  session_id        BIGINT NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
  item_type         TEXT NOT NULL CHECK (item_type IN ('lexeme','form','sentence','rule')),
  item_id           BIGINT NOT NULL,
  prompt_data_json  JSONB,
  result_data_json  JSONB
);

CREATE TABLE IF NOT EXISTS user_known_forms (
  id         BIGINT PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  form_id    BIGINT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  confidence NUMERIC
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_form ON user_known_forms(user_id, form_id);

CREATE TABLE IF NOT EXISTS audio_assets (
  id         BIGINT PRIMARY KEY,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('lexeme','form','sentence')),
  asset_id   BIGINT NOT NULL,
  voice      TEXT,
  dialect    TEXT,
  url        TEXT NOT NULL,
  UNIQUE(asset_type, asset_id, url)
);

