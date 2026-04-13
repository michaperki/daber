import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import {
  VERB_FORMS,
  VerbFormToken,
  expandVerbFormPatterns,
  ADJ_FORMS,
  AdjectiveFormToken,
  expandAdjectiveFormPatterns,
  NOUN_FORMS,
  NounFormToken,
  expandNounFormPatterns,
} from './forms.js';

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

const AdjIntroSchema = z.object({
  lemma: z.string().min(1),
  forms: z.array(z.string().min(1)).default([]),
});

const AdjWaveSchema = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  unlocked: z.boolean().default(false),
  forms: z.array(z.string().min(1)).default([]),
  adjectives: z.array(z.string().min(1)).default([]),
  files: z.array(z.string().min(1)).default([]).optional(),
});

const NounIntroSchema = z.object({
  lemma: z.string().min(1),
  forms: z.array(z.string().min(1)).default([]),
});

const NounWaveSchema = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  unlocked: z.boolean().default(false),
  forms: z.array(z.string().min(1)).default([]),
  nouns: z.array(z.string().min(1)).default([]),
  files: z.array(z.string().min(1)).default([]).optional(),
});

const CurriculumSchema = z.object({
  verbs: z.array(VerbIntroSchema).default([]).optional(),
  waves: z.array(WaveSchema).default([]).optional(),
  adjectives: z.array(AdjIntroSchema).default([]).optional(),
  adj_waves: z.array(AdjWaveSchema).default([]).optional(),
  nouns: z.array(NounIntroSchema).default([]).optional(),
  noun_waves: z.array(NounWaveSchema).default([]).optional(),
});

export type VerbIntroducedMap = Record<string, VerbFormToken[]>; // lemma -> forms
export type AdjIntroducedMap = Record<string, AdjectiveFormToken[]>;
export type NounIntroducedMap = Record<string, NounFormToken[]>;

export function readYaml(filePath: string): unknown {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return parse(text);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Failed to read YAML:', filePath, e);
    throw e;
  }
}

