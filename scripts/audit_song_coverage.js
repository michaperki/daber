#!/usr/bin/env node
/**
 * Song lesson lemma coverage audit.
 *
 * Walks a song's teachable units, determines which of them need a drillable
 * cell (teaching_target + vocabulary roles, drillable unit types), and reports
 * which lemmas are present/missing in packages/content/dist/vocab.json.
 *
 * Grammar patterns, bound forms, and literary forms are treated as annotations
 * and are NOT expected to have drill cells.
 *
 * Usage:
 *   node scripts/audit_song_coverage.js --song hofim
 *   node scripts/audit_song_coverage.js --song hofim --json
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const vocabPath = path.join(repoRoot, 'packages/content/dist/vocab.json');
const songsPath = path.join(repoRoot, 'packages/content/dist/song_lessons.json');

function parseArgs(argv) {
  const out = { song: null, format: 'summary' };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--song') out.song = argv[++i];
    else if (a === '--json') out.format = 'json';
    else if (a === '--summary') out.format = 'summary';
    else if (a === '--help' || a === '-h') {
      console.log('node scripts/audit_song_coverage.js --song <id> [--json]');
      process.exit(0);
    }
  }
  return out;
}

// Units that must have a drillable cell in vocab.json when role is
// teaching_target or vocabulary.
const DRILLABLE_TYPES = new Set([
  'verb',
  'noun',
  'adjective_participle',
  'function_word',
]);

// Unit type -> expected pos in vocab.json.
// function_word is special: it can land in adverbs, prepositions, pronouns,
// or even as a standalone row with no pos-specific shape. We accept any match.
const UNIT_TYPE_TO_POS = {
  verb: 'verb',
  noun: 'noun',
  adjective_participle: 'adjective',
  function_word: null, // any
};

function expectedLemma(unit) {
  if (unit.unit_type === 'verb') return unit.family?.infinitive || unit.base_form;
  if (unit.unit_type === 'noun') return unit.family?.singular || unit.base_form;
  if (unit.unit_type === 'adjective_participle') {
    return unit.agreement_family?.m_sg || unit.base_form;
  }
  return unit.base_form;
}

function indexVocab(rows) {
  const byLemmaPos = new Map(); // key: `${pos}|${lemma}` -> variants[]
  const byHe = new Map(); // he -> rows[]
  for (const r of rows) {
    if (r.lemma) {
      const k = `${r.pos}|${r.lemma}`;
      if (!byLemmaPos.has(k)) byLemmaPos.set(k, []);
      byLemmaPos.get(k).push(r);
    }
    if (!byHe.has(r.he)) byHe.set(r.he, []);
    byHe.get(r.he).push(r);
  }
  return { byLemmaPos, byHe };
}

function checkUnit(unit, idx) {
  if (unit.role === 'annotation') {
    return { status: 'annotation_ignored' };
  }
  if (!DRILLABLE_TYPES.has(unit.unit_type)) {
    return { status: 'non_drillable_ignored' };
  }

  const lemma = expectedLemma(unit);
  const expectedPos = UNIT_TYPE_TO_POS[unit.unit_type];

  if (expectedPos) {
    const key = `${expectedPos}|${lemma}`;
    const rows = idx.byLemmaPos.get(key);
    if (rows && rows.length > 0) {
      return {
        status: 'present',
        lemma,
        pos: expectedPos,
        variants: rows.map((r) => r.variant || 'base'),
      };
    }
    return { status: 'missing', lemma, pos: expectedPos };
  }

  // function_word: accept any matching he
  const rows = idx.byHe.get(lemma);
  if (rows && rows.length > 0) {
    return {
      status: 'present',
      lemma,
      pos: rows[0].pos,
      variants: rows.map((r) => r.variant || 'base'),
    };
  }
  return { status: 'missing', lemma, pos: 'any' };
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.song) {
    console.error('error: --song <id> is required');
    process.exit(2);
  }
  if (!fs.existsSync(vocabPath)) {
    console.error(`error: ${vocabPath} not found. Run: npm -w packages/content run build`);
    process.exit(2);
  }
  if (!fs.existsSync(songsPath)) {
    console.error(`error: ${songsPath} not found. Run: npm -w packages/content run build`);
    process.exit(2);
  }

  const vocab = JSON.parse(fs.readFileSync(vocabPath, 'utf8'));
  const songs = JSON.parse(fs.readFileSync(songsPath, 'utf8'));
  const song = songs.find((s) => s.id === args.song);
  if (!song) {
    console.error(`error: song "${args.song}" not found. Available: ${songs.map((s) => s.id).join(', ')}`);
    process.exit(2);
  }

  const idx = indexVocab(vocab);
  const report = { songId: song.id, title: song.title, units: [] };

  for (const unit of song.teachable_units) {
    const check = checkUnit(unit, idx);
    report.units.push({
      id: unit.id,
      unit_type: unit.unit_type,
      role: unit.role,
      priority: unit.priority,
      base_form: unit.base_form,
      ...check,
    });
  }

  const drillable = report.units.filter(
    (u) => u.status === 'present' || u.status === 'missing'
  );
  const present = drillable.filter((u) => u.status === 'present');
  const missing = drillable.filter((u) => u.status === 'missing');
  const ignored = report.units.filter(
    (u) => u.status === 'annotation_ignored' || u.status === 'non_drillable_ignored'
  );

  const summary = {
    total_units: report.units.length,
    drillable_expected: drillable.length,
    present: present.length,
    missing: missing.length,
    annotations_ignored: ignored.length,
  };

  if (args.format === 'json') {
    console.log(JSON.stringify({ ...report, summary }, null, 2));
    return;
  }

  console.log(`Song: ${song.title} (${song.id})`);
  console.log('');
  console.log('Coverage summary:');
  console.log(`  Total teachable units:      ${summary.total_units}`);
  console.log(`  Drillable (expected cells): ${summary.drillable_expected}`);
  console.log(`  Present in vocab.json:      ${summary.present}`);
  console.log(`  Missing from vocab.json:    ${summary.missing}`);
  console.log(`  Annotations (ignored):      ${summary.annotations_ignored}`);
  console.log('');

  if (missing.length > 0) {
    console.log('MISSING lemmas (need authoring):');
    for (const u of missing) {
      console.log(
        `  - ${u.id.padEnd(32)} ${u.unit_type.padEnd(22)} ${u.role.padEnd(16)} pos=${u.pos} lemma="${u.lemma}"`
      );
    }
    console.log('');
  }

  if (present.length > 0) {
    console.log('PRESENT (lemma already in vocab.json):');
    for (const u of present) {
      const variants = u.variants.slice(0, 6).join(',');
      const more = u.variants.length > 6 ? `,+${u.variants.length - 6}` : '';
      console.log(
        `  - ${u.id.padEnd(32)} ${u.unit_type.padEnd(22)} lemma="${u.lemma}" variants=[${variants}${more}]`
      );
    }
    console.log('');
  }

  console.log('Annotation-only units (no cell expected):');
  for (const u of ignored) {
    console.log(
      `  - ${u.id.padEnd(32)} ${u.unit_type.padEnd(22)} ${u.role}`
    );
  }
}

main();
