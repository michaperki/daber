#!/usr/bin/env node
/**
 * Drill simulation harness for Daber
 *
 * - Uses the same selection logic as apps/web/src/content.ts (ported to Node)
 * - Uses the same progress cell transitions as apps/web/src/storage/mutations.ts
 * - Loads actual built content from packages/content/dist/{vocab,lessons}.json
 *
 * Usage examples:
 *   node scripts/sim_drill.js --n 100 --behavior perfect
 *   node scripts/sim_drill.js --n 50 --behavior reveal --lesson cafe_ordering_1
 *   node scripts/sim_drill.js --n 100 --behavior mixed --seed 42
 *
 * Multiple runs (comma-separated):
 *   node scripts/sim_drill.js --n 20,50,100 --behavior perfect
 */

const fs = require('fs');
const path = require('path');

// ---------- CLI args ----------
function parseArgs(argv) {
  const out = { nList: [100], behavior: 'perfect', lesson: null, seed: null, verbose: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--n' || a === '-n') {
      const v = argv[++i];
      out.nList = String(v).split(',').map((x) => Math.max(1, parseInt(x.trim(), 10) || 0));
    } else if (a === '--behavior' || a === '-b') {
      out.behavior = String(argv[++i]).toLowerCase();
    } else if (a === '--lesson' || a === '-l') {
      out.lesson = String(argv[++i]);
    } else if (a === '--seed' || a === '-s') {
      const v = Number(argv[++i]);
      out.seed = Number.isFinite(v) ? v : null;
    } else if (a === '--verbose' || a === '-v') {
      out.verbose = true;
    } else if (a === '--help' || a === '-h') {
      usage();
      process.exit(0);
    } else {
      console.error(`Unknown arg: ${a}`);
      usage();
      process.exit(1);
    }
  }
  return out;
}

function usage() {
  console.log(`
Drill simulation harness

Required artifacts:
  packages/content/dist/vocab.json
  packages/content/dist/lessons.json

If missing, run: npm -w packages/content run build

Args:
  --n, -n         Number of prompts (e.g., 100 or 20,50,100). Default: 100
  --behavior, -b  perfect | skip | reveal | mixed. Default: perfect
  --lesson, -l    Lesson id for lesson-scoped drill. Omit for free practice.
  --seed, -s      Seed for deterministic RNG (number). Optional.
  --verbose, -v   Print the ordered item sequence.
`);
}

