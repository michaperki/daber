"use client";
import React from 'react';

type DayBucket = { label: string; c: number; f: number; i: number };
type Dataset = { sessions: number; items: number; accuracy: number; activeDays: number; bars: DayBucket[] };

export default function ProgressClient({ datasets }: { datasets: Record<'7d'|'30d'|'all', Dataset> }) {
  const [range, setRange] = React.useState<'7d'|'30d'|'all'>(() => {
    try { return (localStorage.getItem('daber.progress.range') as '7d'|'30d'|'all') || '7d'; } catch { return '7d'; }
  });
  React.useEffect(() => {
    try { localStorage.setItem('daber.progress.range', range); } catch {}
  }, [range]);
  const ds = datasets[range];
  return (
    <>
      <div className="prog-header">
        <h1 className="prog-title">progress</h1>
        <div className="range-pills">
          {(['7d','30d','all'] as const).map(r => (
            <button key={r} className={`range-pill ${range===r?'active':''}`} onClick={() => setRange(r)}>{r}</button>
          ))}
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi-tile"><div className="kpi-num">{ds.sessions}</div><div className="kpi-label">sessions</div></div>
        <div className="kpi-tile"><div className="kpi-num">{ds.items}</div><div className="kpi-label">items</div></div>
        <div className="kpi-tile"><div className="kpi-num">{ds.accuracy}<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-tertiary)' }}>%</span></div><div className="kpi-label">accuracy</div></div>
        <div className="kpi-tile"><div className="kpi-num">{ds.activeDays}</div><div className="kpi-label">active days</div></div>
      </div>

      <div className="chart-section">
        <div className="chart-header">
          <span className="chart-title">{range === 'all' ? 'by month' : `last ${range}`}</span>
          <div className="chart-legend">
            <span className="legend-item"><span className="legend-dot" style={{ background: '#639922' }}></span>correct</span>
            <span className="legend-item"><span className="legend-dot" style={{ background: '#EF9F27' }}></span>flawed</span>
            <span className="legend-item"><span className="legend-dot" style={{ background: '#E24B4A' }}></span>incorrect</span>
          </div>
        </div>
        <div className="bar-chart">
          {ds.bars.map((b, idx) => {
            const total = b.c + b.f + b.i; const maxH = 100;
            const hC = total ? Math.round((b.c/total) * maxH) : 0;
            const hF = total ? Math.round((b.f/total) * maxH) : 0;
            const hI = total ? Math.max(0, maxH - hC - hF) : 0;
            return (
              <div key={idx} className="bar-group">
                <div className="bar-stack" style={{ height: maxH }}>
                  <div className="bar-seg-i" style={{ height: `${hI}%` }}></div>
                  <div className="bar-seg-f" style={{ height: `${hF}%` }}></div>
                  <div className="bar-seg-c" style={{ height: `${hC}%` }}></div>
                </div>
                <div className="bar-label">{b.label}</div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
