import { useEffect, useMemo, useRef } from 'preact/hooks';
import { LETTERS, type LetterGlyph } from '../recognizer/types';
import { calibration } from '../state/signals';
import { toPrototypes } from '../storage/calibration';
import { computeCentroids } from '../recognizer/centroid';
import { FEATURE_PIXELS } from '../recognizer/features';
import styles from './Prototypes.module.css';

// Renders each calibrated letter's averaged prototype as a 64x64 black-on-
// white thumbnail. Recomputes centroids whenever calibration changes.
export function Prototypes() {
  // Reactive dependency on calibration.
  const cal = calibration.value;
  const prototypes = useMemo(() => {
    const proto = toPrototypes(cal);
    return computeCentroids(proto, false);
  }, [cal]);

  const entries = LETTERS
    .filter((L) => prototypes[L])
    .map((L) => [L, prototypes[L]!] as [LetterGlyph, Float32Array]);

  if (!entries.length) {
    return (
      <div class={styles.empty}>
        Prototypes appear here as you calibrate letters.
      </div>
    );
  }

  return (
    <div class={styles.grid} role="list">
      {entries.map(([letter, vec]) => (
        <ProtoThumb key={letter} letter={letter} vec={vec} />
      ))}
    </div>
  );
}

function ProtoThumb({ letter, vec }: { letter: LetterGlyph; vec: Float32Array }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(64, 64);
    // The feature vector is unit-normalized, so raw values are small. Find
    // the max so we scale to full-contrast black for display.
    let max = 0;
    for (let i = 0; i < FEATURE_PIXELS; i++) if (vec[i] > max) max = vec[i];
    const scale = max > 0 ? 255 / max : 0;
    for (let i = 0; i < 64 * 64; i++) {
      const v = Math.max(0, Math.min(255, Math.round(vec[i] * scale)));
      const gray = 255 - v; // invert so ink is dark on white
      img.data[i * 4] = gray;
      img.data[i * 4 + 1] = gray;
      img.data[i * 4 + 2] = gray;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [vec]);

  return (
    <div class={styles.item}>
      <canvas ref={ref} width={64} height={64} />
      <div class={styles.label}>{letter}</div>
    </div>
  );
}
