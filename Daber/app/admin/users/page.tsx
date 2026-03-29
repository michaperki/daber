import React from 'react';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getUsers() {
  const rows = await prisma.session.groupBy({
    by: ['user_id'],
    _count: { _all: true },
    _sum: { correct_count: true, flawed_count: true, incorrect_count: true },
    _min: { started_at: true },
    _max: { started_at: true },
    orderBy: { _max: { started_at: 'desc' } }
  });
  const userIds = rows.map(r => r.user_id || 'anon');
  const labelEvents = await prisma.event.findMany({
    where: { type: 'user_label', user_id: { in: userIds } },
    orderBy: { created_at: 'desc' }
  });
  const labels = new Map<string, string>();
  for (const ev of labelEvents) {
    const uid = ev.user_id || 'anon';
    if (!labels.has(uid)) {
      const lbl = (ev as any).payload?.label;
      if (typeof lbl === 'string' && lbl.trim()) labels.set(uid, lbl.trim());
    }
  }
  return rows.map(r => {
    const c = r._sum.correct_count || 0;
    const f = r._sum.flawed_count || 0;
    const i = r._sum.incorrect_count || 0;
    const attempts = c + f + i;
    const accuracy = attempts ? Math.round((c / attempts) * 100) : 0;
    return {
      userId: r.user_id || 'anon',
      label: labels.get(r.user_id || 'anon') || null,
      sessions: r._count._all || 0,
      attempts,
      accuracy,
      firstSeen: r._min.started_at || null,
      lastActive: r._max.started_at || null,
    };
  });
}

export default async function AdminUsersPage() {
  const users = await getUsers();
  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ marginBottom: 8 }}>Users</h1>
      <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>
        Anonymous device identities (UUID/localStorage). Rows with legacy sessions show as "anon".
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px,1fr) 110px 120px 110px 180px', gap: 8, alignItems: 'start' }}>
        <div style={{ fontWeight: 600 }}>user</div>
        <div style={{ fontWeight: 600 }}>sessions</div>
        <div style={{ fontWeight: 600 }}>attempts</div>
        <div style={{ fontWeight: 600 }}>accuracy</div>
        <div style={{ fontWeight: 600 }}>last active</div>
        {users.map(u => (
          <React.Fragment key={u.userId}>
            <div>
              {u.label ? (
                <div style={{ fontWeight: 600 }}>{u.label}</div>
              ) : null}
              <div style={{ fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)', color: 'var(--color-text-tertiary)' }}>{u.userId}</div>
            </div>
            <div>{u.sessions}</div>
            <div>{u.attempts}</div>
            <div>{u.accuracy}%</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
              {u.lastActive ? new Date(u.lastActive).toLocaleString() : '—'}
            </div>
          </React.Fragment>
        ))}
        {!users.length ? (
          <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--color-text-tertiary)' }}>No sessions yet</div>
        ) : null}
      </div>
    </div>
  );
}
