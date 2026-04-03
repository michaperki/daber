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

// High-value content lemmas to improve prompt context (Mike-known anchors)
// Keep single-token, unpointed forms.
export const CORE_PROMPT_LEMMAS: string[] = [
  // Verbs
  'לכתוב','לדבר','לקרוא','לשמוע','לאהוב','ללכת','לעשות','לרצות','לראות','לקנות',
  // Nouns
  'ספר','גלידה','שיר','בית','זמן','כסף','מים','עבודה','חנות','עיר','רחוב','חבר',
  // Adjectives
  'גדול','חדש','חכם','יפה','קטן','טוב','קשה','יקר',
];

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

// Mini‑morph specific: scope known vocabulary to a provided lexeme allowlist
export async function getUserVocabScopeForLexemeSet(userId: string, allowedLexemeIds: string[]): Promise<{ knownLemmas: string[]; allowedTenses: string[] }> {
  const uid = userId || 'anon';
  const allow = Array.from(new Set((allowedLexemeIds || []).map(String).filter(Boolean)));
  let knownLemmas: string[] = [];
  if (allow.length) {
    const stats = await prisma.itemStat.findMany({ where: { user_id: uid }, select: { lesson_item_id: true } });
    const itemIds = stats.map(s => s.lesson_item_id);
    const lis = itemIds.length ? await prisma.lessonItem.findMany({ where: { id: { in: itemIds }, lexeme_id: { in: allow } }, select: { lexeme_id: true } }) : [];
    const lexemeIds = Array.from(new Set(lis.map(l => l.lexeme_id).filter(Boolean))) as string[];
    const lexemes = lexemeIds.length ? await prisma.lexeme.findMany({ where: { id: { in: lexemeIds } }, select: { lemma: true } }) : [];
    knownLemmas = Array.from(new Set(lexemes.map(l => stripNikkud(l.lemma).trim()).filter(Boolean)));
  }
  const allowed = new Set<string>(['present']);
  const feats = await prisma.featureStat.findMany({ where: { user_id: uid, tense: { in: ['past','future'] } }, select: { tense: true } });
  for (const f of feats) if (f.tense) allowed.add(f.tense);
  return { knownLemmas, allowedTenses: Array.from(allowed) };
}

