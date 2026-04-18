import { useMemo } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import { lessons, type LessonJSON } from '../content';
import { progress } from '../state/signals';
import { lessonProgressFor, type LessonProgress, type SessionStation } from '../storage/progress';
import { LessonNotes } from './LessonNotes';
import styles from './redesign.module.css';

const STATION_ORDER: readonly SessionStation[] = ['words', 'write', 'phrase', 'review'] as const;

function countScope(scope?: LessonJSON['core']) {
  if (!scope) return 0;
  return Object.values(scope.verbs || {}).reduce((n, tokens) => n + tokens.length, 0)
    + Object.values(scope.adjectives || {}).reduce((n, tokens) => n + tokens.length, 0)
    + Object.values(scope.nouns || {}).reduce((n, tokens) => n + tokens.length, 0);
}

function stationDone(progress: LessonProgress, station: SessionStation) {
  if (progress.status === 'completed') return true;
  const stage = progress.stages.find((item) => item.station === station);
  return !!stage && stage.completed >= stage.count;
}

function activeStationId(progress: LessonProgress): SessionStation | 'arrive' {
  if (progress.status === 'completed') return 'arrive';
  for (const station of STATION_ORDER) {
    const stage = progress.stages.find((item) => item.station === station);
    if (!stage) continue;
    if (stage.completed < stage.count) return station;
  }
  return 'arrive';
}

function progressPercent(progress: LessonProgress) {
  if (progress.status === 'completed') return 100;
  if (progress.target_count <= 0) return progress.status === 'in_progress' ? 30 : 0;
  return Math.min(99, Math.round((Math.min(progress.items_completed, progress.target_count) / progress.target_count) * 100));
}

function actionLabel(progress: LessonProgress) {
  if (progress.status === 'completed') return 'Practice again';
  if (progress.status === 'in_progress') return 'Continue';
  return 'Begin';
}

export function LessonEntry() {
  const { route } = useLocation();
  const { params } = useRoute();
  const lesson = lessons.find((item) => item.id === params.id);

  if (!lesson) {
    return (
      <section class={styles.screen}>
        <div class={styles.hero}>
          <div class={styles.topline}>Journey</div>
          <h2 class={styles.title}>Journey not found.</h2>
          <button class={styles.secondaryButton} onClick={() => route('/journeys')}>Back to journeys</button>
        </div>
      </section>
    );
  }

  const lessonProgress = lessonProgressFor(progress.value, lesson.id);
  const coreCount = useMemo(() => countScope(lesson.core), [lesson]);
  const supportingCount = useMemo(() => countScope(lesson.supporting), [lesson]);
  const phraseCount = lesson.build_phrases?.filter((phrase) => phrase.drillable !== false).length || 0;
  const active = activeStationId(lessonProgress);
  const percent = progressPercent(lessonProgress);
  const destinationHref = lesson.source_song_id ? `/song/${lesson.source_song_id}` : `/session/${lesson.id}`;

  const stations = [
    {
      id: 'words' as const,
      title: 'Meet the words',
      detail: coreCount ? `${coreCount} core forms` : 'core exposure',
      done: stationDone(lessonProgress, 'words'),
    },
    {
      id: 'write' as const,
      title: 'Write by hand',
      detail: `${coreCount + supportingCount || 'Several'} forms available`,
      done: stationDone(lessonProgress, 'write'),
    },
    {
      id: 'phrase' as const,
      title: 'Build phrases',
      detail: phraseCount ? `${phraseCount} authored phrases` : 'phrase practice',
      done: stationDone(lessonProgress, 'phrase'),
    },
    {
      id: 'review' as const,
      title: 'Mixed review',
      detail: 'keep the forms reachable',
      done: stationDone(lessonProgress, 'review'),
    },
    {
      id: 'arrive' as const,
      title: 'Arrive',
      detail: lesson.endpoint?.description || lesson.title,
      done: lessonProgress.status === 'completed',
      destination: true,
    },
  ];

  return (
    <section class={styles.screen}>
      <div class={styles.hero}>
        <div class={styles.topline}>
          <button class={styles.secondaryButton} onClick={() => route('/journeys')}>Back</button>
          <span>{percent}% through</span>
        </div>
        <h2 class={styles.title}>{lesson.title}</h2>
        {lesson.tagline && <div class={styles.subtitle}>{lesson.tagline}</div>}
        <button class={`${styles.primaryButton} ${styles.full}`} onClick={() => route(`/session/${lesson.id}`)}>
          {actionLabel(lessonProgress)}
        </button>
      </div>

      <div class={styles.stationList}>
        {stations.map((station, index) => (
          <button
            key={station.id}
            class={[
              styles.station,
              station.done ? styles.stationDone : '',
              active === station.id ? styles.stationActive : '',
            ].filter(Boolean).join(' ')}
            onClick={() => route(station.destination && lessonProgress.status === 'completed' ? destinationHref : `/session/${lesson.id}`)}
          >
            <div
              class={[
                styles.marker,
                station.done ? styles.markerDone : '',
                active === station.id ? styles.markerActive : '',
                station.destination ? styles.markerDestination : '',
              ].filter(Boolean).join(' ')}
            >
              {station.destination ? 'A' : index + 1}
            </div>
            <div>
              <div class={styles.kicker}>{station.id}</div>
              <div class={styles.cardTitle}>{station.title}</div>
              <div class={styles.meta}>{station.detail}</div>
            </div>
          </button>
        ))}
      </div>

      {lesson.notes && lesson.notes.length > 0 && (
        <LessonNotes notes={lesson.notes} />
      )}
    </section>
  );
}
