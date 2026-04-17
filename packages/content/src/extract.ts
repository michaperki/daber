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

function normalizeGloss(gloss: string): string {
  return gloss
    .replace(/\s*;\s*/g, ' / ')
    .replace(/\s*,\s*/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pluralizeWord(word: string): string {
  const clean = word.trim();
  if (!clean) return clean;
  if (/\b(water|sand|milk|coffee|tea|sugar|salt|pepper|butter|oil|meat|work)\b/i.test(clean)) {
    return clean;
  }
  if (/[^aeiou]y$/i.test(clean)) return clean.replace(/y$/i, 'ies');
  if (/(s|x|z|ch|sh)$/i.test(clean)) return `${clean}es`;
  if (/fe$/i.test(clean)) return clean.replace(/fe$/i, 'ves');
  if (/f$/i.test(clean)) return clean.replace(/f$/i, 'ves');
  return `${clean}s`;
}

function pluralizeGloss(gloss: string): string {
  return normalizeGloss(gloss)
    .split(' / ')
    .map((part) => pluralizeWord(part))
    .join(' / ');
}

function nounPrompt(gloss: string, variant: 'sg' | 'pl'): string {
  if (normalizeGloss(gloss).toLowerCase() === 'time / once') {
    return variant === 'pl' ? 'times (plural form)' : 'one time / once (singular form)';
  }
  if (variant === 'pl') return `${pluralizeGloss(gloss)} (plural form)`;
  return `${normalizeGloss(gloss)} (singular form)`;
}

function adjectivePrompt(gloss: string, variant: 'm_sg' | 'f_sg' | 'm_pl' | 'f_pl'): string {
  const labels: Record<typeof variant, string> = {
    m_sg: 'masculine singular form',
    f_sg: 'feminine singular form',
    m_pl: 'masculine plural form',
    f_pl: 'feminine plural form',
  };
  return `${normalizeGloss(gloss)} (${labels[variant]})`;
}

function verbPrompt(en: string, variant?: string): string {
  const prompt = normalizeGloss(en);
  if (!variant) return `${prompt} (infinitive)`;
  return prompt;
}

function row(args: Omit<VocabRow, 'prompt' | 'span'> & { prompt: string }): VocabRow {
  return { ...args, prompt: args.prompt, span: 'cell' };
}

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
          rows.push(row({ he: v.lemma, en: v.gloss, prompt: verbPrompt(v.gloss), pos, lemma: v.lemma }));

          // Helper to add a conjugated form only if both he+en exist
          const add = (he: unknown, en: unknown, variant: string) => {
            if (typeof he === 'string' && he.trim() && typeof en === 'string' && en.trim()) {
              rows.push(row({ he, en, prompt: verbPrompt(en, variant), pos, variant, lemma: v.lemma }));
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
          if (typeof sg === 'string' && sg.trim()) {
            rows.push(row({ he: sg, en: n.gloss, prompt: n.prompts?.sg || nounPrompt(n.gloss, 'sg'), pos, variant: 'sg', lemma: n.lemma }));
          }
          // Emit plural if present
          if (typeof pl === 'string' && pl.trim()) {
            rows.push(row({ he: pl, en: n.gloss, prompt: n.prompts?.pl || nounPrompt(n.gloss, 'pl'), pos, variant: 'pl', lemma: n.lemma }));
          }
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
              rows.push(row({ he, en, prompt: a.prompts?.[variant] || adjectivePrompt(a.gloss, variant), pos, variant, lemma: a.lemma }));
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
          rows.push(row({ he: s.lemma, en: s.gloss, prompt: normalizeGloss(s.gloss), pos }));
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
