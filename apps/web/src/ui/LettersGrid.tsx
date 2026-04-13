import { LETTERS } from '../recognizer/types';
import type { LetterGlyph } from '../recognizer/types';
import { calibrateLetterIdx, sampleCounts } from '../state/signals';
import { clearLetterSamples } from '../storage/mutations';
import styles from './LettersGrid.module.css';

// 27-tile grid of Hebrew letters with per-letter sample counts. Clicking a
// tile jumps the Calibrate tab to that letter (a no-op when not on the
// Calibrate tab).
export function LettersGrid() {
  const counts = sampleCounts.value;
  const activeIdx = calibrateLetterIdx.value;
  return (
    <div class={styles.grid} role="list" aria-label="Letters">
      {LETTERS.map((letter: LetterGlyph, idx: number) => {
        const isActive = idx === activeIdx;
        return (
          <button
            type="button"
            key={letter}
            class={`${styles.item} ${isActive ? styles.itemActive : ''}`}
            onClick={() => {
              // Re-onboard this letter: clear stored samples and make active
              clearLetterSamples(letter);
              calibrateLetterIdx.value = idx;
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
