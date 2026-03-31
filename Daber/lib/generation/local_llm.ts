/**
 * Local LLM integration (on-the-fly generation via Ollama)
 *
 * Env:
 * - LOCAL_LLM_ENABLED=true  // kill switch
 * - LOCAL_LLM_URL=http://127.0.0.1:11434 // Ollama base URL
 * - LOCAL_LLM_MODEL=dicta17-q4           // model name in Ollama
 */

import { prisma } from '@/lib/db';
import { logEvent } from '@/lib/log';
import { PREP_DISPLAY_MAP } from '@/lib/types/governance';

export const FUNCTION_WORD_ALLOWLIST: Set<string> = new Set([
  // Pronouns
  'אני','אתה','את','הוא','היא','אנחנו','אתם','אתן','הם','הן',
  // Prepositions / particles
  'את','של','על','עם','ב','ל','מ','אל','בין','כ','עד','אחרי','לפני',
  // Demonstratives
  'זה','זו','זאת','אלה','אלו',
  // Conjunctions
  'ו','ש','כי','אבל','גם','או','אם',
  // Question words
  'מה','מי','איפה','למה','מתי','איך','כמה',
  // Copula / existence
  'יש','אין',
  // Article as a prefix token (rare standalone)
  'ה',
  // Common adverbs
  'מאוד','עכשיו','פה','שם','הרבה','קצת','עוד','כבר','לא','כן','רק','בבקשה','תודה',
]);

function stripNikkud(s: string): string { return (s || '').replace(/[\u0591-\u05C7]/g, ''); }
function containsHebrew(s: string): boolean { return /[\u0590-\u05FF]/.test(s || ''); }
function containsLatin(s: string): boolean { return /[A-Za-z]/.test(s || ''); }
function englishOk(s: string): boolean { return !!s && !containsHebrew(s) && containsLatin(s); }
function hebrewOk(s: string): boolean { return !!s && containsHebrew(s) && !containsLatin(s); }

