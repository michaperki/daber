import type { LetterGlyph, Ranked } from './types';
import { LETTERS } from './types';
import { dotPixels } from './distance';
import { computeCentroids, type Prototypes } from './centroid';
import { normalizeUnit } from './features';

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
function softmax(arr: Float32Array): Float32Array {
  if (!arr || arr.length === 0) return new Float32Array(0);
  // numerical stability
  let maxv = -Infinity;
  for (let i = 0; i < arr.length; i++) if (arr[i] > maxv) maxv = arr[i];
  const exps = new Float32Array(arr.length);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    const e = Math.exp(arr[i] - maxv);
    exps[i] = e;
    sum += e;
  }
  if (!isFinite(sum) || sum <= 0) return new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) exps[i] /= sum;
  return exps;
}

function looksLikeProbabilities(arr: Float32Array): boolean {
  if (arr.length === 0) return false;
  let sum = 0;
  let allPositive = true;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] < -1e-6) { allPositive = false; break; }
    sum += arr[i];
  }
  return allPositive && Math.abs(sum - 1) < 0.01;
}

function mapModelOutputToLetters(raw: Float32Array, labels?: string[] | null): Record<LetterGlyph, number> {
  // Prefer explicit labels if provided. If the first label looks like a stop token,
  // skip it; otherwise assume labels match LETTERS order.
  // Skip softmax if the model already outputs probabilities (e.g. Keras softmax activation).
  const probs = looksLikeProbabilities(raw) ? raw : softmax(raw);
  const outMap: Partial<Record<LetterGlyph, number>> = {};
  if (labels && labels.length === probs.length) {
    const first = String(labels[0] || '').toLowerCase();
    const skipFirst = first === 'stop' || first === '<stop>' || first === 'pad' || first === '<pad>';
    for (let i = 0; i < probs.length; i++) {
      if (skipFirst && i === 0) continue;
      const lab = String(labels[i]);
      if ((LETTERS as string[]).includes(lab)) outMap[lab as LetterGlyph] = probs[i];
    }
  } else {
    // No labels: infer mapping by output dimension.
    const m = probs.length;
    if (m === LETTERS.length + 1) {
      // likely includes stop at index 0
      for (let i = 1; i < m && (i - 1) < LETTERS.length; i++) outMap[LETTERS[i - 1]] = probs[i];
    } else {
      const n = Math.min(LETTERS.length, m);
      for (let i = 0; i < n; i++) outMap[LETTERS[i]] = probs[i];
    }
  }
  return outMap as Record<LetterGlyph, number>;
}

function inputChannels(model: any): number {
  try {
    const s = model?.inputs?.[0]?.shape;
    const c = Array.isArray(s) ? s[s.length - 1] : null;
    if (c === 1 || c === 3) return c;
  } catch {}
  return 1;
}

// Thicken 1px canvas strokes to ~3px so they match HHD training images.
// Operates on the raw raster (ink=1, bg=0) BEFORE inversion.
// Two rounds of 3×3 max-filter dilation.
function dilateForCnn(src: Float32Array): Float32Array {
  const W = 64;
  let cur = src;
  for (let pass = 0; pass < 2; pass++) {
    const dst = new Float32Array(W * W);
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        let mx = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy, nx = x + dx;
            if (ny >= 0 && ny < W && nx >= 0 && nx < W) {
              const v = cur[ny * W + nx];
              if (v > mx) mx = v;
            }
          }
        }
        dst[y * W + x] = mx;
      }
    }
    cur = dst;
  }
  return cur;
}

// Prepare the 64×64 raw raster for CNN input: dilate then invert.
function prepareCnnInput(vec64x64: Float32Array): Float32Array {
  const dilated = dilateForCnn(vec64x64);
  const arr = new Float32Array(64 * 64);
  for (let i = 0; i < 64 * 64; i++) arr[i] = 1 - dilated[i];
  return arr;
}

