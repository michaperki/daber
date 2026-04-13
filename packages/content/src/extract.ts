import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import {
  FileSchema,
  VerbEntrySchema,
  NounEntrySchema,
  AdjectiveEntrySchema,
  SimpleEntrySchema,
  type VocabRow,
} from './schema.js';

export function readYamlFile(filePath: string): unknown {
  const text = fs.readFileSync(filePath, 'utf8');
  return parse(text);
}

export function extractVocabFromFile(filePath: string): VocabRow[] {
  const raw = readYamlFile(filePath);
  const file = FileSchema.parse(raw);

  // Concepts are skipped in MVP
  if (file.type === 'concept') return [];
  const pos = file.pos;
  if (!pos) return [];

  const rows: VocabRow[] = [];

  for (const entry of file.entries ?? []) {
    try {
      switch (pos) {
        case 'verb': {
          const v = VerbEntrySchema.parse(entry);
          // Base infinitive
          rows.push({ he: v.lemma, en: v.gloss, pos });
          // Present feminine singular (if available)
          const fs = v.present?.f_sg;
          if (typeof fs === 'string' && fs.trim().length > 0) {
            rows.push({ he: fs, en: v.gloss, pos, variant: 'f_sg' });
          }
          break;
        }
        case 'noun': {
          const n = NounEntrySchema.parse(entry);
          const he = n.forms?.sg || n.forms?.base || n.lemma;
          rows.push({ he, en: n.gloss, pos });
          break;
        }
        case 'adjective': {
          const a = AdjectiveEntrySchema.parse(entry);
          const he = a.forms?.m_sg || a.forms?.base || a.lemma;
          rows.push({ he, en: a.gloss, pos });
          const fsg = a.forms?.f_sg;
          if (typeof fsg === 'string' && fsg.trim().length > 0) {
            rows.push({ he: fsg, en: a.gloss, pos, variant: 'f_sg' });
          }
          break;
        }
        case 'adverb':
        case 'pronoun':
        case 'preposition': {
          const s = SimpleEntrySchema.parse(entry);
          rows.push({ he: s.lemma, en: s.gloss, pos });
          break;
        }
        default:
          break;
      }
    } catch (err) {
      // Skip invalid entries; build script prints aggregate errors separately if desired
      continue; // eslint-disable-line no-continue
    }
  }

  return rows.filter((r) => r.he && r.en);
}

export function collectYamlFiles(rootDir: string): string[] {
  const dirs = [
    'verbs',
    'nouns',
    'adjectives',
    'adverbs',
    'pronouns',
    'prepositions',
    // concepts intentionally skipped
  ];
  const files: string[] = [];
  for (const d of dirs) {
    const dir = path.join(rootDir, d);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith('.yaml') || name.endsWith('.yml')) {
        files.push(path.join(dir, name));
      }
    }
  }
  return files;
}

export function dedupeAndSort(rows: VocabRow[]): VocabRow[] {
  const map = new Map<string, VocabRow>();
  for (const r of rows) {
    const key = r.he;
    if (!map.has(key)) map.set(key, r);
  }
  const out = Array.from(map.values());
  out.sort((a, b) => a.he.localeCompare(b.he));
  return out;
}
