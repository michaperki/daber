#!/usr/bin/env node
/*
  Importer: Generates SQL seed using MANUAL curated data, linking to out/* for metadata only.
  - Manual sources: data/manual/lexicon.json, data/manual/sentences.json
  - No inference of lexemes/forms/tokens; only what’s defined manually
  - Links audio and deck info by matching manual sentences to out/flashcards|practice
  Output: db/seed.sql
  No external deps.
*/

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'out');
const DB_DIR = path.join(ROOT, 'db');
const SEED_PATH = path.join(DB_DIR, 'seed.sql');
const MANUAL_DIR = path.join(ROOT, 'data', 'manual');

function readJSONSafe(p) {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error('Failed to parse', p, e.message);
    return null;
  }
}

// Basic escaping for SQL text literals
function sqlLit(v) {
  if (v === null || v === undefined) return 'NULL';
  return `'$${String(v).replace(/\$/g, '$$$$')}$$'`;
}

function containsHebrew(s) {
  return /[\u0590-\u05FF]/.test(s);
}

// For practice matching only
function extractHebrewFromAnswer(textAnswer) {
  if (!textAnswer) return null;
  const idx = textAnswer.indexOf('The answer is:');
  let body = idx >= 0 ? textAnswer.slice(idx + 'The answer is:'.length) : textAnswer;
  body = body.trim();
  const m = body.match(/^([^A-Za-z]*)/);
  if (!m) return null;
  return (m[1] || '').trim() || null;
}

// Deterministic IDs
let nextId = 1;
const idGen = () => nextId++;

// Accumulators
const sentences = []; // {id, external_id, hebrew_text, english_text, difficulty, source}
const audioAssets = [];
const decks = new Map();
const deckItems = [];
const lexemeArr = [];
const lexemeByLemma = new Map();
const sensesArr = [];
const formArr = [];
const formByWritten = new Map();
const sentenceTokens = [];
const lexemeFreq = new Map();

function getOrCreateDeck(name, level = null, description = null, courseOrder = null) {
  if (decks.has(name)) return decks.get(name);
  const deck = { id: idGen(), name, description, level, course_order: courseOrder };
  decks.set(name, deck);
  return deck;
}

function addDeckItem(deckId, itemType, itemId, position) {
  deckItems.push({ id: idGen(), deck_id: deckId, item_type: itemType, item_id: itemId, position });
}

function addSentenceTokenByForm(sentenceId, surfaceText, formWritten, index) {
  const form = formByWritten.get(formWritten);
  if (!form) {
    console.warn('Missing manual form for token', surfaceText, '->', formWritten);
    return;
  }
  const lexemeId = form.lexeme_id;
  sentenceTokens.push({
    id: idGen(),
    sentence_id: sentenceId,
    token_index: index,
    surface_text: surfaceText,
    lexeme_id: lexemeId,
    form_id: form.id,
  });
  lexemeFreq.set(lexemeId, (lexemeFreq.get(lexemeId) || 0) + 1);
}

// Load inputs
const flashNormRaw = readJSONSafe(path.join(OUT_DIR, 'flashcards_normalized.json')) || [];
const practNormRaw = readJSONSafe(path.join(OUT_DIR, 'practice_normalized.json')) || [];
const manualLexicon = readJSONSafe(path.join(MANUAL_DIR, 'lexicon.json'));
const manualSentences = readJSONSafe(path.join(MANUAL_DIR, 'sentences.json'));

if (!manualLexicon || !manualSentences) {
  console.error('Manual data missing. Expected data/manual/lexicon.json and data/manual/sentences.json');
  process.exit(1);
}

// Validate shapes (lightweight validators)
let flashNorm = [];
let practNorm = [];
try {
  const { validateFlashcardNorm, validatePracticeNorm } = require('./contracts');
  for (const it of flashNormRaw) {
    const v = validateFlashcardNorm(it);
    if (v.ok) flashNorm.push(it);
  }
  for (const it of practNormRaw) {
    const v = validatePracticeNorm(it);
    if (v.ok) practNorm.push(it);
  }
} catch (e) {
  flashNorm = flashNormRaw;
  practNorm = practNormRaw;
}

