import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

const PrioritySchema = z.enum(['core', 'supporting', 'advanced']);
const RoleSchema = z.enum(['teaching_target', 'vocabulary', 'annotation']);

const ExampleSchema = z.object({
  he: z.string().min(1),
  en: z.string().min(1),
}).strict();

const LyricUnlockSchema = z.object({
  he: z.string().min(1),
  en: z.string().min(1),
  prompt: z.string().min(1).optional(),
  span: z.enum(['phrase', 'sentence', 'note']).optional(),
  drillable: z.boolean().optional(),
  alternates: z.array(z.string().min(1)).optional(),
  note: z.string().min(1).optional(),
}).strict();

// `priority` measures linguistic complexity; `role` controls learner-facing
// treatment: teaching_target earns a study screen with drills, vocabulary is
// recognition-only, annotation is a lyric-side callout (bound/literary forms,
// advanced patterns). These axes are orthogonal and must both be authored.
const commonFields = {
  id: z.string().min(1),
  priority: PrioritySchema,
  role: RoleSchema.default('teaching_target'),
  prerequisites: z.array(z.string().min(1)).default([]),
  lyric_unlocks: z.array(LyricUnlockSchema).min(1),
};

const VerbUnitSchema = z.object({
  ...commonFields,
  unit_type: z.literal('verb'),
  base_form: z.string().min(1),
  family: z.object({
    infinitive: z.string().min(1),
    present: z.array(z.string().min(1)).min(1).optional(),
    past: z.array(z.string().min(1)).min(1).optional(),
    noun_forms: z.array(z.string().min(1)).min(1).optional(),
    adjective_bridge: z.array(z.string().min(1)).min(1).optional(),
  }).strict(),
  normal_usage: z.array(ExampleSchema).min(1),
  flexibility_forms: z.array(z.string().min(1)).min(1),
  grammar_pattern: z.string().min(1),
  governance: z.object({
    marker: z.string().min(1),
    frame_he: z.string().min(1),
  }).strict().optional(),
}).strict();

const NounUnitSchema = z.object({
  ...commonFields,
  unit_type: z.literal('noun'),
  base_form: z.string().min(1),
  family: z.object({
    singular: z.string().min(1).optional(),
    definite: z.string().min(1).optional(),
    plural: z.string().min(1).optional(),
    directional_or_prefixed: z.array(z.string().min(1)).min(1).optional(),
    construct: z.array(z.string().min(1)).min(1).optional(),
    possessive: z.array(z.string().min(1)).min(1).optional(),
  }).strict(),
  normal_usage: z.array(ExampleSchema).min(1),
  flexibility_forms: z.array(z.string().min(1)).min(1),
  grammar_pattern: z.string().min(1),
  gender: z.enum(['m', 'f', 'plural', 'unknown']).optional(),
}).strict();

const AdjectiveParticipleUnitSchema = z.object({
  ...commonFields,
  unit_type: z.literal('adjective_participle'),
  base_form: z.string().min(1),
  linked_verb: z.string().min(1).optional(),
  agreement_family: z.object({
    m_sg: z.string().min(1),
    f_sg: z.string().min(1),
    m_pl: z.string().min(1),
    f_pl: z.string().min(1),
  }).strict(),
  normal_usage: z.array(ExampleSchema).min(1),
  flexibility_forms: z.array(z.string().min(1)).min(1),
  grammar_pattern: z.string().min(1),
}).strict();

const FunctionWordUnitSchema = z.object({
  ...commonFields,
  unit_type: z.literal('function_word'),
  base_form: z.string().min(1),
  function: z.string().min(1),
  usage_pattern: z.string().min(1),
  normal_usage: z.array(ExampleSchema).min(1),
  flexibility_forms: z.array(z.string().min(1)).min(1),
}).strict();

const GrammarPatternUnitSchema = z.object({
  ...commonFields,
  unit_type: z.literal('grammar_pattern'),
  pattern_name: z.string().min(1),
  pattern: z.string().min(1),
  building_blocks: z.array(z.string().min(1)).min(1),
  normal_usage: z.array(ExampleSchema).min(1),
  flexible_slots: z.array(z.string().min(1)).min(1),
}).strict();

const BoundFormUnitSchema = z.object({
  ...commonFields,
  unit_type: z.literal('bound_form'),
  surface_form: z.string().min(1),
  base_form: z.string().min(1),
  formation: z.string().min(1),
  family: z.array(z.string().min(1)).min(1),
  normal_usage: z.array(ExampleSchema).min(1),
  flexibility_forms: z.array(z.string().min(1)).min(1),
  grammar_pattern: z.string().min(1),
}).strict();

const LiteraryFormUnitSchema = z.object({
  ...commonFields,
  unit_type: z.literal('literary_form'),
  surface_form: z.string().min(1),
  ordinary_equivalent: z.string().min(1),
  literary_function: z.string().min(1),
  recognition_family: z.array(z.string().min(1)).min(1),
  ordinary_usage: z.array(ExampleSchema).min(1),
}).strict();

const TeachableUnitSchema = z.discriminatedUnion('unit_type', [
  VerbUnitSchema,
  NounUnitSchema,
  AdjectiveParticipleUnitSchema,
  FunctionWordUnitSchema,
  GrammarPatternUnitSchema,
  BoundFormUnitSchema,
  LiteraryFormUnitSchema,
]);

const SongLessonSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(['draft', 'ready']).default('draft'),
  source: z.object({
    file: z.string().min(1).optional(),
    normalized_hebrew_note: z.string().min(1).optional(),
  }).strict().optional(),
  lyrics: z.object({
    he: z.string().min(1),
    en: z.string().min(1).optional(),
  }).strict(),
  teachable_units: z.array(TeachableUnitSchema).min(1),
}).strict().superRefine((lesson, ctx) => {
  const ids = new Set<string>();
  lesson.teachable_units.forEach((unit, index) => {
    if (ids.has(unit.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['teachable_units', index, 'id'],
        message: `Duplicate teachable unit id: ${unit.id}`,
      });
    }
    ids.add(unit.id);
  });

  lesson.teachable_units.forEach((unit, unitIndex) => {
    unit.prerequisites.forEach((prereq, prereqIndex) => {
      if (!ids.has(prereq)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['teachable_units', unitIndex, 'prerequisites', prereqIndex],
          message: `Unknown prerequisite id: ${prereq}`,
        });
      }
    });
  });
});

export type SongLesson = z.infer<typeof SongLessonSchema>;
export type TeachableUnit = z.infer<typeof TeachableUnitSchema>;

function readYaml(filePath: string): unknown {
  const text = fs.readFileSync(filePath, 'utf8');
  return parse(text);
}

export function collectSongLessonFiles(dataDirV2: string): string[] {
  const base = path.join(dataDirV2, 'song_lessons');
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .map((name) => path.join(base, name))
    .sort();
}

export function loadSongLessons(dataDirV2: string): SongLesson[] {
  return collectSongLessonFiles(dataDirV2).map((filePath) => SongLessonSchema.parse(readYaml(filePath)));
}

export function writeSongLessonsDist(contentRoot: string) {
  const dataDirV2 = path.join(contentRoot, 'data', 'v2');
  const distDir = path.join(contentRoot, 'dist');
  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
  const songLessons = loadSongLessons(dataDirV2);
  const outPath = path.join(distDir, 'song_lessons.json');
  fs.writeFileSync(outPath, JSON.stringify(songLessons, null, 2), 'utf8');
  // eslint-disable-next-line no-console
  console.log(`Wrote song lessons -> ${path.relative(contentRoot, outPath)} (${songLessons.length})`);
}
