import { useLocation } from 'preact-iso';
import { lessons, songLessons, type LessonJSON } from '../content';
import { progress } from '../state/signals';
import { lessonProgressFor, type LessonProgress } from '../storage/progress';
import styles from './redesign.module.css';

function countScope(scope?: LessonJSON['core']) {
  if (!scope) return 0;
  return Object.values(scope.verbs || {}).reduce((n, tokens) => n + tokens.length, 0)
    + Object.values(scope.adjectives || {}).reduce((n, tokens) => n + tokens.length, 0)
    + Object.values(scope.nouns || {}).reduce((n, tokens) => n + tokens.length, 0);
}

function progressPercent(p: LessonProgress) {
  if (p.status === 'completed') return 100;
  if (p.target_count <= 0) return p.status === 'in_progress' ? 30 : 0;
  return Math.min(99, Math.round((Math.min(p.items_completed, p.target_count) / p.target_count) * 100));
}

function activeStation(p: LessonProgress) {
  if (p.status === 'completed') return 4;
  const stage = p.stages.find((item) => item.completed < item.count);
  if (!stage) return p.status === 'in_progress' ? 2 : 0;
  if (stage.id === 'core_exposure') return 0;
  if (stage.id === 'supporting_build') return 2;
  return 3;
}

export function JourneysScreen() {
  const { route } = useLocation();
  const directSongLessons = lessons.filter((lesson) => lesson.endpoint?.kind === 'song' || lesson.id.startsWith('song_'));
  const authoredLessons = lessons.filter((lesson) => !directSongLessons.includes(lesson));
  const richSongOnly = songLessons.filter(
    (song) => !directSongLessons.some((lesson) => lesson.id === `song_${song.id}` || lesson.source_song_id === song.id),
  );
  const ordered = [...authoredLessons, ...directSongLessons];

  return (
    <section class={styles.screen}>
      <div class={styles.hero}>
        <div class={styles.topline}>
          <span>Journeys</span>
          <span>{ordered.length + richSongOnly.length} destinations</span>
        </div>
        <h2 class={styles.title}>Songs and missions in progress.</h2>
        <div class={styles.subtitle}>Open one path, keep the destination in view, and continue from the next station.</div>
      </div>

      <div class={styles.list}>
        {ordered.map((lesson) => {
          const p = lessonProgressFor(progress.value, lesson.id);
          const percent = progressPercent(p);
          const current = activeStation(p);
          const stationLabels = ['Words', 'Write', 'Phrase', 'Review', 'Arrive'];
          return (
            <button key={lesson.id} class={styles.journeyCard} onClick={() => route(`/journey/${lesson.id}`)}>
              <div class={styles.journeyRow}>
                <div class={styles.cover}>{lesson.endpoint?.kind === 'song' ? 'Song' : 'Path'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div class={styles.cardTitle}>{lesson.title}</div>
                  {lesson.tagline && <div class={styles.meta}>{lesson.tagline}</div>}
                </div>
                <div class={styles.meta}>{percent}%</div>
              </div>
              <div class={styles.trail} aria-label={`${lesson.title} station progress`}>
                {stationLabels.map((label, index) => (
                  <span
                    key={label}
                    title={label}
                    class={[
                      styles.trailDot,
                      index < current || p.status === 'completed' ? styles.trailDotDone : '',
                      index === current && p.status !== 'completed' ? styles.trailDotActive : '',
                    ].filter(Boolean).join(' ')}
                  />
                ))}
              </div>
              <div class={styles.meta}>{countScope(lesson.core) + countScope(lesson.supporting)} forms · {lesson.build_phrases?.length || 0} phrases</div>
            </button>
          );
        })}

        {richSongOnly.map((song) => (
          <button key={song.id} class={styles.journeyCard} onClick={() => route(`/song/${song.id}`)}>
            <div class={styles.journeyRow}>
              <div class={styles.cover}>Song</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div class={styles.cardTitle}>{song.title}</div>
                <div class={styles.meta}>{song.status === 'ready' ? 'Ready' : 'Draft'} curriculum inventory</div>
              </div>
              <div class={styles.meta}>{song.teachable_units.length} units</div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
