import React from 'react';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { normalizeHebrewForMatch, stripNiqqud } from '@/lib/hebrew';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const WD_VERB_POS = 'Q24905';

type LexemeRow = {
  id: string;
  lemma: string;
  pos: string;
  display: string;
  formCount: number;
};

function pickDisplayForm(pos: string, lemma: string, inflections: { form: string; tense: string | null }[]) {
  if (pos === WD_VERB_POS) {
    const infinitive = inflections.find(i => i.tense === 'infinitive')?.form;
    if (infinitive) return infinitive;
    const lForm = inflections.find(i => i.form.startsWith('ל'))?.form;
    if (lForm) return lForm;
  }
  return lemma;
}

export default async function DictionaryPage({ searchParams }: { searchParams?: { q?: string } }) {
  const q = (searchParams?.q || '').trim();

  const wdLexemesCount = await prisma.lexeme.count({ where: { id: { startsWith: 'wd:' } } });
  const wdInflectionsCount = await prisma.inflection.count({ where: { lexeme_id: { startsWith: 'wd:' } } });
  const linkedLessonItemsCount = await prisma.lessonItem.count({ where: { lexeme_id: { startsWith: 'wd:' } } });

  const lexemes = await prisma.lexeme.findMany({
    where: {
      id: { startsWith: 'wd:' },
      ...(q
        ? {
            OR: [
              { lemma: { contains: q } },
              // allow searching without niqqud
              { lemma: { contains: stripNiqqud(q) } },
            ],
          }
        : {}),
    },
    orderBy: { lemma: 'asc' },
    take: 300,
    select: {
      id: true,
      lemma: true,
      pos: true,
      inflections: { select: { form: true, tense: true } },
    },
  });

  const rows: LexemeRow[] = lexemes.map(l => {
    const uniqueForms = new Set(l.inflections.map(i => normalizeHebrewForMatch(i.form)).filter(Boolean));
    return {
      id: l.id,
      lemma: l.lemma,
      pos: l.pos,
      display: pickDisplayForm(l.pos, l.lemma, l.inflections),
      formCount: uniqueForms.size,
    };
  });

  return (
    <div className="lib-root">
      <div className="lib-topbar">
        <h1 className="lib-title">dictionary</h1>
        <Link href="/library" className="lib-settings-btn" aria-label="back to library" title="back">
          ←
        </Link>
      </div>

      <div className="prompt-card" style={{ marginBottom: 12 }}>
        <div className="prompt-eyebrow">progress</div>
        <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Wikidata lexemes: <b style={{ color: 'var(--color-text-primary)' }}>{wdLexemesCount}</b></div>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Wikidata forms: <b style={{ color: 'var(--color-text-primary)' }}>{wdInflectionsCount}</b></div>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Lesson items linked to Wikidata: <b style={{ color: 'var(--color-text-primary)' }}>{linkedLessonItemsCount}</b></div>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          This is a future-facing dictionary view. As we seed more lexemes from Wikidata, coverage will increase.
        </div>
      </div>

      <form action="/dictionary" method="get" className="prompt-card" style={{ marginBottom: 12 }}>
        <div className="prompt-eyebrow">search</div>
        <input
          name="q"
          defaultValue={q}
          placeholder="type hebrew…"
          style={{
            marginTop: 8,
            width: '100%',
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid var(--color-border)',
            background: 'var(--color-background-secondary)',
            color: 'var(--color-text-primary)',
            fontSize: 16,
            direction: 'rtl',
          }}
        />
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          Showing up to 300 results.
        </div>
      </form>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(r => (
          <Link key={r.id} href={`/dictionary/${encodeURIComponent(r.id)}`} className="pack-card" style={{ padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <div style={{ direction: 'rtl' }}>
                <div style={{ fontSize: 20 }}>{r.display}</div>
                {r.display !== r.lemma && (
                  <div style={{ marginTop: 2, fontSize: 12, color: 'var(--color-text-secondary)', direction: 'rtl' }}>
                    lemma: {r.lemma}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{r.formCount} forms</div>
            </div>
          </Link>
        ))}
      </div>

      <div style={{ marginTop: 14, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
        Note: POS is stored as a Wikidata Q-id right now; we’ll translate that to human labels later.
      </div>
    </div>
  );
}
