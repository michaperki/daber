import { prisma } from '@/lib/db';
import { getUserVocabScope, buildVocabWhitelist, generateBatch } from '@/lib/generation/local_llm';
import { logEvent } from '@/lib/log';
import fs from 'fs';
import path from 'path';

let GREEN_LEXEME_IDS: string[] = [];
let GREEN_LEXEME_IDS_LOADED = false;
function getGreenLexemeIds(): string[] {
  if (GREEN_LEXEME_IDS_LOADED) return GREEN_LEXEME_IDS;
  try {
    const p = path.join(process.cwd(), 'data', 'green_lexemes.json');
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const ids = Array.isArray(raw?.lexemeIds) ? raw.lexemeIds.map(String) : [];
    GREEN_LEXEME_IDS = ids.filter(Boolean);
    GREEN_LEXEME_IDS_LOADED = true;
  } catch {
    GREEN_LEXEME_IDS = [];
    GREEN_LEXEME_IDS_LOADED = true;
  }
  return GREEN_LEXEME_IDS;
}

type LessonItemShape = { id: string; english_prompt: string; target_hebrew: string; transliteration: string | null; features?: Record<string, string | null> | null };
type Desired = { person?: string | null; number?: string | null; gender?: string | null };

function hashShort(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

function pick<T>(arr: T[]): T | null {
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

const HEB_PRONOUNS = ['אני','אתה','את','הוא','היא','אנחנו','אתם','אתן','הם','הן'];
function containsHebrew(s: string): boolean { return /[\u0590-\u05FF]/.test(s || ''); }
function containsLatin(s: string): boolean { return /[A-Za-z]/.test(s || ''); }
function englishOk(s: string): boolean { return !!s && !containsHebrew(s) && containsLatin(s); }
function hebrewOk(s: string): boolean { return !!s && containsHebrew(s) && !containsLatin(s); }
function hebrewStartsWithPronoun(s: string): boolean {
  const t = (s || '').trim();
  return HEB_PRONOUNS.some(p => t.startsWith(p + ' '));
}

function validateGenerated(kind: 'verb'|'adjective'|'noun', item: { english_prompt: string; target_hebrew: string; features?: Record<string, string | null> | null }): boolean {
  if (!englishOk(item.english_prompt) || !hebrewOk(item.target_hebrew)) return false;
  const pos = (item.features?.pos || '').toLowerCase();
  if (pos !== kind) return false;
  if (kind === 'verb' || kind === 'adjective') {
    if (!hebrewStartsWithPronoun(item.target_hebrew)) return false;
    // For verbs, require tense + person + number to be present
    if (kind === 'verb') {
      const f = item.features || {} as any;
      if (!f.tense || !f.person || !f.number) return false;
      if (f.number === 'sg' && (f.person === '2' || f.person === '3') && !f.gender) return false;
    }
    if (kind === 'adjective') {
      const f = item.features || {} as any;
      if (!f.number || !f.gender) return false;
    }
  }
  if (kind === 'noun') {
    const f = item.features || {} as any;
    if (!f.number) return false;
  }
  return true;
}

function pronounFrom(inf: { person: string | null; number: string | null; gender: string | null }): string {
  const p = inf.person || '';
  const n = inf.number || '';
  const g = inf.gender || '';
  if (p === '1' && n === 'sg') return 'I';
  if (p === '1' && n === 'pl') return 'we';
  if (p === '2') return 'you';
  if (p === '3' && n === 'sg' && g === 'm') return 'he';
  if (p === '3' && n === 'sg' && g === 'f') return 'she';
  if (p === '3' && n === 'pl') return 'they';
  // Fallback: prefer neutral 'they' to avoid divergence
  return 'they';
}

function pronounHeb(inf: { person: string | null; number: string | null; gender: string | null }, fallbackPerson: '1'|'2'|'3' = '3'): string {
  const p = (inf.person as '1'|'2'|'3'|null) || fallbackPerson;
  const n = inf.number || null;
  const g = inf.gender || null;
  if (p === '1' && n === 'sg') return 'אני';
  if (p === '1' && n === 'pl') return 'אנחנו';
  if (p === '2' && n === 'sg' && g === 'm') return 'אתה';
  if (p === '2' && n === 'sg' && g === 'f') return 'את';
  if (p === '2' && n === 'pl' && g === 'm') return 'אתם';
  if (p === '2' && n === 'pl' && g === 'f') return 'אתן';
  if (p === '3' && n === 'sg' && g === 'm') return 'הוא';
  if (p === '3' && n === 'sg' && g === 'f') return 'היא';
  if (p === '3' && n === 'pl' && g === 'f') return 'הן';
  if (p === '3' && n === 'pl') return 'הם';
  // Fallback aligned with neutral English 'they': default to third‑person plural masculine
  if (fallbackPerson === '1') return 'אני';
  if (fallbackPerson === '2') return 'אתם';
  return 'הם';
}

// Require complete inflection metadata before generating items, to avoid EN/HE divergence
function isCompleteVerbInf(inf: { person: string | null; number: string | null; gender: string | null }): boolean {
  const p = inf.person || '';
  const n = inf.number || '';
  const g = inf.gender || '';
  if (!p || !n) return false;
  if (n === 'sg' && (p === '2' || p === '3') && !g) return false;
  return true;
}

function isCompleteAdjInf(inf: { number: string | null; gender: string | null }): boolean {
  const n = inf.number || '';
  const g = inf.gender || '';
  return !!n && !!g;
}

function isCompleteNounInf(inf: { number: string | null }): boolean {
  return !!(inf.number || '');
}

function englishFromCard(cardEn: string): { base: string; isVerb: boolean; paren?: string } {
  let en = cardEn.trim();
  // Strip "How do I say:" wrapper if present (avoid double-wrapping)
  en = en.replace(/^\s*how\s+do\s+i\s+say[:\s-]*/i, '').replace(/\?+\s*$/, '').trim();
  const isVerbLine = /^to\s+/i.test(en);
  const raw = isVerbLine ? en.replace(/^to\s+/i, '').trim() : en;
  const { base: noParens, paren } = splitParentheticals(raw);
  // Normalize alternative separators and pick the first candidate
  const altNormalized = noParens.replace(/\s+or\s+/gi, ',').replace(/[\|/·]+/g, ',');
  const parts = altNormalized.split(',').map(s => s.trim()).filter(Boolean);
  let cand = parts[0] || noParens;
  cand = cand.replace(/^to\s+/i, '').trim();
  return { base: cand, isVerb: isVerbLine, paren };
}

function splitParentheticals(base: string): { base: string; paren?: string } {
  const parens: string[] = [];
  const core = base.replace(/\(([^)]*)\)/g, (_m, inner: string) => {
    const t = (inner || '').trim();
    if (t) parens.push(t);
    return '';
  }).replace(/\s{2,}/g, ' ').trim();
  const paren = parens.length ? `(${parens.join(', ')})` : undefined;
  return { base: core, paren };
}

function beFor(pron: string): string {
  if (pron === 'I') return 'am';
  if (pron === 'he' || pron === 'she') return 'is';
  return 'are';
}

function ingForm(base: string): string {
  const b = base.trim();
  if (!b) return b;
  const m = b.match(/^([A-Za-z]+)(.*)$/);
  const head = m ? m[1] : b;
  const tail = m ? m[2] : '';
  let out = head;
  if (/ie$/i.test(head)) out = head.replace(/ie$/i, 'ying');
  else if (/[^aeiou]e$/i.test(head)) out = head.replace(/e$/i, 'ing');
  else out = head + 'ing';
  return out + tail;
}

function pastForm(base: string): string {
  const irregular: Record<string, string> = {
    'be': 'was', 'am': 'was', 'is': 'was', 'are': 'were',
    'have': 'had', 'do': 'did', 'say': 'said', 'make': 'made', 'go': 'went', 'take': 'took', 'come': 'came', 'see': 'saw', 'know': 'knew', 'get': 'got', 'give': 'gave', 'find': 'found', 'think': 'thought', 'tell': 'told', 'become': 'became', 'show': 'showed', 'leave': 'left', 'feel': 'felt', 'put': 'put', 'bring': 'brought', 'begin': 'began', 'keep': 'kept', 'hold': 'held', 'write': 'wrote', 'stand': 'stood', 'hear': 'heard', 'let': 'let', 'mean': 'meant', 'set': 'set', 'meet': 'met', 'run': 'ran', 'pay': 'paid', 'sit': 'sat', 'speak': 'spoke', 'lie': 'lay', 'lead': 'led', 'read': 'read', 'grow': 'grew', 'lose': 'lost', 'fall': 'fell', 'send': 'sent', 'build': 'built', 'understand': 'understood', 'draw': 'drew', 'break': 'broke', 'spend': 'spent', 'cut': 'cut', 'rise': 'rose', 'drive': 'drove', 'buy': 'bought', 'wear': 'wore', 'choose': 'chose', 'fight': 'fought', 'throw': 'threw', 'catch': 'caught', 'teach': 'taught', 'sell': 'sold', 'ring': 'rang', 'sing': 'sang', 'swim': 'swam', 'fly': 'flew', 'sleep': 'slept', 'stick': 'stuck', 'shine': 'shone', 'win': 'won', 'shut': 'shut', 'cost': 'cost', 'hurt': 'hurt'
  };
  const m = base.match(/^([A-Za-z]+)(.*)$/);
  const head = m ? m[1].toLowerCase() : base.toLowerCase();
  const tail = m ? m[2] : '';
  let out = irregular[head];
  if (!out) {
    if (/e$/.test(head)) out = head + 'd';
    else if (/[^aeiou]y$/.test(head)) out = head.slice(0, -1) + 'ied';
    else out = head + 'ed';
  }
  return out + tail;
}

function futureForm(base: string): string {
  return `will ${base}`;
}

export async function generateNextFromLexicon(sessionId: string, attemptedIds: Set<string>, opts?: { focusWeakness?: boolean }): Promise<LessonItemShape | null> {
  const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { lesson_id: true, user_id: true } });
  if (!session) return null;
  const baseLesson = await prisma.lesson.findUnique({ where: { id: session.lesson_id } });
  if (!baseLesson) return null;

  const isGreen = baseLesson.id === 'vocab_green';
  const greenLexemeIds = isGreen ? getGreenLexemeIds() : null;
  const genLessonId = `${session.lesson_id}_gen`;
  await prisma.lesson.upsert({
    where: { id: genLessonId },
    update: { title: baseLesson.title ? `${baseLesson.title} · Dynamic` : 'Dynamic Drills', language: baseLesson.language, level: baseLesson.level, type: 'vocab_generated', description: baseLesson.description ?? null },
    create: { id: genLessonId, title: baseLesson.title ? `${baseLesson.title} · Dynamic` : 'Dynamic Drills', language: baseLesson.language, level: baseLesson.level, type: 'vocab_generated', description: baseLesson.description ?? null }
  });

  // If focusing weakness, infer desired features from recent misses; prefer due (SRS) features
  let desired: Desired | null = null;
  try {
    const now = new Date();
    const due = await prisma.featureStat.findFirst({ where: { user_id: (session.user_id || 'anon'), next_due: { lte: now } }, orderBy: { next_due: 'asc' } });
    if (due) desired = { person: (due as any).person || null, number: (due as any).number || null, gender: (due as any).gender || null };
  } catch {}
  if (opts?.focusWeakness) {
    const since = new Date(); since.setDate(since.getDate() - 30);
    const misses = await prisma.attempt.findMany({
      where: { created_at: { gte: since }, OR: [{ grade: 'flawed' }, { grade: 'incorrect' }], session: { user_id: (session.user_id || 'anon') } },
      select: { features: true }
    });
    const counts = new Map<string, number>();
    for (const m of misses) {
      const f = (m as any).features as any;
      if (!f || typeof f !== 'object') continue;
      const number = f.number || 'na';
      const gender = f.gender || 'na';
      const key = `${number}|${gender}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    let top: string | null = null; let max = 0;
    for (const [k, v] of counts) { if (v > max) { max = v; top = k; } }
    if (top) {
      const [num, gen] = top.split('|');
      desired = { number: num, gender: gen };
    }
  }

  const userId = (session.user_id || 'anon');

  // Local LLM: serve from per-session cache if available
  const llmEnabled = (process.env.LOCAL_LLM_ENABLED || '').toLowerCase() === 'true';
  if (llmEnabled) {
    const served = await popCachedLocalItem(sessionId, baseLesson.id);
    if (served) {
      await maybeRefillLocalCache(sessionId, baseLesson.id, userId);
      return served;
    }
  }

  const strategies: Array<() => Promise<LessonItemShape | null>> = [
    async () => generateAdjectiveItem(genLessonId, attemptedIds, desired, greenLexemeIds, isGreen, userId),
    async () => generateVerbPresentItem(genLessonId, attemptedIds, desired, greenLexemeIds, isGreen, userId),
    async () => generateVerbPastItem(genLessonId, attemptedIds, desired, greenLexemeIds, isGreen, userId),
    async () => generateVerbFutureItem(genLessonId, attemptedIds, desired, greenLexemeIds, isGreen, userId),
    async () => generateNounItem(genLessonId, attemptedIds, desired, greenLexemeIds, isGreen, userId)
  ];

  for (let i = 0; i < 6; i++) {
    const strat = pick(strategies);
    if (!strat) break;
    const item = await strat();
    if (item) return item;
  }
  // If no lexicon-generated item and local LLM enabled, try generating on-demand quickly (3s)
  if (llmEnabled) {
    try {
      const got = await generateLocalBatchIntoCache(sessionId, baseLesson.id, userId, 1, 3000);
      if (got) {
        const served = await popCachedLocalItem(sessionId, baseLesson.id);
        if (served) return served;
      }
    } catch {}
  }
  return null;
}

// ---------- Local LLM per-session cache ----------
type CachedItem = { lexeme_id: string; hebrew: string; english: string };
const LOCAL_CACHE = new Map<string, Map<string, CachedItem[]>>(); // sessionId -> (lexemeId -> items)
const LOCAL_WHITELIST = new Map<string, Set<string>>(); // sessionId -> whitelist

async function maybeInitWhitelist(sessionId: string, userId: string) {
  if (LOCAL_WHITELIST.has(sessionId)) return;
  try {
    // Build whitelist from user's known lexemes inferred via stats
    const stats = await prisma.itemStat.findMany({ where: { user_id: userId }, select: { lesson_item_id: true } });
    const lis = await prisma.lessonItem.findMany({ where: { id: { in: stats.map(s => s.lesson_item_id) }, lexeme_id: { not: null } }, select: { lexeme_id: true } });
    const lexIds = Array.from(new Set(lis.map(l => l.lexeme_id as string)));
    const wl = await buildVocabWhitelist(lexIds);
    LOCAL_WHITELIST.set(sessionId, wl);
  } catch {}
}

async function popCachedLocalItem(sessionId: string, lessonId: string): Promise<LessonItemShape | null> {
  const m = LOCAL_CACHE.get(sessionId);
  if (!m) return null;
  // pop from any lexeme bucket with items
  for (const [lexId, arr] of m) {
    const next = arr.shift();
    if (!next) continue;
    if (!arr.length) m.delete(lexId);
    // Persist a DB item under the session's dynamic lesson
    const genLessonId = `${lessonId}_gen`;
    const id = `llm_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    const li = await prisma.lessonItem.create({
      data: {
        id,
        lesson_id: genLessonId,
        english_prompt: next.english,
        target_hebrew: next.hebrew,
        transliteration: null,
        accepted_variants: [], near_miss_patterns: [], tags: ['generated','local_llm'], difficulty: 1,
        lexeme_id: lexId,
        features: { pos: 'sentence', source: 'local_llm' } as any
      }
    });
    try { logEvent({ type: 'local_llm_served', payload: { target_lexeme_id: lexId, was_cached: true } }); } catch {}
    return { id: li.id, english_prompt: li.english_prompt, target_hebrew: li.target_hebrew, transliteration: li.transliteration, features: (li as any).features as any };
  }
  return null;
}