function escapeRegex(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
// Whole-form match: not followed by a Hebrew letter, and preceded by start or non-Hebrew
function includesWholeForm(hay: string, form: string) {
  const f = escapeRegex(form);
  const re = new RegExp(`(^|[^\\u0590-\\u05FF])${f}(?![\\u0590-\\u05FF])`);
  return re.test(hay);
}

export async function getUserVocabScope(userId: string): Promise<{ knownLemmas: string[]; allowedTenses: string[] }> {
  const uid = userId || 'anon';
  // Known lexemes = any ItemStat exists for items linked to a lexeme
  const stats = await prisma.itemStat.findMany({ where: { user_id: uid }, select: { lesson_item_id: true } });
  const itemIds = stats.map(s => s.lesson_item_id);
  const lis = itemIds.length ? await prisma.lessonItem.findMany({ where: { id: { in: itemIds }, lexeme_id: { not: null } }, select: { lexeme_id: true } }) : [];
  const lexemeIds = Array.from(new Set(lis.map(l => l.lexeme_id).filter(Boolean))) as string[];
  const lexemes = lexemeIds.length ? await prisma.lexeme.findMany({ where: { id: { in: lexemeIds } }, select: { lemma: true } }) : [];
  const knownLemmas = Array.from(new Set(lexemes.map(l => stripNikkud(l.lemma).trim()).filter(Boolean)));

  const allowed = new Set<string>(['present']);
  const feats = await prisma.featureStat.findMany({ where: { user_id: uid, tense: { in: ['past','future'] } }, select: { tense: true } });
  for (const f of feats) if (f.tense) allowed.add(f.tense);
  return { knownLemmas, allowedTenses: Array.from(allowed) };
}

export function buildBatchPrompt(params: { targetLemmas: string[]; knownLemmas: string[]; allowedTenses: string[]; direction: 'he_to_en' | 'en_to_he' }): string {
  const targets = Array.from(new Set(params.targetLemmas.map(stripNikkud).map(s => s.trim()).filter(Boolean)));
  const known = Array.from(new Set(params.knownLemmas.map(stripNikkud).map(s => s.trim()).filter(Boolean)));
  const pool = known.filter(k => !targets.includes(k));
  // Fill to ~45 total (targets + sample from pool)
  const max = 45;
  const need = Math.max(0, max - targets.length);
  const sample: string[] = [];
  for (let i = 0; i < pool.length && sample.length < need; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    sample.push(pool[idx]);
  }
  const vocabList = Array.from(new Set([...targets, ...sample])).slice(0, max);
  const vocabStr = vocabList.join(', ');
  const tenseList = (params.allowedTenses && params.allowedTenses.length) ? params.allowedTenses : ['present'];

  // One JSON object with items: one per target lemma
  return [
    'You are a Hebrew drill author. Return STRICT JSON only. One item per target lemma. Use normal spaces between words. No nikkud.',
    `Direction: ${params.direction}.`,
    `Allowed tenses: ${tenseList.join(', ')}.`,
    'Vocabulary: use only from the provided lemmas plus basic function words.',
    `Provided lemmas (targets + context): ${vocabStr}.`,
    'For each target lemma: make a short (4–8 words), natural sentence; include an inflected form of the target; mark definite direct objects with את; provide a literal English translation; use only allowed tenses.',
    'Return JSON: {"items":[{"hebrew":"...","english":"...","target_word":"...","difficulty":"easy","drill_type":"he_to_en","grammar_focus":"present"}, ...] }'
  ].join('\n');
}

type RawItem = { hebrew: string; english: string; target_word: string; difficulty?: string; drill_type?: 'he_to_en'|'en_to_he'; grammar_focus?: string | null };

export type ValidatedItem = RawItem & { target_lexeme_id?: string };

export async function generateBatch(params: {
  targetLemmas: string[];
  knownLemmas: string[];
  allowedTenses: string[];
  direction: 'he_to_en' | 'en_to_he';
  ollamaUrl?: string;
  model?: string;
  timeoutMs?: number; // default 5000
}): Promise<ValidatedItem[]> {
  const ollamaUrl = (params.ollamaUrl || process.env.LOCAL_LLM_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const model = params.model || process.env.LOCAL_LLM_MODEL || 'dicta17-q4';
  const prompt = buildBatchPrompt({ targetLemmas: params.targetLemmas, knownLemmas: params.knownLemmas, allowedTenses: params.allowedTenses, direction: params.direction });
  const body = { model, prompt, format: 'json', options: { temperature: 0.2, num_ctx: 1024, num_predict: Math.min(60 * Math.max(1, params.targetLemmas.length), 300) }, stream: false } as any;

  const abort = new AbortController();
  const t = setTimeout(() => abort.abort(), params.timeoutMs ?? 5000);
  let content = '';
  try {
    const resp = await fetch(`${ollamaUrl}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: abort.signal });
    const data = await resp.json();
    content = data?.response || '';
  } finally { clearTimeout(t); }
  const parsed = parseItems(content);
  if (!parsed.length) return [];

  // Resolve lexeme ids and inflections for target presence + governance
  const lemmaSet = new Set(parsed.map(i => stripNikkud(i.target_word).trim()).filter(Boolean));
  const targetLex = await prisma.lexeme.findMany({ where: { lemma: { in: Array.from(lemmaSet) } }, select: { id: true, lemma: true, verb_governance: true } });
  const lexByLemma = new Map(targetLex.map(l => [stripNikkud(l.lemma).trim(), l] as const));
  const infl = await prisma.inflection.findMany({ where: { lexeme_id: { in: targetLex.map(l => l.id) } }, select: { lexeme_id: true, form: true, tense: true } });
  const formsByLex = new Map<string, { forms: string[]; tenses: Record<string, Set<string>> }>();
  for (const row of infl) {
    const rec = formsByLex.get(row.lexeme_id) || { forms: [], tenses: {} };
    rec.forms.push(stripNikkud(row.form));
    const ten = row.tense || 'unknown';
    if (!rec.tenses[ten]) rec.tenses[ten] = new Set<string>();
    rec.tenses[ten].add(stripNikkud(row.form));
    formsByLex.set(row.lexeme_id, rec);
  }

  const allowedTenses = new Set((params.allowedTenses && params.allowedTenses.length) ? params.allowedTenses : ['present']);

  const whitelist = await buildVocabWhitelistByLemmas(params.knownLemmas);

  const out: ValidatedItem[] = [];
  for (const it of parsed) {
    const h = stripNikkud(it.hebrew || '');
    const e = it.english || '';
    if (!hebrewOk(h) || !englishOk(e)) continue;
    const lex = lexByLemma.get(stripNikkud(it.target_word).trim());
    if (!lex) continue;
    const byLex = formsByLex.get(lex.id) || { forms: [], tenses: {} };
    // Target presence: requires any inflection present (space-insensitive)
    const hNS = h.replace(/\s+/g, '');
    const present = byLex.forms.some(f => hNS.includes(stripNikkud(f).replace(/\s+/g, '')));
    if (!present) continue;
    // Governance: if frames require a preposition, ensure marker exists
    try {
      const gov: any = lex.verb_governance as any;
      if (gov && Array.isArray(gov.frames) && gov.frames.length) {
        const prep = gov.frames[0]?.prep;
        if (prep && prep !== 'none') {
          const mark = (PREP_DISPLAY_MAP as any)[prep] as string | undefined;
          if (mark && !h.includes(mark)) continue;
        }
      }
    } catch {}
    // Tense check: reject if any verb form in the sentence maps to a tense outside allowed
    // Approximation: if target forms include disallowed tenses present in text, reject
    let tenseViolation = false;
    for (const [ten, formSet] of Object.entries(byLex.tenses)) {
      if (!allowedTenses.has(ten) && Array.from(formSet).some(f => includesWholeForm(h, f))) {
        tenseViolation = true; break;
      }
    }
    if (tenseViolation) continue;
    // Vocab whitelist: token-level check with simple prefix handling
    if (!passesWhitelist(h, whitelist)) continue;
    out.push({ ...it, target_lexeme_id: lex.id, hebrew: h });
  }
  // Log batch telemetry
  try {
    logEvent({ type: 'local_llm_batch', payload: { batch_size: parsed.length, valid_count: out.length } });
  } catch {}
  return out;
}

export async function buildVocabWhitelist(knownLemmaIds: string[]): Promise<Set<string>> {
  const infl = knownLemmaIds.length ? await prisma.inflection.findMany({ where: { lexeme_id: { in: knownLemmaIds } }, select: { form: true } }) : [];
  const set = new Set<string>();
  for (const row of infl) set.add(stripNikkud(row.form));
  for (const fw of FUNCTION_WORD_ALLOWLIST) set.add(fw);
  return set;
}

async function buildVocabWhitelistByLemmas(lemmas: string[]): Promise<Set<string>> {
  const rows = lemmas.length ? await prisma.lexeme.findMany({ where: { lemma: { in: lemmas } }, select: { id: true } }) : [];
  return buildVocabWhitelist(rows.map(r => r.id));
}

function parseItems(content: string): RawItem[] {
  const tryParse = (s: string) => { try { return JSON.parse(s); } catch { return null; } };
  const obj = tryParse(content) || (content.match(/\{[\s\S]*\}/) ? tryParse(content.match(/\{[\s\S]*\}/)![0]) : null);
  const items = (obj && Array.isArray(obj.items)) ? obj.items : [];
  return items.map((i: any) => ({
    hebrew: stripNikkud(String(i?.hebrew || '')),
    english: String(i?.english || ''),
    target_word: stripNikkud(String(i?.target_word || '')),
    difficulty: i?.difficulty || 'easy',
    drill_type: (i?.drill_type === 'en_to_he' ? 'en_to_he' : 'he_to_en'),
    grammar_focus: i?.grammar_focus || null,
  }));
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
