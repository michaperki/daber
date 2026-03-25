import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

type InfNeed = { lexeme_id: string; form: string; tense?: string | null; person?: string | null; number?: string | null; gender?: string | null };
type FeatNeed = { lesson_item_id: string; features: Record<string, string | null> };

const inflectionsToEnsure: InfNeed[] = [
  { lexeme_id: 'lex_15TXldeQINee16nXqtek', form: 'משתפר', tense: 'present', number: 'sg', gender: 'm', person: null },
  { lexeme_id: 'lex_15TXmdeQINee16nXqtek', form: 'משתפרת', tense: 'present', number: 'sg', gender: 'f', person: null },
  { lexeme_id: 'lex_15DXoNeZINee16nXqtek', form: 'משתפר', tense: 'present', number: 'sg', gender: 'm', person: null },
  { lexeme_id: 'lex_15DXoNeZINee16nXqtek', form: 'משתפרת', tense: 'present', number: 'sg', gender: 'f', person: null },
  { lexeme_id: 'lex_15DXoNeZINeb15XXqteR', form: 'כותב', tense: 'present', number: 'sg', gender: 'm', person: null },
  { lexeme_id: 'lex_15DXoNeZINeb15XXqteR', form: 'כותבת', tense: 'present', number: 'sg', gender: 'f', person: null },
  { lexeme_id: 'lex_15TXldeQINeb15XXqteR', form: 'כותב', tense: 'present', number: 'sg', gender: 'm', person: null },
  { lexeme_id: 'lex_15TXmdeQINeb15XXqteR', form: 'כותבת', tense: 'present', number: 'sg', gender: 'f', person: null },
  { lexeme_id: 'lex_15DXoNeX16DXlSDXnNeV', form: 'לומדים', tense: 'present', number: 'pl', gender: 'm', person: null },
  { lexeme_id: 'lex_15TXnSDXnNeV157Xk9eZ', form: 'לומדים', tense: 'present', number: 'pl', gender: 'm', person: null },
  { lexeme_id: 'lex_15DXoNeZINeQ1rXXqdeq', form: 'אֵשתַדֵל', tense: 'future', person: '1', number: 'sg', gender: null },
  { lexeme_id: 'lex_15DXoNeZINee1rTXqtec', form: 'מִתלַבֵּט', tense: 'present', person: null, number: 'sg', gender: 'm' },
  { lexeme_id: 'lex_15zWtNek16rXlda515fW', form: 'לִפתוֹחַ' },
  { lexeme_id: 'lex_15zWtNem16LXlda516cg', form: 'לִצעוֹק עַל' },
  { lexeme_id: 'lex_15zWtdeU1rXXqteb1rzX', form: 'לֵהֵתכּוֹנֵן' },
  { lexeme_id: 'lex_15zWtdeU1rTXqtei15XW', form: 'לֵהִתעוֹרֵר' },
  { lexeme_id: 'lex_15zWtNen15HWvNeV1rnX', form: 'לִקבּוֹע תוֹר לֵ…' },
  { lexeme_id: 'lex_15zWtdeU1rfXqNa015nX', form: 'לֵהַרִים אֵת' },
  { lexeme_id: 'lex_15zWtNep14LXqNeV1rnX', form: 'לִשׂרוֹף' }
  ,{ lexeme_id: 'lex_15DXoNeZINeQ1rXXqdeC', form: 'אֵשׂמַח', tense: 'future', person: '1', number: 'sg', gender: null }
];

const featuresToSet: FeatNeed[] = [
  { lesson_item_id: 'ptb01_001', features: { pos: 'verb', tense: 'present', person: '1', number: 'sg', gender: 'm' } },
  { lesson_item_id: 'ptb01_002', features: { pos: 'verb', tense: 'present', person: '1', number: 'sg', gender: 'f' } },
  { lesson_item_id: 'ptb01_003', features: { pos: 'verb', tense: 'present', person: '3', number: 'sg', gender: 'm' } },
  { lesson_item_id: 'ptb01_004', features: { pos: 'verb', tense: 'present', person: '3', number: 'sg', gender: 'f' } },
  { lesson_item_id: 'ptb01_005', features: { pos: 'verb', tense: 'present', person: '1', number: 'sg', gender: 'm' } },
  { lesson_item_id: 'ptb01_006', features: { pos: 'verb', tense: 'present', person: '1', number: 'sg', gender: 'f' } },
  { lesson_item_id: 'ptb01_007', features: { pos: 'verb', tense: 'present', person: '3', number: 'sg', gender: 'm' } },
  { lesson_item_id: 'ptb01_008', features: { pos: 'verb', tense: 'present', person: '3', number: 'sg', gender: 'f' } },
  { lesson_item_id: 'ptb01_009', features: { pos: 'verb', tense: 'present', person: '1', number: 'pl', gender: null } },
  { lesson_item_id: 'ptb01_010', features: { pos: 'verb', tense: 'present', person: '3', number: 'pl', gender: 'm' } },
  { lesson_item_id: 'vocab_i_ll_do_my_best', features: { pos: 'verb', tense: 'future', person: '1', number: 'sg', gender: null } },
  { lesson_item_id: 'vocab_i_m_considering_a_few_op', features: { pos: 'verb', tense: 'present', person: '1', number: 'sg', gender: 'm' } }
];

export async function POST() {
  try {
    let created = 0;
    for (const need of inflectionsToEnsure) {
      const exists = await prisma.inflection.findFirst({ where: { lexeme_id: need.lexeme_id, form: need.form } });
      if (!exists) {
        await prisma.inflection.create({ data: { lexeme_id: need.lexeme_id, form: need.form, tense: need.tense ?? null, person: need.person ?? null, number: need.number ?? null, gender: need.gender ?? null } });
        created += 1;
      }
    }
    let updated = 0;
    for (const f of featuresToSet) {
      await prisma.lessonItem.update({ where: { id: f.lesson_item_id }, data: { features: f.features as any } }).catch(() => {});
      updated += 1;
    }
    return NextResponse.json({ ok: true, createdInflections: created, updatedItems: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to fix' }, { status: 500 });
  }
}
