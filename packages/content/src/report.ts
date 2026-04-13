import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

import {
  collectYamlFiles,
  extractVocabFromFile,
  readYamlFile,
} from './extract.js';
import {
  FileSchema,
  VerbEntrySchema,
  NounEntrySchema,
  AdjectiveEntrySchema,
  SimpleEntrySchema,
  type VocabRow,
} from './schema.js';

type POS = 'verb' | 'noun' | 'adjective' | 'adverb' | 'pronoun' | 'preposition';

type VerbBlock =
  | 'present_he'
  | 'present_en'
  | 'past_he'
  | 'past_en'
  | 'future_he'
  | 'future_en'
  | 'imperative_he'
  | 'imperative_en';

type AdjectiveBlock = 'forms' | 'forms_en';
type PrepositionBlock = 'suffixes_en';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'v2');
const DIST_DIR = path.join(ROOT, 'dist');
const OUT_FILE = path.join(DIST_DIR, 'report.json');

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function posFromPath(filePath: string): POS | undefined {
  const parts = filePath.split(path.sep);
  const idx = parts.lastIndexOf('v2');
  if (idx >= 0 && parts[idx + 1]) {
    const dir = parts[idx + 1] as POS;
    if (
      dir === 'verb' ||
      dir === 'noun' ||
      dir === 'adjective' ||
      dir === 'adverb' ||
      dir === 'pronoun' ||
      dir === 'preposition'
    ) {
      return dir; // unlikely: singular; we map via file content instead
    }
  }
  // Use parent folder name
  const parent = path.basename(path.dirname(filePath)) as POS;
  return parent;
}

function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && Object.keys(value as any).length > 0;
}

function valueIsNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function getKeys(obj: unknown): string[] {
  if (!obj || typeof obj !== 'object') return [];
  return Object.keys(obj as any).sort();
}

function shapeKey(keys: string[]): string {
  return keys.join('/');
}

function summarizeZodError(err: unknown): string {
  if (err && typeof err === 'object' && 'issues' in err) {
    const ze = err as z.ZodError<any>;
    return ze.issues
      .slice(0, 3)
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
  }
  return (err as Error)?.message || String(err);
}

type ShapeSummary = Record<string, { count: number; lemmas: string[]; keys: string[] }>;

type Report = {
  generatedAt: string;
  totals: {
    filesPerPos: Partial<Record<POS, number>>;
    entriesPerPos: Partial<Record<POS, number>>;
    totalExtractorRows: number;
  };
  perPosCompleteness: {
    verbs: {
      blocksPopulated: Record<VerbBlock, number>;
      hebrewBlocksCoverage: { four: number; three: number; two: number; one: number; zero: number };
    };
    adjectives: {
      blocksPopulated: Record<AdjectiveBlock, number>;
    };
    prepositions: {
      blocksPopulated: Record<PrepositionBlock, number>;
    };
  };
  keyShapes: {
    verbs: Record<VerbBlock, ShapeSummary>;
    adjectives: Record<AdjectiveBlock, ShapeSummary>;
    prepositions: Record<PrepositionBlock, ShapeSummary>;
  };
  parallelism: {
    verbIssues: Array<{ lemma: string; issues: string[]; file: string }>;
  };
  perVerbDetail: Array<{
    lemma: string;
    file: string;
    present: 'ok' | 'partial' | 'missing';
    past: 'ok' | 'partial' | 'missing';
    future: 'ok' | 'partial' | 'missing';
    imperative: 'ok' | 'partial' | 'missing';
  }>;
  anomalies: {
    files: Array<{ file: string; error: string }>;
    fileUnknownTopLevelKeys: Array<{ file: string; keys: string[] }>;
    entries: Array<{ file: string; index: number; pos: POS | undefined; lemma?: string; error: string }>;
    missingLemma: Array<{ file: string; index: number; pos: POS | undefined }>;
    nonObjectBlocks: Array<{ file: string; lemma: string; block: string; type: string }>;
  };
};

