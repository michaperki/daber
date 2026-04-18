import { useLocation } from 'preact-iso';
import { lessons, type LessonJSON } from '../content';
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
  if (p.target_count <= 0) return p.status === 'in_progress' ? 25 : 0;
  return Math.min(99, Math.round((Math.min(p.items_completed, p.target_count) / p.target_count) * 100));
}

function actionLabel(p: LessonProgress) {
  if (p.status === 'completed') return 'Practice again';
  if (p.status === 'in_progress') return 'Continue';
  return 'Begin';
}

function nextLesson() {
  const current = lessons.find((lesson) => lessonProgressFor(progress.value, lesson.id).status === 'in_progress');
  if (current) return current;
  return lessons.find((lesson) => lessonProgressFor(progress.value, lesson.id).status !== 'completed') || lessons[0] || null;
}

export function LessonsHome() {
  const { route } = useLocation();
  const lesson = nextLesson();
  const lessonProgress = lesson ? lessonProgressFor(progress.value, lesson.id) : null;
  const coreCount = lesson ? countScope(lesson.core) : 0;
  const supportingCount = lesson ? countScope(lesson.supporting) : 0;
  const phraseCount = lesson?.build_phrases?.filter((phrase) => phrase.drillable !== false).length || 0;
  const knownWords = Object.keys(progress.value.seen_words || {}).length;
  const cleanWords = Object.values(progress.value.seen_words || {}).filter((word) => word.clean > 0).length;
  const completedLessons = lessons.filter((item) => lessonProgressFor(progress.value, item.id).status === 'completed').length;
  const destination = lesson?.endpoint?.description || lesson?.title || 'your next destination';

  if (!lesson) {
    return (
      <section class={styles.screen}>
        <div class={styles.hero}>
          <div class={styles.topline}>Path</div>
          <h2 class={styles.title}>No lessons are ready yet.</h2>
          <div class={styles.subtitle}>Build content first, then come back to the path.</div>
        </div>
      </section>
    );
  }

  const pathSteps = [
    {
      kicker: 'Warm up',
      title: 'Review what is already in reach',
      meta: `${Math.max(3, Math.min(8, cleanWords || 3))} items`,
      href: '/review',
      done: false,
      active: lessonProgress?.status !== 'in_progress',
    },
    {
      kicker: 'New words',
      title: `${coreCount || 'A few'} core forms from ${lesson.title}`,
      meta: lesson.estimated_minutes ? `${lesson.estimated_minutes} min lesson` : 'short lesson',
      href: `/session/${lesson.id}`,
      done: false,
      active: lessonProgress?.status === 'not_started',
    },
    {
      kicker: 'Write',
      title: 'Practice the Hebrew by hand',
      meta: `${coreCount + supportingCount || 'Several'} forms available`,
      href: `/session/${lesson.id}`,
      done: lessonProgress?.status === 'completed',
      active: lessonProgress?.status === 'in_progress',
    },
    {
      kicker: 'Phrase',
      title: phraseCount ? `${phraseCount} phrase${phraseCount === 1 ? '' : 's'} to build` : 'Build useful phrases',
      meta: phraseCount ? 'authored phrase practice' : 'word-to-phrase practice',
      href: `/session/${lesson.id}`,
      done: lessonProgress?.status === 'completed',
      active: lessonProgress?.status === 'in_progress',
    },
    {
      kicker: 'Arrive',
      title: destination,
      meta: lessonProgress?.status === 'completed' ? 'open now' : 'opens through practice',
      href: `/journey/${lesson.id}`,
      done: false,
      active: lessonProgress?.status === 'completed',
      destination: true,
    },
  ];

  return (
    <section class={styles.screen}>
      <div class={styles.hero}>
        <div class={styles.topline}>
          <span>Today</span>
          <span>{completedLessons}/{lessons.length} journeys</span>
        </div>
        <h2 class={styles.title}>Five steps to {lesson.title}.</h2>
        {lesson.tagline && <div class={styles.subtitle}>{lesson.tagline}</div>}
      </div>

      <div class={styles.pathList}>
        {pathSteps.map((step, index) => (
          <div class={styles.pathStep} key={step.kicker}>
            <div
              class={[
                styles.marker,
                step.done ? styles.markerDone : '',
                step.active ? styles.markerActive : '',
                step.destination ? styles.markerDestination : '',
              ].filter(Boolean).join(' ')}
            >
              {step.destination ? 'A' : index + 1}
            </div>
            <button
              class={[
                styles.sketchCard,
                step.active ? styles.sketchCardActive : '',
                step.destination ? styles.sketchCardDark : '',
              ].filter(Boolean).join(' ')}
              onClick={() => route(step.href)}
            >
              <div class={styles.kicker}>{step.kicker}</div>
              <div class={styles.cardTitle}>{step.title}</div>
              <div class={styles.meta}>{step.meta}</div>
            </button>
          </div>
        ))}
      </div>

      <div class={styles.grid}>
        <button class={`${styles.hero} ${styles.heroAccent}`} onClick={() => route(`/journey/${lesson.id}`)}>
          <div class={styles.kicker}>Current journey</div>
          <div class={styles.cardTitle}>{lesson.title}</div>
          <div class={styles.meta}>{progressPercent(lessonProgress!)}% through</div>
        </button>
        <button class={styles.hero} onClick={() => route(`/session/${lesson.id}`)}>
          <div class={styles.kicker}>Next session</div>
          <div class={styles.cardTitle}>{actionLabel(lessonProgress!)}</div>
          <div class={styles.meta}>{knownWords} words have appeared in practice</div>
        </button>
      </div>
    </section>
  );
}
