import type { LetterGlyph, Ranked, Stroke } from './types';
import { LETTERS } from './types';
import { measureBounds } from './raster';

export type StrokeDB = Record<LetterGlyph, Stroke[][]>;

// Normalize strokes and resample to N points across concatenated path.
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
  const scale = Math.max(1e-6, w);
  for (const p of pts) {
    if (p.sid !== lastSid && poly.length > 0) {
      // separator: duplicate last point
      poly.push(poly[poly.length - 1]!);
    }
    // Normalize both axes by width to preserve h/w in the y-extent.
    poly.push([(p.x - minX) / scale, (p.y - minY) / scale]);
    lastSid = p.sid;
  }
  // Curvature-weighted resample: accumulate per-segment weighted length
  // weight_i = |seg_i| * (1 + beta * kappa_i), where kappa_i is the absolute
  // turn angle at the segment (normalized by PI).
  const beta = 0.5;
  const segLen = new Float32Array(Math.max(0, poly.length - 1));
  const segAng = new Float32Array(Math.max(0, poly.length - 1));
  for (let i = 1; i < poly.length; i++) {
    const dx = poly[i]![0] - poly[i - 1]![0];
    const dy = poly[i]![1] - poly[i - 1]![1];
    segLen[i - 1] = Math.hypot(dx, dy);
    segAng[i - 1] = Math.atan2(dy, dx);
  }
  // Curvature proxy at segment i is the turn from previous segment to this one
  const kappa = new Float32Array(segLen.length);
  for (let i = 1; i < segLen.length; i++) {
    let d = segAng[i] - segAng[i - 1];
    // Wrap to [-PI, PI]
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    kappa[i] = Math.abs(d) / Math.PI; // [0,1]
  }
  const W = new Float32Array(poly.length);
  for (let i = 1; i < poly.length; i++) {
    const wseg = segLen[i - 1] * (1 + beta * kappa[i - 1]);
    W[i] = W[i - 1] + wseg;
  }
  const total = W[W.length - 1] || 1;
  const out = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const t = (total * i) / (N - 1);
    // find segment
    let j = 1;
    while (j < W.length && W[j] < t) j++;
    const j0 = Math.max(0, j - 1);
    const j1 = Math.min(W.length - 1, j);
    const s0 = W[j0], s1 = W[j1];
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
      const sample = arr[i]!;
      const f = resampleStroke(sample, N);
      const dShape = l2(q, f);
      dists.push(dShape);
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
// Hybrid fusion removed; stroke-only recognizer retained.
