"use client";
import React from 'react';
import StartOrContinueButton from '@/app/StartOrContinueButton';
import StartSubsetButton from '@/app/StartSubsetButton';

type Item = { id: string; he: string; en: string };
type Group = { lessonId: string; title: string; items: Item[] };

export default function RetryClient({ groups }: { groups: Group[] }) {
  return (
    <>
      {groups.map(g => (
        <GroupCard key={g.lessonId} group={g} />
      ))}
    </>
  );
}

function GroupCard({ group }: { group: Group }) {
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set(group.items.map(i => i.id)));
  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const itemIds = Array.from(selected);
  return (
    <div className="pack-card">
      <div className="pack-top">
        <div className="pack-icon amber">
          <svg viewBox="0 0 18 18" fill="none" stroke="#854F0B" strokeWidth="1.5"><path d="M9 2v14M2 9h14" strokeLinecap="round"/><circle cx="9" cy="9" r="3"/></svg>
        </div>
        <div className="pack-meta">
          <p className="pack-name">{group.title}</p>
          <p className="pack-desc">select misses to review</p>
        </div>
        <span className="pack-status-badge badge-in-progress">review</span>
      </div>
      <div className="missed-card" style={{ margin: 0 }}>
        <div className="missed-row" style={{ justifyContent: 'space-between' }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{itemIds.length} selected</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="qs-btn" style={{ height: 28, padding: '0 8px' }} onClick={() => setSelected(new Set(group.items.map(i => i.id)))}>select all</button>
            <button className="qs-btn" style={{ height: 28, padding: '0 8px' }} onClick={() => setSelected(new Set())}>clear</button>
          </div>
        </div>
        {group.items.map((it) => (
          <label key={it.id} className="missed-row" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggle(it.id)} />
            <div className="missed-hebrew-sm">{it.he}</div>
            <div className="missed-eng">{it.en}</div>
          </label>
        ))}
      </div>
      <div className="cta-row">
        <StartOrContinueButton sessionId={null} lessonId={group.lessonId} label="start pack" />
        <StartSubsetButton lessonId={group.lessonId} itemIds={itemIds} label="drill selected" />
      </div>
    </div>
  );
}
