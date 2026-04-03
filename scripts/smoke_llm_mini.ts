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

function buildFewShotPrompt(params: { targetLemma: string; vocabList: string[] }): string {
  const vocabStr = params.vocabList.join(', ');
  return [
    `Hebrew drill author. For the target word, write one JSON object with hebrew sentence (4-8 words, no nikkud), english translation, and target_word. The sentence MUST use the target word or an inflected form of it.`,
    `Allowed words: ${vocabStr}, plus pronouns and prepositions.`,
    ``,
    `{"items":[{"hebrew":"הוא כותב את הספר החדש","english":"He is writing the new book","target_word":"לכתוב"}]}`,
    `{"items":[{"hebrew":"הבית הגדול מאוד יפה","english":"The big house is very beautiful","target_word":"גדול"}]}`,
    `{"items":[{"hebrew":"אני שומע שיר יפה ברחוב","english":"I hear a beautiful song in the street","target_word":"לשמוע"}]}`,
    `{"items":[{"hebrew":"היא קונה גלידה בחנות","english":"She is buying ice cream at the store","target_word":"גלידה"}]}`,
    `{"items":[{"hebrew":"החבר החכם קורא ספר חדש","english":"The smart friend is reading a new book","target_word":"חכם"}]}`,
    ``,
    `Target: ${params.targetLemma}`,
  ].join('\n');
}

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
  if (obj.hebrew) return { items: [obj] };
  return null;
}

type Provider = 'ollama' | 'openai';

async function callOllama(prompt: string, ollamaUrl: string, model: string): Promise<string> {
  const body = {
    model,
    prompt,
    format: 'json',
    options: { temperature: 0.2, num_ctx: 1024, num_predict: 300 },
    stream: false,
  };
  const resp = await fetch(`${ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Ollama HTTP ${resp.status}: ${await resp.text()}`);
  const data: any = await resp.json();
  return data?.response || '';
}

