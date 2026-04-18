import { useLocation } from 'preact-iso';
import { progress } from '../state/signals';
import { phraseItemsForReview } from '../session_planner';
import styles from './redesign.module.css';

export function ReviewScreen() {
  const { route } = useLocation();
  const phraseItems = phraseItemsForReview(progress.value, 5);
  const phraseText = new Set(phraseItems.map((item) => item.row.he));
  const words = Object.entries(progress.value.seen_words || {})
    .filter(([he]) => !phraseText.has(he))
    .sort(([, a], [, b]) => (b.attempted - b.clean) - (a.attempted - a.clean))
    .slice(0, Math.max(0, 5 - phraseItems.length));
  const dueCount = Math.max(
    3,
    phraseItems.length + (words.filter(([, stat]) => stat.attempted > stat.clean).length || Math.min(5, words.length || 0)),
  );

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
        {phraseItems.map((item, index) => {
          const stat = progress.value.phrases?.[item.key];
          return (
            <div class={styles.station} key={item.key}>
              <div class={styles.marker}>{index + 1}</div>
              <div>
                <div class={styles.kicker}>Phrase</div>
                <div class={styles.cardTitle} dir="rtl">{item.row.he}</div>
                <div class={styles.meta}>
                  {stat ? `${stat.clean}/${stat.attempted} clean attempts` : 'ready for review'}
                </div>
              </div>
            </div>
          );
        })}

        {words.length ? words.map(([he, stat], index) => (
          <div class={styles.station} key={he}>
            <div class={styles.marker}>{phraseItems.length + index + 1}</div>
            <div>
              <div class={styles.kicker}>Word</div>
              <div class={styles.cardTitle} dir="rtl">{he}</div>
              <div class={styles.meta}>{stat.clean}/{stat.attempted} clean attempts</div>
            </div>
          </div>
        )) : null}

        {!phraseItems.length && !words.length && (
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
