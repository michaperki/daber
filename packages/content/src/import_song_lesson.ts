import fs from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import { collectYamlFiles, dedupeAndSort, extractVocabFromFile } from './extract.js';
import {
  collectLessonFiles,
  parseAuthoredLesson,
  runtimeLessonFromAuthored,
  validateLessonReferences,
} from './lessons.js';
import type { VocabRow } from './schema.js';

const CONTENT_ROOT = path.resolve(import.meta.dirname, '..');
const DATA_DIR_V2 = path.join(CONTENT_ROOT, 'data', 'v2');

type Args = {
  source: string | null;
  out: string | null;
};

function usage(): never {
  // eslint-disable-next-line no-console
  console.error(`Usage: npm run song:import -- <generated-yaml> [--out packages/content/data/v2/lessons/songs/<name>.yaml]`);
  process.exit(2);
}

function parseArgs(argv: string[]): Args {
  const args: Args = { source: null, out: null };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') {
      args.out = argv[++i] || null;
    } else if (arg.startsWith('--out=')) {
      args.out = arg.slice('--out='.length);
    } else if (!args.source) {
      args.source = arg;
    } else {
      usage();
    }
  }
  if (!args.source) usage();
  return args;
}

function readYaml(filePath: string): unknown {
  return parse(fs.readFileSync(filePath, 'utf8'));
}

function defaultOutPath(lessonId: string): string {
  const slug = lessonId.replace(/^song_/, '');
  return path.join(DATA_DIR_V2, 'lessons', 'songs', `${slug}.yaml`);
}

function loadCurrentVocabRows() {
  let rows: VocabRow[] = [];
  for (const file of collectYamlFiles(DATA_DIR_V2)) {
    rows = rows.concat(extractVocabFromFile(file));
  }
  return dedupeAndSort(rows);
}

function validateSongLessonShape(lesson: ReturnType<typeof parseAuthoredLesson>): string[] {
  const issues: string[] = [];
  if (lesson.endpoint?.kind !== 'song') {
    issues.push('endpoint.kind must be "song" for generated song lessons');
  }

  lesson.build_phrases?.forEach((phrase, index) => {
    if (phrase.drillable === false) return;
    if (!phrase.prompt) {
      issues.push(`build_phrases.${index}.prompt is required for drillable song phrase`);
    }
    if (!phrase.span) {
      issues.push(`build_phrases.${index}.span is required for drillable song phrase`);
    }
  });

  const noteIds = new Set<string>();
  lesson.notes?.forEach((note, index) => {
    if (noteIds.has(note.id)) {
      issues.push(`notes.${index}.id duplicates "${note.id}"`);
    }
    noteIds.add(note.id);
  });

  return issues;
}

function validateNoDuplicateLessonId(lessonId: string, outPath: string): string[] {
  const issues: string[] = [];
  const normalizedOut = path.resolve(outPath);
  for (const file of collectLessonFiles(DATA_DIR_V2)) {
    const normalizedFile = path.resolve(file);
    if (normalizedFile === normalizedOut) continue;
    const lesson = parseAuthoredLesson(readYaml(file), file);
    if (lesson.id === lessonId) {
      issues.push(`lesson id "${lessonId}" already exists in ${path.relative(process.cwd(), file)}`);
    }
  }
  return issues;
}

function main() {
  const args = parseArgs(process.argv);
  const invocationCwd = process.env.INIT_CWD || process.cwd();
  const sourcePath = path.resolve(invocationCwd, args.source!);
  const authored = parseAuthoredLesson(readYaml(sourcePath), sourcePath);
  const outPath = args.out ? path.resolve(invocationCwd, args.out) : defaultOutPath(authored.id);
  const runtime = runtimeLessonFromAuthored(authored);

  const issues = [
    ...validateSongLessonShape(authored),
    ...validateNoDuplicateLessonId(authored.id, outPath),
    ...validateLessonReferences(runtime, loadCurrentVocabRows()),
  ];

  if (issues.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`Song lesson import failed for ${path.relative(process.cwd(), sourcePath)}:`);
    for (const issue of issues) {
      // eslint-disable-next-line no-console
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, stringify(authored, { lineWidth: 0 }), 'utf8');
  // eslint-disable-next-line no-console
  console.log(`Imported ${authored.id} -> ${path.relative(process.cwd(), outPath)}`);
}

try {
  main();
} catch (err) {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