export function buildBatchPrompt(params: { targetLemmas: string[]; knownLemmas: string[]; allowedTenses: string[]; direction: 'he_to_en' | 'en_to_he'; glossByLemma?: Map<string, string> | Record<string, string> }): string {
  // Target-centric: focus on the first target only; callers typically loop per target
  const targets = Array.from(new Set((params.targetLemmas || []).map(stripNikkud).map(s => s.trim()).filter(Boolean)));
  const target = targets[0] || '';
  const known = Array.from(new Set((params.knownLemmas || []).map(stripNikkud).map(s => s.trim()).filter(Boolean)));

  // Build a small context word list (10–15) from CORE + known, excluding target
  const contextPool = Array.from(new Set([
    ...CORE_PROMPT_LEMMAS.filter(l => l !== target),
    ...known.filter(k => k !== target)
  ]));
  const maxContext = 14;
  const contextList = contextPool.slice(0, maxContext);
  const tenseList = (params.allowedTenses && params.allowedTenses.length) ? params.allowedTenses : ['present'];
  const grammarFocus = tenseList.includes('present') ? 'present' : (tenseList[0] || 'present');

  // Inline gloss only for the target when available
  let targetLabel = target;
  const glossMap = params.glossByLemma instanceof Map
    ? params.glossByLemma
    : (params.glossByLemma ? new Map(Object.entries(params.glossByLemma)) : undefined);
  const gloss = target && glossMap ? (glossMap.get(target) || (glossMap as any)[target]) : undefined;
  if (target && gloss && typeof gloss === 'string') targetLabel = `${target} (${gloss})`;

  // Keep prompt concise and target-first
  // Example uses a DIFFERENT word so the model learns the pattern without copying
  const example = `{"hebrew":"הכלב אוכל את האוכל","english":"The dog eats the food","target_word":"כלב","difficulty":"easy","drill_type":"${params.direction}","grammar_focus":"present"}`;

  const lines: string[] = [];
  lines.push('You are a Hebrew sentence writer. Return JSON only, no nikkud.');
  lines.push(`TARGET WORD: ${targetLabel}`);
  lines.push(`Write ONE short Hebrew sentence (4-8 words) that uses the word "${target}". Include את before definite direct objects.`);
  lines.push(`Use only these tenses: ${tenseList.join(', ')}.`);
  if (contextList.length) lines.push(`Allowed context words (optional): ${contextList.join(', ')}.`);
  lines.push(`Example for a different word: ${example}`);
  lines.push(`Now write for "${target}":`);
  lines.push(`Return a single object {"hebrew":"...","english":"...","target_word":"${target}","difficulty":"easy","drill_type":"${params.direction}","grammar_focus":"${grammarFocus}"}`);
  return lines.join('\n');
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
  skipWhitelist?: boolean; // when true, do not enforce vocab whitelist
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
  // Debug: raw model response (preview)
  try {
    logEvent({ type: 'local_llm_raw', payload: { model, preview: (content || '').slice(0, 300), length: (content || '').length } });
  } catch {}
  const parsed = parseItems(content);
  try {
    logEvent({ type: 'local_llm_parse', payload: { parsed_count: parsed.length } });
  } catch {}
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
  // Always allow non-finite/unknown categories
  allowedTenses.add('infinitive');
  allowedTenses.add('unknown');

  // Allow both user-known lemmas and current batch targets to pass whitelist
  const whitelist = await buildVocabWhitelistByLemmas(Array.from(new Set([...(params.knownLemmas || []), ...(params.targetLemmas || [])])));

  const out: ValidatedItem[] = [];
  for (const it of parsed) {
    let rejectReason: { step: string; detail?: any } | null = null;
    const h = stripNikkud(it.hebrew || '');
    const e = it.english || '';
    if (!hebrewOk(h) || !englishOk(e)) { rejectReason = { step: 'script_check', detail: { heb_ok: hebrewOk(h), eng_ok: englishOk(e) } }; }
    const lex = lexByLemma.get(stripNikkud(it.target_word).trim());
    if (!rejectReason && !lex) { rejectReason = { step: 'target_lexeme_lookup', detail: { target_word: it.target_word } }; }
    const byLex = formsByLex.get(lex.id) || { forms: [], tenses: {} };
    // Target presence: requires any inflection present (space-insensitive)
    const present = byLex.forms.some(f => includesWholeForm(h, stripNikkud(f)) || h.replace(/\s+/g, '').includes(stripNikkud(f).replace(/\s+/g, '')));
    if (!rejectReason && !present) { rejectReason = { step: 'target_presence', detail: { target_word: it.target_word } }; }
    // Governance: if frames require a preposition, ensure marker exists
    try {
      const gov: any = lex.verb_governance as any;
      if (!rejectReason && gov && Array.isArray(gov.frames) && gov.frames.length) {
        const prep = gov.frames[0]?.prep;
        if (prep && prep !== 'none') {
          const mark = (PREP_DISPLAY_MAP as any)[prep] as string | undefined;
          if (mark && !h.includes(mark)) { rejectReason = { step: 'governance', detail: { required_prep: mark } }; }
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
    if (!rejectReason && tenseViolation) { rejectReason = { step: 'tense', detail: { allowed: Array.from(allowedTenses) } }; }
    // Vocab whitelist: token-level check with simple prefix handling (can be skipped for flashcards)
    if (!rejectReason && !params.skipWhitelist && !passesWhitelist(h, whitelist)) { rejectReason = { step: 'whitelist' }; }
    if (!rejectReason) {
      out.push({ ...it, target_lexeme_id: lex.id, hebrew: h });
      try { logEvent({ type: 'local_llm_item_accept', payload: { target_lexeme_id: lex.id } }); } catch {}
    } else {
      try { logEvent({ type: 'local_llm_item_reject', payload: { reason: rejectReason, item: { hebrew: h, english: e, target_word: it.target_word } } }); } catch {}
    }
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
  let obj = tryParse(content);
  if (!obj) {
    // Try fenced JSON blocks
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) obj = tryParse(fenced[1].trim());
  }
  if (!obj) {
    const m = content.match(/\{[\s\S]*\}/);
    if (m) obj = tryParse(m[0]);
  }
  if (!obj) return [];
  let items: any[] = [];
  if (Array.isArray(obj)) items = obj as any[];
  else if (Array.isArray((obj as any).items)) items = (obj as any).items as any[];
  else if ((obj as any).hebrew || (obj as any).english) items = [obj];
  return items.map((i: any) => ({
    hebrew: stripNikkud(String(i?.hebrew || '')),
    english: String(i?.english || ''),
    target_word: stripNikkud(String(i?.target_word || i?.target || i?.target_lemma || '')),
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
