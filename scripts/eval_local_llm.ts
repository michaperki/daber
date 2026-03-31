/**
 * Local LLM Eval Harness (Green/Mini subset)
 *
 * Supports providers:
 *  - ollama (default): POST /api/chat with format: "json"
 *  - openai: OpenAI-compatible /v1/chat/completions with response_format json_object
 *
 * Usage examples:
 *  - ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/eval_local_llm.ts \
 *      --provider ollama --host http://localhost:11434 \
 *      --models "gemma3-4b-q4,dictalm-1.7b-q4" \
 *      --in docs/eval/testset_mini_green.json
 *
 *  - OPENAI_BASE_URL=http://localhost:8000/v1 OPENAI_API_KEY=sk-no-key-required \
 *    ts-node -P scripts/tsconfig.scripts.json --transpile-only scripts/eval_local_llm.ts \
 *      --provider openai \
 *      --models "google/gemma-3-4b-it" \
 *      --in docs/eval/testset_mini_green.json
 */

import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { buildBatchPrompt, FUNCTION_WORD_ALLOWLIST } from '@/lib/generation/local_llm';

type Provider = 'ollama' | 'openai';

const args = parseArgs(process.argv.slice(2));

const provider: Provider = (args.provider as Provider) || 'ollama';
const host: string = args.host || (provider === 'ollama' ? 'http://localhost:11434' : process.env.OPENAI_BASE_URL || 'http://localhost:8000/v1');
const ollamaMode: 'chat' | 'generate' = (args['ollama-mode'] as any) === 'chat' ? 'chat' : 'generate';
const modelNames: string[] = (args.models || '').split(',').map(s => s.trim()).filter(Boolean);
const inPath = args.in || 'docs/eval/testset_mini_green.json';
const outPath = args.out || path.join('scripts', 'out', `eval_${Date.now()}.json`);
const temperature = args.temperature ? Number(args.temperature) : 0.2;

if (!modelNames.length) {
  console.error('Error: --models must list one or more model names (comma-separated)');
  process.exit(1);
}

const testSetRaw = fs.readFileSync(inPath, 'utf8');
const testSet: TestSet = JSON.parse(testSetRaw);

// Ensure out dir exists
fs.mkdirSync(path.dirname(outPath), { recursive: true });

type TestCase = {
  id: string;
  description: string;
  target_lemma: string;
  subject?: string;
  known_words?: string[];
  required_forms: string[]; // Hebrew substrings that must appear
  forbidden_forms?: string[]; // Hebrew substrings that must not appear
  agreement_checks?: Array<{ name: string; must_not_coexist: [string, string]; }>; // both present => bad agreement
};

type TestSet = { name: string; cases: TestCase[] };

const zItem = z.object({
  hebrew: z.string().min(1),
  english: z.string().min(1),
  target_word: z.string().min(1),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  drill_type: z.enum(['he_to_en', 'en_to_he']).optional(),
  grammar_focus: z.string().optional().nullable()
});

const zResponse = z.object({ items: z.array(zItem).min(1) });

function stripNikkud(s: string): string {
  return s.replace(/[\u0591-\u05C7]/g, '');
}
function containsHebrew(s: string): boolean { return /[\u0590-\u05FF]/.test(s); }
function containsLatin(s: string): boolean { return /[A-Za-z]/.test(s); }
function englishOk(s: string): boolean { return !containsHebrew(s) && /[A-Za-z]/.test(s); }
function hebrewOk(s: string): boolean { return containsHebrew(s) && !/[A-Za-z]/.test(s); }

type Failure = 'json_format' | 'script_mismatch' | 'missing_required_vocab' | 'wrong_tense_or_form' | 'bad_agreement' | 'unnatural' | 'bad_english';

type EvalResult = {
  model: string;
  provider: Provider;
  temperature: number;
  host: string;
  testSet: string;
  totals: Record<string, number> & { attempted: number; accepted: number; avg_latency_ms: number };
  cases: Array<{
    caseId: string;
    description: string;
    item?: z.infer<typeof zItem>;
    ok: boolean;
    failures: Failure[];
    raw?: string;
    latency_ms: number;
  }>;
};