function main() {
  ensureDir(DIST_DIR);
  const files = collectYamlFiles(DATA_DIR);

  const totalsFilesPerPos: Partial<Record<POS, number>> = {};
  const totalsEntriesPerPos: Partial<Record<POS, number>> = {};
  let totalRows = 0;

  const verbShapes: Record<VerbBlock, ShapeSummary> = {
    present_he: {},
    present_en: {},
    past_he: {},
    past_en: {},
    future_he: {},
    future_en: {},
    imperative_he: {},
    imperative_en: {},
  };
  const adjShapes: Record<AdjectiveBlock, ShapeSummary> = {
    forms: {},
    forms_en: {},
  };
  const prepShapes: Record<PrepositionBlock, ShapeSummary> = {
    suffixes_en: {},
  };

  const verbBlocks: VerbBlock[] = [
    'present_he',
    'present_en',
    'past_he',
    'past_en',
    'future_he',
    'future_en',
    'imperative_he',
    'imperative_en',
  ];
  const adjBlocks: AdjectiveBlock[] = ['forms', 'forms_en'];
  const prepBlocks: PrepositionBlock[] = ['suffixes_en'];

  const verbsHebrewCoverage = { four: 0, three: 0, two: 0, one: 0, zero: 0 };
  const verbsBlockCounts: Record<VerbBlock, number> = Object.fromEntries(
    verbBlocks.map((b) => [b, 0]),
  ) as Record<VerbBlock, number>;
  const adjBlockCounts: Record<AdjectiveBlock, number> = Object.fromEntries(
    adjBlocks.map((b) => [b, 0]),
  ) as Record<AdjectiveBlock, number>;
  const prepBlockCounts: Record<PrepositionBlock, number> = Object.fromEntries(
    prepBlocks.map((b) => [b, 0]),
  ) as Record<PrepositionBlock, number>;

  const parallelismIssues: Array<{ lemma: string; issues: string[]; file: string }> = [];
  const perVerbDetail: Report['perVerbDetail'] = [];

  const anomalies: Report['anomalies'] = {
    files: [],
    fileUnknownTopLevelKeys: [],
    entries: [],
    missingLemma: [],
    nonObjectBlocks: [],
  };

  // First pass: iterate files, collect counts and analyses
  for (const file of files) {
    const rows = extractVocabFromFile(file);
    totalRows += rows.length;

    const raw = readYamlFile(file);
    const fileParse = FileSchema.safeParse(raw);
    if (!fileParse.success) {
      anomalies.files.push({ file, error: summarizeZodError(fileParse.error) });
      continue;
    }
    const f = fileParse.data;
    if (f.type === 'concept') continue; // skip concepts
    const pos = f.pos as POS | undefined;
    if (!pos) continue;
    totalsFilesPerPos[pos] = (totalsFilesPerPos[pos] || 0) + 1;

    const topKeys = Object.keys(raw as any);
    const unknownTop = topKeys.filter((k) => !['pos', 'type', 'entries'].includes(k));
    if (unknownTop.length) {
      anomalies.fileUnknownTopLevelKeys.push({ file, keys: unknownTop.sort() });
    }

    const entries = (f.entries ?? []) as unknown[];
    totalsEntriesPerPos[pos] = (totalsEntriesPerPos[pos] || 0) + entries.length;

    entries.forEach((entryUnknown, index) => {
      const entry = entryUnknown as any;
      const lemma = typeof entry?.lemma === 'string' ? entry.lemma : undefined;

      // Validate by POS using existing schemas; collect anomalies instead of throwing
      let valid = true;
      try {
        switch (pos) {
          case 'verb':
            VerbEntrySchema.parse(entry);
            break;
          case 'noun':
            NounEntrySchema.parse(entry);
            break;
          case 'adjective':
            AdjectiveEntrySchema.parse(entry);
            break;
          case 'adverb':
          case 'pronoun':
          case 'preposition':
            SimpleEntrySchema.parse(entry);
            break;
          default:
            break;
        }
      } catch (err) {
        valid = false;
        anomalies.entries.push({ file, index, pos, lemma, error: summarizeZodError(err) });
      }

      if (!lemma) {
        anomalies.missingLemma.push({ file, index, pos });
      }

      // Per-POS specific analyses using raw entry data
      if (pos === 'verb') {
        // Count block presence for verbs and shapes
        const hebBlocks: Array<VerbBlock> = ['present_he', 'past_he', 'future_he', 'imperative_he'];
        let hebPopulatedCount = 0;
        for (const b of verbBlocks) {
          const blockVal = entry?.[b];
          if (isNonEmptyObject(blockVal)) {
            verbsBlockCounts[b] += 1;
            const keys = getKeys(blockVal);
            const sk = shapeKey(keys);
            const bucket = verbShapes[b][sk] || { count: 0, lemmas: [], keys };
            bucket.count += 1;
            if (lemma && bucket.lemmas.length < 10) bucket.lemmas.push(lemma);
            verbShapes[b][sk] = bucket;
          } else if (blockVal && typeof blockVal === 'object') {
            // object but empty
            // still consider as not populated; no action
          } else if (blockVal !== undefined) {
            anomalies.nonObjectBlocks.push({
              file,
              lemma: lemma || '(unknown lemma)',
              block: b,
              type: typeof blockVal,
            });
          }
          if (hebBlocks.includes(b) && isNonEmptyObject(blockVal)) {
            hebPopulatedCount += 1;
          }
        }
        if (hebPopulatedCount === 4) verbsHebrewCoverage.four += 1;
        else if (hebPopulatedCount === 3) verbsHebrewCoverage.three += 1;
        else if (hebPopulatedCount === 2) verbsHebrewCoverage.two += 1;
        else if (hebPopulatedCount === 1) verbsHebrewCoverage.one += 1;
        else verbsHebrewCoverage.zero += 1;

        // Parallelism checks per verb
        const issueList: string[] = [];
        const pairs: Array<[VerbBlock, VerbBlock, string]> = [
          ['present_he', 'present_en', 'present'],
          ['past_he', 'past_en', 'past'],
          ['future_he', 'future_en', 'future'],
          ['imperative_he', 'imperative_en', 'imperative'],
        ];
        const blockStatus: Record<string, 'ok' | 'partial' | 'missing'> = {};

        for (const [heB, enB, label] of pairs) {
          const heObj = entry?.[heB];
          const enObj = entry?.[enB];
          const heKeys = getKeys(heObj);
          const enKeys = getKeys(enObj);
          const heSet = new Set(heKeys);
          const enSet = new Set(enKeys);

          const heOnly = heKeys.filter((k) => !enSet.has(k));
          const enOnly = enKeys.filter((k) => !heSet.has(k));

          const valuesOk = heKeys.every((k) => valueIsNonEmptyString(heObj?.[k])) &&
            enKeys.every((k) => valueIsNonEmptyString(enObj?.[k]));

          if (heKeys.length === 0 && enKeys.length === 0) {
            blockStatus[label] = 'missing';
          } else if (heOnly.length === 0 && enOnly.length === 0 && valuesOk) {
            blockStatus[label] = 'ok';
          } else {
            blockStatus[label] = 'partial';
            if (heOnly.length > 0) {
              issueList.push(`${lemma || ''}: ${heB} has ${heOnly.join(', ')} but ${enB} does not`);
            }
            if (enOnly.length > 0) {
              issueList.push(`${lemma || ''}: ${enB} has ${enOnly.join(', ')} but ${heB} does not`);
            }
            if (!valuesOk) {
              issueList.push(`${lemma || ''}: ${label} has empty values in one or both blocks`);
            }
          }
        }

        perVerbDetail.push({
          lemma: lemma || '(unknown lemma)',
          file,
          present: blockStatus['present'] || 'missing',
          past: blockStatus['past'] || 'missing',
          future: blockStatus['future'] || 'missing',
          imperative: blockStatus['imperative'] || 'missing',
        });

        if (issueList.length > 0) {
          parallelismIssues.push({ lemma: lemma || '(unknown lemma)', issues: issueList, file });
        }
      } else if (pos === 'adjective') {
        for (const b of adjBlocks) {
          const blockVal = entry?.[b];
          if (isNonEmptyObject(blockVal)) {
            adjBlockCounts[b] += 1;
            const keys = getKeys(blockVal);
            const sk = shapeKey(keys);
            const bucket = adjShapes[b][sk] || { count: 0, lemmas: [], keys };
            bucket.count += 1;
            if (lemma && bucket.lemmas.length < 10) bucket.lemmas.push(lemma);
            adjShapes[b][sk] = bucket;
          } else if (blockVal !== undefined && typeof blockVal !== 'object') {
            anomalies.nonObjectBlocks.push({
              file,
              lemma: lemma || '(unknown lemma)',
              block: b,
              type: typeof blockVal,
            });
          }
        }
      } else if (pos === 'preposition') {
        for (const b of prepBlocks) {
          const blockVal = entry?.[b];
          if (isNonEmptyObject(blockVal)) {
            prepBlockCounts[b] += 1;
            const keys = getKeys(blockVal);
            const sk = shapeKey(keys);
            const bucket = prepShapes[b][sk] || { count: 0, lemmas: [], keys };
            bucket.count += 1;
            if (lemma && bucket.lemmas.length < 10) bucket.lemmas.push(lemma);
            prepShapes[b][sk] = bucket;
          } else if (blockVal !== undefined && typeof blockVal !== 'object') {
            anomalies.nonObjectBlocks.push({
              file,
              lemma: lemma || '(unknown lemma)',
              block: b,
              type: typeof blockVal,
            });
          }
        }
      }
    });
  }

  const report: Report = {
    generatedAt: new Date().toISOString(),
    totals: {
      filesPerPos: totalsFilesPerPos,
      entriesPerPos: totalsEntriesPerPos,
      totalExtractorRows: totalRows,
    },
    perPosCompleteness: {
      verbs: {
        blocksPopulated: verbsBlockCounts,
        hebrewBlocksCoverage: verbsHebrewCoverage,
      },
      adjectives: {
        blocksPopulated: adjBlockCounts,
      },
      prepositions: {
        blocksPopulated: prepBlockCounts,
      },
    },
    keyShapes: {
      verbs: verbShapes,
      adjectives: adjShapes,
      prepositions: prepShapes,
    },
    parallelism: {
      verbIssues: parallelismIssues,
    },
    perVerbDetail: perVerbDetail.sort((a, b) => a.lemma.localeCompare(b.lemma)),
    anomalies,
  };

  // Write JSON artifact
  ensureDir(DIST_DIR);
  fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2), 'utf8');

  // Human-readable stdout summary
  printSummary(report);
}

