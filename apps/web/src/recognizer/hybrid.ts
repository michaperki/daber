import type { LetterGlyph, Ranked } from './types';
import { LETTERS } from './types';
import { dot } from './distance';
import { computeCentroids, type Prototypes } from './centroid';

// Alpha weighting for prototype contribution as a function of calibration count
function alphaFor(count: number): number {
  if (count <= 0) return 0;
  if (count >= 8) return 0.8;
  return 0.3 + (count - 1) * (0.5 / 7);
}

// Try to obtain CNN probabilities via a global TFJS model, if one is loaded.
// Expected: a model attached at (window as any).daberCnnModel with signature
// predict(tensor) -> logits or probs for len(LETTERS) classes.
// This file intentionally avoids importing tfjs/onnx so the app builds without them.
async function getCnnProbs(vec64x64: Float32Array): Promise<Record<LetterGlyph, number>> {
  try {
    const win: any = window as any;
    const tf = win.tf as any;
    const model = win.daberCnnModel as any;
    if (!tf || !model) return {} as Record<LetterGlyph, number>;
    // Build 1x64x64x1 grayscale input in [0,1], white=1, ink=0
    const arr = new Float32Array(64 * 64);
    for (let i = 0; i < 64 * 64; i++) arr[i] = 1 - vec64x64[i];
    const t = tf.tensor4d(arr, [1, 64, 64, 1]);
    const out = model.predict(t);
    const logits = (await out.data()) as Float32Array;
    t.dispose?.();
    out.dispose?.();
    // Softmax if needed
    const max = Math.max(...logits);
    let sum = 0;
    const exps = Array.from(logits, (v) => { const e = Math.exp(v - max); sum += e; return e; });
    const probs = exps.map((e) => e / (sum || 1));
    const outMap: Partial<Record<LetterGlyph, number>> = {};
    const labels = Array.isArray(win.daberCnnLabels) ? (win.daberCnnLabels as string[]) : null;
    if (labels && labels.length === probs.length) {
      for (let i = 0; i < probs.length; i++) {
        const lab = String(labels[i]);
        if ((LETTERS as string[]).includes(lab)) {
          outMap[lab as LetterGlyph] = probs[i];
        }
      }
    } else {
      for (let i = 0; i < LETTERS.length && i < probs.length; i++) {
        outMap[LETTERS[i]] = probs[i];
      }
    }
    return outMap as Record<LetterGlyph, number>;
  } catch {
    return {} as Record<LetterGlyph, number>;
  }
}

export async function predictByHybridAsync(
  vec: Float32Array,
  db: Prototypes,
  opts: { augment?: boolean; topN?: number; expectedLetter?: LetterGlyph } = {},
): Promise<Ranked[]> {
  // 1) Prototype score from centroids
  const centroids = computeCentroids(db, opts.augment ?? false);
  const protoRaw: Record<LetterGlyph, number> = {} as any;
  const calibCounts: Record<LetterGlyph, number> = {} as any;
  for (const L of LETTERS) {
    const arr = db[L] || [];
    calibCounts[L] = arr.length;
    protoRaw[L] = centroids[L] ? dot(vec, centroids[L]!) : 0;
  }

  // 2) CNN probabilities (optional)
  const cnnProbs = await getCnnProbs(vec.subarray(0, 64 * 64));

  // 3) Combine: logp(cnn) + alpha(count)*proto + prior(expected)
  const combined: { letter: LetterGlyph; raw: number }[] = [];
  const beta = opts.expectedLetter ? 0.15 : 0;
  for (const L of LETTERS) {
    const p = Math.max(1e-8, cnnProbs[L] ?? 1e-8);
    const logp = Math.log(p);
    const a = alphaFor(calibCounts[L] || 0);
    const prior = opts.expectedLetter && L === opts.expectedLetter ? beta : 0;
    combined.push({ letter: L, raw: logp + a * (protoRaw[L] || 0) + prior });
  }
  combined.sort((a, b) => b.raw - a.raw);
  const top = combined.slice(0, opts.topN ?? 5);
  const temp = 10;
  const exps = top.map((s) => Math.exp(s.raw * temp));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return top.map((s, i) => ({ letter: s.letter, prob: exps[i] / sum, raw: s.raw }));
}

// Synchronous wrapper: if no CNN model present, falls back to centroid-only
// combination (i.e., equivalent to predictByCentroid). If a model is present,
// this returns an empty array immediately; callers should prefer the async API
// where possible. For existing call sites that expect sync, we do a best-effort
// fallback so UI remains responsive without a model.
export function predictByHybrid(
  vec: Float32Array,
  db: Prototypes,
  opts: { augment?: boolean; topN?: number; expectedLetter?: LetterGlyph } = {},
): Ranked[] {
  // Always return centroid + prior scores synchronously. If a model is present,
  // callers can use predictByHybridAsync for CNN+KNN fusion.
  const centroids = computeCentroids(db, opts.augment ?? false);
  const calibCounts: Record<LetterGlyph, number> = {} as any;
  for (const L of LETTERS) calibCounts[L] = (db[L] || []).length;
  const beta = opts.expectedLetter ? 0.15 : 0;
  const scored: { letter: LetterGlyph; raw: number }[] = [];
  for (const [letter, c] of Object.entries(centroids) as [LetterGlyph, Float32Array][]) {
    const a = alphaFor(calibCounts[letter] || 0);
    const prior = opts.expectedLetter && letter === opts.expectedLetter ? beta : 0;
    scored.push({ letter, raw: a * dot(vec, c) + prior });
  }
  scored.sort((a, b) => b.raw - a.raw);
  const top = scored.slice(0, opts.topN ?? 5);
  const temp = 10;
  const exps = top.map((s) => Math.exp(s.raw * temp));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return top.map((s, i) => ({ letter: s.letter, prob: exps[i] / sum, raw: s.raw }));
}