async function maybeRefillLocalCache(sessionId: string, lessonId: string, userId: string) {
  // If cache low (<2 items total), prefetch in background
  const m = LOCAL_CACHE.get(sessionId);
  const total = m ? Array.from(m.values()).reduce((s, a) => s + a.length, 0) : 0;
  if (total >= 2) return;
  generateLocalBatchIntoCache(sessionId, lessonId, userId, 3).catch(() => {});
}

async function chooseUpcomingLexemes(userId: string, lessonId: string, count: number): Promise<string[]> {
  // Prefer due items; fall back to recent weak items
  const now = new Date();
  const dueStats = await prisma.itemStat.findMany({ where: { user_id: userId, next_due: { lte: now } }, orderBy: { next_due: 'asc' }, take: 200, select: { lesson_item_id: true } });
  const dueItems = await prisma.lessonItem.findMany({ where: { id: { in: dueStats.map(s => s.lesson_item_id) }, lexeme_id: { not: null } }, select: { lexeme_id: true } });
  const ids: string[] = [];
  for (const r of dueItems) { const id = r.lexeme_id as string; if (id && !ids.includes(id)) ids.push(id); if (ids.length >= count) break; }
  if (ids.length < count) {
    const weak = await prisma.itemStat.findMany({ where: { user_id: userId }, orderBy: [{ incorrect_count: 'desc' }, { correct_streak: 'asc' }], take: 200, select: { lesson_item_id: true } });
    const weakItems = await prisma.lessonItem.findMany({ where: { id: { in: weak.map(s => s.lesson_item_id) }, lexeme_id: { not: null } }, select: { lexeme_id: true } });
    for (const r of weakItems) { const id = r.lexeme_id as string; if (id && !ids.includes(id)) ids.push(id); if (ids.length >= count) break; }
  }
  return ids.slice(0, count);
}

