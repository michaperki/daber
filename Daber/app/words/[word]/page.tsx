import React from 'react';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { tokenizeHebrew } from '@/lib/hebrew';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Params = { params: { word: string } };

type PhraseRow = {
  id: string;
  he: string;
  en: string | null;
};

async function getWordContext(normalizedWord: string): Promise<{ word: string; phrases: PhraseRow[] }> {
  const items = await prisma.lessonItem.findMany({
    select: { id: true, target_hebrew: true, english_prompt: true },
  });

  const phrases: PhraseRow[] = [];
  for (const it of items) {
    const he = (it.target_hebrew ?? '').trim();
    if (!he) continue;
    const tokens = tokenizeHebrew(he);
    if (tokens.includes(normalizedWord)) {
      phrases.push({ id: it.id, he, en: it.english_prompt ?? null });
      if (phrases.length >= 50) break;
    }
  }

  return { word: normalizedWord, phrases };
}

export default async function WordDetailPage({ params }: Params) {
  const normalizedWord = decodeURIComponent(params.word);
  const { word, phrases } = await getWordContext(normalizedWord);

  return (
    <div className="drill-root">
      <div className="prompt-card" style={{ marginBottom: 12 }}>
        <div className="prompt-eyebrow">word</div>
        <div className="prompt-text" style={{ fontSize: 28, direction: 'rtl' }}>{word}</div>
        <div style={{ marginTop: 8, display: 'flex', gap: 10 }}>
          <Link href="/library/words" className="secondary-btn">back</Link>
        </div>
      </div>

      <div className="prompt-card">
        <div className="prompt-eyebrow">examples (first 50)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          {phrases.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>No phrases found containing this token.</div>
          ) : (
            phrases.map(p => (
              <div key={p.id} style={{ padding: 10, borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-background-secondary)' }}>
                <div style={{ direction: 'rtl', fontSize: 18 }}>{p.he}</div>
                {p.en && <div style={{ marginTop: 6, fontSize: 13, color: 'var(--color-text-secondary)' }}>{p.en}</div>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
