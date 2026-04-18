import { useLocation, useRoute } from 'preact-iso';
import { lessons } from '../content';
import { lastSessionSummary } from '../state/session';
import { LessonNotes } from './LessonNotes';
import styles from './redesign.module.css';

function destinationHref(lesson?: typeof lessons[number]) {
  if (!lesson) return '/path';
  if (lesson.source_song_id) return `/song/${lesson.source_song_id}`;
  if (lesson.endpoint?.kind === 'song' && lesson.id.startsWith('song_')) return `/song/${lesson.id.slice(5)}`;
  return `/journey/${lesson.id}`;
}

export function LessonComplete() {
  const { route } = useLocation();
  const { params } = useRoute();
  const lesson = lessons.find((l) => l.id === params.id);
  const summary = lastSessionSummary.value;
  const title = summary?.lessonTitle || lesson?.title;
  const isLesson = summary?.mode === 'lesson';
  const arrived = !!summary?.lessonFinished && !!lesson;
  const primaryHref = arrived ? destinationHref(lesson) : isLesson && lesson ? `/journey/${lesson.id}` : '/review';

  return (
    <>
      <section class={styles.screen}>
        <div class={styles.hero}>
          <div class={styles.topline}>
            <span>Recap</span>
            {summary && <span>{summary.itemsCompleted}/{summary.targetCount}</span>}
          </div>
          <h2 class={styles.title}>{title ? `${title} complete.` : 'Session complete.'}</h2>
          <div class={styles.subtitle}>
            {arrived
              ? 'The destination is open. Take the line back into context.'
              : isLesson
                ? 'Good stopping point. The journey will pick up from the next station.'
                : 'Review stays light so the next session starts within reach.'}
          </div>
        </div>

        {summary ? (
          <div class={styles.statsRow}>
            <div class={styles.stat}>
              <div class={styles.statValue}>{summary.clean}</div>
              <div class={styles.meta}>clean</div>
            </div>
            <div class={styles.stat}>
              <div class={styles.statValue}>{summary.unclean}</div>
              <div class={styles.meta}>needs another pass</div>
            </div>
            <div class={styles.stat}>
              <div class={styles.statValue}>{summary.phrasesPracticed}</div>
              <div class={styles.meta}>phrases practiced</div>
            </div>
            <div class={styles.stat}>
              <div class={styles.statValue}>{summary.newItemsSeen}</div>
              <div class={styles.meta}>new forms seen</div>
            </div>
          </div>
        ) : (
          <div class={styles.station}>
            <div class={styles.marker}>1</div>
            <div>
              <div class={styles.cardTitle}>No session summary is available.</div>
              <div class={styles.meta}>Continue from the path.</div>
            </div>
          </div>
        )}

        <div class={styles.grid}>
          <button class={`${styles.primaryButton} ${styles.full}`} onClick={() => route(primaryHref)}>
            {arrived ? 'Arrive' : isLesson ? 'Back to journey' : 'Done'}
          </button>
          <button class={`${styles.secondaryButton} ${styles.full}`} onClick={() => route('/path')}>
            Path
          </button>
        </div>
      </section>
      {lesson?.notes && lesson.notes.length > 0 && (
        <LessonNotes notes={lesson.notes} heading="Before you go: song notes" />
      )}
    </>
  );
}
