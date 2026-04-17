import fs from 'node:fs';
import path from 'node:path';
import { loadSongLessons, type SongLesson, type TeachableUnit } from './song_lessons.js';
import { loadLessons, type Lesson } from './lessons.js';

// Songs carry annotations (bound_form, literary_form, some grammar_patterns)
// that don't fit the cell drill model. They surface as read-only notes on the
// lesson screens instead.
export type LessonNote = {
  id: string;
  kind: 'bound_form' | 'literary_form' | 'grammar_pattern' | 'function_word' | 'teaching_pattern';
  title: string;
  body: string;
  surface?: string;
  ordinary?: string;
  lyric_he?: string;
  lyric_en?: string;
};

export type SongDerivedLesson = Lesson & {
  source_song_id: string;
  notes?: LessonNote[];
};

const MAX_BUILD_PHRASES = 8;

// Default cell tokens to drill per lemma, chosen to match the shapes present
// in vocab.json and to give the planner enough material for core_exposure (4)
// and core_reinforcement (4) stages without overloading the session.
const CORE_VERB_TOKENS = ['present_m_sg', 'present_f_sg', 'past_1sg', 'past_1pl'];
const SUPPORTING_VERB_TOKENS = ['present_m_sg', 'present_f_sg'];
const CORE_ADJ_TOKENS = ['m_sg', 'f_sg', 'm_pl', 'f_pl'];
const SUPPORTING_ADJ_TOKENS = ['m_sg', 'f_sg'];

function splitIntoPieces(he: string): string[] {
  const parts = he.trim().split(/\s+/).filter(Boolean);
  return parts;
}

function unitIsDrillable(unit: TeachableUnit): boolean {
  if (unit.role === 'annotation') return false;
  return (
    unit.unit_type === 'verb' ||
    unit.unit_type === 'noun' ||
    unit.unit_type === 'adjective_participle'
  );
}

function lemmaForUnit(unit: TeachableUnit): string | null {
  if (unit.unit_type === 'verb') return unit.family.infinitive || unit.base_form;
  if (unit.unit_type === 'noun') return unit.family.singular || unit.base_form;
  if (unit.unit_type === 'adjective_participle') {
    return unit.agreement_family.m_sg || unit.base_form;
  }
  return null;
}

function scopeBucketFor(unit: TeachableUnit): 'verbs' | 'nouns' | 'adjectives' | null {
  if (unit.unit_type === 'verb') return 'verbs';
  if (unit.unit_type === 'noun') return 'nouns';
  if (unit.unit_type === 'adjective_participle') return 'adjectives';
  return null;
}

function tokensForUnit(unit: TeachableUnit, vocabIndex: Map<string, Set<string>>): string[] {
  const lemma = lemmaForUnit(unit);
  const bucket = scopeBucketFor(unit);
  if (!lemma || !bucket) return [];

  const pos = bucket === 'verbs' ? 'verb' : bucket === 'nouns' ? 'noun' : 'adjective';
  const available = vocabIndex.get(`${pos}|${lemma}`) || new Set<string>();

  const isCore = unit.role === 'teaching_target';

  let candidates: string[];
  if (unit.unit_type === 'verb') {
    candidates = isCore ? CORE_VERB_TOKENS : SUPPORTING_VERB_TOKENS;
  } else if (unit.unit_type === 'adjective_participle') {
    candidates = isCore ? CORE_ADJ_TOKENS : SUPPORTING_ADJ_TOKENS;
  } else {
    // noun
    const tokens = ['sg'];
    if (available.has('pl')) tokens.push('pl');
    return tokens;
  }
  return candidates.filter((t) => available.has(t));
}

function noteKindFor(unit: TeachableUnit): LessonNote['kind'] | null {
  if (unit.unit_type === 'bound_form') return 'bound_form';
  if (unit.unit_type === 'literary_form') return 'literary_form';
  if (unit.unit_type === 'grammar_pattern') {
    return unit.role === 'teaching_target' ? 'teaching_pattern' : 'grammar_pattern';
  }
  if (unit.unit_type === 'function_word' && unit.role === 'teaching_target') {
    // Function-word teaching targets have no cell home; surface them as a note
    // alongside their drillable appearances in build_phrases.
    return 'function_word';
  }
  return null;
}

function noteForUnit(unit: TeachableUnit): LessonNote | null {
  const kind = noteKindFor(unit);
  if (!kind) return null;

  const firstUnlock = unit.lyric_unlocks[0];
  const base: LessonNote = {
    id: unit.id,
    kind,
    title: '',
    body: '',
    lyric_he: firstUnlock?.he,
    lyric_en: firstUnlock?.en,
  };

  if (unit.unit_type === 'bound_form') {
    base.title = `${unit.surface_form} (from ${unit.base_form})`;
    base.body = unit.formation;
    base.surface = unit.surface_form;
    base.ordinary = unit.base_form;
  } else if (unit.unit_type === 'literary_form') {
    base.title = `${unit.surface_form} ≈ ${unit.ordinary_equivalent}`;
    base.body = unit.literary_function;
    base.surface = unit.surface_form;
    base.ordinary = unit.ordinary_equivalent;
  } else if (unit.unit_type === 'grammar_pattern') {
    base.title = unit.pattern_name;
    base.body = unit.pattern;
  } else if (unit.unit_type === 'function_word') {
    base.title = `${unit.base_form} — ${unit.function}`;
    base.body = unit.usage_pattern;
    base.surface = unit.base_form;
  }
  return base;
}

