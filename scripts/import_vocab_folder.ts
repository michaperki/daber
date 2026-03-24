import fs from 'node:fs';
import path from 'node:path';

type VocabItem = {
  id: number | string;
  lesson?: string | number | null;
  level?: string | null;
  english_text?: string | null;
  hebrew_text?: string | null;
  subject?: string | null;
  segment?: string | null;
  audio_text?: string | null;
};

type PracticeItem = {
  id: string | number;
  title?: string | null;
  type?: string | null;
  level?: string | null;
  lesson?: number | string | null;
  segment?: string | null;
  question_text?: string | null;
  text_answer?: string | null;
  question_audio_url?: string | null;
  answer_audio_url?: string | null;
  created_at?: string | null;
  last_update?: string | null;
  created_by_user_id?: string | null;
};

type LessonSeed = {
  id: string;
  title: string;
  language: string;
  level: string;
  type: string;
  description?: string;
  items: Array<{
    id: string;
    english_prompt: string;
    target_hebrew: string;
    transliteration?: string | null;
    accepted_variants: string[];
    near_miss_patterns: Array<{ type: string; examples: string[] } | string>;
    tags: string[];
    difficulty: number;
    features?: Record<string, string | null> | null;
  }>;
};

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function readJSON<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

function uniq<T>(arr: T[]): T[] { return Array.from(new Set(arr)); }

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
}

function deriveEmojiFeatures(text: string | null | undefined): Record<string, string | null> {
  const s = text || '';
  const feats: Record<string, string | null> = {};
  if (/👩/.test(s) || /👩‍🦰/.test(s)) feats.gender = feats.gender || 'f';
  if (/🧔/.test(s) || /👨/.test(s)) feats.gender = feats.gender || 'm';
  if (/👨👩/.test(s) || /👩👩/.test(s)) feats.number = 'pl';
  if (/🎤/.test(s)) { feats.mode_icon = 'mic'; feats.mode = 'text-to-voice'; }
  if (/📝/.test(s)) { feats.mode_icon = 'note'; feats.mode = 'voice-to-text'; }
  const emojiOnly = Array.from(s.matchAll(/[\p{Extended_Pictographic}]/gu)).map(m => m[0]);
  if (emojiOnly.length) feats.emoji = uniq(emojiOnly).join('');
  return feats;
}

function extractHebrewAndEnglishFromAnswer(text: string | null | undefined): { he: string | null; en: string | null } {
  if (!text) return { he: null, en: null };
  const t = text.replace(/^\s*The answer is:\s*/i, '');
  let lastHebIdx = -1;
  for (let i = 0; i < t.length; i++) {
    const ch = t.charCodeAt(i);
    if (ch >= 0x0590 && ch <= 0x05FF) lastHebIdx = i;
  }
  if (lastHebIdx >= 0) {
    let firstHebIdx = -1;
    for (let i = 0; i <= lastHebIdx; i++) {
      const ch = t.charCodeAt(i);
      if (ch >= 0x0590 && ch <= 0x05FF) { firstHebIdx = i; break; }
    }
    const he = t.slice(firstHebIdx, lastHebIdx + 1).trim();
    const en = t.slice(lastHebIdx + 1).trim();
    return { he: he || null, en: en || null };
  }
  return { he: null, en: t.trim() || null };
}

function collectVocabFiles(vocabDir: string): string[] {
  return fs.readdirSync(vocabDir)
    .filter(f => f !== 'practice-to-go')
    .map(f => path.join(vocabDir, f))
    .filter(p => fs.statSync(p).isFile());
}

function readPracticeSets(dir: string): PracticeItem[] {
  const files = fs.readdirSync(dir).map(f => path.join(dir, f)).filter(p => fs.statSync(p).isFile());
  const out: PracticeItem[] = [];
  for (const f of files) {
    try {
      const arr = readJSON<PracticeItem[]>(f);
      for (const it of arr) out.push(it);
    } catch {}
  }
  return out;
}

function buildVocabLessons(items: VocabItem[], outDir: string, opts: { onlyLevels?: string[]; lessonPrefix?: string }) {
  const filtered = opts.onlyLevels && opts.onlyLevels.length
    ? items.filter(x => (x.level || '').toLowerCase() && opts.onlyLevels!.includes(String(x.level).toLowerCase()))
    : items;
  if (!filtered.length) return;
  const byLevelLesson = new Map<string, VocabItem[]>();
  for (const it of filtered) {
    const level = (it.level || 'unknown').toString().toLowerCase();
    const lesson = it.lesson == null ? 'unknown' : String(it.lesson);
    const key = `${level}::${lesson}`;
    if (!byLevelLesson.has(key)) byLevelLesson.set(key, []);
    byLevelLesson.get(key)!.push(it);
  }
  for (const [key, arr] of byLevelLesson.entries()) {
    const [level, lesson] = key.split('::');
    const lid = `cc_vocab_${level}_${lesson === 'unknown' ? 'unknown' : 'l' + lesson}`;
    const seed: LessonSeed = {
      id: lid,
      title: `CC Vocab ${level.charAt(0).toUpperCase() + level.slice(1)} — Lesson ${lesson}`,
      language: 'he',
      level,
      type: 'vocab',
      description: 'Citizen Cafe vocabulary; grouped by lesson.',
      items: arr.filter(i => i.english_text && i.hebrew_text).map((i) => {
        const features = {
          source: 'citizencafe',
          kind: 'flashcard',
          level: i.level || null,
          lesson: i.lesson == null ? 'unknown' : String(i.lesson),
          subject: i.subject || null,
          segment: i.segment || null,
          audio: i.audio_text || null,
          ...deriveEmojiFeatures(i.english_text || ''),
        } as Record<string, string | null>;
        return {
          id: `cc_fc_${i.id}`,
          english_prompt: String(i.english_text),
          target_hebrew: String(i.hebrew_text),
          transliteration: null,
          accepted_variants: [],
          near_miss_patterns: [],
          tags: ['vocab', 'cc', `l${lesson}`],
          difficulty: 1,
          features,
        };
      }),
    };
    const file = path.join(outDir, `${lid}.json`);
    fs.writeFileSync(file, JSON.stringify(seed, null, 2));
  }
}

