import { prisma } from '@/lib/db';
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

function pronounFrom(inf: { person: string | null; number: string | null; gender: string | null }): string {
  const p = inf.person || '';
  const n = inf.number || '';
  const g = inf.gender || '';
  if (p === '1' && n === 'sg') return 'I';
  if (p === '1' && n === 'pl') return 'we';
  if (p === '2') return 'you';
  if (p === '3' && n === 'sg' && g === 'm') return 'he';
  if (p === '3' && n === 'sg' && g === 'f') return 'she';
  if (p === '3' && n === 'pl' && g === 'm') return 'they (m)';
  if (p === '3' && n === 'pl' && g === 'f') return 'they (f)';
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
  if (p === '3' && n === 'pl' && g === 'm') return 'הם';
  if (p === '3' && n === 'pl' && g === 'f') return 'הן';
  return 'אני';
}

function englishFromCard(cardEn: string): { base: string; isVerb: boolean; paren?: string } {
  const en = cardEn.trim();
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
  const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { lesson_id: true } });
  if (!session) return null;
  const baseLesson = await prisma.lesson.findUnique({ where: { id: session.lesson_id } });
  if (!baseLesson) return null;

  const greenLexemeIds = baseLesson.id === 'vocab_green' ? getGreenLexemeIds() : null;
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
    const due = await prisma.featureStat.findFirst({ where: { next_due: { lte: now } }, orderBy: { next_due: 'asc' } });
    if (due) desired = { person: (due as any).person || null, number: (due as any).number || null, gender: (due as any).gender || null };
  } catch {}
  if (opts?.focusWeakness) {
    const since = new Date(); since.setDate(since.getDate() - 30);
    const misses = await prisma.attempt.findMany({
      where: { created_at: { gte: since }, OR: [{ grade: 'flawed' }, { grade: 'incorrect' }] },
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

  const strategies: Array<() => Promise<LessonItemShape | null>> = [
    async () => generateAdjectiveItem(genLessonId, attemptedIds, desired, greenLexemeIds),
    async () => generateVerbPresentItem(genLessonId, attemptedIds, desired, greenLexemeIds),
    async () => generateVerbPastItem(genLessonId, attemptedIds, desired, greenLexemeIds),
    async () => generateVerbFutureItem(genLessonId, attemptedIds, desired, greenLexemeIds),
    async () => generateNounItem(genLessonId, attemptedIds, desired, greenLexemeIds)
  ];

  for (let i = 0; i < 6; i++) {
    const strat = pick(strategies);
    if (!strat) break;
    const item = await strat();
    if (item) return item;
  }
  return null;
}

async function generateAdjectiveItem(lessonId: string, attemptedIds: Set<string>, desired?: Desired | null, allowLexemeIds?: string[] | null): Promise<LessonItemShape | null> {
  const lex = await prisma.lexeme.findMany({ where: { language: 'he', pos: 'adjective', ...(allowLexemeIds?.length ? { id: { in: allowLexemeIds } } : {}) }, select: { id: true, lemma: true } });
  if (!lex.length) return null;
  for (let tries = 0; tries < 10; tries++) {
    const chosen = pick(lex);
    if (!chosen) break;
    const infls = await prisma.inflection.findMany({ where: { lexeme_id: chosen.id }, select: { form: true, person: true, number: true, gender: true } });
    if (!infls.length) continue;
    let pool = infls;
    if (desired?.number || desired?.gender) {
      pool = infls.filter(i => (!desired?.number || i.number === desired.number) && (!desired?.gender || i.gender === desired.gender));
      if (!pool.length) pool = infls;
    }
    const inf = pick(pool);
    if (!inf) continue;
    const pron = pronounFrom({ person: '3', number: inf.number, gender: inf.gender });
    const card = await prisma.lessonItem.findFirst({ where: { lexeme_id: chosen.id }, select: { english_prompt: true } });
    const en = englishFromCard(card?.english_prompt || '');
    if (!en.base) continue;
    const enPhrase = en.base ? `${pron} ${beFor(pron)} ${en.base}${en.paren ? ' ' + en.paren : ''}` : pron;
    const hebPron = pronounHeb({ person: '3', number: inf.number, gender: inf.gender }, '3');
    const englishPrompt = `How do I say: ${enPhrase}?`;
    const idBase = `gen_adj_${chosen.id}_${inf.number || 'na'}_${inf.gender || 'na'}_${hashShort(englishPrompt)}`;
    if (attemptedIds.has(idBase)) continue;
    const item = await prisma.lessonItem.upsert({
      where: { id: idBase },
      update: { lesson_id: lessonId, english_prompt: englishPrompt, target_hebrew: `${hebPron} ${inf.form}`, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['generated','adjective'], difficulty: 1, features: { pos: 'adjective', number: inf.number || null, gender: inf.gender || null } as any },
      create: { id: idBase, lesson_id: lessonId, english_prompt: englishPrompt, target_hebrew: `${hebPron} ${inf.form}`, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['generated','adjective'], difficulty: 1, features: { pos: 'adjective', number: inf.number || null, gender: inf.gender || null } as any }
    });
    return { id: item.id, english_prompt: item.english_prompt, target_hebrew: item.target_hebrew, transliteration: item.transliteration, features: (item as any).features as Record<string, string | null> | null };
  }
  return null;
}

async function generateVerbPresentItem(lessonId: string, attemptedIds: Set<string>, desired?: Desired | null, allowLexemeIds?: string[] | null): Promise<LessonItemShape | null> {
  const lex = await prisma.lexeme.findMany({ where: { language: 'he', pos: 'verb', ...(allowLexemeIds?.length ? { id: { in: allowLexemeIds } } : {}) }, select: { id: true, lemma: true, features: true } });
  if (!lex.length) return null;
  for (let tries = 0; tries < 10; tries++) {
    const chosen = pick(lex);
    if (!chosen) break;
    const infls = await prisma.inflection.findMany({ where: { lexeme_id: chosen.id, tense: 'present' }, select: { form: true, person: true, number: true, gender: true, binyan: true } });
    if (!infls.length) continue;
    let pool = infls;
    if (desired?.number || desired?.gender || desired?.person) {
      pool = infls.filter(i => (!desired?.number || i.number === desired.number) && (!desired?.gender || i.gender === desired.gender) && (!desired?.person || i.person === desired.person));
      if (!pool.length) pool = infls;
    }
    const inf = pick(pool);
    if (!inf) continue;
    const pron = pronounFrom({ person: inf.person, number: inf.number, gender: inf.gender });
    const hebPron = pronounHeb({ person: inf.person, number: inf.number, gender: inf.gender }, '3');
    const card = await prisma.lessonItem.findFirst({ where: { lexeme_id: chosen.id }, select: { english_prompt: true } });
    const en = englishFromCard(card?.english_prompt || '');
    if (!en.base) continue;
    const verb = en.base;
    const vIng = ingForm(verb);
    const enPhrase = verb ? `${pron} ${beFor(pron)} ${vIng}${en.paren ? ' ' + en.paren : ''}` : pron;
    const englishPrompt = `How do I say: ${enPhrase}?`;
    const idBase = `gen_vpr_${chosen.id}_${inf.person || 'na'}_${inf.number || 'na'}_${inf.gender || 'na'}_${hashShort(englishPrompt)}`;
    if (attemptedIds.has(idBase)) continue;
    const item = await prisma.lessonItem.upsert({
      where: { id: idBase },
      update: { lesson_id: lessonId, english_prompt: englishPrompt, target_hebrew: `${hebPron} ${inf.form}`, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['generated','verb','present'], difficulty: 1, features: { pos: 'verb', tense: 'present', person: inf.person || null, number: inf.number || null, gender: inf.gender || null, binyan: (inf as any).binyan || null } as any },
      create: { id: idBase, lesson_id: lessonId, english_prompt: englishPrompt, target_hebrew: `${hebPron} ${inf.form}`, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['generated','verb','present'], difficulty: 1, features: { pos: 'verb', tense: 'present', person: inf.person || null, number: inf.number || null, gender: inf.gender || null, binyan: (inf as any).binyan || null } as any }
    });
    return { id: item.id, english_prompt: item.english_prompt, target_hebrew: item.target_hebrew, transliteration: item.transliteration, features: (item as any).features as Record<string, string | null> | null };
  }
  return null;
}

async function generateVerbPastItem(lessonId: string, attemptedIds: Set<string>, desired?: Desired | null, allowLexemeIds?: string[] | null): Promise<LessonItemShape | null> {
  const lex = await prisma.lexeme.findMany({ where: { language: 'he', pos: 'verb', ...(allowLexemeIds?.length ? { id: { in: allowLexemeIds } } : {}) }, select: { id: true, lemma: true } });
  if (!lex.length) return null;
  for (let tries = 0; tries < 10; tries++) {
    const chosen = pick(lex);
    if (!chosen) break;
    const infls = await prisma.inflection.findMany({ where: { lexeme_id: chosen.id, tense: 'past' }, select: { form: true, person: true, number: true, gender: true, binyan: true } });
    if (!infls.length) continue;
    let pool = infls;
    if (desired?.number || desired?.gender || desired?.person) {
      pool = infls.filter(i => (!desired?.number || i.number === desired.number) && (!desired?.gender || i.gender === desired.gender) && (!desired?.person || i.person === desired.person));
      if (!pool.length) pool = infls;
    }
    const inf = pick(pool);
    if (!inf) continue;
    const pron = pronounFrom({ person: inf.person, number: inf.number, gender: inf.gender });
    const card = await prisma.lessonItem.findFirst({ where: { lexeme_id: chosen.id }, select: { english_prompt: true } });
    const en = englishFromCard(card?.english_prompt || '');
    if (!en.base) continue;
    const verb = en.base;
    const vPast = pastForm(verb);
    const enPhrase = verb ? `${pron} ${vPast}${en.paren ? ' ' + en.paren : ''}` : pron;
    const englishPrompt = `How do I say: ${enPhrase}?`;
    const hebPron = pronounHeb({ person: inf.person, number: inf.number, gender: inf.gender }, '1');
    const idBase = `gen_vpa_${chosen.id}_${inf.person || 'na'}_${inf.number || 'na'}_${inf.gender || 'na'}_${hashShort(englishPrompt)}`;
    if (attemptedIds.has(idBase)) continue;
    const item = await prisma.lessonItem.upsert({
      where: { id: idBase },
      update: { lesson_id: lessonId, english_prompt: englishPrompt, target_hebrew: `${hebPron} ${inf.form}`, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['generated','verb','past'], difficulty: 1, features: { pos: 'verb', tense: 'past', person: inf.person || null, number: inf.number || null, gender: inf.gender || null, binyan: (inf as any).binyan || null } as any },
      create: { id: idBase, lesson_id: lessonId, english_prompt: englishPrompt, target_hebrew: `${hebPron} ${inf.form}`, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['generated','verb','past'], difficulty: 1, features: { pos: 'verb', tense: 'past', person: inf.person || null, number: inf.number || null, gender: inf.gender || null, binyan: (inf as any).binyan || null } as any }
    });
    return { id: item.id, english_prompt: item.english_prompt, target_hebrew: item.target_hebrew, transliteration: item.transliteration, features: (item as any).features as Record<string, string | null> | null };
  }
  return null;
}

async function generateNounItem(lessonId: string, attemptedIds: Set<string>, desired?: Desired | null, allowLexemeIds?: string[] | null): Promise<LessonItemShape | null> {
  const lex = await prisma.lexeme.findMany({ where: { language: 'he', pos: 'noun', ...(allowLexemeIds?.length ? { id: { in: allowLexemeIds } } : {}) }, select: { id: true, lemma: true, features: true } });
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
    const feat = chosen.features as Record<string, string> | null;
    const isCompound = chosen.lemma.includes(' ');
    const infls = await prisma.inflection.findMany({ where: { lexeme_id: chosen.id }, select: { form: true, number: true, gender: true } });
    if (!infls.length) continue;

    const validInfls = isCompound ? infls : infls.filter(i => !i.form.includes(' '));
    if (!validInfls.length) continue;

    const card = await prisma.lessonItem.findFirst({ where: { lexeme_id: chosen.id }, select: { english_prompt: true } });
    const en = englishFromCard(card?.english_prompt || '');
    if (!en.base) continue;

    const sgPool = validInfls.filter(i => i.number === 'sg' || !i.number);
    const plPool = validInfls.filter(i => i.number === 'pl');

    const canDoPlural = plPool.length > 0;
    const doDef = !canDoPlural || Math.random() < 0.5;

    let englishPrompt: string;
    let targetHebrew: string;
    let usedInf: typeof infls[0];
    let drillType: 'def' | 'pl';

    if (doDef && sgPool.length > 0) {
      usedInf = pick(sgPool)!;
      englishPrompt = `How do I say: the ${en.base}${en.paren ? ' ' + en.paren : ''}?`;
      targetHebrew = isCompound && feat?.definite_form ? feat.definite_form : `ה${usedInf.form}`;
      drillType = 'def';
    } else if (canDoPlural) {
      usedInf = pick(plPool)!;
      englishPrompt = `How do I say: ${en.base}s${en.paren ? ' ' + en.paren : ''} (plural)?`;
      targetHebrew = usedInf.form;
      drillType = 'pl';
    } else {
      usedInf = pick(validInfls)!;
      englishPrompt = `How do I say: the ${en.base}${en.paren ? ' ' + en.paren : ''}?`;
      targetHebrew = isCompound && feat?.definite_form ? feat.definite_form : `ה${usedInf.form}`;
      drillType = 'def';
    }

    const numLabel = usedInf.number || 'sg';
    const genLabel = usedInf.gender || 'na';
    const idBase = `gen_noun_${chosen.id}_${numLabel}_${genLabel}_${drillType}_${hashShort(englishPrompt)}`;
    if (attemptedIds.has(idBase)) continue;
    const item = await prisma.lessonItem.upsert({
      where: { id: idBase },
      update: { lesson_id: lessonId, english_prompt: englishPrompt, target_hebrew: targetHebrew, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['generated','noun'], difficulty: 1, features: { pos: 'noun', number: numLabel, gender: genLabel } as any },
      create: { id: idBase, lesson_id: lessonId, english_prompt: englishPrompt, target_hebrew: targetHebrew, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['generated','noun'], difficulty: 1, features: { pos: 'noun', number: numLabel, gender: genLabel } as any }
    });
    return { id: item.id, english_prompt: item.english_prompt, target_hebrew: item.target_hebrew, transliteration: item.transliteration, features: (item as any).features as Record<string, string | null> | null };
  }
  return null;
}

async function generateVerbFutureItem(lessonId: string, attemptedIds: Set<string>, desired?: Desired | null, allowLexemeIds?: string[] | null): Promise<LessonItemShape | null> {
  const lex = await prisma.lexeme.findMany({ where: { language: 'he', pos: 'verb', ...(allowLexemeIds?.length ? { id: { in: allowLexemeIds } } : {}) }, select: { id: true, lemma: true } });
  if (!lex.length) return null;
  for (let tries = 0; tries < 10; tries++) {
    const chosen = pick(lex);
    if (!chosen) break;
    const infls = await prisma.inflection.findMany({ where: { lexeme_id: chosen.id, tense: 'future' }, select: { form: true, person: true, number: true, gender: true, binyan: true } });
    if (!infls.length) continue;
    let pool = infls;
    if (desired?.number || desired?.gender || desired?.person) {
      pool = infls.filter(i => (!desired?.number || i.number === desired.number) && (!desired?.gender || i.gender === desired.gender) && (!desired?.person || i.person === desired.person));
      if (!pool.length) pool = infls;
    }
    const inf = pick(pool);
    if (!inf) continue;
    const pron = pronounFrom({ person: inf.person, number: inf.number, gender: inf.gender });
    const card = await prisma.lessonItem.findFirst({ where: { lexeme_id: chosen.id }, select: { english_prompt: true } });
    const en = englishFromCard(card?.english_prompt || '');
    if (!en.base) continue;
    const verb = en.base;
    const vFuture = futureForm(verb);
    const enPhrase = verb ? `${pron} ${vFuture}${en.paren ? ' ' + en.paren : ''}` : pron;
    const englishPrompt = `How do I say: ${enPhrase}?`;
    const hebPron = pronounHeb({ person: inf.person, number: inf.number, gender: inf.gender }, '1');
    const idBase = `gen_vfu_${chosen.id}_${inf.person || 'na'}_${inf.number || 'na'}_${inf.gender || 'na'}_${hashShort(englishPrompt)}`;
    if (attemptedIds.has(idBase)) continue;
    const item = await prisma.lessonItem.upsert({
      where: { id: idBase },
      update: { lesson_id: lessonId, english_prompt: englishPrompt, target_hebrew: `${hebPron} ${inf.form}`, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['generated','verb','future'], difficulty: 1, features: { pos: 'verb', tense: 'future', person: inf.person || null, number: inf.number || null, gender: inf.gender || null, binyan: (inf as any).binyan || null } as any },
      create: { id: idBase, lesson_id: lessonId, english_prompt: englishPrompt, target_hebrew: `${hebPron} ${inf.form}`, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['generated','verb','future'], difficulty: 1, features: { pos: 'verb', tense: 'future', person: inf.person || null, number: inf.number || null, gender: inf.gender || null, binyan: (inf as any).binyan || null } as any }
    });
    return { id: item.id, english_prompt: item.english_prompt, target_hebrew: item.target_hebrew, transliteration: item.transliteration, features: (item as any).features as Record<string, string | null> | null };
  }
  return null;
}
