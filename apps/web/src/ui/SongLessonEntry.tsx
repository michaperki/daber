import { useLocation, useRoute } from 'preact-iso';
import { lessons, songLessons, type UnitRole } from '../content';
import { progress } from '../state/signals';
import { lessonProgressFor } from '../storage/progress';
import styles from './redesign.module.css';

const ROLE_LABEL: Record<UnitRole, string> = {
  teaching_target: 'teaching targets',
  vocabulary: 'vocabulary',
  annotation: 'annotations',
};
const ROLE_ORDER: UnitRole[] = ['teaching_target', 'vocabulary', 'annotation'];

export function SongLessonEntry() {
  const { route } = useLocation();
  const { params } = useRoute();
  const song = songLessons.find((s) => s.id === params.id);

  if (!song) {
    return (
      <section class={styles.screen}>
        <div class={styles.hero}>
          <div class={styles.topline}>Destination</div>
          <h2 class={styles.title}>Song not found.</h2>
          <button class={styles.secondaryButton} onClick={() => route('/journeys')}>Back to journeys</button>
        </div>
      </section>
    );
  }

  const prepLesson = lessons.find((lesson) => lesson.source_song_id === song.id || lesson.id === `song_${song.id}`);
  const prepProgress = prepLesson ? lessonProgressFor(progress.value, prepLesson.id) : null;
  const unlocked = !prepLesson || prepProgress?.status === 'completed';
  const roleCounts = song.teachable_units.reduce<Record<UnitRole, number>>((acc, unit) => {
    acc[unit.role] = (acc[unit.role] || 0) + 1;
    return acc;
  }, { teaching_target: 0, vocabulary: 0, annotation: 0 });

  return (
    <section class={styles.screen}>
      <div class={`${styles.hero} ${unlocked ? styles.heroAccent : ''}`}>
        <div class={styles.topline}>
          <button class={styles.secondaryButton} onClick={() => route(prepLesson ? `/journey/${prepLesson.id}` : '/journeys')}>Back</button>
          <span>{unlocked ? 'Open' : 'Prep in progress'}</span>
        </div>
        <h2 class={styles.title}>{song.title}</h2>
        <div class={styles.subtitle}>
          {unlocked
            ? 'Read the line in context. The study walk can continue when you are ready.'
            : 'Complete the prep stations first, then come back to the line with more of it in reach.'}
        </div>
        {prepLesson && (
          <button
            class={`${styles.primaryButton} ${styles.full}`}
            onClick={() => route(unlocked ? `/journey/${prepLesson.id}` : `/session/${prepLesson.id}`)}
          >
            {unlocked ? 'Review the journey' : 'Continue prep'}
          </button>
        )}
      </div>

      {song.source?.normalized_hebrew_note && (
        <div class={styles.station}>
          <div class={styles.marker}>N</div>
          <div>
            <div class={styles.kicker}>Note</div>
            <div class={styles.meta}>{song.source.normalized_hebrew_note}</div>
          </div>
        </div>
      )}

      <div class={styles.statsRow}>
        {ROLE_ORDER.map((role) => (
          <div key={role} class={styles.stat}>
            <div class={styles.statValue}>{roleCounts[role] || 0}</div>
            <div class={styles.meta}>{ROLE_LABEL[role]}</div>
          </div>
        ))}
      </div>

      <div class={styles.hero}>
        <div class={styles.kicker}>Lyrics</div>
        <div class={styles.hebrewBlock} dir="rtl">{song.lyrics.he}</div>
        {song.lyrics.en && <div class={styles.subtitle}>{song.lyrics.en}</div>}
      </div>

      {prepLesson && (
        <button class={`${styles.secondaryButton} ${styles.full}`} onClick={() => route(`/session/${prepLesson.id}`)}>
          Practice this again
        </button>
      )}
    </section>
  );
}
