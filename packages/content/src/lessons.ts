import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { ADJ_FORMS, NOUN_FORMS, VERB_FORMS } from './forms.js';
import type { VocabRow } from './schema.js';

const VerbFormSchema = z.enum(VERB_FORMS);
const AdjectiveFormSchema = z.enum(ADJ_FORMS);
const NounFormSchema = z.enum(NOUN_FORMS);

const ScopeSchema = z.object({
  verbs: z.record(z.array(VerbFormSchema).min(1)).default({}).optional(),
  adjectives: z.record(z.array(AdjectiveFormSchema).min(1)).default({}).optional(),
  nouns: z.record(z.array(NounFormSchema).min(1)).default({}).optional(),
}).strict().partial();

const PhaseSchema = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  goal: z.string().optional(),
}).strict();

const BuildPhraseSchema = z.object({
  he: z.string().min(1),
  en: z.string().min(1),
  prompt: z.string().min(1).optional(),
  span: z.enum(['phrase', 'sentence']).optional(),
  alternates: z.array(z.string().min(1)).optional(),
  drillable: z.boolean().optional(),
  pieces: z.array(z.string().min(1)).min(1),
  notes: z.string().min(1).optional(),
}).strict();

const LessonNoteSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    'bound_form',
    'literary_form',
    'grammar_pattern',
    'function_word',
    'teaching_pattern',
    'usage_note',
    'lyric_note',
  ]),
  title: z.string().min(1),
  body: z.string().min(1),
  related_he: z.string().min(1).optional(),
  surface: z.string().min(1).optional(),
  ordinary: z.string().min(1).optional(),
  lyric_he: z.string().min(1).optional(),
  lyric_en: z.string().min(1).optional(),
}).strict();

const AuthoredLessonSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  tagline: z.string().optional(),
  estimated_minutes: z.number().int().positive().optional(),
  endpoint: z.object({
    kind: z.enum(['mission', 'song']).optional(),
    description: z.string().optional(),
  }).strict().partial().optional(),
  core: ScopeSchema.optional(),
  supporting: ScopeSchema.optional(),
  build_phrases: z.array(BuildPhraseSchema).optional(),
  phases: z.array(PhaseSchema).optional(),
  notes: z.array(LessonNoteSchema).optional(),
  wishlist: z.array(z.string()).optional(),
  authoring_principles: z.array(z.string().min(1)).optional(),
}).strict();

export type AuthoredLesson = z.infer<typeof AuthoredLessonSchema>;
export type Lesson = Omit<AuthoredLesson, 'authoring_principles'>;
export type LessonNote = z.infer<typeof LessonNoteSchema>;

function readYaml(filePath: string): unknown {
  const text = fs.readFileSync(filePath, 'utf8');
  return parse(text);
}

function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => {
    const where = issue.path.length ? issue.path.join('.') : '<root>';
    return `${where}: ${issue.message}`;
  }).join('\n');
}

export function parseAuthoredLesson(raw: unknown, filePath = '<lesson>'): AuthoredLesson {
  try {
    return AuthoredLessonSchema.parse(raw);
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new Error(`Lesson parse error in ${filePath}\n${formatZodError(err)}`);
    }
    throw err;
  }
}

export function runtimeLessonFromAuthored(lesson: AuthoredLesson): Lesson {
  const {
    authoring_principles: _authoringPrinciples,
    build_phrases: buildPhrases,
    ...runtime
  } = lesson;

  return {
    ...runtime,
    build_phrases: buildPhrases?.map((phrase) => {
      const { notes: _notes, ...runtimePhrase } = phrase;
      return {
        ...runtimePhrase,
        prompt: runtimePhrase.prompt || runtimePhrase.en,
        span: runtimePhrase.span || 'sentence',
      };
    }),
  };
}

export function collectLessonFiles(dataDirV2: string): string[] {
  const base = path.join(dataDirV2, 'lessons');
  if (!fs.existsSync(base)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    const ents = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && (e.name.endsWith('.yml') || e.name.endsWith('.yaml'))) out.push(p);
    }
  };
  walk(base);
  return out;
}

export function loadLessons(dataDirV2: string): Lesson[] {
  const files = collectLessonFiles(dataDirV2);
  const lessons = files.map((f) => runtimeLessonFromAuthored(parseAuthoredLesson(readYaml(f), f)));
  const seen = new Map<string, string>();
  for (let i = 0; i < lessons.length; i += 1) {
    const lesson = lessons[i];
    const file = files[i];
    const firstFile = seen.get(lesson.id);
    if (firstFile) {
      throw new Error(`Duplicate lesson id "${lesson.id}" in ${file} and ${firstFile}`);
    }
    seen.set(lesson.id, file);
  }
  return lessons;
}

export function validateLessonReferences(lesson: Lesson, vocabRows: VocabRow[]): string[] {
  const available = new Set<string>();
  for (const row of vocabRows) {
    const variant = row.variant || (row.pos === 'verb' ? 'lemma' : undefined);
    if (!row.lemma || !variant) continue;
    available.add(`${row.pos}|${row.lemma}|${variant}`);
  }

  const issues: string[] = [];
  const checkScope = (scopeName: 'core' | 'supporting') => {
    const scope = lesson[scopeName];
    if (!scope) return;
    for (const [lemma, tokens] of Object.entries(scope.verbs || {})) {
      for (const token of tokens) {
        if (!available.has(`verb|${lemma}|${token}`)) {
          issues.push(`${scopeName}.verbs.${lemma}: missing vocab row for ${token}`);
        }
      }
    }
    for (const [lemma, tokens] of Object.entries(scope.adjectives || {})) {
      for (const token of tokens) {
        if (!available.has(`adjective|${lemma}|${token}`)) {
          issues.push(`${scopeName}.adjectives.${lemma}: missing vocab row for ${token}`);
        }
      }
    }
    for (const [lemma, tokens] of Object.entries(scope.nouns || {})) {
      for (const token of tokens) {
        if (!available.has(`noun|${lemma}|${token}`)) {
          issues.push(`${scopeName}.nouns.${lemma}: missing vocab row for ${token}`);
        }
      }
    }
  };

  checkScope('core');
  checkScope('supporting');
  return issues;
}

export function writeLessonsDist(contentRoot: string) {
  const dataDirV2 = path.join(contentRoot, 'data', 'v2');
  const distDir = path.join(contentRoot, 'dist');
  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
  const lessons = loadLessons(dataDirV2);
  const outPath = path.join(distDir, 'lessons.json');
  fs.writeFileSync(outPath, JSON.stringify(lessons, null, 2), 'utf8');
  // eslint-disable-next-line no-console
  console.log(`Wrote lessons → ${path.relative(contentRoot, outPath)} (${lessons.length})`);
}
