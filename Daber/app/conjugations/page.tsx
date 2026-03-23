import React from 'react';
import { prisma } from '@/lib/db';

type MasteryLevel = 'green' | 'yellow' | 'red' | 'gray';

function masteryColor(correct: number, total: number): MasteryLevel {
  if (total === 0) return 'gray';
  const pct = (correct / total) * 100;
  if (pct > 70) return 'green';
  if (pct >= 40) return 'yellow';
  return 'red';
}

const PRONOUNS = [
  { person: '1', number: 'sg', gender: null, label: 'אני' },
  { person: '2', number: 'sg', gender: 'm', label: 'אתה' },
  { person: '2', number: 'sg', gender: 'f', label: 'את' },
  { person: '3', number: 'sg', gender: 'm', label: 'הוא' },
  { person: '3', number: 'sg', gender: 'f', label: 'היא' },
  { person: '1', number: 'pl', gender: null, label: 'אנחנו' },
  { person: '2', number: 'pl', gender: 'm', label: 'אתם' },
  { person: '2', number: 'pl', gender: 'f', label: 'אתן' },
  { person: '3', number: 'pl', gender: 'm', label: 'הם' },
  { person: '3', number: 'pl', gender: 'f', label: 'הן' },
] as const;

const ADJ_CELLS = [
  { number: 'sg', gender: 'm', label: 'm.sg' },
  { number: 'sg', gender: 'f', label: 'f.sg' },
  { number: 'pl', gender: 'm', label: 'm.pl' },
  { number: 'pl', gender: 'f', label: 'f.pl' },
] as const;

const TENSES = ['present', 'past', 'future'] as const;

async function getConjugationData() {
  const lexemes = await prisma.lexeme.findMany({
    where: { language: 'he', pos: { in: ['verb', 'adjective'] } },
    select: { id: true, lemma: true, pos: true },
    orderBy: { lemma: 'asc' },
  });

  const inflections = await prisma.inflection.findMany({
    where: { lexeme_id: { in: lexemes.map(l => l.id) } },
    select: { lexeme_id: true, form: true, tense: true, person: true, number: true, gender: true, binyan: true },
  });

  const featureStats = await prisma.featureStat.findMany({
    select: { pos: true, tense: true, person: true, number: true, gender: true, correct_count: true, flawed_count: true, incorrect_count: true },
  });

  // Build lookup for mastery
  const masteryMap = new Map<string, { correct: number; total: number }>();
  for (const fs of featureStats) {
    const key = [fs.pos, fs.tense, fs.person, fs.number, fs.gender].join('|');
    const total = (fs.correct_count || 0) + (fs.flawed_count || 0) + (fs.incorrect_count || 0);
    masteryMap.set(key, { correct: fs.correct_count || 0, total });
  }

  // Group inflections by lexeme
  const inflByLexeme = new Map<string, typeof inflections>();
  for (const inf of inflections) {
    const arr = inflByLexeme.get(inf.lexeme_id) || [];
    arr.push(inf);
    inflByLexeme.set(inf.lexeme_id, arr);
  }

  return { lexemes, inflByLexeme, masteryMap };
}

export default async function ConjugationsPage() {
  const { lexemes, inflByLexeme, masteryMap } = await getConjugationData();

  const verbs = lexemes.filter(l => l.pos === 'verb');
  const adjectives = lexemes.filter(l => l.pos === 'adjective');

  function getMastery(pos: string, tense: string | null, person: string | null, number: string | null, gender: string | null): MasteryLevel {
    const key = [pos, tense, person, number, gender].join('|');
    const data = masteryMap.get(key);
    if (!data) return 'gray';
    return masteryColor(data.correct, data.total);
  }

  function findForm(lexemeId: string, tense: string | null, person: string | null, number: string | null, gender: string | null): string {
    const infls = inflByLexeme.get(lexemeId) || [];
    const match = infls.find(i =>
      (tense === null || i.tense === tense) &&
      (person === null || i.person === person) &&
      (number === null || i.number === number) &&
      (gender === null || i.gender === gender)
    );
    return match?.form || '—';
  }

  function findBinyan(lexemeId: string): string | null {
    const infls = inflByLexeme.get(lexemeId) || [];
    const withBinyan = infls.find(i => i.binyan);
    return withBinyan?.binyan || null;
  }

  return (
    <div className="lib-root">
      <div className="lib-topbar">
        <h1 className="lib-title">conjugation tables</h1>
      </div>

      {verbs.length > 0 && (
        <>
          <div className="section-eyebrow">verbs</div>
          {verbs.map(v => {
            const binyan = findBinyan(v.id);
            return (
              <div key={v.id} className="pack-card" style={{ marginBottom: 16, overflow: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontFamily: 'var(--font-serif)', fontSize: 18, direction: 'rtl' as const }}>{v.lemma}</span>
                  {binyan && <span className="vocab-chip">{binyan}</span>}
                </div>
                <table className="conj-table">
                  <thead>
                    <tr>
                      <th></th>
                      {TENSES.map(t => <th key={t}>{t}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {PRONOUNS.map(pr => (
                      <tr key={pr.label}>
                        <td style={{ fontFamily: 'var(--font-serif)', direction: 'rtl' as const, fontSize: 13, padding: '4px 8px', whiteSpace: 'nowrap' }}>{pr.label}</td>
                        {TENSES.map(tense => {
                          const form = findForm(v.id, tense, pr.person, pr.number, pr.gender);
                          const mastery = getMastery('verb', tense, pr.person, pr.number, pr.gender);
                          return (
                            <td key={tense} className={`conj-cell conj-cell-${mastery}`}>
                              {form}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </>
      )}

      {adjectives.length > 0 && (
        <>
          <div className="section-eyebrow" style={{ marginTop: 16 }}>adjectives</div>
          {adjectives.map(a => (
            <div key={a.id} className="pack-card" style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, direction: 'rtl' as const, marginBottom: 8 }}>{a.lemma}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                {ADJ_CELLS.map(cell => {
                  const form = findForm(a.id, null, null, cell.number, cell.gender);
                  const mastery = getMastery('adjective', null, null, cell.number, cell.gender);
                  return (
                    <div key={cell.label} className={`conj-cell conj-cell-${mastery}`} style={{ padding: '8px 12px', borderRadius: 8, textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>{cell.label}</div>
                      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16, direction: 'rtl' as const }}>{form}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}

      {!verbs.length && !adjectives.length && (
        <div style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', padding: '2rem 0' }}>
          No lexicon data yet. Seed with SEED_LEXEMES=1 to populate.
        </div>
      )}
    </div>
  );
}
