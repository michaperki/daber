import React from 'react';
import { prisma } from '@/lib/db';

type Issue = {
  lessonItemId: string;
  english: string;
  target: string;
  reason: string;
  details?: string;
};

function stripHebPronoun(s: string): string {
  const pronouns = ['אני','אתה','את','הוא','היא','אנחנו','אתם','אתן','הם','הן'];
  let out = s;
  for (const p of pronouns) {
    if (out.startsWith(p + ' ')) { out = out.slice(p.length).trim(); break; }
  }
  return out.replace(/[\u2000-\u206F\s]+$/g, '').replace(/[!?,.;:]+$/g, '').trim();
}

function normalizeFormForMatch(s: string): string {
  return stripHebPronoun(s).replace(/[\u2000-\u206F]+/g, '').replace(/[!?,.;:]+/g, '').trim();
}

async function getIssues(): Promise<Issue[]> {
  const items = await prisma.lessonItem.findMany({ where: { NOT: { lexeme_id: null } }, select: { id: true, english_prompt: true, target_hebrew: true, features: true, lexeme_id: true } });
  const issues: Issue[] = [];
  for (const it of items) {
    const lexemeId = (it as any).lexeme_id as string | null;
    if (!lexemeId) continue;
    const form = stripHebPronoun(it.target_hebrew || '');
    const infl = await prisma.inflection.findMany({ where: { lexeme_id: lexemeId } });
    const normItem = normalizeFormForMatch(it.target_hebrew || '');
    const match = infl.find((f: { form: string }) => normalizeFormForMatch(f.form) === normItem) || null;
    if (!match) {
      issues.push({ lessonItemId: it.id, english: it.english_prompt, target: it.target_hebrew, reason: 'missing_inflection_form', details: `No Inflection with form='${form}'` });
      continue;
    }
    const f = (it.features as any) || {};
    const diffs: string[] = [];
    if (f.tense && match.tense && f.tense !== match.tense) diffs.push(`tense=${f.tense}!=${match.tense}`);
    if (f.person && match.person && f.person !== match.person) diffs.push(`person=${f.person}!=${match.person}`);
    if (f.number && match.number && f.number !== match.number) diffs.push(`number=${f.number}!=${match.number}`);
    if (f.gender && match.gender && f.gender !== match.gender) diffs.push(`gender=${f.gender}!=${match.gender}`);
    if (diffs.length) {
      issues.push({ lessonItemId: it.id, english: it.english_prompt, target: it.target_hebrew, reason: 'feature_mismatch', details: diffs.join(', ') });
    }
  }
  return issues;
}

export default async function AdminLexiconValidatePage() {
  if (process.env.ADMIN_ENABLED !== '1') {
    return <div style={{ padding: 16 }}>Admin disabled. Set ADMIN_ENABLED=1 in env.</div>;
  }
  const issues = await getIssues();
  return (
    <div className="lib-root">
      <div className="lib-topbar"><h1 className="lib-title">lexicon validation</h1></div>
      <div className="section-eyebrow">mismatches</div>
      {!issues.length ? <div className="prompt-card"><div className="prompt-text">No issues found</div></div> : null}
      {issues.map((i) => (
        <div key={i.lessonItemId} className="pack-card">
          <div className="pack-top">
            <div className="pack-meta">
              <p className="pack-name">{i.english}</p>
              <p className="pack-desc">{i.target}</p>
            </div>
            <span className="pack-status-badge badge-in-progress">{i.reason}</span>
          </div>
          <div style={{ padding: '0 1rem', fontSize: 12, color: 'var(--color-text-secondary)' }}>{i.details || ''}</div>
          <div className="cta-row">
            <form action={`/api/admin/lexicon/sync`} method="post" style={{ display: 'inline-flex', gap: 8 }}>
              <input type="hidden" name="lessonItemId" value={i.lessonItemId} />
              <input type="hidden" name="action" value="sync" />
              <button className="qs-btn" type="submit">sync features</button>
            </form>
            <form action={`/api/admin/lexicon/sync`} method="post" style={{ display: 'inline-flex', gap: 8 }}>
              <input type="hidden" name="lessonItemId" value={i.lessonItemId} />
              <input type="hidden" name="action" value="unlink" />
              <button className="qs-btn" type="submit">unlink lexeme</button>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}
