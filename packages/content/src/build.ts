import fs from 'node:fs';
import path from 'node:path';
import { collectYamlFiles, dedupeAndSort, extractVocabFromFile } from './extract.js';
import { writeCurriculumDist } from './curriculum.js';
import type { VocabRow } from './schema.js';

// Build script: YAML → dist/vocab.json
// Usage: npm -w packages/content run build

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'v2');
const DIST_DIR = path.join(ROOT, 'dist');
const OUT_FILE = path.join(DIST_DIR, 'vocab.json');

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function main() {
  ensureDir(DIST_DIR);
  const files = collectYamlFiles(DATA_DIR);
  let rows: VocabRow[] = [];
  for (const f of files) {
    rows = rows.concat(extractVocabFromFile(f));
  }
  const out = dedupeAndSort(rows);
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), 'utf8');
  // eslint-disable-next-line no-console
  console.log(`Wrote ${out.length} vocab rows → ${path.relative(ROOT, OUT_FILE)}`);
  // Also emit curriculum projection (if present)
  writeCurriculumDist(ROOT);
}

main();
