import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { VERB_FORMS, VerbFormToken, expandVerbFormPatterns } from './forms.js';

// Zod schemas for curriculum config
const VerbIntroSchema = z.object({
  lemma: z.string().min(1),
  forms: z.array(z.string().min(1)).default([]),
});

const WaveSchema = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  unlocked: z.boolean().default(false),
  forms: z.array(z.string().min(1)).default([]),
  verbs: z.array(z.string().min(1)).default([]),
  files: z.array(z.string().min(1)).default([]).optional(), // optional: verbs drawn from verbs/<file>.yaml
});

const CurriculumSchema = z.object({
  verbs: z.array(VerbIntroSchema).default([]).optional(),
  waves: z.array(WaveSchema).default([]).optional(),
});

export type VerbIntroducedMap = Record<string, VerbFormToken[]>; // lemma -> forms

export function readYaml(filePath: string): unknown {
  const text = fs.readFileSync(filePath, 'utf8');
  return parse(text);
}

export function loadCurriculumIntroduced(dataDirV2: string): VerbIntroducedMap {
  const curriculumDir = path.join(dataDirV2, 'curriculum');
  const verbsFile = path.join(curriculumDir, 'verbs.yaml');
  if (!fs.existsSync(verbsFile)) return {};
  const raw = readYaml(verbsFile);
  const cfg = CurriculumSchema.parse(raw);
  const map = new Map<string, Set<VerbFormToken>>();

  const add = (lemma: string, forms: string[]) => {
    if (!lemma || !forms?.length) return;
    if (!map.has(lemma)) map.set(lemma, new Set());
    const set = map.get(lemma)!;
    for (const tok of expandVerbFormPatterns(forms)) set.add(tok);
  };

  for (const v of cfg.verbs ?? []) add(v.lemma, v.forms);
  for (const w of cfg.waves ?? []) {
    if (!w.unlocked) continue;
    let lemmas = [...(w.verbs || [])];
    if (w.files && w.files.length) {
      for (const base of w.files) {
        const p = path.join(dataDirV2, 'verbs', `${base}.yaml`);
        if (!fs.existsSync(p)) continue;
        try {
          const raw = readYaml(p) as any;
          const fileEntries = Array.isArray(raw?.entries) ? raw.entries : [];
          for (const e of fileEntries) {
            if (e && typeof e.lemma === 'string') lemmas.push(e.lemma);
          }
        } catch {
          // ignore file read/parse failures for curriculum convenience
        }
      }
    }
    for (const lemma of lemmas) add(lemma, w.forms);
  }

  const out: VerbIntroducedMap = {};
  for (const [lemma, set] of map) {
    // Normalize order by canonical token order
    const ordered = (VERB_FORMS as readonly string[]).filter((t) => set.has(t as VerbFormToken));
    out[lemma] = ordered as VerbFormToken[];
  }
  return out;
}

export function writeCurriculumDist(contentRoot: string) {
  const dataDirV2 = path.join(contentRoot, 'data', 'v2');
  const distDir = path.join(contentRoot, 'dist');
  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
  const introduced = loadCurriculumIntroduced(dataDirV2);
  const outPath = path.join(distDir, 'curriculum.json');
  fs.writeFileSync(
    outPath,
    JSON.stringify({
      verbs: introduced,
      tokens: VERB_FORMS,
      generated_at: new Date().toISOString(),
    }),
    'utf8',
  );
  // eslint-disable-next-line no-console
  console.log(`Wrote curriculum → ${path.relative(contentRoot, outPath)}`);
}
