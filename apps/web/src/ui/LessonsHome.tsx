import { useLocation } from 'preact-iso';
import { lessons, songLessons } from '../content';
import { progress } from '../state/signals';
import { lessonProgressFor, type LessonProgress } from '../storage/progress';
import panels from './panels.module.css';
import study from './study.module.css';

function statusLabel(status: LessonProgress['status']) {
  if (status === 'completed') return 'Completed';
  if (status === 'in_progress') return 'In progress';
  return 'Not started';
}

function statusDetail(p: LessonProgress) {
  if (p.status === 'completed' && p.last_completed_at) {
    return `Done ${new Date(p.last_completed_at).toLocaleDateString()}`;
  }
  if (p.target_count > 0) return `${Math.min(p.items_completed, p.target_count)}/${p.target_count} items`;
  return 'Untouched';
}

export function LessonsHome() {
  const { route } = useLocation();
  const directSongLessons = lessons.filter((l) => l.endpoint?.kind === 'song' || l.id.startsWith('song_'));
  const authoredLessons = lessons.filter((l) => !directSongLessons.includes(l));
  const richSongOnly = songLessons.filter(
    (song) => !directSongLessons.some((lesson) => lesson.id === `song_${song.id}` || lesson.source_song_id === song.id),
  );

  return (
    <>
      <div class={panels.panel}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Missions</div>
        <div class={panels.muted}>Short, curated lessons with a clear payoff.</div>
      </div>
      {(() => {
        return authoredLessons.length ? (
        authoredLessons.map((l) => {
          const lessonProgress = lessonProgressFor(progress.value, l.id);
          return (
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
              <div class={panels.row}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>
                  {statusLabel(lessonProgress.status)}
                </div>
                <div class={panels.progress}>{statusDetail(lessonProgress)}</div>
              </div>
            </button>
          );
        })
      ) : (
        <div class={panels.panel}>No lessons found. Build content or add data under packages/content/data/v2/lessons.</div>
      );
      })()}
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
      {(directSongLessons.length > 0 || richSongOnly.length > 0) && (
        <>
          <div class={panels.panel}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Songs</div>
            <div class={panels.muted}>Song-based handwriting lessons.</div>
          </div>
          {directSongLessons.map((l) => {
            const lessonProgress = lessonProgressFor(progress.value, l.id);
            return (
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
                <div class={panels.row}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>
                    {statusLabel(lessonProgress.status)}
                  </div>
                  <div class={panels.progress}>{statusDetail(lessonProgress)}</div>
                </div>
              </button>
            );
          })}
          {richSongOnly.map((song) => (
            <button
              key={song.id}
              class={panels.panel}
              onClick={() => route(`/song/${song.id}`)}
              style={{ textAlign: 'left' }}
            >
              <div class={panels.row}>
                <div style={{ fontWeight: 600 }}>{song.title}</div>
                <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--muted)' }}>
                  {song.teachable_units.length} units
                </div>
              </div>
              <div class={panels.muted}>
                {song.status === 'ready' ? 'Ready' : 'Draft'} curriculum inventory
              </div>
            </button>
          ))}
        </>
      )}
    </>
  );
}