async function callOpenAI(prompt: string, baseUrl: string, apiKey: string, model: string): Promise<string> {
  const resp = await fetch(baseUrl + '/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(apiKey ? { 'authorization': `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: '' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  const data: any = await resp.json();
  const content = data?.choices?.[0]?.message?.content || '';
  if (!content && data?.error) return JSON.stringify(data);
  return content;
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const provider: Provider = (process.env.SMOKE_PROVIDER || 'ollama') as Provider;

  const ollamaUrl = (process.env.LOCAL_LLM_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const ollamaModel = process.env.LOCAL_LLM_MODEL || 'dicta17-q4';

  const openaiBaseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const openaiKey = process.env.OPENAI_API_KEY || '';
  const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (provider === 'openai' && !openaiKey && openaiBaseUrl.includes('api.openai.com')) {
    throw new Error('OPENAI_API_KEY required when SMOKE_PROVIDER=openai');
  }

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

  // Whitelist: all DB inflections + all vocab pool lemmas as bare tokens
  // Smoke test measures generation quality, not strict production whitelist
  const allDbLexemes = await prisma.lexeme.findMany({ select: { id: true } });
  const knownLemmaIds = allDbLexemes.map(r => r.id);
  const whitelist = await buildWhitelist(prisma, knownLemmaIds);
  // Also allow all mini allowlist lemmas as bare tokens (many lack inflection rows)
  for (const r of lexRows) whitelist.add(stripNikkud(r.lemma).trim());

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

  // Build vocab list for few-shot prompt (all known lemmas as context)
  const knownLemmaStrs = await (async () => {
    const rows = knownLemmaIds.length ? await prisma.lexeme.findMany({ where: { id: { in: knownLemmaIds } }, select: { lemma: true } }) : [];
    return rows.map(r => stripNikkud(r.lemma).trim()).filter(Boolean);
  })();
  const miniLemmaStrs = lexRows.map(r => stripNikkud(r.lemma).trim()).filter(Boolean);
  const vocabPool = Array.from(new Set([...CORE_PROMPT_LEMMAS, ...miniLemmaStrs, ...knownLemmaStrs])).slice(0, 60);

  // --dry-run: print first prompt and exit
  if (isDryRun) {
    const prompt = provider === 'ollama'
      ? buildFewShotPrompt({ targetLemma: targetLemmas[0], vocabList: vocabPool })
      : buildBatchPrompt({ targetLemmas: [targetLemmas[0]], knownLemmas: CORE_PROMPT_LEMMAS, allowedTenses: ['present','past','future'], direction: 'he_to_en' });
    console.log(`Provider: ${provider} | Model: ${provider === 'ollama' ? ollamaModel : openaiModel}`);
    console.log(`Targets: ${targetLemmas.length} lemmas (showing first)`);
    console.log('---');
    console.log(prompt);
    await prisma.$disconnect();
    return;
  }

  console.log(`Provider: ${provider} | Model: ${provider === 'ollama' ? ollamaModel : openaiModel} | Targets: ${targetLemmas.length}`);

  // Iterate targets one at a time
  const results: Array<{ target: string; ok: boolean; failures: Failure[]; hebrew?: string; english?: string; raw?: string }> = [];
  for (let i = 0; i < targetLemmas.length; i++) {
    const targetLemma = targetLemmas[i];
    const prompt = provider === 'ollama'
      ? buildFewShotPrompt({ targetLemma, vocabList: vocabPool })
      : buildBatchPrompt({ targetLemmas: [targetLemma], knownLemmas: CORE_PROMPT_LEMMAS, allowedTenses: ['present','past','future'], direction: 'he_to_en' });
    let raw = '';
    try {
      if (provider === 'ollama') {
        raw = await callOllama(prompt, ollamaUrl, ollamaModel);
      } else {
        raw = await callOpenAI(prompt, openaiBaseUrl, openaiKey, openaiModel);
      }
    } catch (e: any) {
      results.push({ target: targetLemma, ok: false, failures: ['http_error'], raw: String(e?.message || e) });
      process.stdout.write(`[${i + 1}/${targetLemmas.length}] ${targetLemma} -> HTTP_ERROR\n`);
      continue;
    }
    // Parse JSON (handle raw text, markdown fences, preamble)
    const obj = extractJson(raw);
    const items = (obj && Array.isArray(obj.items)) ? obj.items : [];
    if (!items.length) {
      results.push({ target: targetLemma, ok: false, failures: ['json_format'], raw });
      process.stdout.write(`[${i + 1}/${targetLemmas.length}] ${targetLemma} -> json_format\n`);
      continue;
    }
    const it = items[0] as any;
    const heb = stripNikkud(String(it?.hebrew || ''));
    const eng = String(it?.english || '');
    const failures: Failure[] = [];
    if (!hebrewOk(heb)) { failures.push('script_mismatch'); results.push({ target: targetLemma, ok: false, failures, raw }); process.stdout.write(`[${i + 1}/${targetLemmas.length}] ${targetLemma} -> script_mismatch (no hebrew)\n`); continue; }
    if (!englishOk(eng)) failures.push('script_mismatch');
    // Always validate against the requested target, not model's target_word
    const lexId = idByLemma.get(targetLemma);
    if (!lexId) { failures.push('missing_target'); results.push({ target: targetLemma, ok: false, failures, raw }); process.stdout.write(`[${i + 1}/${targetLemmas.length}] ${targetLemma} -> missing_target (no lexeme)\n`); continue; }
    const rec = formsByLex.get(lexId) || { forms: [], tenses: {} };
    const allForms = [...rec.forms, targetLemma];
    const hNS = heb.replace(/\s+/g, '');
    const present = allForms.some(f => hNS.includes(stripNikkud(f).replace(/\s+/g, '')));
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
    // Whitelist (tracked but not blocking — smoke test measures generation quality)
    const wlPass = passesWhitelist(heb, whitelist);
    if (!wlPass) failures.push('whitelist');
    const ok = failures.filter(f => f !== 'whitelist').length === 0;
    results.push({ target: targetLemma, ok, failures, hebrew: heb, english: eng });
    process.stdout.write(`[${i + 1}/${targetLemmas.length}] ${targetLemma} -> ${ok ? 'OK' : failures.join(',')}\n`);
  }

  // Summarize
  const totals = { attempted: results.length, accepted: results.filter(r => r.ok).length } as any;
  for (const f of ['http_error','json_format','script_mismatch','missing_target','governance','tense_violation','whitelist'] as Failure[]) {
    totals[f] = results.filter(r => r.failures.includes(f)).length;
  }
  // Find dominant failure reason
  const failureCounts: Record<string, number> = {};
  for (const r of results) { for (const f of r.failures) { failureCounts[f] = (failureCounts[f] || 0) + 1; } }
  const dominantFailure = Object.entries(failureCounts).sort((a, b) => b[1] - a[1])[0];
  const summary = totals.accepted === totals.attempted
    ? `All ${totals.attempted} accepted.`
    : `Accepted ${totals.accepted}/${totals.attempted}. Dominant failure: ${dominantFailure ? `${dominantFailure[0]} (${dominantFailure[1]})` : 'none'}.`;

  const out = { generatedAt: new Date().toISOString(), provider, model: provider === 'ollama' ? ollamaModel : openaiModel, summary, totals, results };
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`\n${summary}`);
  console.log(`Mini smoke: accepted ${totals.accepted}/${totals.attempted} | json ${totals.json_format} | script ${totals.script_mismatch} | tgt ${totals.missing_target} | gov ${totals.governance} | whitelist ${totals.whitelist}`);
  console.log(`Wrote ${outPath}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
