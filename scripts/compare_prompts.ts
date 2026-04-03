import fs from 'node:fs';
import path from 'node:path';
import Module from 'module';
import { PrismaClient } from '@prisma/client';

// Patch module resolution for '@/'
const origResolve = (Module as any)._resolveFilename as Function;
(Module as any)._resolveFilename = function patched(request: string, parent: any, isMain: boolean, options: any) {
  if (request && request.startsWith('@@/')) request = request.replace(/^@@\//, path.join(process.cwd(), 'Daber/'));
  else if (request && request.startsWith('@/')) request = request.replace(/^@\//, path.join(process.cwd(), 'Daber/'));
  return origResolve.call(this, request, parent, isMain, options);
};

import { PROMPT_TEMPLATES, PromptBuilderArgs } from '../Daber/lib/generation/prompts';
import { FUNCTION_WORD_ALLOWLIST, CORE_PROMPT_LEMMAS } from '../Daber/lib/generation/local_llm';
import { PREP_DISPLAY_MAP } from '../Daber/lib/types/governance';
import { buildVocabWhitelist } from '../Daber/lib/generation/local_llm';

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

function extractJson(raw: string): any {
  const tryParse = (s: string) => { try { return JSON.parse(s); } catch { return null; } };
  let obj = tryParse(raw);
  if (!obj) {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) obj = tryParse(fenced[1].trim());
  }
  if (!obj) {
    const braceMatch = raw.match(/\{[\s\S]*\}/);
    if (braceMatch) obj = tryParse(braceMatch[0]);
  }
  if (!obj) return null;
  if (Array.isArray(obj.items)) return obj;
  if ((obj as any).hebrew) return { items: [obj] };
  return null;
}

async function callOllama(prompt: string, ollamaUrl: string, model: string): Promise<{ content: string; ms: number }> {
  const body = { model, prompt, format: 'json', options: { temperature: 0.2, num_ctx: 1024, num_predict: 300 }, stream: false } as any;
  const t0 = Date.now();
  const resp = await fetch(`${ollamaUrl}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const ms = Date.now() - t0;
  if (!resp.ok) throw new Error(`Ollama HTTP ${resp.status}: ${await resp.text()}`);
  const data: any = await resp.json();
  return { content: data?.response || '', ms };
}

type TemplateResult = { template: string; attempted: number; accepted: number; json_format: number; script_mismatch: number; missing_target: number; governance: number; tense_violation: number; whitelist: number; avg_ms: number };

async function main() {
  const args = process.argv.slice(2);
  let templatesArg = 'baseline,core_plus';
  let targetsPath: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--templates' && args[i + 1]) { templatesArg = args[++i]; continue; }
    if (args[i] === '--targets' && args[i + 1]) { targetsPath = args[++i]; continue; }
  }
  const templateNames = templatesArg.split(',').map(s => s.trim()).filter(Boolean);
  const prisma = new PrismaClient();
  const outDir = path.join('scripts', 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `compare_${Date.now()}.json`);

  const ollamaUrl = (process.env.LOCAL_LLM_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const model = process.env.LOCAL_LLM_MODEL || 'dicta17-q4';

  // Build targets set
  let targetLexemes: Array<{ id: string; lemma: string; pos: string; gloss?: string | null }> = [];
  if (targetsPath) {
    const raw = JSON.parse(fs.readFileSync(targetsPath, 'utf8'));
    const lemmas: string[] = Array.isArray(raw?.lemmas) ? raw.lemmas.map(String) : [];
    const ids: string[] = Array.isArray(raw?.lexemeIds) ? raw.lexemeIds.map(String) : [];
    if (lemmas.length) {
      const rows = await prisma.lexeme.findMany({ where: { lemma: { in: lemmas } }, select: { id: true, lemma: true, pos: true, gloss: true } });
      targetLexemes = rows;
    } else if (ids.length) {
      const rows = await prisma.lexeme.findMany({ where: { id: { in: ids } }, select: { id: true, lemma: true, pos: true, gloss: true } });
      targetLexemes = rows;
    }
  }
  if (!targetLexemes.length) {
    // Default: use mini allowlist when available
    try {
      const p = path.join('Daber', 'data', 'mini_allowlist.json');
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      const ids: string[] = Array.isArray(raw?.lexemeIds) ? raw.lexemeIds.map(String) : [];
      if (ids.length) {
        const rows = await prisma.lexeme.findMany({ where: { id: { in: ids } }, select: { id: true, lemma: true, pos: true, gloss: true } });
        targetLexemes = rows;
      }
    } catch {}
  }
  if (!targetLexemes.length) {
    // Fallback: pick random common POS lexemes
    const rows = await prisma.lexeme.findMany({ where: { language: 'he', pos: { in: ['verb','noun','adjective','Q24905','Q1084','Q34698'] } }, take: 200, select: { id: true, lemma: true, pos: true, gloss: true } });
    targetLexemes = rows;
  }
  if (!targetLexemes.length) throw new Error('No target lexemes available');
  const targetLemmas = Array.from(new Set(targetLexemes.map(l => stripNikkud(l.lemma).trim()).filter(Boolean))).slice(0, 60);

  // Known lemmas context and gloss map
  const knownRows = await prisma.lexeme.findMany({ select: { lemma: true, gloss: true } });
  const knownLemmas = Array.from(new Set(knownRows.map(r => stripNikkud(r.lemma).trim()).filter(Boolean))).slice(0, 200);
  const glossByLemma = new Map<string, string>();
  for (const r of knownRows) {
    const k = stripNikkud(r.lemma).trim();
    const g = (r.gloss || '').trim();
    if (k && g) glossByLemma.set(k, g);
  }

  // Whitelist: all DB inflections + function words
  const allIds = (await prisma.lexeme.findMany({ select: { id: true } })).map(r => r.id);
  const whitelist = await buildVocabWhitelist(allIds);
  for (const fw of FUNCTION_WORD_ALLOWLIST) whitelist.add(fw);

  const allowedTenses = ['present','past','future'];
  const direction: PromptBuilderArgs['direction'] = 'he_to_en';

  const details: any[] = [];
  const summaries: TemplateResult[] = [];
  for (const name of templateNames) {
    const builder = PROMPT_TEMPLATES[name];
    if (!builder) {
      console.error(`Unknown template: ${name}`);
      continue;
    }
    const results: Array<{ target: string; ok: boolean; failures: Failure[]; ms: number; hebrew?: string; english?: string; raw?: string }> = [];
    let msTotal = 0;
    let attempted = 0;
    for (let i = 0; i < targetLemmas.length; i++) {
      const target = targetLemmas[i];
      const prompt = builder({ targetLemmas: [target], knownLemmas: Array.from(new Set([...CORE_PROMPT_LEMMAS, ...knownLemmas])).slice(0, 60), allowedTenses, direction, context: { glossByLemma } });
      let raw = '';
      let ms = 0;
      try {
        const resp = await callOllama(prompt, ollamaUrl, model);
        raw = resp.content; ms = resp.ms;
      } catch (e: any) {
        results.push({ target, ok: false, failures: ['http_error'], ms, raw: String(e?.message || e) });
        continue;
      }
      attempted++;
      msTotal += ms;
      const obj = extractJson(raw);
      const items = (obj && Array.isArray(obj.items)) ? obj.items : [];
      if (!items.length) {
        results.push({ target, ok: false, failures: ['json_format'], ms, raw });
        continue;
      }
      const it = items[0] as any;
      const heb = stripNikkud(String(it?.hebrew || ''));
      const eng = String(it?.english || '');
      const failures: Failure[] = [];
      if (!hebrewOk(heb) || !englishOk(eng)) failures.push('script_mismatch');
      // Target presence: check against DB inflections for that target lexeme when available
      const lexRow = await prisma.lexeme.findFirst({ where: { lemma: target }, select: { id: true, verb_governance: true } });
      if (lexRow?.id) {
        const infl = await prisma.inflection.findMany({ where: { lexeme_id: lexRow.id }, select: { form: true, tense: true } });
        const forms = infl.map(r => stripNikkud(r.form));
        const hNS = heb.replace(/\s+/g, '');
        const present = forms.some(f => hNS.includes(stripNikkud(f).replace(/\s+/g, '')));
        if (!present) failures.push('missing_target');
        // Governance check
        try {
          const gov: any = lexRow.verb_governance as any;
          if (gov && Array.isArray(gov.frames) && gov.frames.length) {
            const prep = gov.frames[0]?.prep;
            if (prep && prep !== 'none') {
              const mark = (PREP_DISPLAY_MAP as any)[prep] as string | undefined;
              if (mark && !heb.includes(mark)) failures.push('governance');
            }
          }
        } catch {}
      } else {
        failures.push('missing_target');
      }
      // Whitelist check
      const tokens = heb.trim().split(/\s+/).filter(Boolean);
      const prefixes = ['ה','ו','ב','ל','מ','כ','ש'];
      const ok = (tok: string) => whitelist.has(tok) || FUNCTION_WORD_ALLOWLIST.has(tok);
      for (const t of tokens) {
        if (ok(t)) continue;
        let matched = false;
        for (const p of prefixes) { if (t.startsWith(p) && ok(t.slice(p.length))) { matched = true; break; } }
        if (!matched) { failures.push('whitelist'); break; }
      }
      const accepted = failures.length === 0 || (failures.length === 1 && failures[0] === 'whitelist');
      results.push({ target, ok: accepted, failures, ms, hebrew: heb, english: eng });
    }

    const totals: any = { attempted, accepted: results.filter(r => r.ok).length };
    for (const f of ['http_error','json_format','script_mismatch','missing_target','governance','tense_violation','whitelist'] as Failure[]) {
      totals[f] = results.filter(r => r.failures.includes(f)).length;
    }
    const avg_ms = attempted ? Math.round(msTotal / attempted) : 0;
    summaries.push({ template: name, attempted: totals.attempted, accepted: totals.accepted, json_format: totals.json_format, script_mismatch: totals.script_mismatch, missing_target: totals.missing_target, governance: totals.governance, tense_violation: totals.tense_violation, whitelist: totals.whitelist, avg_ms });
    details.push({ template: name, totals: { ...totals, avg_ms }, results });
  }

  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), model, results: details }, null, 2), 'utf8');
  // Print compact summary
  const pad = (s: string, n: number) => (s + ' '.repeat(n)).slice(0, n);
  console.log(['TEMPLATE','OK','TOTAL','JSON','SCRIPT','TARGET','GOV','WL','AVG_MS'].map(h => pad(h, 10)).join(' '));
  for (const s of summaries) {
    console.log([
      pad(s.template, 10),
      pad(String(s.accepted), 10),
      pad(String(s.attempted), 10),
      pad(String(s.json_format), 10),
      pad(String(s.script_mismatch), 10),
      pad(String(s.missing_target), 10),
      pad(String(s.governance), 10),
      pad(String(s.whitelist), 10),
      pad(String(s.avg_ms), 10),
    ].join(' '));
  }
  console.log(`Wrote ${outPath}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

