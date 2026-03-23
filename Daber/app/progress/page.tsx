import { prisma } from '@/lib/db';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
import ProgressClient from './ProgressClient';

type DayBucket = { label: string; c: number; f: number; i: number };
type Mastery = { lessonId: string; title: string; pct: number };

function fmtShort(d: Date) { return d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0,1); }
function monthLabel(d: Date) { return d.toLocaleDateString('en-US', { month: 'short' }); }

function sumAccuracy(items: { grade: string }[]) {
  const c = items.filter(a => a.grade === 'correct').length;
  return items.length ? Math.round((c / items.length) * 100) : 0;
}

export default async function ProgressPage() {
  const now = new Date();
  const since7 = new Date(now); since7.setDate(now.getDate() - 6);
  const since30 = new Date(now); since30.setDate(now.getDate() - 29);

  const [attempts7, attempts30, attemptsAll, sessions7, sessions30, sessionsAll, sessionAgg, hard, stats] = await Promise.all([
    prisma.attempt.findMany({ where: { created_at: { gte: since7 } }, select: { created_at: true, grade: true } }),
    prisma.attempt.findMany({ where: { created_at: { gte: since30 } }, select: { created_at: true, grade: true } }),
    prisma.attempt.findMany({ select: { created_at: true, grade: true } }),
    prisma.session.findMany({ where: { started_at: { gte: since7 } }, select: { id: true } }),
    prisma.session.findMany({ where: { started_at: { gte: since30 } }, select: { id: true } }),
    prisma.session.findMany({ select: { id: true } }),
    prisma.session.groupBy({ by: ['lesson_id'], _sum: { correct_count: true, flawed_count: true, incorrect_count: true } }),
    prisma.attempt.groupBy({ by: ['lesson_item_id'], where: { OR: [{ grade: 'flawed' }, { grade: 'incorrect' }] }, _count: { lesson_item_id: true }, orderBy: { _count: { lesson_item_id: 'desc' } }, take: 5 }),
    prisma.featureStat.findMany({})
  ]);

  function bucketsForRange(days: number, attempts: { created_at: Date; grade: string }[]): DayBucket[] {
    const bs: Record<string, DayBucket> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now); d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0,10);
      bs[key] = { label: fmtShort(d), c: 0, f: 0, i: 0 };
    }
    attempts.forEach(a => {
      const key = new Date(a.created_at).toISOString().slice(0,10);
      const b = bs[key]; if (!b) return;
      if (a.grade === 'correct') b.c++; else if (a.grade === 'flawed') b.f++; else b.i++;
    });
    return Object.keys(bs).sort().map(k => bs[k]);
  }

  function monthlyBuckets(attempts: { created_at: Date; grade: string }[]): DayBucket[] {
    if (!attempts.length) return [];
    const first = attempts.reduce((m,a) => a.created_at < m ? a.created_at : m, attempts[0].created_at);
    const start = new Date(first.getFullYear(), first.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    const labels: Date[] = [];
    let cur = start;
    while (cur <= end) {
      labels.push(new Date(cur));
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    const bs: Record<string, DayBucket> = {};
    labels.forEach(d => { const key = `${d.getFullYear()}-${d.getMonth()+1}`; bs[key] = { label: monthLabel(d), c: 0, f: 0, i: 0 }; });
    attempts.forEach(a => {
      const d = a.created_at; const key = `${d.getFullYear()}-${d.getMonth()+1}`; const b = bs[key]; if (!b) return;
      if (a.grade === 'correct') b.c++; else if (a.grade === 'flawed') b.f++; else b.i++;
    });
    const arr = Object.keys(bs).sort((a,b) => (new Date(a+'-01') as any) - (new Date(b+'-01') as any)).map(k => bs[k]);
    return arr.slice(-6); // last 6 months
  }

  const ds7 = { sessions: sessions7.length, items: attempts7.length, accuracy: sumAccuracy(attempts7), activeDays: bucketsForRange(7, attempts7).filter(b => (b.c+b.f+b.i)>0).length, bars: bucketsForRange(7, attempts7) };
  const ds30 = { sessions: sessions30.length, items: attempts30.length, accuracy: sumAccuracy(attempts30), activeDays: bucketsForRange(30, attempts30).filter(b => (b.c+b.f+b.i)>0).length, bars: bucketsForRange(30, attempts30) };
  const dsAll = { sessions: sessionsAll.length, items: attemptsAll.length, accuracy: sumAccuracy(attemptsAll), activeDays: monthlyBuckets(attemptsAll).length, bars: monthlyBuckets(attemptsAll) };

  const lessons = await prisma.lesson.findMany({ select: { id: true, title: true } });
  const lessonMap = new Map(lessons.map(l => [l.id, l.title]));
  const mastery: Mastery[] = sessionAgg.map(row => {
    const c = row._sum.correct_count || 0; const f = row._sum.flawed_count || 0; const i = row._sum.incorrect_count || 0;
    const total = c + f + i; const pct = total ? Math.round((c / total) * 100) : 0;
    return { lessonId: row.lesson_id, title: lessonMap.get(row.lesson_id) || row.lesson_id, pct };
  }).sort((a,b) => b.pct - a.pct);

  const hardItems = await Promise.all(hard.map(async h => {
    const li = await prisma.lessonItem.findUnique({ where: { id: h.lesson_item_id }, select: { target_hebrew: true, english_prompt: true } });
    const misses = (h as any)._count?.lesson_item_id || 0;
    return { he: li?.target_hebrew || '', en: li?.english_prompt || '', misses };
  }));

  const featureRows = stats.map(s => {
    const pos = (s as any).pos || '';
    const tense = (s as any).tense || '';
    const person = (s as any).person || '';
    const number = (s as any).number || '';
    const gender = (s as any).gender || '';
    const c = (s as any).correct_count || 0;
    const f = (s as any).flawed_count || 0;
    const i = (s as any).incorrect_count || 0;
    const total = c + f + i;
    const pct = total ? Math.round((c / total) * 100) : 0;
    const label = [pos, tense, [person, number, gender].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
    return { label, pct };
  }).sort((a,b) => a.pct - b.pct).slice(0, 6);

  return (
    <div className="prog-root">
      <ProgressClient datasets={{ '7d': ds7, '30d': ds30, 'all': dsAll }} />
      <div className="section-label">mastery by lesson</div>
      <div className="mastery-list">
        {mastery.map((m) => (
          <div key={m.lessonId} className="mastery-row">
            <span className="mastery-name">{m.title}</span>
            <div className="mastery-track"><div className="mastery-fill" style={{ width: `${m.pct}%` }}></div></div>
            <span className="mastery-pct">{m.pct ? `${m.pct}%` : '—'}</span>
          </div>
        ))}
        {!mastery.length ? <div style={{ padding: '0 1rem', fontSize: 12, color: 'var(--color-text-tertiary)' }}>No data yet</div> : null}
      </div>

      <div className="section-label">hardest items</div>
      <div className="hard-items-card">
        {hardItems.map((h,i) => (
          <div key={i} className="hard-item-row">
            <span className="hard-rank">{i+1}</span>
            <div className="hard-hebrew">{h.he}</div>
            <div className="hard-eng">{h.en}</div>
            <div className="hard-attempts">{h.misses} misses</div>
          </div>
        ))}
        {!hardItems.length ? <div className="hard-item-row"><div className="hard-eng" style={{ textAlign: 'center' }}>No misses yet</div></div> : null}
      </div>

      <div className="section-label">feature mastery (lowest)</div>
      <div className="mastery-list">
        {featureRows.map((r, i) => (
          <div key={i} className="mastery-row">
            <span className="mastery-name">{r.label}</span>
            <div className="mastery-track"><div className="mastery-fill" style={{ width: `${r.pct}%` }}></div></div>
            <span className="mastery-pct">{r.pct ? `${r.pct}%` : '—'}</span>
          </div>
        ))}
        {!featureRows.length ? <div style={{ padding: '0 1rem', fontSize: 12, color: 'var(--color-text-tertiary)' }}>No data yet</div> : null}
      </div>
    </div>
  );
}