// Index out/* for quick lookup
const flashById = new Map();
const flashByHeb = new Map();
for (const c of flashNorm) {
  flashById.set(String(c.id), c);
  if (c.hebrew) flashByHeb.set(c.hebrew.trim(), c);
}
const practById = new Map();
const practByHeb = new Map();
for (const p of practNorm) {
  practById.set(String(p.id), p);
  const heb = extractHebrewFromAnswer(p.text_answer);
  if (heb) practByHeb.set(heb, p);
}

// Build lexemes + forms from manual
for (const lx of manualLexicon.lexemes || []) {
  const le = {
    id: idGen(),
    language: lx.language || 'he',
    lemma: lx.lemma,
    transliteration: lx.transliteration || null,
    pos: lx.pos || null,
    root: lx.root || null,
    binyan: lx.binyan || null,
    gender: lx.gender || null,
    number: lx.number || null,
    frequency_rank: null,
    register: lx.register || null,
    notes: lx.notes || null,
  };
  lexemeArr.push(le);
  lexemeByLemma.set(le.lemma, le);
  if (Array.isArray(lx.senses)) {
    for (const gloss of lx.senses) {
      sensesArr.push({ id: idGen(), lexeme_id: le.id, gloss, example_hint: null });
    }
  }
  if (Array.isArray(lx.forms)) {
    for (const f of lx.forms) {
      const fr = {
        id: idGen(),
        lexeme_id: le.id,
        written_form: f.written_form,
        niqqud_form: f.niqqud_form || null,
        transliteration: f.transliteration || null,
        tense: f.tense || null,
        person: f.person || null,
        gender: f.gender || null,
        number: f.number || null,
        state: f.state || null,
        is_common: !!f.is_common,
        metadata_json: null,
      };
      formArr.push(fr);
      formByWritten.set(fr.written_form, fr);
    }
  }
}

// Build sentences strictly from manual annotations
for (const s of manualSentences.sentences || []) {
  const id = idGen();
  sentences.push({ id, external_id: s.external_id || null, hebrew_text: s.hebrew_text, english_text: s.english_text || null, difficulty: null, source: s.source || null });
  let pos = 0;
  for (const t of s.tokens || []) {
    addSentenceTokenByForm(id, t.surface_text, t.form_written, pos++);
  }
  // Attach audio and deck if we can match to out/*
  let matched = false;
  if (s.external_id && s.external_id.startsWith('F')) {
    const fid = s.external_id.slice(1);
    const c = flashById.get(fid) || flashByHeb.get(s.hebrew_text);
    if (c) {
      matched = true;
      const hebItem = Array.isArray(c.contents) ? c.contents.find(x => x && x.type === 'Hebrew' && x.audio_url) : null;
      if (hebItem && hebItem.audio_url) {
        audioAssets.push({ id: idGen(), asset_type: 'sentence', asset_id: id, voice: null, dialect: null, url: hebItem.audio_url });
      }
      const deck = getOrCreateDeck(`Flashcards Lesson ${c.lesson}`, null, null, Number(c.lesson) || null);
      addDeckItem(deck.id, 'sentence', id, sentences.length);
    }
  } else if (s.external_id && s.external_id.startsWith('P')) {
    const pid = s.external_id.slice(1);
    const p = practById.get(pid) || practByHeb.get(s.hebrew_text);
    if (p) {
      matched = true;
      if (p.answer_audio_url) {
        audioAssets.push({ id: idGen(), asset_type: 'sentence', asset_id: id, voice: null, dialect: null, url: p.answer_audio_url });
      }
      const deckName = `Practice L${p.lesson} S${p.segment}`;
      const deck = getOrCreateDeck(deckName, p.level || null, p.title || null, Number(p.lesson) || null);
      addDeckItem(deck.id, 'sentence', id, sentences.length);
    }
  }
  if (!matched) {
    const c = flashByHeb.get(s.hebrew_text);
    if (c) {
      matched = true;
      const hebItem = Array.isArray(c.contents) ? c.contents.find(x => x && x.type === 'Hebrew' && x.audio_url) : null;
      if (hebItem && hebItem.audio_url) {
        audioAssets.push({ id: idGen(), asset_type: 'sentence', asset_id: id, voice: null, dialect: null, url: hebItem.audio_url });
      }
      const deck = getOrCreateDeck(`Flashcards Lesson ${c.lesson}`, null, null, Number(c.lesson) || null);
      addDeckItem(deck.id, 'sentence', id, sentences.length);
    }
  }
  if (!matched) {
    const p = practByHeb.get(s.hebrew_text);
    if (p) {
      matched = true;
      if (p.answer_audio_url) {
        audioAssets.push({ id: idGen(), asset_type: 'sentence', asset_id: id, voice: null, dialect: null, url: p.answer_audio_url });
      }
      const deckName = `Practice L${p.lesson} S${p.segment}`;
      const deck = getOrCreateDeck(deckName, p.level || null, p.title || null, Number(p.lesson) || null);
      addDeckItem(deck.id, 'sentence', id, sentences.length);
    }
  }
  if (!matched) {
    const deck = getOrCreateDeck('Manual', null, 'Manually curated sentences', null);
    addDeckItem(deck.id, 'sentence', id, sentences.length);
  }
}

