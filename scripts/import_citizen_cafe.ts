import fs from 'node:fs';
import path from 'node:path';

type Flashcard = { id: string; lesson: string | number | null; english: string | null; hebrew: string | null };
type Practice = {
  id: string;
  title?: string | null;
  type?: string | null; // 'voice-to-text' | 'text-to-voice' | string
  level?: string | null;
  lesson?: number | string | null;
  segment?: string | null;
  question_text?: string | null;
  text_answer?: string | null;
  question_audio_url?: string | null;
  answer_audio_url?: string | null;
  created_at?: string | null;
  last_update?: string | null;
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
    near_miss_patterns: Array<{ type: string; examples: string[] }> | any[];
    tags: string[];
    difficulty: number;
    features?: Record<string, string | null>;
  }>;
};

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function readJSON<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function deriveEmojiFeatures(text: string | null | undefined): Record<string, string | null> {
  const s = text || '';
  const feats: Record<string, string | null> = {};
  const hasF = /\p{Emoji}(?:\u200D\p{Emoji})*/u.test('👩') ? /👩/.test(s) || /👩🏻/.test(s) || /👩‍🦰/.test(s) : /👩/.test(s);
  const hasM = /🧔/.test(s) || /👨/.test(s);
  const hasPl = /👨👩/.test(s) || /👩👩/.test(s);
  if (hasF) feats.gender = 'f';
  if (hasM) feats.gender = feats.gender ? feats.gender : 'm';
  if (hasPl) feats.number = 'pl';
  if (/🎤/.test(s)) { feats.mode_icon = 'mic'; feats.mode = 'text-to-voice'; }
  if (/📝/.test(s)) { feats.mode_icon = 'note'; feats.mode = 'voice-to-text'; }
  const emojiOnly = Array.from(s.matchAll(/[\p{Extended_Pictographic}]/gu)).map(m => m[0]);
  if (emojiOnly.length) feats.emoji = uniq(emojiOnly).join('');
  return feats;
}

function extractHebrewAndEnglishFromAnswer(text: string | null | undefined): { he: string | null; en: string | null } {
  if (!text) return { he: null, en: null };
  const t = text.replace(/^\s*The answer is:\s*/i, '');
  // Find last index of a Hebrew character
  let lastHebIdx = -1;
  for (let i = 0; i < t.length; i++) {
    const ch = t.charCodeAt(i);
    if (ch >= 0x0590 && ch <= 0x05FF) lastHebIdx = i;
  }
  if (lastHebIdx >= 0) {
    // Extract the contiguous Hebrew segment(s)
    // Find first Hebrew index
    let firstHebIdx = -1;
    for (let i = 0; i <= lastHebIdx; i++) {
      const ch = t.charCodeAt(i);
      if (ch >= 0x0590 && ch <= 0x05FF) { firstHebIdx = i; break; }
    }
    const he = t.slice(firstHebIdx, lastHebIdx + 1).trim();
    const en = t.slice(lastHebIdx + 1).trim();
    return { he: he || null, en: en || null };
  }
  // No Hebrew found; treat entire as English
  return { he: null, en: t.trim() || null };
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48);
}

function buildFlashcardLessons(flashcards: Flashcard[], outDir: string) {
  const byLesson = new Map<string, Flashcard[]>();
  for (const fc of flashcards) {
    if (!fc.english || !fc.hebrew) continue;
    const key = fc.lesson == null ? 'unknown' : String(fc.lesson);
    if (!byLesson.has(key)) byLesson.set(key, []);
    byLesson.get(key)!.push(fc);
  }
  for (const [lesson, items] of byLesson.entries()) {
    const lessonId = lesson === 'unknown' ? 'cc_flashcards_unknown' : `cc_flashcards_l${lesson}`;
    const seed: LessonSeed = {
      id: lessonId,
      title: lesson === 'unknown' ? 'CC Flashcards — Unknown Lesson' : `CC Flashcards — Lesson ${lesson}`,
      language: 'he',
      level: 'green',
      type: 'vocab',
      description: 'Flashcards scraped from Citizen Cafe; emojis preserved.',
      items: items.map((c) => {
        const features = {
          source: 'citizencafe',
          kind: 'flashcard',
          lesson: c.lesson == null ? 'unknown' : String(c.lesson),
          ...deriveEmojiFeatures(c.english || ''),
        } as Record<string, string | null>;
        return {
          id: `cc_fc_${c.id}`,
          english_prompt: c.english!,
          target_hebrew: c.hebrew!,
          transliteration: null,
          accepted_variants: [],
          near_miss_patterns: [],
          tags: ['vocab', 'cc', `l${lesson}`],
          difficulty: 1,
          features,
        };
      }),
    };
    const file = path.join(outDir, `${lessonId}.json`);
    fs.writeFileSync(file, JSON.stringify(seed, null, 2));
  }
}