// ---------- Data loading ----------
function readJSON(fp) {
  try {
    const raw = fs.readFileSync(fp, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function loadContent() {
  const vocabPath = path.join(process.cwd(), 'packages', 'content', 'dist', 'vocab.json');
  const lessonsPath = path.join(process.cwd(), 'packages', 'content', 'dist', 'lessons.json');
  const vocab = readJSON(vocabPath);
  const lessons = readJSON(lessonsPath) || [];
  if (!Array.isArray(vocab)) {
    console.error('Missing packages/content/dist/vocab.json. Run: npm -w packages/content run build');
    process.exit(2);
  }
  return { vocab, lessons };
}

// ---------- Progress model (ported) ----------
function nowIso() {
  return new Date().toISOString();
}

function emptyProgress() {
  return {
    version: 1,
    prefs: { sound_enabled: true, haptics_enabled: true },
    practice_stats: { correct: 0, total: 0 },
    vocab_stats: { correct_letters: 0, total_letters: 0, words_completed: 0 },
    seen_words: {},
    cells: {},
    updated_at: nowIso(),
  };
}

function cellKey(pos, lemma, token) {
  return `${pos}:${lemma}:${token}`;
}

function bumpCell(progress, pos, lemma, token, cleanAttempt) {
  if (!pos || !lemma || !token) return;
  const key = cellKey(pos, lemma, token);
  const cells = progress.cells || (progress.cells = {});
  const prev = cells[key] || { state: 'introduced', streak: 0, correct: 0, attempts: 0 };
  const next = { ...prev, attempts: prev.attempts + 1, last_seen_at: nowIso() };
  const clean = !!cleanAttempt;
  if (clean) next.correct = prev.correct + 1;
  if (!clean) {
    if (prev.state === 'mastered') next.state = 'practicing';
    next.streak = 0;
  } else {
    if (prev.state === 'introduced') {
      next.streak = prev.streak + 1;
      if (next.streak >= 3) { next.state = 'practicing'; next.streak = 0; }
    } else if (prev.state === 'practicing') {
      next.streak = prev.streak + 1;
      if (next.streak >= 5) { next.state = 'mastered'; next.streak = 0; }
    } else if (prev.state === 'mastered') {
      next.streak = 0;
    }
  }
  cells[key] = next;
}

// ---------- RNG (seedable) ----------
function mulberry32(a) {
  return function() {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Selector (ported) ----------
function buildMaps(vocab) {
  const vmap = new Map();
  const amap = new Map();
  const nmap = new Map();
  for (const e of vocab) {
    if (e.pos === 'verb') {
      const lemma = e.lemma || (e.variant ? undefined : e.he);
      const token = e.variant || 'lemma';
      if (lemma) vmap.set(`verb:${lemma}:${token}`, e);
    } else if (e.pos === 'adjective') {
      const lemma = e.lemma || (e.variant ? undefined : e.he);
      const token = e.variant || 'm_sg';
      if (lemma && token) amap.set(`adjective:${lemma}:${token}`, e);
    } else if (e.pos === 'noun') {
      const lemma = e.lemma || (e.variant ? undefined : e.he);
      const token = e.variant || 'sg';
      if (lemma && token) nmap.set(`noun:${lemma}:${token}`, e);
    }
  }
  return { vmap, amap, nmap };
}

function deriveScopeFromDataset(vocab) {
  const scoped = { verbs: {}, adjectives: {}, nouns: {} };
  for (const e of vocab) {
    const lemma = e.lemma || (e.variant ? undefined : e.he);
    const token = e.variant || (e.pos === 'verb' ? 'lemma' : e.pos === 'noun' ? 'sg' : 'm_sg');
    if (!lemma || !token) continue;
    if (e.pos === 'verb') {
      if (!scoped.verbs[lemma]) scoped.verbs[lemma] = [];
      if (!scoped.verbs[lemma].includes(token)) scoped.verbs[lemma].push(token);
    } else if (e.pos === 'adjective') {
      if (!scoped.adjectives[lemma]) scoped.adjectives[lemma] = [];
      if (!scoped.adjectives[lemma].includes(token)) scoped.adjectives[lemma].push(token);
    } else if (e.pos === 'noun') {
      if (!scoped.nouns[lemma]) scoped.nouns[lemma] = [];
      if (!scoped.nouns[lemma].includes(token)) scoped.nouns[lemma].push(token);
    }
  }
  return scoped;
}

function scopeFromLesson(lessons, lessonId) {
  const L = lessons.find((l) => l.id === lessonId) || null;
  if (!L) return null;
  const scoped = { verbs: {}, adjectives: {}, nouns: {} };
  const merge = (dst, src) => {
    if (!src) return;
    for (const [lemma, toks] of Object.entries(src)) {
      if (!dst[lemma]) dst[lemma] = [];
      const set = new Set(dst[lemma]);
      for (const t of toks) set.add(t);
      dst[lemma] = Array.from(set);
    }
  };
  merge(scoped.verbs, L.core?.verbs);
  merge(scoped.verbs, L.supporting?.verbs);
  merge(scoped.adjectives, L.core?.adjectives);
  merge(scoped.adjectives, L.supporting?.adjectives);
  merge(scoped.nouns, L.core?.nouns);
  merge(scoped.nouns, L.supporting?.nouns);
  return scoped;
}

function buildItemsFromScope(scope, vmap, amap, nmap) {
  const items = [];
  for (const [lemma, tokens] of Object.entries(scope.verbs || {})) {
    for (const token of tokens) {
      const key = `verb:${lemma}:${token}`;
      const row = vmap.get(key);
      if (!row) continue;
      if (row.he.replace(/\s/g, '').length < 3) continue;
      items.push({ key, row });
    }
  }
  for (const [lemma, tokens] of Object.entries(scope.adjectives || {})) {
    for (const token of tokens) {
      const key = `adjective:${lemma}:${token}`;
      const row = amap.get(key);
      if (!row) continue;
      if (row.he.replace(/\s/g, '').length < 3) continue;
      items.push({ key, row });
    }
  }
  for (const [lemma, tokens] of Object.entries(scope.nouns || {})) {
    for (const token of tokens) {
      const key = `noun:${lemma}:${token}`;
      const row = nmap.get(key);
      if (!row) continue;
      if (row.he.replace(/\s/g, '').length < 3) continue;
      items.push({ key, row });
    }
  }
  return items;
}

function pickWeighted(rng, items) {
  const total = items.reduce((s, x) => s + x.weight, 0);
  if (total <= 0) return items.length ? items[Math.floor(rng() * items.length)].item : null;
  let r = rng() * total;
  for (const { item, weight } of items) {
    r -= weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1]?.item ?? null;
}

function makeSelector(vocab, lessons, lessonId, progress, rng) {
  const { vmap, amap, nmap } = buildMaps(vocab);
  const scoped = lessonId ? (scopeFromLesson(lessons, lessonId) || { verbs: {}, adjectives: {}, nouns: {} }) : deriveScopeFromDataset(vocab);
  const items = buildItemsFromScope(scoped, vmap, amap, nmap);

  const session = { recentLemmas: [], seenCells: new Set(), pickCount: 0, newCells: 0 };
  const stateWeight = (s) => (s === 'mastered' ? 1 : s === 'practicing' ? 3 : 6);
  const recency = (ts) => {
    if (!ts) return 4; // unseen
    const ms = Math.max(0, Date.now() - Date.parse(ts));
    const hours = ms / 3.6e6;
    return 1 + Math.min(3, Math.floor(hours / 12));
  };
  const difficulty = (streak) => 1 + Math.max(0, 3 - (streak || 0));
  const isEasy = (row) => {
    const short = (row.he || '').replace(/\s/g, '').length <= 4;
    if (row.pos === 'noun' || row.pos === 'adjective') return short;
    if (row.pos === 'verb') return short && (!!row.variant && row.variant.startsWith('present_') || row.variant === 'lemma');
    return short;
  };

  function next() {
    if (!items.length) return null;
    const cells = progress.cells || {};
    const last1 = session.recentLemmas[session.recentLemmas.length - 1];
    const last2 = session.recentLemmas[session.recentLemmas.length - 2];
    const wouldViolateDepthCap = (lemma) => last1 === lemma && last2 === lemma;
    const breadthCheck = (lemma) => {
      if (session.pickCount < 9) return true;
      const arr = [...session.recentLemmas.slice(-9), lemma];
      return new Set(arr).size >= 3;
    };
    const distinctSeen = session.seenCells.size;
    const isNewCell = (key) => !cells[key] && !session.seenCells.has(key);

    const applyGuards = ({ key, row }) => {
      const parts = key.split(':');
      const lemma = parts[1] || row.lemma || row.he;
      if (!lemma) return false;
      if (wouldViolateDepthCap(lemma)) return false;
      if (!breadthCheck(lemma)) return false;
      if (session.pickCount < 2 && !isEasy(row)) return false;
      return true;
    };
    const filtered = items.filter(applyGuards);
    const relaxedGuards = ({ key, row }) => {
      const parts = key.split(':');
      const lemma = parts[1] || row.lemma || row.he;
      if (!lemma) return true;
      if (wouldViolateDepthCap(lemma)) return false;
      if (session.pickCount < 2 && !isEasy(row)) return false;
      return true;
    };
    const relaxed = items.filter(relaxedGuards);
    const MIN_POOL = Math.min(15, items.length);
    const source = filtered.length >= MIN_POOL ? filtered : (relaxed.length >= MIN_POOL ? relaxed : items);

    const weightedEntries = source.map(({ key, row }) => {
      const c = cells[key];
      const w = stateWeight(c?.state) * recency(c?.last_seen_at) * difficulty(c?.streak);
      return { key, item: row, weight: w };
    });
    const newBucket = weightedEntries.filter((e) => isNewCell(e.key)).map(({ item, weight }) => ({ item, weight }));
    const oldBucket = weightedEntries.filter((e) => !isNewCell(e.key)).map(({ item, weight }) => ({ item, weight }));
    const pNew = session.pickCount < 20 ? 0.5 : (distinctSeen < 100 ? 0.3 : 0.1);
    const chooseNew = rng() < pNew;
    const picked = chooseNew ? (newBucket.length ? pickWeighted(rng, newBucket) : (oldBucket.length ? pickWeighted(rng, oldBucket) : null))
                             : (oldBucket.length ? pickWeighted(rng, oldBucket) : (newBucket.length ? pickWeighted(rng, newBucket) : null));
    if (!picked) return null;
    // Update session trackers
    const pos = picked.pos;
    const lemma = picked.lemma || (picked.variant ? undefined : picked.he);
    const token = picked.variant || (pos === 'verb' ? 'lemma' : pos === 'noun' ? 'sg' : 'm_sg');
    if (lemma && token) {
      const key = `${pos}:${lemma}:${token}`;
      if (!cells[key] && !session.seenCells.has(key)) session.newCells++;
      session.seenCells.add(key);
      session.recentLemmas.push(lemma);
      if (session.recentLemmas.length > 10) session.recentLemmas.shift();
    }
    session.pickCount++;
    return picked;
  }

  return { next, itemsTotal: items.length };
}

// ---------- Behavior policy ----------
function decideClean(behavior, progress, row) {
  if (behavior === 'perfect') return true;
  if (behavior === 'reveal') return false;
  if (behavior === 'skip') return null; // null = do not bump progress
  // mixed behavior: better on familiar, weaker on new
  const pos = row.pos;
  const lemma = row.lemma || (row.variant ? undefined : row.he);
  const token = row.variant || (pos === 'verb' ? 'lemma' : pos === 'noun' ? 'sg' : 'm_sg');
  if (!lemma || !token) return false;
  const key = `${pos}:${lemma}:${token}`;
  const c = (progress.cells || {})[key];
  const unseen = !c;
  const state = c?.state || 'introduced';
  let pClean = 0.6;
  if (unseen) pClean = 0.3; else if (state === 'introduced') pClean = 0.6; else if (state === 'practicing') pClean = 0.85; else if (state === 'mastered') pClean = 0.95;
  // Slight bias: very short/easy items are easier to be clean
  const short = (row.he || '').replace(/\s/g, '').length <= 4;
  if (short) pClean = Math.min(0.98, pClean + 0.05);
  return Math.random() < pClean;
}

// ---------- Metrics ----------
function analyzeRun(seq, progress, scopeTotal) {
  const itemCounts = new Map();
  const lemmaCounts = new Map();
  const posCounts = new Map();
  const seenCells = new Set();
  const newCellStep = [];
  let newCellsSoFar = 0;
  for (let i = 0; i < seq.length; i++) {
    const it = seq[i];
    const key = it.key;
    const lemma = it.lemma;
    const pos = it.pos;
    itemCounts.set(key, (itemCounts.get(key) || 0) + 1);
    lemmaCounts.set(lemma, (lemmaCounts.get(lemma) || 0) + 1);
    posCounts.set(pos, (posCounts.get(pos) || 0) + 1);
    if (!seenCells.has(key)) { seenCells.add(key); newCellsSoFar++; }
    newCellStep.push(newCellsSoFar);
  }
  // Simple loop/starvation heuristics
  const window = Math.min(10, seq.length);
  let minUniqueLemmas = Infinity;
  for (let i = 0; i + window <= seq.length; i++) {
    const set = new Set();
    for (let j = i; j < i + window; j++) set.add(seq[j].lemma);
    minUniqueLemmas = Math.min(minUniqueLemmas, set.size);
  }
  const stalledAt = (() => {
    const totalPossible = scopeTotal;
    if (totalPossible <= 0) return null;
    // Consider stalled if 15 consecutive picks added no new cells and we have < 75% coverage of scope
    let lastNew = 0;
    for (let i = 0; i < newCellStep.length; i++) if (newCellStep[i] > lastNew) lastNew = i;
    const seenCount = seenCells.size;
    const coverage = seenCount / totalPossible;
    if (seq.length - lastNew >= 15 && coverage < 0.75) return lastNew + 1;
    return null;
  })();

  // Prepare compact summaries
  const topItems = Array.from(itemCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topLemmas = Array.from(lemmaCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);

  return {
    totalDelivered: seq.length,
    distinctLemmas: lemmaCounts.size,
    distinctCells: seenCells.size,
    posDistribution: Object.fromEntries(posCounts.entries()),
    repeatsByItem: Object.fromEntries(topItems),
    repeatsByLemma: Object.fromEntries(topLemmas),
    minUniqueLemmasPer10: Number.isFinite(minUniqueLemmas) ? minUniqueLemmas : seq.length,
    stalledAt,
    coverageOfScope: scopeTotal ? (seenCells.size / scopeTotal) : 0,
    sequence: seq.map((x) => x.key),
  };
}

function runOne({ vocab, lessons }, { n, behavior, lesson, seed, verbose }) {
  // Seed RNG for weighted-choice, but behavior.mixed uses Math.random; make both deterministic if seed provided
  const rng = seed == null ? Math.random : mulberry32(seed >>> 0);
  if (seed != null) {
    // Monkey-patch Math.random to align mixed behavior randomness
    const seeded = mulberry32((seed + 1337) >>> 0);
    Math.random = seeded;
  }

  const progress = emptyProgress();
  const selector = makeSelector(vocab, lessons, lesson, progress, rng);
  const seq = [];
  for (let i = 0; i < n; i++) {
    const row = selector.next();
    if (!row) break;
    const pos = row.pos;
    const lemma = row.lemma || (row.variant ? undefined : row.he);
    const token = row.variant || (pos === 'verb' ? 'lemma' : pos === 'noun' ? 'sg' : 'm_sg');
    const key = lemma && token ? `${pos}:${lemma}:${token}` : `${pos}:${row.he}`;
    seq.push({ key, pos, lemma: lemma || row.he });
    const clean = decideClean(behavior, progress, row);
    if (clean === null) {
      // skip: do not bump
    } else {
      if (lemma && token) bumpCell(progress, pos, lemma, token, !!clean);
    }
  }
  const report = analyzeRun(seq, progress, selector.itemsTotal);
  if (verbose) {
    console.log('Sequence:');
    for (let i = 0; i < report.sequence.length; i++) console.log(`${i+1}. ${report.sequence[i]}`);
  }
  return report;
}

function main() {
  const args = parseArgs(process.argv);
  const content = loadContent();
  const scenarios = [args.behavior];
  for (const n of args.nList) {
    const report = runOne(content, { n, behavior: args.behavior, lesson: args.lesson, seed: args.seed, verbose: args.verbose });
    const scopeLabel = args.lesson ? `lesson:${args.lesson}` : 'free';
    console.log(`\n=== Simulation: n=${n}, behavior=${args.behavior}, scope=${scopeLabel} ===`);
    console.log(`Delivered: ${report.totalDelivered}`);
    console.log(`Distinct lemmas: ${report.distinctLemmas}`);
    console.log(`Distinct cells: ${report.distinctCells} (scope total: ${report.coverageOfScope ? Math.round(report.coverageOfScope*100)+'% coverage' : 'n/a'})`);
    console.log(`POS distribution: ${JSON.stringify(report.posDistribution)}`);
    console.log(`Top repeats (item): ${JSON.stringify(report.repeatsByItem)}`);
    console.log(`Top repeats (lemma): ${JSON.stringify(report.repeatsByLemma)}`);
    console.log(`Min unique lemmas per 10-pick window: ${report.minUniqueLemmasPer10}`);
    console.log(`Loop/stall heuristic: ${report.stalledAt ? `stalled after ~${report.stalledAt} picks` : 'no obvious stall'}`);
  }
}

if (require.main === module) {
  main();
}
