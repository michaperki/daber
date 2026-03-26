import React from 'react';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { normalizeHebrewForMatch } from '@/lib/hebrew';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const WD_VERB_POS = 'Q24905';

type Params = { params: { lexemeId: string } };

function pickDisplayForm(pos: string, lemma: string, inflections: { form: string; tense: string | null }[]) {
  if (pos === WD_VERB_POS) {
    const infinitive = inflections.find(i => i.tense === 'infinitive')?.form;
    if (infinitive) return infinitive;
    const lForm = inflections.find(i => i.form.startsWith('ל'))?.form;
    if (lForm) return lForm;
  }
  return lemma;
}

export default async function DictionaryLexemePage({ params }: Params) {
  const lexemeId = decodeURIComponent(params.lexemeId);

  const lexeme = await prisma.lexeme.findUnique({
    where: { id: lexemeId },
    select: {
      id: true,
      lemma: true,
      pos: true,
      inflections: { select: { form: true, tense: true } },
    },
  });

  if (!lexeme) {
    return (
      <div className="drill-root">
        <div className="prompt-card">
          <div className="prompt-text">Not found</div>
          <div style={{ marginTop: 10 }}>
            <Link href="/dictionary" className="secondary-btn">back</Link>
          </div>
        </div>
      </div>
    );
  }

  const display = pickDisplayForm(lexeme.pos, lexeme.lemma, lexeme.inflections);

  const uniqueForms = Array.from(
    new Set(lexeme.inflections.map(i => normalizeHebrewForMatch(i.form)).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'he'));

  // Example phrase lookup: find LessonItems where target_hebrew contains any inflection form (normalized containment)
  // We do this in-memory for now (simple + safe for current DB size).
  const allItems = await prisma.lessonItem.findMany({
    select: { id: true, target_hebrew: true, english_prompt: true },
  });

  const matchForms = uniqueForms.slice(0, 200); // guard
  const examples: Array<{ id: string; he: string; en: string }> = [];

  for (const it of allItems) {
    const heNorm = normalizeHebrewForMatch(it.target_hebrew || '');
    if (!heNorm) continue;

    let hit = false;
    for (const f of matchForms) {
      if (f && heNorm.includes(f)) {
        hit = true;
        break;
      }
    }
    if (!hit) continue;

    examples.push({ id: it.id, he: it.target_hebrew || '', en: it.english_prompt || '' });
    if (examples.length >= 10) break;
  }

  return (
    <div className="drill-root">
      <div className="prompt-card" style={{ marginBottom: 12 }}>
        <div className="prompt-eyebrow">dictionary</div>
        <div className="prompt-text" style={{ fontSize: 30, direction: 'rtl' }}>{display}</div>
        {display !== lexeme.lemma && (
          <div style={{ marginTop: 6, fontSize: 13, color: 'var(--color-text-secondary)', direction: 'rtl' }}>
            lemma: {lexeme.lemma}
          </div>
        )}
        <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
          <Link href="/dictionary" className="secondary-btn">back</Link>
        </div>
      </div>

      <div className="prompt-card" style={{ marginBottom: 12 }}>
        <div className="prompt-eyebrow">forms</div>
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8, direction: 'rtl' }}>
          {uniqueForms.slice(0, 120).map(f => (
            <span
              key={f}
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                border: '1px solid var(--color-border)',
                background: 'var(--color-background-secondary)',
                fontSize: 14,
              }}
            >
              {f}
            </span>
          ))}
        </div>
        {uniqueForms.length > 120 && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            Showing 120 of {uniqueForms.length} forms.
          </div>
        )}
      </div>

      <div className="prompt-card">
        <div className="prompt-eyebrow">examples</div>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {examples.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>No examples found yet.</div>
          ) : (
            examples.map(ex => (
              <div key={ex.id} style={{ padding: 10, borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-background-secondary)' }}>
                <div style={{ direction: 'rtl', fontSize: 18 }}>{ex.he}</div>
                {ex.en && <div style={{ marginTop: 6, fontSize: 13, color: 'var(--color-text-secondary)' }}>{ex.en}</div>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