function printSummary(r: Report) {
  const out: string[] = [];
  const sep = () => out.push('');

  out.push('=== Content Report (v2 YAML) ===');
  out.push(`Generated: ${r.generatedAt}`);
  sep();

  // Totals
  out.push('Totals');
  const posList: POS[] = ['verb', 'noun', 'adjective', 'preposition', 'adverb', 'pronoun'];
  for (const pos of posList) {
    const files = r.totals.filesPerPos[pos] || 0;
    const entries = r.totals.entriesPerPos[pos] || 0;
    out.push(`- ${pos}: files ${files}, entries ${entries}`);
  }
  out.push(`- Extractor rows (vocab): ${r.totals.totalExtractorRows}`);
  sep();

  // Verbs completeness
  out.push('Verbs — Block Completeness');
  const vb = r.perPosCompleteness.verbs.blocksPopulated;
  out.push(
    `- present (he/en): ${vb.present_he}/${vb.present_en} | past (he/en): ${vb.past_he}/${vb.past_en} | future (he/en): ${vb.future_he}/${vb.future_en} | imperative (he/en): ${vb.imperative_he}/${vb.imperative_en}`,
  );
  const cov = r.perPosCompleteness.verbs.hebrewBlocksCoverage;
  out.push(
    `- Hebrew blocks coverage (present/past/future/imperative): 4=${cov.four}, 3=${cov.three}, 2=${cov.two}, 1=${cov.one}, 0=${cov.zero}`,
  );
  sep();

  // Adjectives completeness
  out.push('Adjectives — Block Completeness');
  out.push(
    `- forms: ${r.perPosCompleteness.adjectives.blocksPopulated.forms} | forms_en: ${r.perPosCompleteness.adjectives.blocksPopulated.forms_en}`,
  );
  sep();

  // Prepositions completeness
  out.push('Prepositions — Block Completeness');
  out.push(`- suffixes_en: ${r.perPosCompleteness.prepositions.blocksPopulated.suffixes_en}`);
  sep();

  // Key shape analysis (summaries)
  out.push('Key Shapes — Verbs');
  const printShapes = (label: string, shapes: ShapeSummary) => {
    const entries = Object.entries(shapes);
    if (entries.length === 0) {
      out.push(`- ${label}: (none)`);
      return;
    }
    entries.sort((a, b) => b[1].count - a[1].count);
    for (const [shape, info] of entries) {
      const ex = info.lemmas.slice(0, 5).join(', ');
      out.push(`- ${label} [${shape || '(no keys)'}]: ${info.count} (e.g., ${ex})`);
    }
  };
  printShapes('present_he', r.keyShapes.verbs.present_he);
  printShapes('present_en', r.keyShapes.verbs.present_en);
  printShapes('past_he', r.keyShapes.verbs.past_he);
  printShapes('past_en', r.keyShapes.verbs.past_en);
  printShapes('future_he', r.keyShapes.verbs.future_he);
  printShapes('future_en', r.keyShapes.verbs.future_en);
  printShapes('imperative_he', r.keyShapes.verbs.imperative_he);
  printShapes('imperative_en', r.keyShapes.verbs.imperative_en);
  sep();

  out.push('Key Shapes — Adjectives');
  printShapes('forms', r.keyShapes.adjectives.forms);
  printShapes('forms_en', r.keyShapes.adjectives.forms_en);
  sep();

  out.push('Key Shapes — Prepositions');
  printShapes('suffixes_en', r.keyShapes.prepositions.suffixes_en);
  sep();

  // Parallelism issues summary
  out.push('Parallelism — Verb Hebrew/English mismatches');
  if (r.parallelism.verbIssues.length === 0) {
    out.push('- None');
  } else {
    const maxList = 50;
    r.parallelism.verbIssues.slice(0, maxList).forEach((vi) => {
      out.push(`- ${vi.lemma}: ${vi.issues.join(' | ')}`);
    });
    if (r.parallelism.verbIssues.length > maxList) {
      out.push(`- ...and ${r.parallelism.verbIssues.length - maxList} more`);
    }
  }
  sep();

  // Per-verb completeness detail
  out.push('Per-Verb Completeness');
  const sym = (s: 'ok' | 'partial' | 'missing') => (s === 'ok' ? '✓' : '·');
  r.perVerbDetail.forEach((v) => {
    out.push(
      `${v.lemma}: [lemma ${valueIsNonEmptyString(v.lemma) ? '✓' : '·'}] [present ${sym(v.present)}] [past ${sym(v.past)}] [future ${sym(v.future)}] [imperative ${sym(v.imperative)}]`,
    );
  });
  sep();

  // Anomalies summary
  out.push('Anomalies');
  if (r.anomalies.files.length) out.push(`- File parse errors: ${r.anomalies.files.length}`);
  if (r.anomalies.entries.length) out.push(`- Entry schema failures: ${r.anomalies.entries.length}`);
  if (r.anomalies.missingLemma.length) out.push(`- Entries missing lemma: ${r.anomalies.missingLemma.length}`);
  if (r.anomalies.fileUnknownTopLevelKeys.length)
    out.push(`- Files with unknown top-level keys: ${r.anomalies.fileUnknownTopLevelKeys.length}`);
  if (r.anomalies.nonObjectBlocks.length)
    out.push(`- Non-object blocks encountered: ${r.anomalies.nonObjectBlocks.length}`);

  // eslint-disable-next-line no-console
  console.log(out.join('\n'));
}

main();

