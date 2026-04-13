import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

// Minimal lesson schema for the first slice
const ScopeSchema = z.object({
  verbs: z.record(z.array(z.string())).default({}).optional(),
  adjectives: z.record(z.array(z.string())).default({}).optional(),
  nouns: z.record(z.array(z.string())).default({}).optional(),
}).partial();

const PhaseSchema = z.object({ id: z.string().min(1), title: z.string().optional(), goal: z.string().optional() });

const LessonSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  tagline: z.string().optional(),
  estimated_minutes: z.number().int().positive().optional(),
  endpoint: z.object({ description: z.string().optional() }).partial().optional(),
  core: ScopeSchema.optional(),
  supporting: ScopeSchema.optional(),
  phases: z.array(PhaseSchema).optional(),
  wishlist: z.array(z.string()).optional(),
});

export type Lesson = z.infer<typeof LessonSchema>;

function readYaml(filePath: string): unknown {
  const text = fs.readFileSync(filePath, 'utf8');
  return parse(text);
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
  const out: Lesson[] = [];
  for (const f of files) {
    try {
      const raw = readYaml(f);
      const parsed = LessonSchema.parse(raw);
      out.push(parsed);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Lesson parse error in', f, e);
    }
  }
  return out;
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

