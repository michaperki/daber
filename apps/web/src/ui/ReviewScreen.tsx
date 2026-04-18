import { useLocation } from 'preact-iso';
import { progress } from '../state/signals';
import styles from './redesign.module.css';

export function ReviewScreen() {
  const { route } = useLocation();
  const words = Object.entries(progress.value.seen_words || {})
    .sort(([, a], [, b]) => (b.attempted - b.clean) - (a.attempted - a.clean))
    .slice(0, 5);
  const dueCount = Math.max(3, words.filter(([, stat]) => stat.attempted > stat.clean).length || Math.min(5, words.length || 3));

  return (
    <section class={styles.screen}>
      <div class={styles.hero}>
        <div class={styles.topline}>
          <span>Review</span>
          <span>{dueCount} due</span>
        </div>
        <h2 class={styles.title}>Review, gently.</h2>
        <div class={styles.subtitle}>A short mixed session from the words and forms that need another pass.</div>
        <button class={`${styles.primaryButton} ${styles.full}`} onClick={() => route('/practice')}>
          Start daily review
        </button>
      </div>

      <div class={styles.list}>
        {words.length ? words.map(([he, stat], index) => (
          <div class={styles.station} key={he}>
            <div class={styles.marker}>{index + 1}</div>
            <div>
              <div class={styles.cardTitle} dir="rtl">{he}</div>
              <div class={styles.meta}>{stat.clean}/{stat.attempted} clean attempts</div>
            </div>
          </div>
        )) : (
          <div class={styles.station}>
            <div class={styles.marker}>1</div>
            <div>
              <div class={styles.cardTitle}>No review history yet.</div>
              <div class={styles.meta}>Start a lesson and this queue will fill in.</div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
