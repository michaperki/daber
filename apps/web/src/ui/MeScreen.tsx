import { lessons } from '../content';
import { progress } from '../state/signals';
import { lessonProgressFor } from '../storage/progress';
import styles from './redesign.module.css';

export function MeScreen() {
  const completedLessons = lessons.filter((lesson) => lessonProgressFor(progress.value, lesson.id).status === 'completed').length;
  const wordsSeen = Object.keys(progress.value.seen_words || {}).length;
  const cells = Object.values(progress.value.cells || {});
  const masteredCells = cells.filter((cell) => cell.state === 'mastered').length;
  const totalLetters = progress.value.vocab_stats.total_letters;
  const accuracy = totalLetters
    ? Math.round((progress.value.vocab_stats.correct_letters / totalLetters) * 100)
    : 0;

  return (
    <section class={styles.screen}>
      <div class={styles.hero}>
        <div class={styles.topline}>Me</div>
        <h2 class={styles.title}>Your trail.</h2>
        <div class={styles.subtitle}>Progress stays quiet: lessons finished, words seen, forms mastered, and handwriting accuracy.</div>
      </div>

      <div class={styles.statsRow}>
        <div class={styles.stat}>
          <div class={styles.statValue}>{completedLessons}</div>
          <div class={styles.meta}>journeys completed</div>
        </div>
        <div class={styles.stat}>
          <div class={styles.statValue}>{wordsSeen}</div>
          <div class={styles.meta}>words seen</div>
        </div>
        <div class={styles.stat}>
          <div class={styles.statValue}>{masteredCells}</div>
          <div class={styles.meta}>forms mastered</div>
        </div>
        <div class={styles.stat}>
          <div class={styles.statValue}>{accuracy}%</div>
          <div class={styles.meta}>letter accuracy</div>
        </div>
      </div>
    </section>
  );
}
