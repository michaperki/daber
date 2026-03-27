import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const LESSON_ID = 'song_ma_naaseh_chorus_v1';

// Minimal "song pack" bootstrap: create one chorus-focused lesson if missing.
// Avoids schema changes; idempotent.
export async function POST() {
  try {
    const existing = await prisma.lesson.findUnique({ where: { id: LESSON_ID }, select: { id: true } });
    if (!existing) {
      await prisma.lesson.create({
        data: {
          id: LESSON_ID,
          title: 'Ma Na’aseh (Hadag Nahash) — Chorus',
          language: 'he',
          level: 'a1',
          type: 'song',
          description: 'Song pack v1: chorus core lines + a couple key verbs (infinitive-first) from “מה נעשה”.',
        },
      });

      const items: Array<{ id: string; en: string; he: string; tags?: string[]; familyId?: string | null; familyBase?: boolean }> = [
        { id: `${LESSON_ID}__line1`, en: 'What should we do?', he: 'מה נעשה, מה נעשה', tags: ['song','chorus','phrase'] },
        { id: `${LESSON_ID}__line2`, en: 'That I’m always this stoned (high).', he: 'שאני תמיד מסטול כזה', tags: ['song','chorus','phrase','slang'] },
        { id: `${LESSON_ID}__line3`, en: "I don’t want (to).", he: "אנ׳לא רוצה, אנ׳לא רוצה", tags: ['song','chorus','phrase'] },
        { id: `${LESSON_ID}__line4`, en: 'To reach the edge (the limit).', he: 'להגיע לקצה', tags: ['song','chorus','phrase'] },
        { id: `${LESSON_ID}__line5`, en: 'That my generation is this crooked / messed up.', he: 'שהדור שלי עקום כזה', tags: ['song','chorus','phrase'] },
        { id: `${LESSON_ID}__line6`, en: "I can’t find (it).", he: "אנ׳לא מוצא, אנ׳לא מוצא", tags: ['song','chorus','phrase'] },
        { id: `${LESSON_ID}__line7`, en: "It’s already late — need to get out of this.", he: 'כבר מאוחר צריך לצאת מזה', tags: ['song','chorus','phrase'] },

        // Infinitive-first verb intros (single items). These help later when we expand to conjugations.
        { id: `${LESSON_ID}__v_reach`, en: 'to reach / to arrive', he: 'להגיע', tags: ['song','chorus','verb','infinitive'], familyId: 'lex:verb_reach', familyBase: true },
        { id: `${LESSON_ID}__v_exit`, en: 'to get out / to leave', he: 'לצאת', tags: ['song','chorus','verb','infinitive'], familyId: 'lex:verb_exit', familyBase: true },
        { id: `${LESSON_ID}__v_want`, en: 'to want', he: 'לרצות', tags: ['song','chorus','verb','infinitive'], familyId: 'lex:verb_want', familyBase: true },
        { id: `${LESSON_ID}__n_gen`, en: 'generation', he: 'דור', tags: ['song','chorus','noun'] },
        { id: `${LESSON_ID}__adj_crooked`, en: 'crooked / messed up', he: 'עקום', tags: ['song','chorus','adjective'] },
      ];

      for (const it of items) {
        await prisma.lessonItem.create({
          data: {
            id: it.id,
            lesson_id: LESSON_ID,
            english_prompt: it.en,
            target_hebrew: it.he,
            transliteration: null,
            accepted_variants: [],
            near_miss_patterns: [],
            tags: it.tags || ['song'],
            difficulty: 1,
            // features omitted
            family_id: it.familyId || null,
            family_base: it.familyBase || false,
          },
        });
      }
    }

    return NextResponse.json({ ok: true, lessonId: LESSON_ID });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'bootstrap failed' }, { status: 500 });
  }
}