export function buildVocabIndex(vocabRows: Array<{ pos: string; lemma?: string; variant?: string }>): Map<string, Set<string>> {
  const idx = new Map<string, Set<string>>();
  for (const row of vocabRows) {
    if (!row.lemma) continue;
    const key = `${row.pos}|${row.lemma}`;
    if (!idx.has(key)) idx.set(key, new Set());
    idx.get(key)!.add(row.variant || 'base');
  }
  return idx;
}

export function songToLesson(
  song: SongLesson,
  vocabIndex: Map<string, Set<string>>,
): SongDerivedLesson {
  const core: NonNullable<Lesson['core']> = { verbs: {}, nouns: {}, adjectives: {} };
  const supporting: NonNullable<Lesson['supporting']> = { verbs: {}, nouns: {}, adjectives: {} };
  const notes: LessonNote[] = [];
  const buildPhrases: NonNullable<Lesson['build_phrases']> = [];
  const seenPhrases = new Set<string>();

  for (const unit of song.teachable_units) {
    // Drillable → add to core/supporting scope.
    if (unitIsDrillable(unit)) {
      const lemma = lemmaForUnit(unit);
      const bucket = scopeBucketFor(unit);
      const tokens = tokensForUnit(unit, vocabIndex);
      if (lemma && bucket && tokens.length > 0) {
        const target = unit.role === 'teaching_target' ? core : supporting;
        if (!target[bucket]) target[bucket] = {};
        (target[bucket] as Record<string, string[]>)[lemma] = tokens;
      }
    }

    // Annotations and function-word teaching targets → notes.
    const note = noteForUnit(unit);
    if (note) notes.push(note);

    // Song phrase handwriting is opt-in: a lyric unlock needs an authored
    // production prompt and must not be marked reveal-only. This keeps bare
    // translations/glosses from becoming unfair production prompts.
    for (const unlock of unit.lyric_unlocks) {
      if (unlock.drillable === false || unlock.span === 'note' || !unlock.prompt) continue;
      if (seenPhrases.has(unlock.he)) continue;
      const pieces = splitIntoPieces(unlock.he);
      if (pieces.length < 2) continue; // schema requires ≥2 pieces
      seenPhrases.add(unlock.he);
      buildPhrases.push({
        he: unlock.he,
        en: unlock.en,
        prompt: unlock.prompt,
        span: unlock.span === 'sentence' ? 'sentence' : 'phrase',
        alternates: unlock.alternates,
        pieces,
      });
    }
  }

  // Prefer phrases tied to teaching_target units first, then cap.
  const targetUnitIds = new Set(
    song.teachable_units.filter((u) => u.role === 'teaching_target').map((u) => u.id),
  );
  const rankedPhrases = buildPhrases
    .map((p, idx) => ({ p, idx, score: 0 }))
    .map((entry) => {
      // Boost phrases that appear in a teaching_target unit's lyric_unlocks.
      const inTarget = song.teachable_units.some(
        (u) => targetUnitIds.has(u.id) && u.lyric_unlocks.some((l) => l.he === entry.p.he),
      );
      entry.score = inTarget ? 2 : 1;
      return entry;
    })
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
    .slice(0, MAX_BUILD_PHRASES)
    .map((entry) => entry.p);

  return {
    id: `song_${song.id}`,
    source_song_id: song.id,
    title: song.title,
    tagline: `Song study: learn the Hebrew behind the lyrics.`,
    core,
    supporting,
    build_phrases: rankedPhrases,
    phases: [
      { id: 'warmup', title: 'Warm-up', goal: 'Core teaching targets from the song.' },
      { id: 'build', title: 'Build', goal: 'Assemble phrases the song uses.' },
      { id: 'review', title: 'Review', goal: 'Mixed review of core forms.' },
    ],
    notes,
  };
}

export function writeSongDerivedLessons(contentRoot: string) {
  const dataDirV2 = path.join(contentRoot, 'data', 'v2');
  const distDir = path.join(contentRoot, 'dist');
  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

  const vocabPath = path.join(distDir, 'vocab.json');
  if (!fs.existsSync(vocabPath)) {
    // eslint-disable-next-line no-console
    console.warn('song_to_lesson: vocab.json not found; skipping song-derived lessons');
    return;
  }
  const vocab = JSON.parse(fs.readFileSync(vocabPath, 'utf8'));
  const vocabIndex = buildVocabIndex(vocab);

  const songs = loadSongLessons(dataDirV2);
  const derived: SongDerivedLesson[] = songs.map((song) => songToLesson(song, vocabIndex));

  // Merge with authored lessons.
  const authored = loadLessons(dataDirV2);
  const combined: Lesson[] = [...authored, ...derived];

  const outPath = path.join(distDir, 'lessons.json');
  fs.writeFileSync(outPath, JSON.stringify(combined, null, 2), 'utf8');
  // eslint-disable-next-line no-console
  console.log(
    `Wrote combined lessons → ${path.relative(contentRoot, outPath)} (${authored.length} authored + ${derived.length} from songs)`,
  );
}