function buildPracticeLessons(practice: Practice[], outDir: string) {
  if (!practice.length) return;
  const byLesson = new Map<string, Practice[]>();
  for (const p of practice) {
    const key = p.lesson == null ? 'unknown' : String(p.lesson);
    if (!byLesson.has(key)) byLesson.set(key, []);
    byLesson.get(key)!.push(p);
  }
  for (const [lesson, items] of byLesson.entries()) {
    const lessonId = lesson === 'unknown' ? 'cc_practicetogo_unknown' : `cc_practicetogo_l${lesson}`;
    const seed: LessonSeed = {
      id: lessonId,
      title: lesson === 'unknown' ? 'CC Practice to Go — Unknown Lesson' : `CC Practice to Go — Lesson ${lesson}`,
      language: 'he',
      level: (items[0]?.level || 'green').toLowerCase(),
      type: 'practice',
      description: 'Practice-to-Go items scraped from Citizen Cafe; emojis preserved.',
      items: items.map((q) => {
        const { he: heFromAns, en: enFromAns } = extractHebrewAndEnglishFromAnswer(q.text_answer || '');
        const english_prompt = (q.question_text && q.question_text.trim()) || (enFromAns || q.title || '').toString().trim() || `Practice Item ${q.id}`;
        const target_hebrew = (heFromAns || (q.title || '').replace(/^.*?[📝🎤]?/, '').trim()).toString();
        const f = {
          source: 'citizencafe',
          kind: 'practice',
          type: q.type || null,
          level: q.level || null,
          lesson: q.lesson == null ? 'unknown' : String(q.lesson),
          segment: q.segment || null,
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
          features: f,
        };
      }),
    };
    const file = path.join(outDir, `${lessonId}.json`);
    fs.writeFileSync(file, JSON.stringify(seed, null, 2));
  }
}

function main() {
  const args = process.argv.slice(2);
  const inDir = args.includes('--in-dir') ? args[args.indexOf('--in-dir') + 1] : path.join('scraper', 'out');
  const outDir = args.includes('--out-dir') ? args[args.indexOf('--out-dir') + 1] : path.join('Daber', 'data', 'imports');
  ensureDir(outDir);

  const flashPath = path.join(inDir, 'flashcards_normalized.json');
  const practicePath = path.join(inDir, 'practice_normalized.json');

  if (fs.existsSync(flashPath)) {
    const flash = readJSON<Flashcard[]>(flashPath);
    const ok = flash.filter(f => f.english && f.hebrew);
    buildFlashcardLessons(ok, outDir);
    // eslint-disable-next-line no-console
    console.log(`Wrote flashcard lessons from ${ok.length} items.`);
  } else {
    // eslint-disable-next-line no-console
    console.log('No flashcards_normalized.json found; skipping flashcards.');
  }

  if (fs.existsSync(practicePath)) {
    const prac = readJSON<Practice[]>(practicePath);
    buildPracticeLessons(prac, outDir);
    // eslint-disable-next-line no-console
    console.log(`Wrote practice lessons from ${prac.length} items.`);
  } else {
    // eslint-disable-next-line no-console
    console.log('No practice_normalized.json found; skipping practice.');
  }
}

main();

