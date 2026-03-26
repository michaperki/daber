import React from 'react';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { tokenizeHebrew } from '@/lib/hebrew';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type WordRow = {
  token: string; // display token (first-seen)
  normalized: string;
  countPhrases: number;
};

async function getWords(): Promise<WordRow[]> {
  const items = await prisma.lessonItem.findMany({
    select: { id: true, target_hebrew: true },
  });

  const map = new Map<string, { token: string; phraseIds: Set<string> }>();

  for (const it of items) {
    const text = (it.target_hebrew ?? '').trim();
    if (!text) continue;
    const tokens = tokenizeHebrew(text);
    for (const tok of tokens) {
      const normalized = tok; // tokenizeHebrew already normalizes; keep exact token as normalized key for now
      const existing = map.get(normalized);
      if (existing) {
        existing.phraseIds.add(it.id);
      } else {
        map.set(normalized, { token: tok, phraseIds: new Set([it.id]) });
      }
    }
  }

  const rows: WordRow[] = Array.from(map.entries()).map(([normalized, v]) => ({
    token: v.token,
    normalized,
    countPhrases: v.phraseIds.size,
  }));

  rows.sort((a, b) => b.countPhrases - a.countPhrases || a.normalized.localeCompare(b.normalized, 'he'));
  return rows;
}

export default async function WordsIndexPage() {
  const words = await getWords();

  return (
    <div className="lib-root">
      <div className="lib-topbar">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h1 className="lib-title">words</h1>
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{words.length}</span>
        </div>
        <Link href="/library" className="lib-settings-btn" aria-label="back to library" title="back">
          ←
        </Link>
      </div>

      <div style={{ marginTop: 8, fontSize: 13, color: 'var(--color-text-secondary)' }}>
        Derived from all lesson items. This is a first pass (no morphology yet).
      </div>

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {words.slice(0, 500).map(w => (
          <Link
            key={w.normalized}
            href={`/words/${encodeURIComponent(w.normalized)}`}
            className="pack-card"
            style={{ padding: 12 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
              <div style={{ fontSize: 18, direction: 'rtl' }}>{w.token}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{w.countPhrases} phrases</div>
            </div>
          </Link>
        ))}
      </div>

      {words.length > 500 && (
        <div style={{ marginTop: 14, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          Showing top 500 by phrase coverage.
        </div>
      )}
    </div>
  );
}
