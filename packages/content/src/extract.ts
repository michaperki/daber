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
          // Base infinitive row
          rows.push({ he: v.lemma, en: v.gloss, pos, lemma: v.lemma });

          // Helper to add a conjugated form only if both he+en exist
          const add = (he: unknown, en: unknown, variant: string) => {
            if (typeof he === 'string' && he.trim() && typeof en === 'string' && en.trim()) {
              rows.push({ he, en, pos, variant, lemma: v.lemma });
            }
          };

          // Present (gender/number)
          const presHe = (v as any).present_he || {};
          const presEn = (v as any).present_en || {};
          add(presHe.m_sg, presEn.m_sg, 'present_m_sg');
          add(presHe.f_sg, presEn.f_sg, 'present_f_sg');
          add(presHe.m_pl, presEn.m_pl, 'present_m_pl');
          add(presHe.f_pl, presEn.f_pl, 'present_f_pl');

          // Past (person)
          const pastHe = (v as any).past_he || {};
          const pastEn = (v as any).past_en || {};
          const pastKeys = [
            '1sg',
            '2sg_m',
            '2sg_f',
            '3sg_m',
            '3sg_f',
            '1pl',
            '2pl_m',
            '2pl_f',
            '3pl',
          ] as const;
          for (const k of pastKeys) add(pastHe[k], pastEn[k], `past_${k}`);

          // Future (person)
          const futHe = (v as any).future_he || {};
          const futEn = (v as any).future_en || {};
          const futKeys = pastKeys; // same shape
          for (const k of futKeys) add(futHe[k], futEn[k], `future_${k}`);

          // Imperative (gender/number)
          const impHe = (v as any).imperative_he || {};
          const impEn = (v as any).imperative_en || {};
          const impKeys = ['sg_m', 'sg_f', 'pl_m', 'pl_f'] as const;
          for (const k of impKeys) add(impHe[k], impEn[k], `imperative_${k}`);
          break;
        }
        case 'noun': {
          const n = NounEntrySchema.parse(entry);
          const sg = n.forms?.sg || n.forms?.base || n.lemma;
          const pl = (n as any).forms?.pl;
          // Emit singular (sg) as its own cell
          if (typeof sg === 'string' && sg.trim()) rows.push({ he: sg, en: n.gloss, pos, variant: 'sg', lemma: n.lemma });
          // Emit plural if present
          if (typeof pl === 'string' && pl.trim()) rows.push({ he: pl, en: n.gloss, pos, variant: 'pl', lemma: n.lemma });
          break;
        }
        case 'adjective': {
          const a = AdjectiveEntrySchema.parse(entry);
          const forms = a.forms || {};
          const formsEn = (a as any).forms_en || {};
          const addAdj = (
            he: unknown,
            en: unknown,
            variant: 'm_sg' | 'f_sg' | 'm_pl' | 'f_pl',
          ) => {
            if (typeof he === 'string' && he.trim() && typeof en === 'string' && en.trim()) {
              rows.push({ he, en, pos, variant, lemma: a.lemma });
            }
          };
          addAdj(forms.m_sg, formsEn.m_sg, 'm_sg');
          addAdj(forms.f_sg, formsEn.f_sg, 'f_sg');
          addAdj(forms.m_pl, formsEn.m_pl, 'm_pl');
          addAdj(forms.f_pl, formsEn.f_pl, 'f_pl');
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
    // Include variant in key so f_sg vs base can coexist even if `he` matches
    const key = `${r.he}::${r.variant || ''}`;
    if (!map.has(key)) map.set(key, r);
  }
  const out = Array.from(map.values());
  out.sort((a, b) => a.he.localeCompare(b.he));
  return out;
}