function buildPracticeLessons(items: PracticeItem[], outDir: string, opts: { onlyLevels?: string[]; lessonPrefix?: string }) {
  const filtered = opts.onlyLevels && opts.onlyLevels.length
    ? items.filter(x => (x.level || '').toLowerCase() && opts.onlyLevels!.includes(String(x.level).toLowerCase()))
    : items;
  if (!filtered.length) return;
  const byLesson = new Map<string, PracticeItem[]>();
  for (const it of filtered) {
    const key = it.lesson == null ? 'unknown' : String(it.lesson);
    if (!byLesson.has(key)) byLesson.set(key, []);
    byLesson.get(key)!.push(it);
  }
  for (const [lesson, arr] of byLesson.entries()) {
    const lid = `${opts.lessonPrefix || 'cc_practicetogo'}_${lesson === 'unknown' ? 'unknown' : 'l' + lesson}`;
    const seed: LessonSeed = {
      id: lid,
      title: `CC Practice to Go — Lesson ${lesson}`,
      language: 'he',
      level: (arr[0]?.level || 'green').toString().toLowerCase(),
      type: 'practice',
      description: 'Practice-to-Go items from Citizen Cafe (Green).',
      items: arr.map((q) => {
        const { he: heFromAns, en: enFromAns } = extractHebrewAndEnglishFromAnswer(q.text_answer || '');
        const english_prompt = (q.question_text && q.question_text.trim()) || (enFromAns || q.title || '').toString().trim() || `Practice Item ${q.id}`;
        const target_hebrew = (heFromAns || (q.title || '').replace(/^.*?[📝🎤]?/, '').trim()).toString();
        const features = {
          source: 'citizencafe',
          kind: 'practice',
          type: q.type || null,
          level: q.level || null,
          lesson: q.lesson == null ? 'unknown' : String(q.lesson),
          segment: q.segment || null,
          q_audio: q.question_audio_url || null,
          a_audio: q.answer_audio_url || null,
          ...deriveEmojiFeatures(q.title || q.question_text || ''),
        } as Record<string, string | null>;
        const tags = ['practice', 'cc'];
        if (q.type) tags.push(q.type);
        if (q.segment) tags.push(`seg_${q.segment}`);
        return {
          id: `cc_pg_${q.id}`,
          english_prompt,
          target_hebrew,
          transliteration: null,
          accepted_variants: [],
          near_miss_patterns: [],
          tags,
          difficulty: 2,
          features,
        };
      }),
    };
    const file = path.join(outDir, `${lid}.json`);
    fs.writeFileSync(file, JSON.stringify(seed, null, 2));
  }
}

function main() {
  const args = process.argv.slice(2);
  const vocabDir = args.includes('--vocab-dir') ? args[args.indexOf('--vocab-dir') + 1] : 'vocab';
  const outDir = args.includes('--out-dir') ? args[args.indexOf('--out-dir') + 1] : path.join('Daber', 'data', 'imports');
  const levelsArg = args.includes('--levels') ? args[args.indexOf('--levels') + 1] : 'green';
  const includeVocab = args.includes('--include-vocab') ? args[args.indexOf('--include-vocab') + 1] !== 'false' : true;
  const includePractice = args.includes('--include-practice') ? args[args.indexOf('--include-practice') + 1] !== 'false' : true;
  const onlyLevels = levelsArg.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  ensureDir(outDir);

  if (includePractice) {
    const pDir = path.join(vocabDir, 'practice-to-go');
    if (fs.existsSync(pDir) && fs.statSync(pDir).isDirectory()) {
      const practice = readPracticeSets(pDir);
      buildPracticeLessons(practice, outDir, { onlyLevels, lessonPrefix: 'cc_practicetogo_green' });
      console.log(`Wrote practice lessons from ${practice.length} items (levels: ${onlyLevels.join(',')}).`);
    } else {
      console.log('No practice-to-go directory found; skipping practice.');
    }
  }

  if (includeVocab) {
    const files = collectVocabFiles(vocabDir);
    const all: VocabItem[] = [];
    for (const f of files) {
      try { all.push(...readJSON<VocabItem[]>(f)); } catch {}
    }
    buildVocabLessons(all, outDir, { onlyLevels });
    console.log(`Wrote vocab lessons from ${all.length} items (filtered to levels: ${onlyLevels.join(',')}).`);
  }
}

main();