async function getCnnProbs(vec64x64: Float32Array): Promise<Record<LetterGlyph, number>> {
  try {
    const win: any = window as any;
    const tf = win.tf as any;
    const model = win.daberCnnModel as any;
    if (!tf || !model) return {} as Record<LetterGlyph, number>;
    // Dilate thin canvas strokes then invert to white=1, ink=0
    const arr = prepareCnnInput(vec64x64);
    const channels = inputChannels(model);
    let t;
    if (channels === 3) {
      const rgb = new Float32Array(64 * 64 * 3);
      for (let i = 0; i < 64 * 64; i++) {
        const v = arr[i];
        rgb[i * 3 + 0] = v;
        rgb[i * 3 + 1] = v;
        rgb[i * 3 + 2] = v;
      }
      t = tf.tensor4d(rgb, [1, 64, 64, 3]);
    } else {
      t = tf.tensor4d(arr, [1, 64, 64, 1]);
    }
    const out = model.predict(t);
    const logits = (await out.data()) as Float32Array;
    t.dispose?.();
    out.dispose?.();
    const labels = Array.isArray(win.daberCnnLabels) ? (win.daberCnnLabels as string[]) : null;
    return mapModelOutputToLetters(logits, labels);
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
    // Dilate thin canvas strokes then invert to white=1, ink=0
    const arr = prepareCnnInput(vec64x64);
    const channels = inputChannels(model);
    let t;
    if (channels === 3) {
      const rgb = new Float32Array(64 * 64 * 3);
      for (let i = 0; i < 64 * 64; i++) {
        const v = arr[i];
        rgb[i * 3 + 0] = v;
        rgb[i * 3 + 1] = v;
        rgb[i * 3 + 2] = v;
      }
      t = tf.tensor4d(rgb, [1, 64, 64, 3]);
    } else {
      t = tf.tensor4d(arr, [1, 64, 64, 1]);
    }
    const out = model.predict(t);
    const logits = out.dataSync ? out.dataSync() as Float32Array : new Float32Array(0);
    t.dispose?.();
    out.dispose?.();
    if (!logits || logits.length === 0) return {} as Record<LetterGlyph, number>;
    const labels = Array.isArray(win.daberCnnLabels) ? (win.daberCnnLabels as string[]) : null;
    return mapModelOutputToLetters(logits, labels);
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

// CNN-only predictor: rank letters by the TFJS model probabilities.
export function predictByCnn(
  vec: Float32Array,
  opts: { topN?: number } = {},
): { letter: LetterGlyph; prob: number; raw: number }[] {
  const probs = getCnnProbsSync(vec.subarray(0, 64 * 64));
  const out = LETTERS.map((L) => {
    const p = probs[L] ?? 0;
    const safe = Math.max(1e-8, p);
    return { letter: L, prob: p, raw: Math.log(safe) };
  });
  out.sort((a, b) => b.prob - a.prob);
  return out.slice(0, opts.topN ?? 5);
}

export type HybridContrib = {
  letter: LetterGlyph;
  cnnProb: number;
  logp: number;
  proto: number; // a * (q·centroid)
  alpha: number;
  prior: number;
  raw: number; // logp + proto + prior
};

export function debugHybridContribs(
  vec: Float32Array,
  db: Prototypes,
  opts: { augment?: boolean; expectedLetter?: LetterGlyph } = {},
): HybridContrib[] {
  const centroids = computeCentroids(db, opts.augment ?? false);
  const q = normalizeUnit(vec);
  const calibCounts: Record<LetterGlyph, number> = {} as any;
  for (const L of LETTERS) calibCounts[L] = (db[L] || []).length;
  const beta = opts.expectedLetter ? 0.15 : 0;
  const cnnProbs = getCnnProbsSync(vec.subarray(0, 64 * 64));
  const contribs: HybridContrib[] = [];
  for (const L of LETTERS) {
    const a = alphaFor(calibCounts[L] || 0);
    const c = centroids[L];
    const protoDot = c ? dotPixels(q, c) : 0;
    const proto = a * protoDot;
    const p = Math.max(1e-8, cnnProbs[L] ?? 1e-8);
    const logp = Math.log(p);
    const prior = opts.expectedLetter && L === opts.expectedLetter ? beta : 0;
    const raw = logp + proto + prior;
    contribs.push({ letter: L, cnnProb: p, logp, proto, alpha: a, prior, raw });
  }
  contribs.sort((a, b) => b.raw - a.raw);
  return contribs;
}

export async function predictByHybridAsync(
  vec: Float32Array,
  db: Prototypes,
  opts: { augment?: boolean; topN?: number; expectedLetter?: LetterGlyph } = {},
): Promise<Ranked[]> {
  // 1) Prototype score from centroids
  const centroids = computeCentroids(db, opts.augment ?? false);
  const q = normalizeUnit(vec);
  const protoRaw: Record<LetterGlyph, number> = {} as any;
  const calibCounts: Record<LetterGlyph, number> = {} as any;
  for (const L of LETTERS) {
    const arr = db[L] || [];
    calibCounts[L] = arr.length;
    protoRaw[L] = centroids[L] ? dotPixels(q, centroids[L]!) : 0;
  }

  // 2) CNN probabilities (optional)
  // CNN path expects raw 64x64 pixel intensities (not unit-normalized)
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
  const q = normalizeUnit(vec);
  const calibCounts: Record<LetterGlyph, number> = {} as any;
  for (const L of LETTERS) calibCounts[L] = (db[L] || []).length;
  const beta = opts.expectedLetter ? 0.15 : 0;
  // CNN path expects raw 64x64 pixel intensities (not unit-normalized)
  const cnnProbs = getCnnProbsSync(vec.subarray(0, 64 * 64));
  const scored: { letter: LetterGlyph; raw: number }[] = [];
  const letters = LETTERS as LetterGlyph[];
  for (const letter of letters) {
    const c = centroids[letter];
    const a = alphaFor(calibCounts[letter] || 0);
    const prior = opts.expectedLetter && letter === opts.expectedLetter ? beta : 0;
    const proto = c ? a * dotPixels(q, c) : 0;
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