// Frequency ranks from manual token usage
const freqSorted = lexemeArr.map(le => ({ le, count: lexemeFreq.get(le.id) || 0 }))
  .sort((a, b) => b.count - a.count);
freqSorted.forEach((x, i) => { x.le.frequency_rank = i + 1; });

// SQL emit helper
function pushInsert(lines, table, cols, rows) {
  if (!rows.length) return;
  const colList = cols.join(', ');
  for (const r of rows) {
    const values = cols.map(c => {
      const v = r[c];
      if (v === null || v === undefined) return 'NULL';
      if (typeof v === 'number' || typeof v === 'bigint') return String(v);
      if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
      return sqlLit(v);
    }).join(', ');
    lines.push(`INSERT INTO ${table} (${colList}) VALUES (${values});`);
  }
}

// Build SQL
const lines = [];
lines.push('-- Auto-generated by scripts/seed_from_out.js (manual mode)');
lines.push('BEGIN;');

// Demo user
const demoUserId = idGen();
pushInsert(lines, 'users', ['id','email','name','native_language','target_language'], [
  { id: demoUserId, email: 'demo@example.com', name: 'Demo User', native_language: 'en', target_language: 'he' }
]);

// Lexemes with full fields
pushInsert(lines, 'lexemes', ['id','language','lemma','transliteration','pos','root','binyan','gender','number','frequency_rank','register','notes'], lexemeArr);

// Senses
pushInsert(lines, 'senses', ['id','lexeme_id','gloss','example_hint'], sensesArr);

// Forms with full fields
pushInsert(lines, 'forms', ['id','lexeme_id','written_form','niqqud_form','transliteration','tense','person','gender','number','state','is_common','metadata_json'], formArr);

// Sentences
pushInsert(lines, 'sentences', ['id','external_id','hebrew_text','english_text','source'], sentences);

// Sentence tokens
pushInsert(lines, 'sentence_tokens', ['id','sentence_id','token_index','surface_text','lexeme_id','form_id'], sentenceTokens);

// Decks
const deckArr = Array.from(decks.values());
pushInsert(lines, 'decks', ['id','name','description','level','course_order'], deckArr);

// Deck items
pushInsert(lines, 'deck_items', ['id','deck_id','item_type','item_id','position'], deckItems);

// Audio assets
pushInsert(lines, 'audio_assets', ['id','asset_type','asset_id','voice','dialect','url'], audioAssets);

lines.push('COMMIT;');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
fs.writeFileSync(SEED_PATH, lines.join('\n') + '\n');

console.log(`Wrote ${SEED_PATH}`);