async function main() {
  const results: EvalResult[] = [];
  for (const model of modelNames) {
    const totals: EvalResult['totals'] = {
      attempted: 0, accepted: 0, avg_latency_ms: 0,
      json_format: 0, script_mismatch: 0, missing_required_vocab: 0, wrong_tense_or_form: 0, bad_agreement: 0, unnatural: 0, bad_english: 0
    };
    const perCase: EvalResult['cases'] = [];

    for (const tc of testSet.cases) {
      totals.attempted++;
      const started = Date.now();
      const { parsed, item, raw } = await callOnce(provider, host, model, temperature, buildPrompt(tc));
      const latency = Date.now() - started;
      if (!parsed) {
        totals.json_format++;
        perCase.push({ caseId: tc.id, description: tc.description, ok: false, failures: ['json_format'], raw, latency_ms: latency });
        continue;
      }
      if (!item) {
        totals.json_format++;
        perCase.push({ caseId: tc.id, description: tc.description, ok: false, failures: ['json_format'], raw, latency_ms: latency });
        continue;
      }
      // Normalize/strip
      item.hebrew = stripNikkud(item.hebrew);
      const failures: Failure[] = [];
      if (!hebrewOk(item.hebrew)) failures.push('script_mismatch');
      if (!englishOk(item.english) || /how do i say/i.test(item.english)) failures.push('bad_english');
      // required / forbidden with normalization and whole-form checks
      const heb = item.hebrew;
      const hebNS = heb.replace(/\s+/g, '');
      for (const req of tc.required_forms) {
        const reqNS = req.replace(/\s+/g, '');
        if (!hebNS.includes(reqNS)) failures.push('missing_required_vocab');
      }
      for (const bad of tc.forbidden_forms || []) {
        if (includesWholeForm(heb, bad)) failures.push('wrong_tense_or_form');
      }
      for (const chk of (tc.agreement_checks || [])) {
        const [a, b] = chk.must_not_coexist;
        if (heb.includes(a) && includesWholeForm(heb, b)) failures.push('bad_agreement');
      }
      // very rough unnatural heuristic: overly long or punctuation noise
      const tokens = heb.trim().split(/\s+/);
      if (tokens.length > 14 || /[!?]{2,}|\.{3,}/.test(heb)) failures.push('unnatural');

      if (!failures.length) {
        totals.accepted++;
      } else {
        for (const f of failures) totals[f]++;
      }
      perCase.push({ caseId: tc.id, description: tc.description, item, ok: failures.length === 0, failures, raw, latency_ms: latency });
    }

    const avg = perCase.length ? Math.round(perCase.reduce((s, c) => s + c.latency_ms, 0) / perCase.length) : 0;
    totals.avg_latency_ms = avg;
    results.push({ model, provider, temperature, host, testSet: testSet.name, totals, cases: perCase });
  }

  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2), 'utf8');
  // Print compact summary
  for (const r of results) {
    console.log(`[${r.provider}] ${r.model}: accepted ${r.totals.accepted}/${r.totals.attempted} | json ${r.totals.json_format} | vocab ${r.totals.missing_required_vocab} | tense ${r.totals.wrong_tense_or_form} | agree ${r.totals.bad_agreement} | eng ${r.totals.bad_english} | avg ${r.totals.avg_latency_ms}ms`);
  }
  console.log(`Wrote ${outPath}`);
}

function buildPrompt(tc: TestCase) {
  // Reuse shared batch prompt builder with a single target
  const prompt = buildBatchPrompt({
    targetLemmas: [tc.target_lemma],
    knownLemmas: tc.known_words || [],
    allowedTenses: ['present','past','future'],
    direction: 'he_to_en'
  });
  // For generate mode, we combine system+user into a single prompt; here we just return a minimal container
  return { sys: '', user: prompt };
}

async function callOnce(provider: Provider, host: string, model: string, temperature: number, prompt: { sys: string; user: any }) {
  try {
    if (provider === 'ollama') {
      if (ollamaMode === 'generate') {
        const u = typeof prompt.user === 'string' ? prompt.user : JSON.stringify(prompt.user);
        const combined = `${prompt.sys}\n\n${u}`;
        const resp = await fetch(host.replace(/\/$/, '') + '/api/generate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model, prompt: combined, options: { temperature }, format: 'json', stream: false })
        });
        const data = await resp.json();
        const content = data?.response || '';
        return parseResponse(content);
      } else {
        const resp = await fetch(host.replace(/\/$/, '') + '/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: prompt.sys },
              { role: 'user', content: JSON.stringify(prompt.user) }
            ],
            options: { temperature },
            format: 'json'
          })
        });
        const data = await resp.json();
        const content = data?.message?.content || '';
        return parseResponse(content);
      }
    } else {
      const body = {
        model,
        temperature,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: prompt.sys },
          { role: 'user', content: JSON.stringify(prompt.user) }
        ]
      };
      const url = host.replace(/\/$/, '') + '/chat/completions';
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${process.env.OPENAI_API_KEY || 'sk-no-key-required'}`
        },
        body: JSON.stringify(body)
      });
      const data = await resp.json();
      const content = data?.choices?.[0]?.message?.content || '';
      return parseResponse(content);
    }
  } catch (e: any) {
    return { parsed: false as const, item: null, raw: String(e?.message || e) };
  }
}

function parseResponse(content: string): { parsed: boolean; item: z.infer<typeof zItem> | null; raw: string } {
  // Try direct
  const attempt = (s: string) => {
    try {
      const obj = JSON.parse(s);
      const parsed = zResponse.safeParse(obj);
      if (parsed.success) return parsed.data.items[0];
      return null;
    } catch { return null; }
  };
  let item = attempt(content);
  if (!item) {
    // Try to extract first JSON object substring
    const m = content.match(/\{[\s\S]*\}/);
    if (m) item = attempt(m[0]) || null;
  }
  if (!item) return { parsed: false, item: null, raw: content };
  return { parsed: true, item, raw: content };
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Whole-form match: form appears not followed by a Hebrew letter, and preceded by start or non-Hebrew.
function includesWholeForm(hay: string, form: string) {
  const f = escapeRegex(form);
  const re = new RegExp(`(^|[^\u0590-\u05FF])${f}(?![\u0590-\u05FF])`);
  return re.test(hay);
}

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const [k, v] = a.slice(2).split('=');
    if (v !== undefined) out[k] = v; else out[k] = argv[i + 1] || '';
  }
  return out;
}

main().catch(e => { console.error(e); process.exit(1); });
