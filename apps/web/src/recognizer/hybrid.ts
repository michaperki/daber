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
    // Model output is already softmax — just normalize for FP safety
    let sum = 0;
    for (let i = 0; i < logits.length; i++) sum += logits[i];
    const probs = Array.from(logits, (v) => v / (sum || 1));
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

function getCnnProbsSync(vec64x64: Float32Array): Record<LetterGlyph, number> {
  try {
    const win: any = window as any;
    const tf = win.tf as any;
    const model = win.daberCnnModel as any;
    if (!tf || !model) return {} as Record<LetterGlyph, number>;
    const arr = new Float32Array(64 * 64);
    for (let i = 0; i < 64 * 64; i++) arr[i] = 1 - vec64x64[i];
    const t = tf.tensor4d(arr, [1, 64, 64, 1]);
    const out = model.predict(t);
    const logits = out.dataSync ? out.dataSync() as Float32Array : new Float32Array(0);
    t.dispose?.();
    out.dispose?.();
    if (!logits || logits.length === 0) return {} as Record<LetterGlyph, number>;
    // Model output is already softmax — just normalize for FP safety
    let sum = 0;
    for (let i = 0; i < logits.length; i++) sum += logits[i];
    const probs = Array.from(logits, (v: number) => v / (sum || 1));
    const outMap: Partial<Record<LetterGlyph, number>> = {};
    const labels = Array.isArray(win.daberCnnLabels) ? (win.daberCnnLabels as string[]) : null;
    if (labels && labels.length === probs.length) {
      for (let i = 0; i < probs.length; i++) {
        const lab = String(labels[i]);
        if ((LETTERS as string[]).includes(lab)) outMap[lab as LetterGlyph] = probs[i];
      }
    } else {
      for (let i = 0; i < LETTERS.length && i < probs.length; i++) outMap[LETTERS[i]] = probs[i];
    }
    return outMap as Record<LetterGlyph, number>;
  } catch {
    return {} as Record<LetterGlyph, number>;
  }
}

// Expose raw CNN probs for diagnostics (sync version).
export function getRawCnnProbs(vec64x64: Float32Array): { letter: LetterGlyph; prob: number }[] {
  const probs = getCnnProbsSync(vec64x64);
  const entries = LETTERS.map((L) => ({ letter: L, prob: probs[L] ?? 0 }));
  entries.sort((a, b) => b.prob - a.prob);
  return entries;
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
  // Synchronous fusion: use CNN probs if available, add centroid prototypes (weighted by alpha), and expected-letter prior.
  const centroids = computeCentroids(db, opts.augment ?? false);
  const calibCounts: Record<LetterGlyph, number> = {} as any;
  for (const L of LETTERS) calibCounts[L] = (db[L] || []).length;
  const beta = opts.expectedLetter ? 0.15 : 0;
  const cnnProbs = getCnnProbsSync(vec.subarray(0, 64 * 64));
  const scored: { letter: LetterGlyph; raw: number }[] = [];
  const letters = LETTERS as LetterGlyph[];
  for (const letter of letters) {
    const c = centroids[letter];
    const a = alphaFor(calibCounts[letter] || 0);
    const prior = opts.expectedLetter && letter === opts.expectedLetter ? beta : 0;
    const proto = c ? a * dot(vec, c) : 0;
    const logp = cnnProbs[letter] ? Math.log(Math.max(1e-8, cnnProbs[letter])) : 0;
    scored.push({ letter, raw: logp + proto + prior });
  }
  scored.sort((a, b) => b.raw - a.raw);
  const top = scored.slice(0, opts.topN ?? 5);
  const temp = 10;
  const exps = top.map((s) => Math.exp(s.raw * temp));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return top.map((s, i) => ({ letter: s.letter, prob: exps[i] / sum, raw: s.raw }));
}