async function generateLocalBatchIntoCache(sessionId: string, lessonId: string, userId: string, targetCount: number, timeoutMs?: number): Promise<boolean> {
  try {
    await maybeInitWhitelist(sessionId, userId);
    const { knownLemmas, allowedTenses } = await getUserVocabScope(userId);
    const targets = await chooseUpcomingLexemes(userId, lessonId, Math.max(1, targetCount));
    if (!targets.length) return false;
    const lexRows = await prisma.lexeme.findMany({ where: { id: { in: targets } }, select: { id: true, lemma: true } });
    const targetLemmas = lexRows.map(r => r.lemma);
    const items = await generateBatch({ targetLemmas, knownLemmas, allowedTenses, direction: 'he_to_en', timeoutMs });
    if (!items.length) { logEvent({ type: 'local_llm_batch', payload: { batch_size: targetLemmas.length, valid_count: 0 } }); return false; }
    let m = LOCAL_CACHE.get(sessionId); if (!m) { m = new Map(); LOCAL_CACHE.set(sessionId, m); }
    for (const it of items) {
      const lexId = it.target_lexeme_id as string | undefined;
      if (!lexId) continue;
      const bucket = m.get(lexId) || [];
      bucket.push({ lexeme_id: lexId, hebrew: it.hebrew, english: it.english });
      m.set(lexId, bucket);
    }
    logEvent({ type: 'local_llm_batch', payload: { batch_size: targetLemmas.length, valid_count: items.length } });
    return items.length > 0;
  } catch (e) {
    logEvent({ type: 'local_llm_batch', payload: { error: (e as any)?.message || 'error' } });
    return false;
  }
}

