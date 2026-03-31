import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../Daber/lib/db';

type POS = 'verb' | 'noun' | 'adjective';

type VerbGrid = {
  present: Array<{ form: string; number: string; gender: string|null }>;
  past: Array<{ form: string; person: string; number: string; gender: string|null }>;
  future: Array<{ form: string; person: string; number: string; gender: string|null }>;
};

type NounGrid = { sg?: { form: string; gender: string|null }, pl?: { form: string; gender: string|null } };
type AdjGrid = { msg?: string; fsg?: string; mpl?: string; fpl?: string };

function nowIso() { return new Date().toISOString(); }
function isHebrew(s: string) { return /[\u0590-\u05FF]/.test(s || ''); }
function isSingleToken(s: string) { return (s || '').trim().split(/\s+/).filter(Boolean).length === 1; }

function enPron(m: { person?: string|null, number?: string|null, gender?: string|null }): string {
  const p = (m.person || '').toString();
  const n = (m.number || '').toString();
  const g = (m.gender || '').toString();
  if (p === '1' && n === 'sg') return 'I';
  if (p === '1' && n === 'pl') return 'we';
  if (p === '2' && n === 'sg') return 'you';
  if (p === '2' && n === 'pl') return 'you (pl)';
  if (p === '3' && n === 'sg' && g === 'm') return 'he';
  if (p === '3' && n === 'sg' && g === 'f') return 'she';
  if (p === '3' && n === 'pl') return 'they';
  return 'they';
}
function hePron(m: { person?: string|null, number?: string|null, gender?: string|null }): string {
  const p = (m.person || '').toString();
  const n = (m.number || '').toString();
  const g = (m.gender || '').toString();
  if (p === '1' && n === 'sg') return 'אני';
  if (p === '1' && n === 'pl') return 'אנחנו';
  if (p === '2' && n === 'sg' && g === 'm') return 'אתה';
  if (p === '2' && n === 'sg' && g === 'f') return 'את';
  if (p === '2' && n === 'pl' && g === 'm') return 'אתם';
  if (p === '2' && n === 'pl' && g === 'f') return 'אתן';
  if (p === '3' && n === 'sg' && g === 'm') return 'הוא';
  if (p === '3' && n === 'sg' && g === 'f') return 'היא';
  if (p === '3' && n === 'pl') return 'הם';
  return 'הם';
}
function beFor(pron: string): string { if (pron === 'I') return 'am'; if (pron === 'he' || pron === 'she') return 'is'; return 'are'; }
function ing(v: string): string {
  const b = v.trim();
  if (!b) return b;
  if (/ie$/i.test(b)) return b.replace(/ie$/i, 'ying');
  if (/[^aeiou]e$/i.test(b)) return b.replace(/e$/i, 'ing');
  return b + 'ing';
}
function pastEn(v: string): string {
  const irregular: Record<string, string> = { write: 'wrote', speak: 'spoke', read: 'read', hear: 'heard' };
  const head = v.toLowerCase();
  return irregular[head] || (head.endsWith('e') ? head + 'd' : head + 'ed');
}
function futureEn(v: string) { return `will ${v}`; }

function readGreenIds(): string[] {
  const p = path.join(process.cwd(), 'Daber', 'data', 'green_lexemes.json');
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  const ids = Array.isArray(raw?.lexemeIds) ? raw.lexemeIds.map(String) : [];
  return ids.filter(Boolean);
}

function loadMiniAllowlist(): Set<string> {
  try {
    const p = path.join(process.cwd(), 'Daber', 'data', 'mini_allowlist.json');
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const ids = Array.isArray(raw?.lexemeIds) ? raw.lexemeIds.map(String) : [];
    return new Set(ids.filter(Boolean));
  } catch {
    return new Set<string>();
  }
}
function saveMiniAllowlist(set: Set<string>) {
  const p = path.join(process.cwd(), 'Daber', 'data', 'mini_allowlist.json');
  const obj = { generatedAt: nowIso(), note: 'Allowlist for vocab_mini_morph. Expanded via scripts/expand_mini_from_green.ts.', lexemeIds: Array.from(set) };
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
}

async function getPOS(lexPos: string): Promise<POS | null> {
  const p = (lexPos || '').toLowerCase();
  if (p === 'verb' || p === 'q24905') return 'verb';
  if (p === 'noun' || p === 'q1084') return 'noun';
  if (p === 'adjective' || p === 'q34698') return 'adjective';
  return null;
}

