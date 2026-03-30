import { prisma } from '../Daber/lib/db';

type Morph = { person?: string | null; number?: string | null; gender?: string | null };

function enPron(m: Morph): string {
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

function hePron(m: Morph): string {
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

function ing(v: string): string {
  const b = v.trim();
  if (!b) return b;
  if (/ie$/i.test(b)) return b.replace(/ie$/i, 'ying');
  if (/[^aeiou]e$/i.test(b)) return b.replace(/e$/i, 'ing');
  return b + 'ing';
}

function past(v: string): string {
  const irregular: Record<string, string> = { write: 'wrote' };
  const head = v.toLowerCase();
  return irregular[head] || (head.endsWith('e') ? head + 'd' : head + 'ed');
}

async function main() {
  const lessonId = 'vocab_mini_morph';
  // Create lesson
  await prisma.lesson.upsert({
    where: { id: lessonId },
    update: { title: 'Mini Morph Drill', language: 'he', level: 'mini', type: 'vocab', description: 'Small allowlisted set with key forms (mini sandbox)' },
    create: { id: lessonId, title: 'Mini Morph Drill', language: 'he', level: 'mini', type: 'vocab', description: 'Small allowlisted set with key forms (mini sandbox)' }
  });

  // Lexemes
  const L_VERB = 'mini_lex_write';
  const L_NOUN = 'mini_lex_book';
  const L_ADJ  = 'mini_lex_big';
  // Phase 1 expansion
  const L_VERB2 = 'mini_lex_speak';
  const L_NOUN2 = 'mini_lex_icecream';
  const L_ADJ2  = 'mini_lex_new';
  // Phase 2 expansion
  const L_VERB3 = 'mini_lex_read';
  const L_VERB4 = 'mini_lex_hear';
  const L_NOUN3 = 'mini_lex_song';
  const L_ADJ3  = 'mini_lex_smart';
  const F_VERB = `lex:${L_VERB}`;
  const F_NOUN = `lex:${L_NOUN}`;
  const F_ADJ  = `lex:${L_ADJ}`;
  const F_VERB2 = `lex:${L_VERB2}`;
  const F_NOUN2 = `lex:${L_NOUN2}`;
  const F_ADJ2  = `lex:${L_ADJ2}`;
  const F_VERB3 = `lex:${L_VERB3}`;
  const F_VERB4 = `lex:${L_VERB4}`;
  const F_NOUN3 = `lex:${L_NOUN3}`;
  const F_ADJ3  = `lex:${L_ADJ3}`;

  await prisma.lexeme.upsert({ where: { id: L_VERB }, update: { lemma: 'לכתוב', language: 'he', pos: 'verb', gloss: 'to write' }, create: { id: L_VERB, lemma: 'לכתוב', language: 'he', pos: 'verb', gloss: 'to write' } });
  await prisma.lexeme.upsert({ where: { id: L_NOUN }, update: { lemma: 'ספר', language: 'he', pos: 'noun', gloss: 'book' }, create: { id: L_NOUN, lemma: 'ספר', language: 'he', pos: 'noun', gloss: 'book' } });
  await prisma.lexeme.upsert({ where: { id: L_ADJ }, update: { lemma: 'גדול', language: 'he', pos: 'adjective', gloss: 'big' }, create: { id: L_ADJ, lemma: 'גדול', language: 'he', pos: 'adjective', gloss: 'big' } });
  // Phase 1 lexemes
  await prisma.lexeme.upsert({ where: { id: L_VERB2 }, update: { lemma: 'לדבר', language: 'he', pos: 'verb', gloss: 'to speak' }, create: { id: L_VERB2, lemma: 'לדבר', language: 'he', pos: 'verb', gloss: 'to speak' } });
  await prisma.lexeme.upsert({ where: { id: L_NOUN2 }, update: { lemma: 'גלידה', language: 'he', pos: 'noun', gloss: 'ice cream' }, create: { id: L_NOUN2, lemma: 'גלידה', language: 'he', pos: 'noun', gloss: 'ice cream' } });
  await prisma.lexeme.upsert({ where: { id: L_ADJ2 }, update: { lemma: 'חדש', language: 'he', pos: 'adjective', gloss: 'new' }, create: { id: L_ADJ2, lemma: 'חדש', language: 'he', pos: 'adjective', gloss: 'new' } });
  // Phase 2 lexemes
  await prisma.lexeme.upsert({ where: { id: L_VERB3 }, update: { lemma: 'לקרוא', language: 'he', pos: 'verb', gloss: 'to read' }, create: { id: L_VERB3, lemma: 'לקרוא', language: 'he', pos: 'verb', gloss: 'to read' } });
  await prisma.lexeme.upsert({ where: { id: L_VERB4 }, update: { lemma: 'לשמוע', language: 'he', pos: 'verb', gloss: 'to hear' }, create: { id: L_VERB4, lemma: 'לשמוע', language: 'he', pos: 'verb', gloss: 'to hear' } });
  await prisma.lexeme.upsert({ where: { id: L_NOUN3 }, update: { lemma: 'שיר', language: 'he', pos: 'noun', gloss: 'song' }, create: { id: L_NOUN3, lemma: 'שיר', language: 'he', pos: 'noun', gloss: 'song' } });
  await prisma.lexeme.upsert({ where: { id: L_ADJ3 }, update: { lemma: 'חכם', language: 'he', pos: 'adjective', gloss: 'smart' }, create: { id: L_ADJ3, lemma: 'חכם', language: 'he', pos: 'adjective', gloss: 'smart' } });

  // Inflections — VERB (כתב / לכתוב)
  const vInfs: Array<{ form: string; tense?: string | null; person?: string | null; number?: string | null; gender?: string | null }>= [
    { form: 'לכתוב', tense: 'infinitive' },
    // present
    { form: 'כותב', tense: 'present', number: 'sg', gender: 'm', person: '3' },
    { form: 'כותבת', tense: 'present', number: 'sg', gender: 'f', person: '3' },
    { form: 'כותבים', tense: 'present', number: 'pl', gender: 'm', person: '3' },
    { form: 'כותבות', tense: 'present', number: 'pl', gender: 'f', person: '3' },
    // past (subset across persons)
    { form: 'כתבתי', tense: 'past', person: '1', number: 'sg', gender: null },
    { form: 'כתב', tense: 'past', person: '3', number: 'sg', gender: 'm' },
    { form: 'כתבה', tense: 'past', person: '3', number: 'sg', gender: 'f' },
    { form: 'כתבנו', tense: 'past', person: '1', number: 'pl', gender: null },
    { form: 'כתבו', tense: 'past', person: '3', number: 'pl', gender: null },
    // future (subset across persons)
    { form: 'אכתוב', tense: 'future', person: '1', number: 'sg', gender: null },
    { form: 'תכתוב', tense: 'future', person: '2', number: 'sg', gender: 'm' },
    { form: 'תכתבי', tense: 'future', person: '2', number: 'sg', gender: 'f' },
    { form: 'יכתוב', tense: 'future', person: '3', number: 'sg', gender: 'm' },
    { form: 'תכתוב', tense: 'future', person: '3', number: 'sg', gender: 'f' },
    { form: 'נכתוב', tense: 'future', person: '1', number: 'pl', gender: null },
    { form: 'תכתבו', tense: 'future', person: '2', number: 'pl', gender: null },
    { form: 'יכתבו', tense: 'future', person: '3', number: 'pl', gender: null },
  ];
  for (const inf of vInfs) {
    await prisma.inflection.create({ data: { lexeme_id: L_VERB, form: inf.form, transliteration: null, tense: inf.tense ?? null, person: inf.person ?? null, number: inf.number ?? null, gender: inf.gender ?? null } }).catch(() => {});
  }

  // Inflections — VERB 2 (לדבר)
  const v2Infs: Array<{ form: string; tense?: string | null; person?: string | null; number?: string | null; gender?: string | null }>= [
    { form: 'לדבר', tense: 'infinitive' },
    // present
    { form: 'מדבר', tense: 'present', number: 'sg', gender: 'm', person: '3' },
    { form: 'מדברת', tense: 'present', number: 'sg', gender: 'f', person: '3' },
    { form: 'מדברים', tense: 'present', number: 'pl', gender: 'm', person: '3' },
    { form: 'מדברות', tense: 'present', number: 'pl', gender: 'f', person: '3' },
    // past (subset)
    { form: 'דיברתי', tense: 'past', person: '1', number: 'sg', gender: null },
    { form: 'דיבר', tense: 'past', person: '3', number: 'sg', gender: 'm' },
    { form: 'דיברה', tense: 'past', person: '3', number: 'sg', gender: 'f' },
    { form: 'דיברנו', tense: 'past', person: '1', number: 'pl', gender: null },
    { form: 'דיברו', tense: 'past', person: '3', number: 'pl', gender: null },
    // future (subset)
    { form: 'אדבר', tense: 'future', person: '1', number: 'sg', gender: null },
    { form: 'תדבר', tense: 'future', person: '2', number: 'sg', gender: 'm' },
    { form: 'תדברי', tense: 'future', person: '2', number: 'sg', gender: 'f' },
    { form: 'ידבר', tense: 'future', person: '3', number: 'sg', gender: 'm' },
    { form: 'תדבר', tense: 'future', person: '3', number: 'sg', gender: 'f' },
    { form: 'נדבר', tense: 'future', person: '1', number: 'pl', gender: null },
    { form: 'תדברו', tense: 'future', person: '2', number: 'pl', gender: null },
    { form: 'ידברו', tense: 'future', person: '3', number: 'pl', gender: null },
  ];
  for (const inf of v2Infs) {
    await prisma.inflection.create({ data: { lexeme_id: L_VERB2, form: inf.form, transliteration: null, tense: inf.tense ?? null, person: inf.person ?? null, number: inf.number ?? null, gender: inf.gender ?? null } }).catch(() => {});
  }
  // Inflections — VERB 3 (לקרוא)
  const v3Infs: Array<{ form: string; tense?: string | null; person?: string | null; number?: string | null; gender?: string | null }>= [
    { form: 'לקרוא', tense: 'infinitive' },
    // present
    { form: 'קורא', tense: 'present', number: 'sg', gender: 'm', person: '3' },
    { form: 'קוראת', tense: 'present', number: 'sg', gender: 'f', person: '3' },
    { form: 'קוראים', tense: 'present', number: 'pl', gender: 'm', person: '3' },
    { form: 'קוראות', tense: 'present', number: 'pl', gender: 'f', person: '3' },
    // past
    { form: 'קראתי', tense: 'past', person: '1', number: 'sg', gender: null },
    { form: 'קרא', tense: 'past', person: '3', number: 'sg', gender: 'm' },
    { form: 'קראה', tense: 'past', person: '3', number: 'sg', gender: 'f' },
    { form: 'קראנו', tense: 'past', person: '1', number: 'pl', gender: null },
    { form: 'קראו', tense: 'past', person: '3', number: 'pl', gender: null },
    // future
    { form: 'אקרא', tense: 'future', person: '1', number: 'sg', gender: null },
    { form: 'תקרא', tense: 'future', person: '2', number: 'sg', gender: 'm' },
    { form: 'תקראי', tense: 'future', person: '2', number: 'sg', gender: 'f' },
    { form: 'יקרא', tense: 'future', person: '3', number: 'sg', gender: 'm' },
    { form: 'תקרא', tense: 'future', person: '3', number: 'sg', gender: 'f' },
    { form: 'נקרא', tense: 'future', person: '1', number: 'pl', gender: null },
    { form: 'תקראו', tense: 'future', person: '2', number: 'pl', gender: null },
    { form: 'יקראו', tense: 'future', person: '3', number: 'pl', gender: null },
  ];
  for (const inf of v3Infs) {
    await prisma.inflection.create({ data: { lexeme_id: L_VERB3, form: inf.form, transliteration: null, tense: inf.tense ?? null, person: inf.person ?? null, number: inf.number ?? null, gender: inf.gender ?? null } }).catch(() => {});
  }
  // Inflections — VERB 4 (לשמוע)
  const v4Infs: Array<{ form: string; tense?: string | null; person?: string | null; number?: string | null; gender?: string | null }>= [
    { form: 'לשמוע', tense: 'infinitive' },
    // present
    { form: 'שומע', tense: 'present', number: 'sg', gender: 'm', person: '3' },
    { form: 'שומעת', tense: 'present', number: 'sg', gender: 'f', person: '3' },
    { form: 'שומעים', tense: 'present', number: 'pl', gender: 'm', person: '3' },
    { form: 'שומעות', tense: 'present', number: 'pl', gender: 'f', person: '3' },
    // past
    { form: 'שמעתי', tense: 'past', person: '1', number: 'sg', gender: null },
    { form: 'שמע', tense: 'past', person: '3', number: 'sg', gender: 'm' },
    { form: 'שמעה', tense: 'past', person: '3', number: 'sg', gender: 'f' },
    { form: 'שמענו', tense: 'past', person: '1', number: 'pl', gender: null },
    { form: 'שמעו', tense: 'past', person: '3', number: 'pl', gender: null },
    // future
    { form: 'אשמע', tense: 'future', person: '1', number: 'sg', gender: null },
    { form: 'תשמע', tense: 'future', person: '2', number: 'sg', gender: 'm' },
    { form: 'תשמעי', tense: 'future', person: '2', number: 'sg', gender: 'f' },
    { form: 'ישמע', tense: 'future', person: '3', number: 'sg', gender: 'm' },
    { form: 'תשמע', tense: 'future', person: '3', number: 'sg', gender: 'f' },
    { form: 'נשמע', tense: 'future', person: '1', number: 'pl', gender: null },
    { form: 'תשמעו', tense: 'future', person: '2', number: 'pl', gender: null },
    { form: 'ישמעו', tense: 'future', person: '3', number: 'pl', gender: null },
  ];
  for (const inf of v4Infs) {
    await prisma.inflection.create({ data: { lexeme_id: L_VERB4, form: inf.form, transliteration: null, tense: inf.tense ?? null, person: inf.person ?? null, number: inf.number ?? null, gender: inf.gender ?? null } }).catch(() => {});
  }

  // Inflections — NOUN (ספר)
  const nInfs = [
    { form: 'ספר', number: 'sg', gender: 'm' },
    { form: 'ספרים', number: 'pl', gender: 'm' },
  ];
  for (const inf of nInfs) {
    await prisma.inflection.create({ data: { lexeme_id: L_NOUN, form: inf.form, transliteration: null, number: inf.number as any, gender: inf.gender as any } }).catch(() => {});
  }

  // Inflections — NOUN 2 (גלידה)
  const n2Infs = [
    { form: 'גלידה', number: 'sg', gender: 'f' },
    { form: 'גלידות', number: 'pl', gender: 'f' },
  ];
  for (const inf of n2Infs) {
    await prisma.inflection.create({ data: { lexeme_id: L_NOUN2, form: inf.form, transliteration: null, number: inf.number as any, gender: inf.gender as any } }).catch(() => {});
  }
  // Inflections — NOUN 3 (שיר)
  const n3Infs = [
    { form: 'שיר', number: 'sg', gender: 'm' },
    { form: 'שירים', number: 'pl', gender: 'm' },
  ];
  for (const inf of n3Infs) {
    await prisma.inflection.create({ data: { lexeme_id: L_NOUN3, form: inf.form, transliteration: null, number: inf.number as any, gender: inf.gender as any } }).catch(() => {});
  }

  // Inflections — ADJECTIVE (גדול)
  const aInfs = [
    { form: 'גדול', number: 'sg', gender: 'm' },
    { form: 'גדולה', number: 'sg', gender: 'f' },
    { form: 'גדולים', number: 'pl', gender: 'm' },
    { form: 'גדולות', number: 'pl', gender: 'f' },
  ];
  for (const inf of aInfs) {
    await prisma.inflection.create({ data: { lexeme_id: L_ADJ, form: inf.form, transliteration: null, number: inf.number as any, gender: inf.gender as any } }).catch(() => {});
  }

  // Inflections — ADJECTIVE 2 (חדש)
  const a2Infs = [
    { form: 'חדש', number: 'sg', gender: 'm' },
    { form: 'חדשה', number: 'sg', gender: 'f' },
    { form: 'חדשים', number: 'pl', gender: 'm' },
    { form: 'חדשות', number: 'pl', gender: 'f' },
  ];
  for (const inf of a2Infs) {
    await prisma.inflection.create({ data: { lexeme_id: L_ADJ2, form: inf.form, transliteration: null, number: inf.number as any, gender: inf.gender as any } }).catch(() => {});
  }
  // Inflections — ADJECTIVE 3 (חכם)
  const a3Infs = [
    { form: 'חכם', number: 'sg', gender: 'm' },
    { form: 'חכמה', number: 'sg', gender: 'f' },
    { form: 'חכמים', number: 'pl', gender: 'm' },
    { form: 'חכמות', number: 'pl', gender: 'f' },
  ];
  for (const inf of a3Infs) {
    await prisma.inflection.create({ data: { lexeme_id: L_ADJ3, form: inf.form, transliteration: null, number: inf.number as any, gender: inf.gender as any } }).catch(() => {});
  }

  // Helper to upsert item
  async function upsertItem(id: string, english: string, hebrew: string, tags: string[], features: Record<string, string | null>, lexId: string, familyId: string, familyBase = false) {
    await prisma.lessonItem.upsert({
      where: { id },
      update: { lesson_id: lessonId, english_prompt: english, target_hebrew: hebrew, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags, difficulty: 1, lexeme_id: lexId, family_id: familyId, family_base: familyBase, features: features as any },
      create: { id, lesson_id: lessonId, english_prompt: english, target_hebrew: hebrew, transliteration: null, accepted_variants: [], near_miss_patterns: [], tags, difficulty: 1, lexeme_id: lexId, family_id: familyId, family_base: familyBase, features: features as any }
    });
  }

  // Base items (canonical intros)
  await upsertItem('mini_verb_base', 'How do I say: to write?', 'לכתוב', ['mini','verb','base'], { pos: 'verb', tense: 'infinitive' }, L_VERB, F_VERB, true);
  await upsertItem('mini_noun_base', 'How do I say: book?', 'ספר', ['mini','noun','base'], { pos: 'noun', number: 'sg', gender: 'm' }, L_NOUN, F_NOUN, true);
  await upsertItem('mini_adj_base',  'How do I say: big?', 'גדול', ['mini','adjective','base'], { pos: 'adjective', number: 'sg', gender: 'm' }, L_ADJ, F_ADJ, true);
  // Phase 1 bases
  await upsertItem('mini_verb2_base', 'How do I say: to speak?', 'לדבר', ['mini','verb','base'], { pos: 'verb', tense: 'infinitive' }, L_VERB2, F_VERB2, true);
  await upsertItem('mini_noun2_base', 'How do I say: ice cream?', 'גלידה', ['mini','noun','base'], { pos: 'noun', number: 'sg', gender: 'f' }, L_NOUN2, F_NOUN2, true);
  await upsertItem('mini_adj2_base',  'How do I say: new?', 'חדש', ['mini','adjective','base'], { pos: 'adjective', number: 'sg', gender: 'm' }, L_ADJ2, F_ADJ2, true);
  // Phase 2 bases
  await upsertItem('mini_verb3_base', 'How do I say: to read?', 'לקרוא', ['mini','verb','base'], { pos: 'verb', tense: 'infinitive' }, L_VERB3, F_VERB3, true);
  await upsertItem('mini_verb4_base', 'How do I say: to hear?', 'לשמוע', ['mini','verb','base'], { pos: 'verb', tense: 'infinitive' }, L_VERB4, F_VERB4, true);
  await upsertItem('mini_noun3_base', 'How do I say: song?', 'שיר', ['mini','noun','base'], { pos: 'noun', number: 'sg', gender: 'm' }, L_NOUN3, F_NOUN3, true);
  await upsertItem('mini_adj3_base',  'How do I say: smart?', 'חכם', ['mini','adjective','base'], { pos: 'adjective', number: 'sg', gender: 'm' }, L_ADJ3, F_ADJ3, true);

  // Verb variants
  const vBase = 'write';
  // Present (1sg m/f, 3sg m/f, 3pl)
  const presentSet: Array<Morph & { form: string }> = [
    { person: '1', number: 'sg', gender: 'm', form: 'כותב' },
    { person: '1', number: 'sg', gender: 'f', form: 'כותבת' },
    { person: '3', number: 'sg', gender: 'm', form: 'כותב' },
    { person: '3', number: 'sg', gender: 'f', form: 'כותבת' },
    { person: '3', number: 'pl', gender: 'm', form: 'כותבים' },
    { person: '3', number: 'pl', gender: 'f', form: 'כותבות' },
  ];
  for (let i = 0; i < presentSet.length; i++) {
    const m = presentSet[i];
    const en = `How do I say: ${enPron(m)} ${(['he','she'].includes(enPron(m)) ? 'is' : (enPron(m) === 'I' ? 'am' : 'are'))} ${ing(vBase)}?`;
    const he = `${hePron(m)} ${m.form}`;
    await upsertItem(`mini_v_pr_${i}`, en, he, ['mini','verb','present'], { pos: 'verb', tense: 'present', person: m.person || null, number: m.number || null, gender: m.gender || null }, L_VERB, F_VERB, false);
  }

  // Past (1sg, 3sg m/f, 1pl, 3pl)
  const pastSet: Array<Morph & { form: string }> = [
    { person: '1', number: 'sg', gender: null, form: 'כתבתי' },
    { person: '3', number: 'sg', gender: 'm', form: 'כתב' },
    { person: '3', number: 'sg', gender: 'f', form: 'כתבה' },
    { person: '1', number: 'pl', gender: null, form: 'כתבנו' },
    { person: '3', number: 'pl', gender: null, form: 'כתבו' },
  ];
  for (let i = 0; i < pastSet.length; i++) {
    const m = pastSet[i];
    const en = `How do I say: ${enPron(m)} ${past(vBase)}?`;
    const he = `${hePron(m)} ${m.form}`;
    await upsertItem(`mini_v_pa_${i}`, en, he, ['mini','verb','past'], { pos: 'verb', tense: 'past', person: m.person || null, number: m.number || null, gender: m.gender || null }, L_VERB, F_VERB, false);
  }

  // Future (1sg, 2sg f, 3sg m, 3sg f, 1pl, 2pl, 3pl)
  const futureSet: Array<Morph & { form: string }> = [
    { person: '1', number: 'sg', gender: null, form: 'אכתוב' },
    { person: '2', number: 'sg', gender: 'f', form: 'תכתבי' },
    { person: '3', number: 'sg', gender: 'm', form: 'יכתוב' },
    { person: '3', number: 'sg', gender: 'f', form: 'תכתוב' },
    { person: '1', number: 'pl', gender: null, form: 'נכתוב' },
    { person: '2', number: 'pl', gender: null, form: 'תכתבו' },
    { person: '3', number: 'pl', gender: null, form: 'יכתבו' },
  ];
  for (let i = 0; i < futureSet.length; i++) {
    const m = futureSet[i];
    const en = `How do I say: ${enPron(m)} will ${vBase}?`;
    const he = `${hePron(m)} ${m.form}`;
    await upsertItem(`mini_v_fu_${i}`, en, he, ['mini','verb','future'], { pos: 'verb', tense: 'future', person: m.person || null, number: m.number || null, gender: m.gender || null }, L_VERB, F_VERB, false);
  }

  // Verb 2 variants — לדבר (to speak)
  const v2Base = 'speak';
  const present2: Array<Morph & { form: string }> = [
    { person: '1', number: 'sg', gender: 'm', form: 'מדבר' },
    { person: '1', number: 'sg', gender: 'f', form: 'מדברת' },
    { person: '3', number: 'sg', gender: 'm', form: 'מדבר' },
    { person: '3', number: 'sg', gender: 'f', form: 'מדברת' },
    { person: '3', number: 'pl', gender: 'm', form: 'מדברים' },
    { person: '3', number: 'pl', gender: 'f', form: 'מדברות' },
  ];
  for (let i = 0; i < present2.length; i++) {
    const m = present2[i];
    const en = `How do I say: ${enPron(m)} ${(['he','she'].includes(enPron(m)) ? 'is' : (enPron(m) === 'I' ? 'am' : 'are'))} ${ing(v2Base)}?`;
    const he = `${hePron(m)} ${m.form}`;
    await upsertItem(`mini_v2_pr_${i}`, en, he, ['mini','verb','present'], { pos: 'verb', tense: 'present', person: m.person || null, number: m.number || null, gender: m.gender || null }, L_VERB2, F_VERB2, false);
  }
  const past2: Array<Morph & { form: string }> = [
    { person: '1', number: 'sg', gender: null, form: 'דיברתי' },
    { person: '3', number: 'sg', gender: 'm', form: 'דיבר' },
    { person: '3', number: 'sg', gender: 'f', form: 'דיברה' },
    { person: '1', number: 'pl', gender: null, form: 'דיברנו' },
    { person: '3', number: 'pl', gender: null, form: 'דיברו' },
  ];
  for (let i = 0; i < past2.length; i++) {
    const m = past2[i];
    const en = `How do I say: ${enPron(m)} spoke?`;
    const he = `${hePron(m)} ${m.form}`;
    await upsertItem(`mini_v2_pa_${i}`, en, he, ['mini','verb','past'], { pos: 'verb', tense: 'past', person: m.person || null, number: m.number || null, gender: m.gender || null }, L_VERB2, F_VERB2, false);
  }
  const future2: Array<Morph & { form: string }> = [
    { person: '1', number: 'sg', gender: null, form: 'אדבר' },
    { person: '2', number: 'sg', gender: 'f', form: 'תדברי' },
    { person: '3', number: 'sg', gender: 'm', form: 'ידבר' },
    { person: '3', number: 'sg', gender: 'f', form: 'תדבר' },
    { person: '1', number: 'pl', gender: null, form: 'נדבר' },
    { person: '2', number: 'pl', gender: null, form: 'תדברו' },
    { person: '3', number: 'pl', gender: null, form: 'ידברו' },
  ];
  for (let i = 0; i < future2.length; i++) {
    const m = future2[i];
    const en = `How do I say: ${enPron(m)} will ${v2Base}?`;
    const he = `${hePron(m)} ${m.form}`;
    await upsertItem(`mini_v2_fu_${i}`, en, he, ['mini','verb','future'], { pos: 'verb', tense: 'future', person: m.person || null, number: m.number || null, gender: m.gender || null }, L_VERB2, F_VERB2, false);
  }
  // Verb 3 variants — לקרוא (to read)
  const v3Base = 'read';
  const present3: Array<Morph & { form: string }> = [
    { person: '1', number: 'sg', gender: 'm', form: 'קורא' },
    { person: '1', number: 'sg', gender: 'f', form: 'קוראת' },
    { person: '3', number: 'sg', gender: 'm', form: 'קורא' },
    { person: '3', number: 'sg', gender: 'f', form: 'קוראת' },
    { person: '3', number: 'pl', gender: 'm', form: 'קוראים' },
    { person: '3', number: 'pl', gender: 'f', form: 'קוראות' },
  ];
  for (let i = 0; i < present3.length; i++) {
    const m = present3[i];
    const en = `How do I say: ${enPron(m)} ${(['he','she'].includes(enPron(m)) ? 'is' : (enPron(m) === 'I' ? 'am' : 'are'))} ${ing(v3Base)}?`;
    const he = `${hePron(m)} ${m.form}`;
    await upsertItem(`mini_v3_pr_${i}`, en, he, ['mini','verb','present'], { pos: 'verb', tense: 'present', person: m.person || null, number: m.number || null, gender: m.gender || null }, L_VERB3, F_VERB3, false);
  }
  const past3: Array<Morph & { form: string }> = [
    { person: '1', number: 'sg', gender: null, form: 'קראתי' },
    { person: '3', number: 'sg', gender: 'm', form: 'קרא' },
    { person: '3', number: 'sg', gender: 'f', form: 'קראה' },
    { person: '1', number: 'pl', gender: null, form: 'קראנו' },
    { person: '3', number: 'pl', gender: null, form: 'קראו' },
  ];
  for (let i = 0; i < past3.length; i++) {
    const m = past3[i];
    const en = `How do I say: ${enPron(m)} read?`;
    const he = `${hePron(m)} ${m.form}`;
    await upsertItem(`mini_v3_pa_${i}`, en, he, ['mini','verb','past'], { pos: 'verb', tense: 'past', person: m.person || null, number: m.number || null, gender: m.gender || null }, L_VERB3, F_VERB3, false);
  }
  const future3: Array<Morph & { form: string }> = [
    { person: '1', number: 'sg', gender: null, form: 'אקרא' },
    { person: '2', number: 'sg', gender: 'f', form: 'תקראי' },
    { person: '3', number: 'sg', gender: 'm', form: 'יקרא' },
    { person: '3', number: 'sg', gender: 'f', form: 'תקרא' },
    { person: '1', number: 'pl', gender: null, form: 'נקרא' },
    { person: '2', number: 'pl', gender: null, form: 'תקראו' },
    { person: '3', number: 'pl', gender: null, form: 'יקראו' },
  ];
  for (let i = 0; i < future3.length; i++) {
    const m = future3[i];
    const en = `How do I say: ${enPron(m)} will ${v3Base}?`;
    const he = `${hePron(m)} ${m.form}`;
    await upsertItem(`mini_v3_fu_${i}`, en, he, ['mini','verb','future'], { pos: 'verb', tense: 'future', person: m.person || null, number: m.number || null, gender: m.gender || null }, L_VERB3, F_VERB3, false);
  }
  // Verb 4 variants — לשמוע (to hear)
  const v4Base = 'hear';
  const present4: Array<Morph & { form: string }> = [
    { person: '1', number: 'sg', gender: 'm', form: 'שומע' },
    { person: '1', number: 'sg', gender: 'f', form: 'שומעת' },
    { person: '3', number: 'sg', gender: 'm', form: 'שומע' },
    { person: '3', number: 'sg', gender: 'f', form: 'שומעת' },
    { person: '3', number: 'pl', gender: 'm', form: 'שומעים' },
    { person: '3', number: 'pl', gender: 'f', form: 'שומעות' },
  ];
  for (let i = 0; i < present4.length; i++) {
    const m = present4[i];
    const en = `How do I say: ${enPron(m)} ${(['he','she'].includes(enPron(m)) ? 'is' : (enPron(m) === 'I' ? 'am' : 'are'))} ${ing(v4Base)}?`;
    const he = `${hePron(m)} ${m.form}`;
    await upsertItem(`mini_v4_pr_${i}`, en, he, ['mini','verb','present'], { pos: 'verb', tense: 'present', person: m.person || null, number: m.number || null, gender: m.gender || null }, L_VERB4, F_VERB4, false);
  }
  const past4: Array<Morph & { form: string }> = [
    { person: '1', number: 'sg', gender: null, form: 'שמעתי' },
    { person: '3', number: 'sg', gender: 'm', form: 'שמע' },
    { person: '3', number: 'sg', gender: 'f', form: 'שמעה' },
    { person: '1', number: 'pl', gender: null, form: 'שמענו' },
    { person: '3', number: 'pl', gender: null, form: 'שמעו' },
  ];
  for (let i = 0; i < past4.length; i++) {
    const m = past4[i];
    const en = `How do I say: ${enPron(m)} heard?`;
    const he = `${hePron(m)} ${m.form}`;
    await upsertItem(`mini_v4_pa_${i}`, en, he, ['mini','verb','past'], { pos: 'verb', tense: 'past', person: m.person || null, number: m.number || null, gender: m.gender || null }, L_VERB4, F_VERB4, false);
  }
  const future4: Array<Morph & { form: string }> = [
    { person: '1', number: 'sg', gender: null, form: 'אשמע' },
    { person: '2', number: 'sg', gender: 'f', form: 'תשמעי' },
    { person: '3', number: 'sg', gender: 'm', form: 'ישמע' },
    { person: '3', number: 'sg', gender: 'f', form: 'תשמע' },
    { person: '1', number: 'pl', gender: null, form: 'נשמע' },
    { person: '2', number: 'pl', gender: null, form: 'תשמעו' },
    { person: '3', number: 'pl', gender: null, form: 'ישמעו' },
  ];
  for (let i = 0; i < future4.length; i++) {
    const m = future4[i];
    const en = `How do I say: ${enPron(m)} will ${v4Base}?`;
    const he = `${hePron(m)} ${m.form}`;
    await upsertItem(`mini_v4_fu_${i}`, en, he, ['mini','verb','future'], { pos: 'verb', tense: 'future', person: m.person || null, number: m.number || null, gender: m.gender || null }, L_VERB4, F_VERB4, false);
  }

  // Noun variants (definite sg, plural)
  await upsertItem('mini_n_def', 'How do I say: the book?', 'הספר', ['mini','noun','definite'], { pos: 'noun', number: 'sg', gender: 'm' }, L_NOUN, F_NOUN, false);
  await upsertItem('mini_n_pl',  'How do I say: books (plural)?', 'ספרים', ['mini','noun','plural'], { pos: 'noun', number: 'pl', gender: 'm' }, L_NOUN, F_NOUN, false);
  // Noun 2 variants — גלידה
  await upsertItem('mini_n2_def', 'How do I say: the ice cream?', 'הגלידה', ['mini','noun','definite'], { pos: 'noun', number: 'sg', gender: 'f' }, L_NOUN2, F_NOUN2, false);
  await upsertItem('mini_n2_pl',  'How do I say: ice creams (plural)?', 'גלידות', ['mini','noun','plural'], { pos: 'noun', number: 'pl', gender: 'f' }, L_NOUN2, F_NOUN2, false);
  // Noun 3 variants — שיר
  await upsertItem('mini_n3_def', 'How do I say: the song?', 'השיר', ['mini','noun','definite'], { pos: 'noun', number: 'sg', gender: 'm' }, L_NOUN3, F_NOUN3, false);
  await upsertItem('mini_n3_pl',  'How do I say: songs (plural)?', 'שירים', ['mini','noun','plural'], { pos: 'noun', number: 'pl', gender: 'm' }, L_NOUN3, F_NOUN3, false);

  // Adjective variants — גדול
  await upsertItem('mini_a_m_sg', 'How do I say: he is big?', 'הוא גדול', ['mini','adjective'], { pos: 'adjective', number: 'sg', gender: 'm' }, L_ADJ, F_ADJ, false);
  await upsertItem('mini_a_f_sg', 'How do I say: she is big?', 'היא גדולה', ['mini','adjective'], { pos: 'adjective', number: 'sg', gender: 'f' }, L_ADJ, F_ADJ, false);
  await upsertItem('mini_a_m_pl', 'How do I say: they (m) are big?', 'הם גדולים', ['mini','adjective'], { pos: 'adjective', number: 'pl', gender: 'm' }, L_ADJ, F_ADJ, false);
  await upsertItem('mini_a_f_pl', 'How do I say: they (f) are big?', 'הן גדולות', ['mini','adjective'], { pos: 'adjective', number: 'pl', gender: 'f' }, L_ADJ, F_ADJ, false);
  // Adjective 2 variants — חדש
  await upsertItem('mini_a2_m_sg', 'How do I say: he is new?', 'הוא חדש', ['mini','adjective'], { pos: 'adjective', number: 'sg', gender: 'm' }, L_ADJ2, F_ADJ2, false);
  await upsertItem('mini_a2_f_sg', 'How do I say: she is new?', 'היא חדשה', ['mini','adjective'], { pos: 'adjective', number: 'sg', gender: 'f' }, L_ADJ2, F_ADJ2, false);
  await upsertItem('mini_a2_m_pl', 'How do I say: they (m) are new?', 'הם חדשים', ['mini','adjective'], { pos: 'adjective', number: 'pl', gender: 'm' }, L_ADJ2, F_ADJ2, false);
  await upsertItem('mini_a2_f_pl', 'How do I say: they (f) are new?', 'הן חדשות', ['mini','adjective'], { pos: 'adjective', number: 'pl', gender: 'f' }, L_ADJ2, F_ADJ2, false);
  // Adjective 3 variants — חכם
  await upsertItem('mini_a3_m_sg', 'How do I say: he is smart?', 'הוא חכם', ['mini','adjective'], { pos: 'adjective', number: 'sg', gender: 'm' }, L_ADJ3, F_ADJ3, false);
  await upsertItem('mini_a3_f_sg', 'How do I say: she is smart?', 'היא חכמה', ['mini','adjective'], { pos: 'adjective', number: 'sg', gender: 'f' }, L_ADJ3, F_ADJ3, false);
  await upsertItem('mini_a3_m_pl', 'How do I say: they (m) are smart?', 'הם חכמים', ['mini','adjective'], { pos: 'adjective', number: 'pl', gender: 'm' }, L_ADJ3, F_ADJ3, false);
  await upsertItem('mini_a3_f_pl', 'How do I say: they (f) are smart?', 'הן חכמות', ['mini','adjective'], { pos: 'adjective', number: 'pl', gender: 'f' }, L_ADJ3, F_ADJ3, false);

  console.log('Seeded vocab_mini_morph with 10 lexemes and variants.');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