// Exported for session-start prefetch
export async function prefetchLocalLLMForSession(sessionId: string) {
  if ((process.env.LOCAL_LLM_ENABLED || '').toLowerCase() !== 'true') return;
  const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { lesson_id: true, user_id: true } });
  if (!session) return;
  await generateLocalBatchIntoCache(sessionId, session.lesson_id, session.user_id || 'anon', 5).catch(() => {});
}

async function generateAdjectiveItem(lessonId: string, attemptedIds: Set<string>, desired?: Desired | null, allowLexemeIds?: string[] | null, isGreen?: boolean, userId?: string): Promise<LessonItemShape | null> {
  const lex = await prisma.lexeme.findMany({ where: { language: 'he', pos: { in: ['adjective', 'Q34698'] }, ...(allowLexemeIds?.length ? { id: { in: allowLexemeIds } } : {}) }, select: { id: true, lemma: true, gloss: true } });
  if (!lex.length) return null;
  for (let tries = 0; tries < 10; tries++) {
    const chosen = pick(lex);
    if (!chosen) break;
    // If Green and family not yet introduced, let selection layer handle canonical intro
    if (isGreen && userId) {
      const famId = `lex:${chosen.id}`;
      const intro = await prisma.familyStat.findUnique({ where: { family_id_user_id: { family_id: famId, user_id: userId } } });
      if (!intro) continue;
    }
    const infls = await prisma.inflection.findMany({ where: { lexeme_id: chosen.id }, select: { form: true, person: true, number: true, gender: true } });
    if (!infls.length) continue;
    // Require complete adjective morphology; prefer canonical m.sg for early exposures
    let pool = infls.filter(i => isCompleteAdjInf({ number: i.number || null, gender: i.gender || null }));
    if (!pool.length) continue;
    pool = pool.filter(i => i.number === 'sg' && i.gender === 'm').concat(pool);
    if (desired?.number || desired?.gender) {
      pool = infls.filter(i => (!desired?.number || i.number === desired.number) && (!desired?.gender || i.gender === desired.gender));
      if (!pool.length) pool = infls;
    }
    const inf = pick(pool);
    if (!inf) continue;
    const pron = pronounFrom({ person: '3', number: inf.number, gender: inf.gender });
    const hebPron = pronounHeb({ person: '3', number: inf.number, gender: inf.gender }, '3');

    let englishPrompt: string | null = null;
    if (isGreen) {
      // For Green, align the English phrase to the chosen inflection (avoid lemma/gloss vs conjugation mismatch)
      const en = englishFromCard(chosen.gloss || '');
      if (!en.base) continue; // require a real gloss; skip if missing
      const enPhrase = en.base ? `${pron} ${beFor(pron)} ${en.base}${en.paren ? ' ' + en.paren : ''}` : pron;
      englishPrompt = `How do I say: ${enPhrase}?`;
    } else {
      const enSrc = chosen.gloss || (await prisma.lessonItem.findFirst({ where: { lexeme_id: chosen.id }, select: { english_prompt: true } }))?.english_prompt || '';
      const en = englishFromCard(enSrc);
      if (!en.base) continue;
      const enPhrase = en.base ? `${pron} ${beFor(pron)} ${en.base}${en.paren ? ' ' + en.paren : ''}` : pron;
      englishPrompt = `How do I say: ${enPhrase}?`;
    }
    const idBase = `gen_adj_${chosen.id}_${inf.number || 'na'}_${inf.gender || 'na'}_${hashShort(englishPrompt)}`;
    if (attemptedIds.has(idBase)) continue;
    const item = await prisma.lessonItem.upsert({
      where: { id: idBase },
      update: { lesson_id: lessonId, lexeme_id: chosen.id, english_prompt: englishPrompt, target_hebrew: `${hebPron} ${inf.form}`, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['generated','adjective'], difficulty: 1, features: { pos: 'adjective', number: inf.number || null, gender: inf.gender || null } as any },
      create: { id: idBase, lesson_id: lessonId, lexeme_id: chosen.id, english_prompt: englishPrompt, target_hebrew: `${hebPron} ${inf.form}`, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['generated','adjective'], difficulty: 1, features: { pos: 'adjective', number: inf.number || null, gender: inf.gender || null } as any }
    });
    const out = { id: item.id, english_prompt: item.english_prompt, target_hebrew: item.target_hebrew, transliteration: item.transliteration, features: (item as any).features as Record<string, string | null> | null };
    if (!validateGenerated('adjective', out)) continue;
    return out;
  }
  return null;
}

