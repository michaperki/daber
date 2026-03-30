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
    update: { title: 'Mini Morph Drill', language: 'he', level: 'mini', type: 'vocab', description: 'Exactly 1 verb, 1 noun, 1 adjective (all key forms)' },
    create: { id: lessonId, title: 'Mini Morph Drill', language: 'he', level: 'mini', type: 'vocab', description: 'Exactly 1 verb, 1 noun, 1 adjective (all key forms)' }
  });

  // Lexemes
  const L_VERB = 'mini_lex_write';
  const L_NOUN = 'mini_lex_book';
  const L_ADJ  = 'mini_lex_big';
  const F_VERB = `lex:${L_VERB}`;
  const F_NOUN = `lex:${L_NOUN}`;
  const F_ADJ  = `lex:${L_ADJ}`;

  await prisma.lexeme.upsert({ where: { id: L_VERB }, update: { lemma: 'לכתוב', language: 'he', pos: 'verb', gloss: 'to write' }, create: { id: L_VERB, lemma: 'לכתוב', language: 'he', pos: 'verb', gloss: 'to write' } });
  await prisma.lexeme.upsert({ where: { id: L_NOUN }, update: { lemma: 'ספר', language: 'he', pos: 'noun', gloss: 'book' }, create: { id: L_NOUN, lemma: 'ספר', language: 'he', pos: 'noun', gloss: 'book' } });
  await prisma.lexeme.upsert({ where: { id: L_ADJ }, update: { lemma: 'גדול', language: 'he', pos: 'adjective', gloss: 'big' }, create: { id: L_ADJ, lemma: 'גדול', language: 'he', pos: 'adjective', gloss: 'big' } });

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

  // Inflections — NOUN (ספר)
  const nInfs = [
    { form: 'ספר', number: 'sg', gender: 'm' },
    { form: 'ספרים', number: 'pl', gender: 'm' },
  ];
  for (const inf of nInfs) {
    await prisma.inflection.create({ data: { lexeme_id: L_NOUN, form: inf.form, transliteration: null, number: inf.number as any, gender: inf.gender as any } }).catch(() => {});
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

  // Noun variants (definite sg, plural)
  await upsertItem('mini_n_def', 'How do I say: the book?', 'הספר', ['mini','noun','definite'], { pos: 'noun', number: 'sg', gender: 'm' }, L_NOUN, F_NOUN, false);
  await upsertItem('mini_n_pl',  'How do I say: books (plural)?', 'ספרים', ['mini','noun','plural'], { pos: 'noun', number: 'pl', gender: 'm' }, L_NOUN, F_NOUN, false);

  // Adjective variants
  await upsertItem('mini_a_m_sg', 'How do I say: he is big?', 'הוא גדול', ['mini','adjective'], { pos: 'adjective', number: 'sg', gender: 'm' }, L_ADJ, F_ADJ, false);
  await upsertItem('mini_a_f_sg', 'How do I say: she is big?', 'היא גדולה', ['mini','adjective'], { pos: 'adjective', number: 'sg', gender: 'f' }, L_ADJ, F_ADJ, false);
  await upsertItem('mini_a_m_pl', 'How do I say: they (m) are big?', 'הם גדולים', ['mini','adjective'], { pos: 'adjective', number: 'pl', gender: 'm' }, L_ADJ, F_ADJ, false);
  await upsertItem('mini_a_f_pl', 'How do I say: they (f) are big?', 'הן גדולות', ['mini','adjective'], { pos: 'adjective', number: 'pl', gender: 'f' }, L_ADJ, F_ADJ, false);

  console.log('Seeded vocab_mini_morph with 3 lexemes and variants.');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });

