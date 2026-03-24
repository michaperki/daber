import fs from 'node:fs';
import path from 'node:path';

export type VocabCard = { en: string; he: string };

export type InflectionSeed = {
  form: string;
  transliteration?: string | null;
  tense?: string | null;
  aspect?: string | null;
  person?: string | null;
  number?: string | null;
  gender?: string | null;
  voice?: string | null;
  binyan?: string | null;
};

export type LexemeSeed = {
  lemma: string;
  pos: 'verb' | 'adjective' | 'noun' | 'phrase' | 'unknown' | 'untagged';
  features?: Record<string, string> | null;
  inflections: InflectionSeed[];
};

function isHebrew(s: string): boolean {
  return /[\u0590-\u05FF]/.test(s);
}

function trimPunct(s: string): string {
  return s.replace(/[\s"'`]+$/g, '').replace(/^[\s"'`]+/g, '').trim();
}

export function parseVocabMarkdown(md: string): VocabCard[] {
  const lines = md.split(/\r?\n/).map(s => s.trim());
  const cards: VocabCard[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (line === '=' || line === '＝') {
      let en = '';
      for (let j = i - 1; j >= 0; j--) {
        if (!lines[j]) continue;
        en = trimPunct(lines[j]);
        break;
      }
      let he = '';
      for (let k = i + 1; k < lines.length; k++) {
        if (!lines[k]) continue;
        he = trimPunct(lines[k]);
        break;
      }
      if (en && he && isHebrew(he)) cards.push({ en, he });
      continue;
    }
    if (line.includes('=') && !/^=+$/.test(line)) {
      const [lhs, rhs] = line.split('=').map(s => trimPunct(s));
      if (lhs && rhs && isHebrew(rhs)) cards.push({ en: lhs, he: rhs });
    }
  }
  return Array.from(new Map(cards.map(c => [c.en + '|' + c.he, c])).values());
}

function splitCommaForms(s: string): string[] {
  return s.split(',').map(x => trimPunct(x)).filter(Boolean);
}

function mapPresentForms(forms: string[]): InflectionSeed[] {
  const labels: Array<{ gender: string; number: string }> = [
    { gender: 'm', number: 'sg' },
    { gender: 'f', number: 'sg' },
    { gender: 'm', number: 'pl' },
    { gender: 'f', number: 'pl' }
  ];
  const infs: InflectionSeed[] = [];
  for (let i = 0; i < Math.min(forms.length, labels.length); i++) {
    const f = trimPunct(forms[i]);
    if (!f) continue;
    infs.push({ form: f, tense: 'present', number: labels[i].number, gender: labels[i].gender, voice: null, aspect: null, person: null });
  }
  return infs;
}

const pronounFeatures: Record<string, { person: string; number: string; gender: string | null }> = {
  'אני': { person: '1', number: 'sg', gender: null },
  'אתה': { person: '2', number: 'sg', gender: 'm' },
  'את': { person: '2', number: 'sg', gender: 'f' },
  'הוא': { person: '3', number: 'sg', gender: 'm' },
  'היא': { person: '3', number: 'sg', gender: 'f' },
  'אנחנו': { person: '1', number: 'pl', gender: null },
  'אתם': { person: '2', number: 'pl', gender: 'm' },
  'אתן': { person: '2', number: 'pl', gender: 'f' },
  'הם': { person: '3', number: 'pl', gender: 'm' },
  'הן': { person: '3', number: 'pl', gender: 'f' },
};

function parsePastLine(line: string): InflectionSeed[] {
  const out: InflectionSeed[] = [];
  const parts = line.split(',').map(s => s.trim()).filter(Boolean);
  for (const p of parts) {
    const spaceIdx = p.indexOf(' ');
    if (spaceIdx <= 0) continue;
    const pron = trimPunct(p.slice(0, spaceIdx));
    const form = trimPunct(p.slice(spaceIdx + 1));
    if (!isHebrew(pron) || !isHebrew(form)) continue;
    const f = pronounFeatures[pron];
    if (!f) continue;
    out.push({ form, tense: 'past', person: f.person, number: f.number, gender: f.gender, voice: null, aspect: null });
  }
  return out;
}

export function detectBinyan(infinitive: string): string {
  const inf = infinitive.trim();
  if (/^להת/.test(inf)) return "hitpa'el";
  if (/^לה/.test(inf)) return "hif'il";
  if (/^להי/.test(inf)) return "huf'al";
  if (/^לנ/.test(inf) || /^להי/.test(inf)) return "nif'al";
  // Pi'el often has dagesh in middle root letter, hard to detect from text alone
  // Default to pa'al for standard ל + root patterns
  return "pa'al";
}

function inferNounGender(hebrewForm: string): string {
  // Common feminine endings: ה, ת, ית, ות
  if (/[הת]$/.test(hebrewForm) && !/^[אהוי]/.test(hebrewForm)) return 'f';
  if (/ית$/.test(hebrewForm)) return 'f';
  if (/ות$/.test(hebrewForm)) return 'f';
  // Default to masculine
  return 'm';
}

export function parseEnhancedVocabMarkdown(md: string): { cards: VocabCard[]; lexemes: LexemeSeed[] } {
  const cards = parseVocabMarkdown(md);
  const lines = md.split(/\r?\n/).map(s => s.trim()).filter(s => s.length > 0);
  const lexemes: LexemeSeed[] = [];
  let current: LexemeSeed | null = null;

  const flush = () => {
    if (current && current.lemma && current.inflections.length) {
      // Attach binyan to verb inflections
      if (current.pos === 'verb') {
        const binyan = detectBinyan(current.lemma);
        for (const inf of current.inflections) {
          if (!inf.binyan) inf.binyan = binyan;
        }
      }
      const key = current.lemma;
      const exists = lexemes.find(l => l.lemma === key);
      if (exists) {
        const seen = new Set(exists.inflections.map(i => i.form));
        for (const inf of current.inflections) {
          if (!seen.has(inf.form)) exists.inflections.push(inf);
        }
      } else {
        lexemes.push(current);
      }
    }
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    if (line.includes('=') && !/^=+$/.test(line)) {
      const [lhsRaw, rhsRaw] = line.split('=').map(s => trimPunct(s));
      const lhs = lhsRaw;
      const rhs = rhsRaw;
      if (lhs && rhs && isHebrew(rhs)) {
        const isVerb = /^to\s/i.test(lhs) && /^ל/.test(rhs);
        if (isVerb) {
          flush();
          current = { lemma: rhs, pos: 'verb', features: null, inflections: [] };
          continue;
        }
        const hebrewForms = splitCommaForms(rhs);
        if (hebrewForms.length === 4) {
          flush();
          current = { lemma: hebrewForms[0], pos: 'adjective', features: null, inflections: [] };
          current.inflections.push(...mapPresentForms(hebrewForms));
          flush();
          continue;
        }
        if (hebrewForms.length >= 1) {
          flush();
          const lemma = hebrewForms[0];
          const gender = inferNounGender(lemma);
          const inflections: InflectionSeed[] = [];
          // First form is singular
          inflections.push({ form: lemma, number: 'sg', gender });
          // If there are additional forms, treat as plural
          for (let fi = 1; fi < hebrewForms.length; fi++) {
            const plForm = hebrewForms[fi];
            const plGender = /ות$/.test(plForm) ? 'f' : /ים$/.test(plForm) ? 'm' : gender;
            inflections.push({ form: plForm, number: 'pl', gender: plGender });
          }
          current = { lemma, pos: 'untagged', features: { gender }, inflections };
          flush();
          continue;
        }
      }
    }

    if (line === '=' || line === '＝') {
      let nextHeb = '';
      for (let k = i + 1; k < lines.length; k++) {
        if (!lines[k]) continue;
        nextHeb = trimPunct(lines[k]);
        break;
      }
      if (nextHeb && isHebrew(nextHeb)) {
        flush();
        current = { lemma: nextHeb, pos: 'phrase', features: null, inflections: [{ form: nextHeb }] };
        flush();
      }
      continue;
    }

    if (/^הווה:?$/.test(line)) {
      const next = lines[i + 1] || '';
      const forms = splitCommaForms(next).filter(isHebrew);
      if (current && current.pos === 'verb' && forms.length) {
        current.inflections.push(...mapPresentForms(forms));
      }
      i++;
      continue;
    }

    if (/^עבר(?:\s+Passive)?:?$/.test(line)) {
      const voice = /Passive/.test(line) ? 'passive' : null;
      let k = i + 1;
      while (k < lines.length && lines[k] && !/[:=]$/.test(lines[k])) {
        const row = lines[k];
        if (isHebrew(row) && current && current.pos === 'verb') {
          const infs = parsePastLine(row).map(x => ({ ...x, voice }));
          if (infs.length) current.inflections.push(...infs);
        }
        k++;
      }
      i = k - 1;
      continue;
    }
  }
  flush();
  return { cards, lexemes };
}

export function readVocabFromRepoRoot(filename = 'Mike_Hebrew_Vocab.md'): VocabCard[] {
  try {
    const file = path.join(process.cwd(), '..', filename);
    const raw = fs.readFileSync(file, 'utf8');
    return parseVocabMarkdown(raw);
  } catch {
    return [];
  }
}

export function readEnhancedVocabFromRepoRoot(filename = 'Mike_Hebrew_Vocab.md'): { cards: VocabCard[]; lexemes: LexemeSeed[] } {
  try {
    const file = path.join(process.cwd(), '..', filename);
    const raw = fs.readFileSync(file, 'utf8');
    return parseEnhancedVocabMarkdown(raw);
  } catch {
    return { cards: [], lexemes: [] };
  }
}