async function generateVerbPresentItem(lessonId: string, attemptedIds: Set<string>, desired?: Desired | null, allowLexemeIds?: string[] | null, isGreen?: boolean, userId?: string): Promise<LessonItemShape | null> {
  const lex = await prisma.lexeme.findMany({ where: { language: 'he', pos: { in: ['verb', 'Q24905'] }, ...(allowLexemeIds?.length ? { id: { in: allowLexemeIds } } : {}) }, select: { id: true, lemma: true, gloss: true, features: true } });
  if (!lex.length) return null;
  for (let tries = 0; tries < 10; tries++) {
    const chosen = pick(lex);
    if (!chosen) break;
    if (isGreen && userId) {
      const famId = `lex:${chosen.id}`;
      const intro = await prisma.familyStat.findUnique({ where: { family_id_user_id: { family_id: famId, user_id: userId } } });
      if (!intro) continue;
    }
    const infls = await prisma.inflection.findMany({ where: { lexeme_id: chosen.id, tense: 'present' }, select: { form: true, person: true, number: true, gender: true, binyan: true } });
    if (!infls.length) continue;
    let pool = infls.filter(i => isCompleteVerbInf({ person: i.person || null, number: i.number || null, gender: i.gender || null }));
    if (!pool.length) continue;
    if (desired?.number || desired?.gender || desired?.person) {
      pool = infls.filter(i => (!desired?.number || i.number === desired.number) && (!desired?.gender || i.gender === desired.gender) && (!desired?.person || i.person === desired.person));
      if (!pool.length) pool = infls;
    }
    const inf = pick(pool);
    if (!inf) continue;
    const pron = pronounFrom({ person: inf.person, number: inf.number, gender: inf.gender });
    const hebPron = pronounHeb({ person: inf.person, number: inf.number, gender: inf.gender }, '3');
    let englishPrompt: string | null = null;
    if (isGreen) {
      // Use gloss to derive an English phrase matching the selected present form
      const en = englishFromCard(chosen.gloss || '');
      if (!en.base) continue; // skip lexemes without gloss
      const verb = en.base;
      const vIng = ingForm(verb);
      const enPhrase = verb ? `${pron} ${beFor(pron)} ${vIng}${en.paren ? ' ' + en.paren : ''}` : pron;
      englishPrompt = `How do I say: ${enPhrase}?`;
    } else {
      const enSrc = chosen.gloss || (await prisma.lessonItem.findFirst({ where: { lexeme_id: chosen.id }, select: { english_prompt: true } }))?.english_prompt || '';
      const en = englishFromCard(enSrc);
      if (!en.base) continue;
      const verb = en.base;
      const vIng = ingForm(verb);
      const enPhrase = verb ? `${pron} ${beFor(pron)} ${vIng}${en.paren ? ' ' + en.paren : ''}` : pron;
      englishPrompt = `How do I say: ${enPhrase}?`;
    }
    if (!englishPrompt) continue;
    const idBase = `gen_vpr_${chosen.id}_${inf.person || 'na'}_${inf.number || 'na'}_${inf.gender || 'na'}_${hashShort(englishPrompt)}`;
    if (attemptedIds.has(idBase)) continue;
    const item = await prisma.lessonItem.upsert({
      where: { id: idBase },
      update: { lesson_id: lessonId, lexeme_id: chosen.id, english_prompt: englishPrompt, target_hebrew: `${hebPron} ${inf.form}`, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['generated','verb','present'], difficulty: 1, features: { pos: 'verb', tense: 'present', person: inf.person || null, number: inf.number || null, gender: inf.gender || null, binyan: (inf as any).binyan || null } as any },
      create: { id: idBase, lesson_id: lessonId, lexeme_id: chosen.id, english_prompt: englishPrompt, target_hebrew: `${hebPron} ${inf.form}`, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['generated','verb','present'], difficulty: 1, features: { pos: 'verb', tense: 'present', person: inf.person || null, number: inf.number || null, gender: inf.gender || null, binyan: (inf as any).binyan || null } as any }
    });
    const out = { id: item.id, english_prompt: item.english_prompt, target_hebrew: item.target_hebrew, transliteration: item.transliteration, features: (item as any).features as Record<string, string | null> | null };
    if (!validateGenerated('verb', out)) continue;
    return out;
  }
  return null;
}

