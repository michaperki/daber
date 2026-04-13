import { useMemo, useState } from 'preact/hooks';
import { curriculumData, vocab, type VocabEntry } from '../content';

type Token = string;

function uniqueVerbs(entries: VocabEntry[]): string[] {
  const set = new Set<string>();
  for (const e of entries) if (e.pos === 'verb' && e.lemma) set.add(e.lemma);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function tokensForLemma(entries: VocabEntry[], lemma: string): Map<Token, VocabEntry> {
  const map = new Map<Token, VocabEntry>();
  for (const e of entries) {
    if (e.pos !== 'verb') continue;
    if (e.lemma !== lemma) continue;
    const token: Token = e.variant || 'lemma';
    map.set(token, e);
  }
  return map;
}

function canonicalTokens(): Token[] {
  const t = (curriculumData?.tokens || []) as string[];
  if (t.length) return t;
  // Fallback to tokens seen in vocab
  const seen = new Set<string>();
  for (const e of vocab) if (e.pos === 'verb') seen.add(e.variant || 'lemma');
  return Array.from(seen).sort();
}

export function VerbInspector() {
  const lemmas = useMemo(() => uniqueVerbs(vocab), []);
  const [lemma, setLemma] = useState<string>(lemmas[0] || '');
  const introduced = (curriculumData?.verbs || {})[lemma] || [];
  const tokenMap = useMemo(() => tokensForLemma(vocab, lemma), [lemma]);
  const tokens = useMemo(() => canonicalTokens(), []);

  if (!lemma) return <div>No verbs available.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label for="lemma">Verb:</label>
        <select id="lemma" value={lemma} onChange={(e) => setLemma((e.target as HTMLSelectElement).value)}>
          {lemmas.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {tokens.map((tok) => {
          const row = tokenMap.get(tok);
          const isIntro = introduced.includes(tok);
          const he = row?.he || (tok === 'lemma' ? lemma : '');
          const style: any = {
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: 8,
            opacity: isIntro ? 1 : 0.4,
            background: 'var(--panel)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          };
          return (
            <div key={tok} style={style} title={isIntro ? 'introduced' : 'locked'}>
              <div style={{ fontSize: 14, direction: 'rtl' }}>{he || '—'}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{tok}</div>
              <div style={{ fontSize: 12 }}>{isIntro ? 'introduced' : 'locked'}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