export function loadCurriculumIntroduced(dataDirV2: string): { verbs: VerbIntroducedMap; adjectives: AdjIntroducedMap; nouns: NounIntroducedMap } {
  const curriculumDir = path.join(dataDirV2, 'curriculum');
  const verbsFile = path.join(curriculumDir, 'verbs.yaml');
  if (!fs.existsSync(verbsFile)) return { verbs: {}, adjectives: {}, nouns: {} };
  const raw = readYaml(verbsFile);
  let cfg: z.infer<typeof CurriculumSchema>;
  try {
    cfg = CurriculumSchema.parse(raw);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Curriculum parse error in', verbsFile, e);
    throw e;
  }
  const vmap = new Map<string, Set<VerbFormToken>>();

  const add = (lemma: string, forms: string[]) => {
    if (!lemma || !forms?.length) return;
    if (!vmap.has(lemma)) vmap.set(lemma, new Set());
    const set = vmap.get(lemma)!;
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

  const verbsOut: VerbIntroducedMap = {};
  for (const [lemma, set] of vmap) {
    // Normalize order by canonical token order
    const ordered = (VERB_FORMS as readonly string[]).filter((t) => set.has(t as VerbFormToken));
    verbsOut[lemma] = ordered as VerbFormToken[];
  }

  // Adjectives
  const amap = new Map<string, Set<AdjectiveFormToken>>();
  const adda = (lemma: string, forms: string[]) => {
    if (!lemma || !forms?.length) return;
    if (!amap.has(lemma)) amap.set(lemma, new Set());
    const set = amap.get(lemma)!;
    for (const tok of expandAdjectiveFormPatterns(forms)) set.add(tok);
  };
  for (const a of cfg.adjectives ?? []) adda(a.lemma, a.forms);
  for (const w of cfg.adj_waves ?? []) {
    if (!w.unlocked) continue;
    let lemmas: string[] = [...(w.adjectives || [])];
    if (w.files && w.files.length) {
      for (const base of w.files) {
        const p = path.join(dataDirV2, 'adjectives', `${base}.yaml`);
        if (!fs.existsSync(p)) continue;
        try {
          const rawf = readYaml(p) as any;
          const es = Array.isArray(rawf?.entries) ? rawf.entries : [];
          for (const e of es) if (e && typeof e.lemma === 'string') lemmas.push(e.lemma);
        } catch {}
      }
    }
    for (const lemma of lemmas) adda(lemma, w.forms);
  }
  const adjsOut: AdjIntroducedMap = {};
  for (const [lemma, set] of amap) {
    const ordered = (ADJ_FORMS as readonly string[]).filter((t) => set.has(t as AdjectiveFormToken));
    adjsOut[lemma] = ordered as AdjectiveFormToken[];
  }

  // Nouns
  const nmap = new Map<string, Set<NounFormToken>>();
  const addn = (lemma: string, forms: string[]) => {
    if (!lemma || !forms?.length) return;
    if (!nmap.has(lemma)) nmap.set(lemma, new Set());
    const set = nmap.get(lemma)!;
    for (const tok of expandNounFormPatterns(forms)) set.add(tok);
  };
  for (const n of cfg.nouns ?? []) addn(n.lemma, n.forms);
  for (const w of cfg.noun_waves ?? []) {
    if (!w.unlocked) continue;
    let lemmas: string[] = [...(w.nouns || [])];
    if (w.files && w.files.length) {
      for (const base of w.files) {
        const p = path.join(dataDirV2, 'nouns', `${base}.yaml`);
        if (!fs.existsSync(p)) continue;
        try {
          const rawf = readYaml(p) as any;
          const es = Array.isArray(rawf?.entries) ? rawf.entries : [];
          for (const e of es) if (e && typeof e.lemma === 'string') lemmas.push(e.lemma);
        } catch {}
      }
    }
    for (const lemma of lemmas) addn(lemma, w.forms);
  }
  const nounsOut: NounIntroducedMap = {};
  for (const [lemma, set] of nmap) {
    const ordered = (NOUN_FORMS as readonly string[]).filter((t) => set.has(t as NounFormToken));
    nounsOut[lemma] = ordered as NounFormToken[];
  }

  return { verbs: verbsOut, adjectives: adjsOut, nouns: nounsOut };
}

export function writeCurriculumDist(contentRoot: string) {
  const dataDirV2 = path.join(contentRoot, 'data', 'v2');
  const distDir = path.join(contentRoot, 'dist');
  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
  const introduced = loadCurriculumIntroduced(dataDirV2);
  // Derive active chapter identifiers from unlocked waves across POS
  const curFile = path.join(dataDirV2, 'curriculum', 'verbs.yaml');
  let chapters = { verbs: [] as string[], adjectives: [] as string[], nouns: [] as string[] };
  try {
    const raw = readYaml(curFile) as any;
    const vfiles = new Set<string>();
    const afiles = new Set<string>();
    const nfiles = new Set<string>();
    if (raw && Array.isArray(raw.waves)) {
      for (const w of raw.waves) {
        if (w && w.unlocked && Array.isArray(w.files)) for (const f of w.files) vfiles.add(String(f));
      }
    }
    if (raw && Array.isArray(raw.adj_waves)) {
      for (const w of raw.adj_waves) {
        if (w && w.unlocked && Array.isArray(w.files)) for (const f of w.files) afiles.add(String(f));
      }
    }
    if (raw && Array.isArray(raw.noun_waves)) {
      for (const w of raw.noun_waves) {
        if (w && w.unlocked && Array.isArray(w.files)) for (const f of w.files) nfiles.add(String(f));
      }
    }
    chapters = { verbs: Array.from(vfiles), adjectives: Array.from(afiles), nouns: Array.from(nfiles) };
  } catch {}
  const outPath = path.join(distDir, 'curriculum.json');
  fs.writeFileSync(
    outPath,
    JSON.stringify({
      verbs: introduced.verbs,
      adjectives: introduced.adjectives,
      nouns: introduced.nouns,
      tokens: { verb: VERB_FORMS, adjective: ADJ_FORMS, noun: NOUN_FORMS },
      chapters,
      generated_at: new Date().toISOString(),
    }),
    'utf8',
  );
  // eslint-disable-next-line no-console
  console.log(`Wrote curriculum → ${path.relative(contentRoot, outPath)}`);
}