async function generateVerbPastItem(lessonId: string, attemptedIds: Set<string>, desired?: Desired | null, allowLexemeIds?: string[] | null, isGreen?: boolean, userId?: string): Promise<LessonItemShape | null> {
  const lex = await prisma.lexeme.findMany({ where: { language: 'he', pos: { in: ['verb', 'Q24905'] }, ...(allowLexemeIds?.length ? { id: { in: allowLexemeIds } } : {}) }, select: { id: true, lemma: true, gloss: true } });
  if (!lex.length) return null;
  for (let tries = 0; tries < 10; tries++) {
    const chosen = pick(lex);
    if (!chosen) break;
    if (isGreen && userId) {
      const famId = `lex:${chosen.id}`;
      const intro = await prisma.familyStat.findUnique({ where: { family_id_user_id: { family_id: famId, user_id: userId } } });
      if (!intro) continue;
    }
    const infls = await prisma.inflection.findMany({ where: { lexeme_id: chosen.id, tense: 'past' }, select: { form: true, person: true, number: true, gender: true, binyan: true } });
    if (!infls.length) continue;
    let pool = infls.filter(i => isCompleteVerbInf({ person: i.person || null, number: i.number || null, gender: i.gender || null }));
    if (!pool.length) continue;
    if (desired?.number || desired?.gender || desired?.person) {
      const filtered = pool.filter(i => (!desired?.number || i.number === desired.number) && (!desired?.gender || i.gender === desired.gender) && (!desired?.person || i.person === desired.person));
      if (filtered.length) pool = filtered;
    }
    const inf = pick(pool);
    if (!inf) continue;
    const pron = pronounFrom({ person: inf.person, number: inf.number, gender: inf.gender });
    let englishPrompt: string | null = null;
    if (isGreen) {
      // Align English to the selected past inflection
      const en = englishFromCard(chosen.gloss || '');
      if (!en.base) continue; // require a gloss; skip otherwise
      const verb = en.base;
      const vPast = pastForm(verb);
      const enPhrase = verb ? `${pron} ${vPast}${en.paren ? ' ' + en.paren : ''}` : pron;
      englishPrompt = `How do I say: ${enPhrase}?`;
    } else {
      const enSrc = chosen.gloss || (await prisma.lessonItem.findFirst({ where: { lexeme_id: chosen.id }, select: { english_prompt: true } }))?.english_prompt || '';
      const en = englishFromCard(enSrc);
      if (!en.base) continue;
      const verb = en.base;
      const vPast = pastForm(verb);
      const enPhrase = verb ? `${pron} ${vPast}${en.paren ? ' ' + en.paren : ''}` : pron;
      englishPrompt = `How do I say: ${enPhrase}?`;
    }
    if (!englishPrompt) continue;
    const hebPron = pronounHeb({ person: inf.person, number: inf.number, gender: inf.gender }, '3');
    const idBase = `gen_vpa_${chosen.id}_${inf.person || 'na'}_${inf.number || 'na'}_${inf.gender || 'na'}_${hashShort(englishPrompt)}`;
    if (attemptedIds.has(idBase)) continue;
    const item = await prisma.lessonItem.upsert({
      where: { id: idBase },
      update: { lesson_id: lessonId, lexeme_id: chosen.id, english_prompt: englishPrompt, target_hebrew: `${hebPron} ${inf.form}`, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['generated','verb','past'], difficulty: 1, features: { pos: 'verb', tense: 'past', person: inf.person || null, number: inf.number || null, gender: inf.gender || null, binyan: (inf as any).binyan || null } as any },
      create: { id: idBase, lesson_id: lessonId, lexeme_id: chosen.id, english_prompt: englishPrompt, target_hebrew: `${hebPron} ${inf.form}`, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['generated','verb','past'], difficulty: 1, features: { pos: 'verb', tense: 'past', person: inf.person || null, number: inf.number || null, gender: inf.gender || null, binyan: (inf as any).binyan || null } as any }
    });
    const out = { id: item.id, english_prompt: item.english_prompt, target_hebrew: item.target_hebrew, transliteration: item.transliteration, features: (item as any).features as Record<string, string | null> | null };
    if (!validateGenerated('verb', out)) continue;
    return out;
  }
  return null;
}

