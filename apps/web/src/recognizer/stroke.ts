import type { LetterGlyph, Ranked, Stroke } from './types';
import { LETTERS } from './types';

export type StrokeDB = Record<LetterGlyph, Stroke[][]>;

// Normalize strokes to unit box and resample to N points across concatenated path.
export function resampleStroke(strokes: Stroke[], N = 96): Float32Array {
  const pts: { x: number; y: number; sid: number }[] = [];
  for (let sid = 0; sid < strokes.length; sid++) {
    const s = strokes[sid];
    for (let i = 0; i < s.length; i++) pts.push({ x: s[i]!.x, y: s[i]!.y, sid });
  }
  if (pts.length === 0) return new Float32Array(N * 2);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y; }
  const w = Math.max(1e-6, maxX - minX), h = Math.max(1e-6, maxY - minY);
  // Build concatenated polyline with segment separators by duplicating last point
  const poly: [number, number][] = [];
  let lastSid = pts[0]!.sid;
  for (const p of pts) {
    if (p.sid !== lastSid && poly.length > 0) {
      // separator: duplicate last point
      poly.push(poly[poly.length - 1]!);
    }
    poly.push([(p.x - minX) / Math.max(w, h), (p.y - minY) / Math.max(w, h)]);
    lastSid = p.sid;
  }
  // Arc-length resample
  const S = new Float32Array(poly.length);
  for (let i = 1; i < poly.length; i++) {
    const dx = poly[i]![0] - poly[i - 1]![0];
    const dy = poly[i]![1] - poly[i - 1]![1];
    S[i] = S[i - 1] + Math.hypot(dx, dy);
  }
  const total = S[S.length - 1] || 1;
  const out = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const t = (total * i) / (N - 1);
    // find segment
    let j = 1;
    while (j < S.length && S[j] < t) j++;
    const j0 = Math.max(0, j - 1);
    const j1 = Math.min(S.length - 1, j);
    const s0 = S[j0], s1 = S[j1];
    const u = s1 > s0 ? (t - s0) / (s1 - s0) : 0;
    const x = poly[j0]![0] + u * (poly[j1]![0] - poly[j0]![0]);
    const y = poly[j0]![1] + u * (poly[j1]![1] - poly[j0]![1]);
    out[i * 2 + 0] = x;
    out[i * 2 + 1] = y;
  }
  return out;
}

function l2(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return s;
}

export function predictByStroke(
  strokes: Stroke[],
  db: StrokeDB,
  opts: { topN?: number; N?: number; temperature?: number } = {},
): Ranked[] {
  const N = opts.N ?? 96;
  const temp = opts.temperature ?? 20; // scale distances → exp(-d*temp)
  const q = resampleStroke(strokes, N);
  const scores: { letter: LetterGlyph; score: number }[] = [];
  for (const L of LETTERS) {
    const arr = db[L] || [];
    if (!arr.length) continue;
    let accum = 0;
    const k = Math.min(5, arr.length);
    // Take up to k nearest
    const dists: number[] = [];
    for (let i = 0; i < arr.length; i++) {
      const f = resampleStroke(arr[i]!, N);
      dists.push(l2(q, f));
    }
    dists.sort((a, b) => a - b);
    for (let i = 0; i < k; i++) accum += Math.exp(-dists[i]! * temp);
    scores.push({ letter: L, score: accum / k });
  }
  scores.sort((a, b) => b.score - a.score);
  const sum = scores.reduce((s, r) => s + r.score, 0) || 1;
  const top = (opts.topN ?? 5);
  return scores.slice(0, top).map((r) => ({ letter: r.letter, raw: r.score, prob: r.score / sum }));
}

// Fuse existing hybrid rankings with stroke rankings. Adds a centered stroke
// score to the hybrid raw score and re-normalizes.
export function fuseHybridWithStroke(
  hybrid: { letter: LetterGlyph; raw: number }[],
  stroke: Ranked[],
  strokeDb: StrokeDB,
): Ranked[] {
  const UNIFORM_P = 1 / (hybrid.length || 27);
  // Reliability from stroke margin
  const strokeMargin = stroke.length >= 2 ? Math.max(0, stroke[0]!.prob - stroke[1]!.prob) : 0;
  // Scale by how much stroke data we have
  let total = 0;
  for (const k of Object.keys(strokeDb)) total += (strokeDb as any)[k]?.length || 0;
  const dataScale = Math.min(1, Math.sqrt(total / 100)); // saturate around 100 samples
  const gamma = 0.35 * strokeMargin * (0.3 + 0.7 * dataScale); // max ~0.35
  const strokeMap: Record<LetterGlyph, number> = {} as any;
  for (const r of stroke) strokeMap[r.letter] = r.prob;
  const fused = hybrid.map((h) => {
    const p = strokeMap[h.letter] ?? 0;
    const add = gamma * (p - UNIFORM_P);
    return { letter: h.letter, raw: h.raw + add } as Ranked;
  });
  fused.sort((a, b) => b.raw - a.raw);
  // Softmax for probs
  const temp = 10;
  const exps = fused.map((s) => Math.exp(s.raw * temp));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  for (let i = 0; i < fused.length; i++) (fused[i] as any).prob = exps[i] / sum;
  return fused.slice(0, 5);
}