async function buildVerbGrid(lexemeId: string) : Promise<{ ok: true, grid: VerbGrid } | { ok: false, reason: string }> {
  const infls = await prisma.inflection.findMany({ where: { lexeme_id: lexemeId } });
  const present = infls.filter(i => (i.tense || '').toLowerCase() === 'present');
  const past = infls.filter(i => (i.tense || '').toLowerCase() === 'past');
  const future = infls.filter(i => (i.tense || '').toLowerCase() === 'future');

  const presReq = [ ['sg','m'], ['sg','f'], ['pl','m'], ['pl','f'] ] as const;
  const presForms: Array<{ form: string; number: string; gender: string|null }> = [];
  for (const [n,g] of presReq) {
    const f = present.find(i => (i.number||'') === n && (i.gender||'') === g);
    if (!f || !isSingleToken(f.form)) return { ok: false, reason: 'present_incomplete' };
    presForms.push({ form: f.form, number: n, gender: g });
  }

  const reqTriples = [
    ['1','sg',null], ['2','sg','m'], ['2','sg','f'], ['3','sg','m'], ['3','sg','f'],
    ['1','pl',null], ['2','pl',null], ['3','pl',null],
  ] as const;
  const pastForms: Array<{ form: string; person: string; number: string; gender: string|null }> = [];
  for (const [p, n, g] of reqTriples) {
    const cand = past.find(i => (i.person||'') === p && (i.number||'') === n && ((i.gender||null) === g));
    if (!cand || !isSingleToken(cand.form)) return { ok: false, reason: 'past_incomplete' };
    pastForms.push({ form: cand.form, person: p, number: n, gender: g });
  }

  const futureForms: Array<{ form: string; person: string; number: string; gender: string|null }> = [];
  for (const [p, n, g] of reqTriples) {
    const cand = future.find(i => (i.person||'') === p && (i.number||'') === n && ((i.gender||null) === g));
    if (!cand || !isSingleToken(cand.form)) return { ok: false, reason: 'future_incomplete' };
    futureForms.push({ form: cand.form, person: p, number: n, gender: g });
  }

  return { ok: true, grid: { present: presForms, past: pastForms, future: futureForms } };
}

async function buildAdjGrid(lexemeId: string): Promise<{ ok: true, grid: AdjGrid } | { ok: false, reason: string }> {
  const infls = await prisma.inflection.findMany({ where: { lexeme_id: lexemeId } });
  const msg = infls.find(i => (i.number||'') === 'sg' && (i.gender||'') === 'm');
  const fsg = infls.find(i => (i.number||'') === 'sg' && (i.gender||'') === 'f');
  const mpl = infls.find(i => (i.number||'') === 'pl' && (i.gender||'') === 'm');
  const fpl = infls.find(i => (i.number||'') === 'pl' && (i.gender||'') === 'f');
  if (!msg || !fsg || !mpl || !fpl) return { ok: false, reason: 'adjective_incomplete' };
  if (![msg.form,fsg.form,mpl.form,fpl.form].every(f => isSingleToken(f))) return { ok: false, reason: 'adjective_multiword' };
  return { ok: true, grid: { msg: msg.form, fsg: fsg.form, mpl: mpl.form, fpl: fpl.form } };
}

async function buildNounGrid(lexemeId: string): Promise<{ ok: true, grid: NounGrid } | { ok: false, reason: string }> {
  const infls = await prisma.inflection.findMany({ where: { lexeme_id: lexemeId } });
  const sg = infls.find(i => (i.number||'') === 'sg');
  const pl = infls.find(i => (i.number||'') === 'pl');
  if (!sg || !pl) return { ok: false, reason: 'noun_missing_number' };
  if (![sg.form, pl.form].every(f => isSingleToken(f))) return { ok: false, reason: 'noun_multiword' };
  return { ok: true, grid: { sg: { form: sg.form, gender: sg.gender || null }, pl: { form: pl.form, gender: pl.gender || null } } };
}

async function upsertLesson() {
  await prisma.lesson.upsert({
    where: { id: 'vocab_mini_morph' },
    update: { title: 'Mini Morph Drill', language: 'he', level: 'mini', type: 'vocab', description: 'Expanded mini sandbox (Green-derived) with full morphology' },
    create: { id: 'vocab_mini_morph', title: 'Mini Morph Drill', language: 'he', level: 'mini', type: 'vocab', description: 'Expanded mini sandbox (Green-derived) with full morphology' }
  });
}