async function generateNounItem(lessonId: string, attemptedIds: Set<string>, desired?: Desired | null, allowLexemeIds?: string[] | null, isGreen?: boolean, userId?: string): Promise<LessonItemShape | null> {
  const lex = await prisma.lexeme.findMany({ where: { language: 'he', pos: { in: ['noun', 'Q1084'] }, ...(allowLexemeIds?.length ? { id: { in: allowLexemeIds } } : {}) }, select: { id: true, lemma: true, gloss: true, features: true } });
  const usableLex = lex.filter(l => {
    const isMultiWord = l.lemma.includes(' ');
    if (!isMultiWord) return true;
    const feat = l.features as Record<string, string> | null;
    return feat?.definite_form != null;
  });
  if (!usableLex.length) return null;
  for (let tries = 0; tries < 10; tries++) {
    const chosen = pick(usableLex);
    if (!chosen) break;
    if (isGreen && userId) {
      const famId = `lex:${chosen.id}`;
      const intro = await prisma.familyStat.findUnique({ where: { family_id_user_id: { family_id: famId, user_id: userId } } });
      if (!intro) continue;
    }
    const feat = chosen.features as Record<string, string> | null;
    const isCompound = chosen.lemma.includes(' ');
    const infls = await prisma.inflection.findMany({ where: { lexeme_id: chosen.id }, select: { form: true, number: true, gender: true } });
    if (!infls.length) continue;

    // Prefer singular forms for early exposures; avoid multiword unless compound; filter possessive suffixes
    const hasPossSuffix = (s: string) => /(?:י|ך|ךָ|ךְ|נו|כם|כן|יהם|יהן)$/.test(s || '');
    let validInfls = (isCompound ? infls : infls.filter(i => !i.form.includes(' ')))
      .filter(i => isCompleteNounInf({ number: i.number || null }))
      .filter(i => !hasPossSuffix(i.form));
    const sgInfls = validInfls.filter(i => i.number === 'sg' || !i.number);
    if (sgInfls.length) validInfls = sgInfls;
    if (!validInfls.length) continue;

    let en: { base: string; isVerb: boolean; paren?: string } | null = null;
    if (!isGreen) {
      const enSrc = chosen.gloss || (await prisma.lessonItem.findFirst({ where: { lexeme_id: chosen.id }, select: { english_prompt: true } }))?.english_prompt || '';
      en = englishFromCard(enSrc);
      if (!en.base) continue;
    }

    const sgPool = validInfls.filter(i => i.number === 'sg' || !i.number);
    const plPool = validInfls.filter(i => i.number === 'pl');

    const canDoPlural = plPool.length > 0;
    const doDef = !canDoPlural || Math.random() < 0.5;

    let englishPrompt: string;
    let targetHebrew: string;
    let usedInf: typeof infls[0];
    let drillType: 'def' | 'pl';

    if (isGreen) {
      usedInf = pick(validInfls)!;
      // Require a proper English gloss; skip if missing to avoid Hebrew-in-English prompt
      if (!chosen.gloss) continue;
      englishPrompt = `How do I say: ${chosen.gloss}?`;
      targetHebrew = usedInf.form;
      drillType = usedInf.number === 'pl' ? 'pl' : 'def';
    } else if (doDef && sgPool.length > 0) {
      usedInf = pick(sgPool)!;
      englishPrompt = `How do I say: the ${en!.base}${en!.paren ? ' ' + en!.paren : ''}?`;
      targetHebrew = isCompound && feat?.definite_form ? feat.definite_form : `ה${usedInf.form}`;
      drillType = 'def';
    } else if (canDoPlural) {
      usedInf = pick(plPool)!;
      englishPrompt = `How do I say: ${en!.base}s${en!.paren ? ' ' + en!.paren : ''} (plural)?`;
      targetHebrew = usedInf.form;
      drillType = 'pl';
    } else {
      usedInf = pick(validInfls)!;
      englishPrompt = `How do I say: the ${en!.base}${en!.paren ? ' ' + en!.paren : ''}?`;
      targetHebrew = isCompound && feat?.definite_form ? feat.definite_form : `ה${usedInf.form}`;
      drillType = 'def';
    }

    const numLabel = usedInf.number || 'sg';
    const genLabel = usedInf.gender || 'na';
    const idBase = `gen_noun_${chosen.id}_${numLabel}_${genLabel}_${drillType}_${hashShort(englishPrompt)}`;
    if (attemptedIds.has(idBase)) continue;
    const item = await prisma.lessonItem.upsert({
      where: { id: idBase },
      update: { lesson_id: lessonId, lexeme_id: chosen.id, english_prompt: englishPrompt, target_hebrew: targetHebrew, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['generated','noun'], difficulty: 1, features: { pos: 'noun', number: numLabel, gender: genLabel } as any },
      create: { id: idBase, lesson_id: lessonId, lexeme_id: chosen.id, english_prompt: englishPrompt, target_hebrew: targetHebrew, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['generated','noun'], difficulty: 1, features: { pos: 'noun', number: numLabel, gender: genLabel } as any }
    });
    const out = { id: item.id, english_prompt: item.english_prompt, target_hebrew: item.target_hebrew, transliteration: item.transliteration, features: (item as any).features as Record<string, string | null> | null };
    if (!validateGenerated('noun', out)) continue;
    return out;
  }
  return null;
}

