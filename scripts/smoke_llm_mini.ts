import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import Module from 'module';
// Patch module resolution for '@/'
const origResolve = (Module as any)._resolveFilename as Function;
(Module as any)._resolveFilename = function patched(request: string, parent: any, isMain: boolean, options: any) {
  if (request && request.startsWith('@@/')) request = request.replace(/^@@\//, path.join(process.cwd(), 'Daber/'));
  else if (request && request.startsWith('@/')) request = request.replace(/^@\//, path.join(process.cwd(), 'Daber/'));
  return origResolve.call(this, request, parent, isMain, options);
};

import { buildBatchPrompt, FUNCTION_WORD_ALLOWLIST, CORE_PROMPT_LEMMAS } from '../Daber/lib/generation/local_llm';
import { PREP_DISPLAY_MAP } from '../Daber/lib/types/governance';

type Failure = 'http_error' | 'json_format' | 'script_mismatch' | 'missing_target' | 'governance' | 'tense_violation' | 'whitelist';

function stripNikkud(s: string): string { return (s || '').replace(/[\u0591-\u05C7]/g, ''); }
function containsHebrew(s: string): boolean { return /[\u0590-\u05FF]/.test(s || ''); }
function containsLatin(s: string): boolean { return /[A-Za-z]/.test(s || ''); }
function englishOk(s: string): boolean { return !!s && !containsHebrew(s) && containsLatin(s); }
function hebrewOk(s: string): boolean { return !!s && containsHebrew(s) && !containsLatin(s); }
function escapeRegex(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function includesWholeForm(hay: string, form: string) {
  const f = escapeRegex(form);
  const re = new RegExp(`(^|[^\\u0590-\\u05FF])${f}(?![\\u0590-\\u05FF])`);
  return re.test(hay);
}

function passesWhitelist(he: string, whitelist: Set<string>): boolean {
  const tokens = he.trim().split(/\s+/).filter(Boolean);
  const prefixes = ['ה','ו','ב','ל','מ','כ','ש'];
  const ok = (tok: string) => whitelist.has(tok) || FUNCTION_WORD_ALLOWLIST.has(tok);
  for (const t of tokens) {
    if (ok(t)) continue;
    let matched = false;
    for (const p of prefixes) {
      if (t.startsWith(p) && ok(t.slice(p.length))) { matched = true; break; }
    }
    if (!matched) return false;
  }
  return true;
}

async function buildWhitelist(prisma: PrismaClient, lemmaIds: string[]): Promise<Set<string>> {
  const infl = lemmaIds.length ? await prisma.inflection.findMany({ where: { lexeme_id: { in: lemmaIds } }, select: { form: true } }) : [];
  const set = new Set<string>();
  for (const row of infl) set.add(stripNikkud(row.form));
  for (const fw of FUNCTION_WORD_ALLOWLIST) set.add(fw);
  return set;
}

async function main() {
  const prisma = new PrismaClient();
  const outDir = path.join('scripts', 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `smoke_mini_${Date.now()}.json`);

  // Load mini allowlist
  const mini = JSON.parse(fs.readFileSync(path.join('Daber', 'data', 'mini_allowlist.json'), 'utf8'));
  const lexemeIds: string[] = Array.isArray(mini?.lexemeIds) ? mini.lexemeIds.map(String) : [];
  if (!lexemeIds.length) throw new Error('Mini allowlist empty');

  // Fetch lexemes
  const lexRows = await prisma.lexeme.findMany({ where: { id: { in: lexemeIds } }, select: { id: true, lemma: true, pos: true, verb_governance: true } });
  const lemmaById = new Map(lexRows.map(r => [r.id, stripNikkud(r.lemma).trim()] as const));
  const idByLemma = new Map(lexRows.map(r => [stripNikkud(r.lemma).trim(), r.id] as const));

  // Pick up to 50 target lemmas (favor verbs/nouns/adjectives)
  const candidates = lexRows.filter(r => ['verb','noun','adjective','Q24905','Q1084','Q34698'].includes((r.pos || '').toString()));
  const chosen = new Set<string>();
  for (const r of candidates) { if (chosen.size >= 50) break; chosen.add(stripNikkud(r.lemma).trim()); }
  const targetLemmas = Array.from(chosen);
  if (!targetLemmas.length) throw new Error('No target lemmas selected');

  // Known lemma ids for whitelist = core pack (by lemma) + a sample of other mini lemmas
  const coreIds = CORE_PROMPT_LEMMAS.map(l => idByLemma.get(l)).filter(Boolean) as string[];
  const otherIds = lexRows.map(r => r.id).filter(id => !coreIds.includes(id));
  const sampleCount = Math.max(0, Math.min(20, otherIds.length));
  const sampleIds: string[] = [];
  for (let i = 0; i < otherIds.length && sampleIds.length < sampleCount; i++) {
    const idx = Math.floor(Math.random() * otherIds.length);
    const v = otherIds[idx];
    if (!sampleIds.includes(v)) sampleIds.push(v);
  }
  const knownLemmaIds = Array.from(new Set([...coreIds, ...sampleIds]));
  const whitelist = await buildWhitelist(prisma, knownLemmaIds);

  // Preload inflections for all target lexemes for validation
  const infRows = await prisma.inflection.findMany({ where: { lexeme_id: { in: lexRows.map(r => r.id) } }, select: { lexeme_id: true, form: true, tense: true } });
  const formsByLex = new Map<string, { forms: string[]; tenses: Record<string, Set<string>> }>();
  for (const row of infRows) {
    const rec = formsByLex.get(row.lexeme_id) || { forms: [], tenses: {} };
    const form = stripNikkud(row.form);
    rec.forms.push(form);
    const ten = row.tense || 'unknown';
    if (!rec.tenses[ten]) rec.tenses[ten] = new Set<string>();
    rec.tenses[ten].add(form);
    formsByLex.set(row.lexeme_id, rec);
  }

  // OpenAI setup
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const apiKey = process.env.OPENAI_API_KEY || '';
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  if (!apiKey && baseUrl.includes('api.openai.com')) throw new Error('OPENAI_API_KEY required');

  // Iterate targets in small batches (for prompt construction reusing core and sample)
  const results: Array<{ target: string; ok: boolean; failures: Failure[]; hebrew?: string; english?: string; raw?: string } > = [];
  for (const targetLemma of targetLemmas) {
    const prompt = buildBatchPrompt({ targetLemmas: [targetLemma], knownLemmas: CORE_PROMPT_LEMMAS, allowedTenses: ['present','past','future'], direction: 'he_to_en' });
    // Call OpenAI chat completion
    let content = '';
    try {
      const resp = await fetch(baseUrl + '/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(apiKey ? { 'authorization': `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: '' },
            { role: 'user', content: prompt }
          ]
        })
      });
      const data: any = await resp.json();
      content = data?.choices?.[0]?.message?.content || '';
      if (!content && data?.error) content = JSON.stringify(data);
    } catch (e: any) {
      results.push({ target: targetLemma, ok: false, failures: ['http_error'], raw: String(e?.message || e) });
      continue;
    }
    // Parse
    let obj: any = null;
    try { obj = JSON.parse(content); } catch {}
    const items = (obj && Array.isArray(obj.items)) ? obj.items : [];
    if (!items.length) { results.push({ target: targetLemma, ok: false, failures: ['json_format'], raw: content }); continue; }
    const it = items[0] as any;
    const heb = stripNikkud(String(it?.hebrew || ''));
    const eng = String(it?.english || '');
    const tw = stripNikkud(String(it?.target_word || ''));
    const failures: Failure[] = [];
    if (!hebrewOk(heb) || !englishOk(eng)) failures.push('script_mismatch');
    const lexId = idByLemma.get(tw);
    if (!lexId) { failures.push('missing_target'); results.push({ target: targetLemma, ok: false, failures, raw: content }); continue; }
    const rec = formsByLex.get(lexId) || { forms: [], tenses: {} };
    const present = rec.forms.some(f => heb.replace(/\s+/g,'').includes(stripNikkud(f).replace(/\s+/g,'')));
    if (!present) failures.push('missing_target');
    // Governance
    try {
      const lex = lexRows.find(l => l.id === lexId);
      const gov: any = lex?.verb_governance as any;
      if (gov && Array.isArray(gov.frames) && gov.frames.length) {
        const prep = gov.frames[0]?.prep;
        if (prep && prep !== 'none') {
          const mark = (PREP_DISPLAY_MAP as any)[prep] as string | undefined;
          if (mark && !heb.includes(mark)) failures.push('governance');
        }
      }
    } catch {}
    // Tense gate (allow all in smoke test)
    // Whitelist
    if (!passesWhitelist(heb, whitelist)) failures.push('whitelist');
    const ok = failures.length === 0;
    results.push({ target: targetLemma, ok, failures, hebrew: heb, english: eng });
  }

  // Summarize
  const totals = { attempted: results.length, accepted: results.filter(r => r.ok).length } as any;
  for (const f of ['http_error','json_format','script_mismatch','missing_target','governance','tense_violation','whitelist'] as Failure[]) {
    totals[f] = results.filter(r => r.failures.includes(f)).length;
  }
  const out = { generatedAt: new Date().toISOString(), totals, results };
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`Mini smoke: accepted ${totals.accepted}/${totals.attempted} | json ${totals.json_format} | script ${totals.script_mismatch} | tgt ${totals.missing_target} | gov ${totals.governance} | whitelist ${totals.whitelist}`);
  console.log(`Wrote ${outPath}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
