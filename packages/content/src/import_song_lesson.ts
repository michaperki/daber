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

const TOP_LEVEL_KEYS = new Set([
  'id',
  'title',
  'tagline',
  'estimated_minutes',
  'endpoint',
  'phases',
  'core',
  'supporting',
  'build_phrases',
  'notes',
  'wishlist',
  'authoring_principles',
]);

const SCOPE_SECTIONS = new Set(['core', 'supporting']);
const SCOPE_POS_KEYS = new Set(['verbs', 'nouns', 'adjectives']);
const ENDPOINT_KEYS = new Set(['kind', 'description']);
const LIST_SECTIONS = new Set(['phases', 'build_phrases', 'notes']);
const BLOCK_LIST_KEYS = new Set(['pieces', 'alternates']);
const ITEM_START = /^- [A-Za-z_][A-Za-z0-9_]*:/;

function asciiKey(line: string): string | null {
  const match = /^([A-Za-z_][A-Za-z0-9_]*):(?:\s|$)/.exec(line);
  return match?.[1] || null;
}

function isEmptyKey(line: string, key: string): boolean {
  return new RegExp(`^${key}:\\s*$`).test(line);
}

function normalizeGeneratedSongYaml(text: string): string {
  const lines = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => !/^```(?:ya?ml)?\s*$/.test(line.trim()));

  let section: string | null = null;
  let scopePos: string | null = null;
  let listBlockKey: string | null = null;

  return lines.map((rawLine) => {
    const withoutTabs = rawLine.replace(/\t/g, '  ');
    const trimmedRight = withoutTabs.replace(/\s+$/g, '');
    if (!trimmedRight.trim()) return '';

    const starred = trimmedRight.replace(/^(\s*)\*\s+/, '$1- ');
    const content = starred.trimStart();
    const indent = starred.length - content.length;
    const key = asciiKey(content);

    if (indent === 0 && key && TOP_LEVEL_KEYS.has(key)) {
      section = key;
      scopePos = null;
      listBlockKey = null;
      return content;
    }

    if (section === 'endpoint' && key && ENDPOINT_KEYS.has(key)) {
      return `  ${content}`;
    }

    if (section && SCOPE_SECTIONS.has(section)) {
      if (key && SCOPE_POS_KEYS.has(key)) {
        scopePos = key;
        return `  ${content}`;
      }
      if (content.startsWith('- ')) {
        if (indent > 0) return scopePos && indent < 6 ? `      ${content}` : starred;
        return scopePos ? `      ${content}` : `  ${content}`;
      }
      if (indent > 0) {
        if (key && SCOPE_POS_KEYS.has(key)) {
          scopePos = key;
          return indent < 2 ? `  ${content}` : starred;
        }
        return scopePos && indent < 4 ? `    ${content}` : starred;
      }
      return scopePos ? `    ${content}` : `  ${content}`;
    }

    if (section && LIST_SECTIONS.has(section)) {
      if (listBlockKey && content.startsWith('- ') && !ITEM_START.test(content)) {
        return indent < 6 ? `      ${content}` : starred;
      }
      if (content.startsWith('- ')) {
        listBlockKey = null;
        return indent === 0 ? `  ${content}` : starred;
      }
      if (key && BLOCK_LIST_KEYS.has(key) && isEmptyKey(content, key)) {
        listBlockKey = key;
        return indent < 4 ? `    ${content}` : starred;
      }
      listBlockKey = null;
      return indent < 4 ? `    ${content}` : starred;
    }

    if (section === 'authoring_principles') {
      if (indent > 0) return starred;
      return content.startsWith('- ') ? `  ${content}` : `  ${content}`;
    }

    if (indent > 0) {
      return starred;
    }

    return content;
  }).join('\n');
}

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

function readYaml(filePath: string, options: { normalizeGenerated?: boolean } = {}): unknown {
  const text = fs.readFileSync(filePath, 'utf8');
  return parse(options.normalizeGenerated ? normalizeGeneratedSongYaml(text) : text);
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
  const authored = parseAuthoredLesson(readYaml(sourcePath, { normalizeGenerated: true }), sourcePath);
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
