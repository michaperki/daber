import { useLocation } from 'preact-iso';
import { lessons } from '../content';
import panels from './panels.module.css';
import study from './study.module.css';

export function LessonsHome() {
  const { route } = useLocation();

  return (
    <>
      <div class={panels.panel}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Missions</div>
        <div class={panels.muted}>Short, curated lessons with a clear payoff.</div>
      </div>
      {lessons.length ? (
        lessons.map((l) => (
          <button
            key={l.id}
            class={panels.panel}
            onClick={() => route(`/lesson/${l.id}`)}
            style={{ textAlign: 'left' }}
          >
            <div class={panels.row}>
              <div style={{ fontWeight: 600 }}>{l.title}</div>
              <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--muted)' }}>
                {l.estimated_minutes ? `${l.estimated_minutes} min` : ''}
              </div>
            </div>
            {l.tagline && <div class={panels.muted}>{l.tagline}</div>}
          </button>
        ))
      ) : (
        <div class={panels.panel}>No lessons found. Build content or add data under packages/content/data/v2/lessons.</div>
      )}
      <div class={panels.panel}>
        <div class={panels.row}>
          <div>
            <div style={{ fontWeight: 600 }}>Free practice</div>
            <div class={panels.muted}>Drill broadly from the lexicon.</div>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <button class={study.secondaryBtn} onClick={() => route('/practice')}>Start</button>
          </div>
        </div>
      </div>
    </>
  );
}