async function generateVerbFutureItem(lessonId: string, attemptedIds: Set<string>, desired?: Desired | null, allowLexemeIds?: string[] | null, isGreen?: boolean, userId?: string): Promise<LessonItemShape | null> {
  const lex = await prisma.lexeme.findMany({ where: { language: 'he', pos: { in: ['verb', 'Q24905'] }, ...(allowLexemeIds?.length ? { id: { in: allowLexemeIds } } : {}) }, select: { id: true, lemma: true, gloss: true } });
  if (!lex.length) return null;
  for (let tries = 0; tries < 10; tries++) {
    const chosen = pick(lex);
    if (!chosen) break;
    if (isGreen && userId) {
      const famId = `lex:${chosen.id}`;
      const intro = await prisma.familyStat.findUnique({ where: { family_id_user_id: { family_id: famId, user_id: userId } } });
      if (!intro) continue;
    }
    const infls = await prisma.inflection.findMany({ where: { lexeme_id: chosen.id, tense: 'future' }, select: { form: true, person: true, number: true, gender: true, binyan: true } });
    if (!infls.length) continue;
    let pool = infls.filter(i => isCompleteVerbInf({ person: i.person || null, number: i.number || null, gender: i.gender || null }));
    if (!pool.length) continue;
    if (desired?.number || desired?.gender || desired?.person) {
      const filtered = pool.filter(i => (!desired?.number || i.number === desired.number) && (!desired?.gender || i.gender === desired.gender) && (!desired?.person || i.person === desired.person));
      if (filtered.length) pool = filtered;
    }
    const inf = pick(pool);
    if (!inf) continue;
    const pron = pronounFrom({ person: inf.person, number: inf.number, gender: inf.gender });
    let englishPrompt: string | null = null;
    if (isGreen) {
      // Align English to the selected future inflection
      const en = englishFromCard(chosen.gloss || '');
      if (!en.base) continue; // skip if no gloss
      const verb = en.base;
      const vFuture = futureForm(verb);
      const enPhrase = verb ? `${pron} ${vFuture}${en.paren ? ' ' + en.paren : ''}` : pron;
      englishPrompt = `How do I say: ${enPhrase}?`;
    } else {
      const enSrc = chosen.gloss || (await prisma.lessonItem.findFirst({ where: { lexeme_id: chosen.id }, select: { english_prompt: true } }))?.english_prompt || '';
      const en = englishFromCard(enSrc);
      if (!en.base) continue;
      const verb = en.base;
      const vFuture = futureForm(verb);
      const enPhrase = verb ? `${pron} ${vFuture}${en.paren ? ' ' + en.paren : ''}` : pron;
      englishPrompt = `How do I say: ${enPhrase}?`;
    }
    if (!englishPrompt) continue;
    const hebPron = pronounHeb({ person: inf.person, number: inf.number, gender: inf.gender }, '3');
    const idBase = `gen_vfu_${chosen.id}_${inf.person || 'na'}_${inf.number || 'na'}_${inf.gender || 'na'}_${hashShort(englishPrompt)}`;
    if (attemptedIds.has(idBase)) continue;
    const item = await prisma.lessonItem.upsert({
      where: { id: idBase },
      update: { lesson_id: lessonId, lexeme_id: chosen.id, english_prompt: englishPrompt, target_hebrew: `${hebPron} ${inf.form}`, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['generated','verb','future'], difficulty: 1, features: { pos: 'verb', tense: 'future', person: inf.person || null, number: inf.number || null, gender: inf.gender || null, binyan: (inf as any).binyan || null } as any },
      create: { id: idBase, lesson_id: lessonId, lexeme_id: chosen.id, english_prompt: englishPrompt, target_hebrew: `${hebPron} ${inf.form}`, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['generated','verb','future'], difficulty: 1, features: { pos: 'verb', tense: 'future', person: inf.person || null, number: inf.number || null, gender: inf.gender || null, binyan: (inf as any).binyan || null } as any }
    });
    const out = { id: item.id, english_prompt: item.english_prompt, target_hebrew: item.target_hebrew, transliteration: item.transliteration, features: (item as any).features as Record<string, string | null> | null };
    if (!validateGenerated('verb', out)) continue;
    return out;
  }
  return null;
}
