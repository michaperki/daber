import { LETTERS } from '../recognizer/types';
import type { LetterGlyph } from '../recognizer/types';
import { activeTab, calibrateLetterIdx, rightRailOpen, sampleCounts } from '../state/signals';
import styles from './LettersGrid.module.css';

// 27-tile grid of Hebrew letters with per-letter sample counts. Clicking a
// tile jumps the Calibrate tab to that letter (a no-op when not on the
// Calibrate tab).
export function LettersGrid() {
  const counts = sampleCounts.value;
  const activeIdx = calibrateLetterIdx.value;
  const onCalibrate = activeTab.value === 'calibrate';
  return (
    <div class={styles.grid} role="list" aria-label="Letters">
      {LETTERS.map((letter: LetterGlyph, idx: number) => {
        const isActive = onCalibrate && idx === activeIdx;
        return (
          <button
            type="button"
            key={letter}
            class={`${styles.item} ${isActive ? styles.itemActive : ''}`}
            onClick={() => {
              calibrateLetterIdx.value = idx;
              if (!onCalibrate) activeTab.value = 'calibrate';
              rightRailOpen.value = false;
            }}
            title={`${letter}: ${counts[letter] || 0} samples`}
          >
            <div class={styles.glyph}>{letter}</div>
            <div class={styles.count}>{counts[letter] || 0}</div>
          </button>
        );
      })}
    </div>
  );
}