async function main() {
  await upsertLesson();
  const greenIds = readGreenIds();
  const allow = loadMiniAllowlist();

  const added: any[] = [];
  const skipped: any[] = [];

  for (const id of greenIds) {
    try {
      const lex = await prisma.lexeme.findUnique({ where: { id }, select: { id: true, lemma: true, pos: true, gloss: true } });
      if (!lex) { skipped.push({ id, reason: 'lexeme_missing' }); continue; }
      const pos = await getPOS(lex.pos);
      if (!pos) { skipped.push({ id, lemma: lex.lemma, reason: 'pos_unsupported' }); continue; }
      if (!lex.gloss || /[\u0590-\u05FF]/.test(lex.gloss)) { skipped.push({ id, lemma: lex.lemma, reason: 'missing_or_nonlatin_gloss' }); continue; }

      if (pos === 'verb') {
        // Require infinitive form for base
        const inf = await prisma.inflection.findFirst({ where: { lexeme_id: id, tense: 'infinitive' } });
        if (!inf || !isSingleToken(inf.form)) { skipped.push({ id, lemma: lex.lemma, reason: 'verb_missing_infinitive' }); continue; }
        const grid = await buildVerbGrid(id);
        if (!grid.ok) { skipped.push({ id, lemma: lex.lemma, reason: grid.reason }); continue; }

        // Base
        await prisma.lessonItem.upsert({
          where: { id: `mini_${id.replace(/[:]/g,'_')}_base` },
          update: { lesson_id: 'vocab_mini_morph', english_prompt: `How do I say: to ${lex.gloss}?`, target_hebrew: inf.form, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['mini','verb','base'], difficulty: 1, lexeme_id: id, family_id: `lex:${id}`, family_base: true, features: { pos: 'verb', tense: 'infinitive' } as any },
          create: { id: `mini_${id.replace(/[:]/g,'_')}_base`, lesson_id: 'vocab_mini_morph', english_prompt: `How do I say: to ${lex.gloss}?`, target_hebrew: inf.form, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['mini','verb','base'], difficulty: 1, lexeme_id: id, family_id: `lex:${id}`, family_base: true, features: { pos: 'verb', tense: 'infinitive' } as any }
        });
        // Present
        for (const f of grid.grid.present) {
          const pron = hePron({ person: '3', number: f.number, gender: f.gender });
          const enPronoun = enPron({ person: '3', number: f.number, gender: f.gender });
          const vIng = ing(lex.gloss.replace(/^to\s+/i, ''));
          await prisma.lessonItem.upsert({
            where: { id: `mini_${id.replace(/[:]/g,'_')}_vpr_${f.number}_${f.gender||'na'}` },
            update: { lesson_id: 'vocab_mini_morph', english_prompt: `How do I say: ${enPronoun} ${beFor(enPronoun)} ${vIng}?`, target_hebrew: `${pron} ${f.form}`, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['mini','verb','present'], difficulty: 1, lexeme_id: id, family_id: `lex:${id}`, family_base: false, features: { pos: 'verb', tense: 'present', person: '3', number: f.number, gender: f.gender } as any },
            create: { id: `mini_${id.replace(/[:]/g,'_')}_vpr_${f.number}_${f.gender||'na'}`, lesson_id: 'vocab_mini_morph', english_prompt: `How do I say: ${enPronoun} ${beFor(enPronoun)} ${vIng}?`, target_hebrew: `${pron} ${f.form}`, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['mini','verb','present'], difficulty: 1, lexeme_id: id, family_id: `lex:${id}`, family_base: false, features: { pos: 'verb', tense: 'present', person: '3', number: f.number, gender: f.gender } as any }
          });
        }
        // Past
        for (const f of grid.grid.past) {
          const pron = hePron({ person: f.person, number: f.number, gender: f.gender });
          const enPronoun = enPron({ person: f.person, number: f.number, gender: f.gender });
          const vPast = pastEn(lex.gloss.replace(/^to\s+/i, ''));
          await prisma.lessonItem.upsert({
            where: { id: `mini_${id.replace(/[:]/g,'_')}_vpa_${f.person}_${f.number}_${f.gender||'na'}` },
            update: { lesson_id: 'vocab_mini_morph', english_prompt: `How do I say: ${enPronoun} ${vPast}?`, target_hebrew: `${pron} ${f.form}`, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['mini','verb','past'], difficulty: 1, lexeme_id: id, family_id: `lex:${id}`, family_base: false, features: { pos: 'verb', tense: 'past', person: f.person, number: f.number, gender: f.gender } as any },
            create: { id: `mini_${id.replace(/[:]/g,'_')}_vpa_${f.person}_${f.number}_${f.gender||'na'}`, lesson_id: 'vocab_mini_morph', english_prompt: `How do I say: ${enPronoun} ${vPast}?`, target_hebrew: `${pron} ${f.form}`, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['mini','verb','past'], difficulty: 1, lexeme_id: id, family_id: `lex:${id}`, family_base: false, features: { pos: 'verb', tense: 'past', person: f.person, number: f.number, gender: f.gender } as any }
          });
        }
        // Future
        for (const f of grid.grid.future) {
          const pron = hePron({ person: f.person, number: f.number, gender: f.gender });
          const enPronoun = enPron({ person: f.person, number: f.number, gender: f.gender });
          const vFuture = futureEn(lex.gloss.replace(/^to\s+/i, ''));
          await prisma.lessonItem.upsert({
            where: { id: `mini_${id.replace(/[:]/g,'_')}_vfu_${f.person}_${f.number}_${f.gender||'na'}` },
            update: { lesson_id: 'vocab_mini_morph', english_prompt: `How do I say: ${enPronoun} ${vFuture}?`, target_hebrew: `${pron} ${f.form}`, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['mini','verb','future'], difficulty: 1, lexeme_id: id, family_id: `lex:${id}`, family_base: false, features: { pos: 'verb', tense: 'future', person: f.person, number: f.number, gender: f.gender } as any },
            create: { id: `mini_${id.replace(/[:]/g,'_')}_vfu_${f.person}_${f.number}_${f.gender||'na'}`, lesson_id: 'vocab_mini_morph', english_prompt: `How do I say: ${enPronoun} ${vFuture}?`, target_hebrew: `${pron} ${f.form}`, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['mini','verb','future'], difficulty: 1, lexeme_id: id, family_id: `lex:${id}`, family_base: false, features: { pos: 'verb', tense: 'future', person: f.person, number: f.number, gender: f.gender } as any }
          });
        }

        allow.add(id);
        added.push({ id, lemma: lex.lemma, pos, gloss: lex.gloss, verb: grid.grid });
        continue;
      }

      if (pos === 'adjective') {
        const grid = await buildAdjGrid(id);
        if (!grid.ok) { skipped.push({ id, lemma: lex.lemma, reason: grid.reason }); continue; }
        // Base m.sg
        await prisma.lessonItem.upsert({
          where: { id: `mini_${id.replace(/[:]/g,'_')}_base` },
          update: { lesson_id: 'vocab_mini_morph', english_prompt: `How do I say: ${lex.gloss}?`, target_hebrew: grid.grid.msg!, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['mini','adjective','base'], difficulty: 1, lexeme_id: id, family_id: `lex:${id}`, family_base: true, features: { pos: 'adjective', number: 'sg', gender: 'm' } as any },
          create: { id: `mini_${id.replace(/[:]/g,'_')}_base`, lesson_id: 'vocab_mini_morph', english_prompt: `How do I say: ${lex.gloss}?`, target_hebrew: grid.grid.msg!, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['mini','adjective','base'], difficulty: 1, lexeme_id: id, family_id: `lex:${id}`, family_base: true, features: { pos: 'adjective', number: 'sg', gender: 'm' } as any }
        });
        // Variants
        const variants: Array<{ en: string; he: string; number: string; gender: string } > = [
          { en: `How do I say: he is ${lex.gloss}?`, he: `הוא ${grid.grid.msg!}`, number: 'sg', gender: 'm' },
          { en: `How do I say: she is ${lex.gloss}?`, he: `היא ${grid.grid.fsg!}`, number: 'sg', gender: 'f' },
          { en: `How do I say: they (m) are ${lex.gloss}?`, he: `הם ${grid.grid.mpl!}`, number: 'pl', gender: 'm' },
          { en: `How do I say: they (f) are ${lex.gloss}?`, he: `הן ${grid.grid.fpl!}`, number: 'pl', gender: 'f' },
        ];
        for (let i = 0; i < variants.length; i++) {
          const v = variants[i];
          await prisma.lessonItem.upsert({
            where: { id: `mini_${id.replace(/[:]/g,'_')}_adj_${i}` },
            update: { lesson_id: 'vocab_mini_morph', english_prompt: v.en, target_hebrew: v.he, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['mini','adjective'], difficulty: 1, lexeme_id: id, family_id: `lex:${id}`, family_base: false, features: { pos: 'adjective', number: v.number, gender: v.gender } as any },
            create: { id: `mini_${id.replace(/[:]/g,'_')}_adj_${i}`, lesson_id: 'vocab_mini_morph', english_prompt: v.en, target_hebrew: v.he, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['mini','adjective'], difficulty: 1, lexeme_id: id, family_id: `lex:${id}`, family_base: false, features: { pos: 'adjective', number: v.number, gender: v.gender } as any }
          });
        }
        allow.add(id);
        added.push({ id, lemma: lex.lemma, pos, gloss: lex.gloss, adjective: grid.grid });
        continue;
      }

      if (pos === 'noun') {
        const grid = await buildNounGrid(id);
        if (!grid.ok || !grid.grid.sg || !grid.grid.pl) { skipped.push({ id, lemma: lex.lemma, reason: (grid.ok ? 'noun_incomplete' : (grid as any).reason) }); continue; }
        // Base singular (no ה-)
        await prisma.lessonItem.upsert({
          where: { id: `mini_${id.replace(/[:]/g,'_')}_base` },
          update: { lesson_id: 'vocab_mini_morph', english_prompt: `How do I say: ${lex.gloss}?`, target_hebrew: grid.grid.sg.form.replace(/^ה+/, ''), transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['mini','noun','base'], difficulty: 1, lexeme_id: id, family_id: `lex:${id}`, family_base: true, features: { pos: 'noun', number: 'sg', gender: grid.grid.sg.gender || null } as any },
          create: { id: `mini_${id.replace(/[:]/g,'_')}_base`, lesson_id: 'vocab_mini_morph', english_prompt: `How do I say: ${lex.gloss}?`, target_hebrew: grid.grid.sg.form.replace(/^ה+/, ''), transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['mini','noun','base'], difficulty: 1, lexeme_id: id, family_id: `lex:${id}`, family_base: true, features: { pos: 'noun', number: 'sg', gender: grid.grid.sg.gender || null } as any }
        });
        // Definite sg and plural
        await prisma.lessonItem.upsert({
          where: { id: `mini_${id.replace(/[:]/g,'_')}_def` },
          update: { lesson_id: 'vocab_mini_morph', english_prompt: `How do I say: the ${lex.gloss}?`, target_hebrew: `ה${grid.grid.sg.form.replace(/^ה+/, '')}`, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['mini','noun','definite'], difficulty: 1, lexeme_id: id, family_id: `lex:${id}`, family_base: false, features: { pos: 'noun', number: 'sg', gender: grid.grid.sg.gender || null } as any },
          create: { id: `mini_${id.replace(/[:]/g,'_')}_def`, lesson_id: 'vocab_mini_morph', english_prompt: `How do I say: the ${lex.gloss}?`, target_hebrew: `ה${grid.grid.sg.form.replace(/^ה+/, '')}`, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['mini','noun','definite'], difficulty: 1, lexeme_id: id, family_id: `lex:${id}`, family_base: false, features: { pos: 'noun', number: 'sg', gender: grid.grid.sg.gender || null } as any }
        });
        await prisma.lessonItem.upsert({
          where: { id: `mini_${id.replace(/[:]/g,'_')}_pl` },
          update: { lesson_id: 'vocab_mini_morph', english_prompt: `How do I say: ${lex.gloss}s (plural)?`, target_hebrew: grid.grid.pl.form, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['mini','noun','plural'], difficulty: 1, lexeme_id: id, family_id: `lex:${id}`, family_base: false, features: { pos: 'noun', number: 'pl', gender: grid.grid.pl.gender || null } as any },
          create: { id: `mini_${id.replace(/[:]/g,'_')}_pl`, lesson_id: 'vocab_mini_morph', english_prompt: `How do I say: ${lex.gloss}s (plural)?`, target_hebrew: grid.grid.pl.form, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['mini','noun','plural'], difficulty: 1, lexeme_id: id, family_id: `lex:${id}`, family_base: false, features: { pos: 'noun', number: 'pl', gender: grid.grid.pl.gender || null } as any }
        });
        allow.add(id);
        added.push({ id, lemma: lex.lemma, pos, gloss: lex.gloss, noun: grid.grid });
        continue;
      }
    } catch (e: any) {
      skipped.push({ id, reason: e?.message || 'error' });
    }
  }

  // Persist updated allowlist
  saveMiniAllowlist(allow);

  // Emit report
  const outDir = path.join(process.cwd(), 'scripts', 'out');
  try { fs.mkdirSync(outDir, { recursive: true }); } catch {}
  const outPath = path.join(outDir, `mini_expand_report_${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: nowIso(), addedCount: added.length, skippedCount: skipped.length, added, skipped }, null, 2), 'utf8');
  // eslint-disable-next-line no-console
  console.log(`Mini expansion complete. Added=${added.length} Skipped=${skipped.length}. Report at ${outPath}`);

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error('Expansion failed:', e?.message || e); try { await prisma.$disconnect(); } catch {} process.exit(1); });

