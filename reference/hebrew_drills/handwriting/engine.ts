// Handwriting engine: canvas preprocessing, prototype KNN, hybrid scoring hooks
// No browser globals exported here beyond typed helpers.

export const HEBREW_CLASSES = [
  'א','ב','ג','ד','ה','ו','ז','ח','ט','י',
  'ך','כ','ל','ם','מ','ן','נ','ס','ע','ף',
  'פ','ץ','צ','ק','ר','ש','ת'
];

export const MODEL_INPUT = 64;

export type ProtoMap = Record<string, Float32Array>; // letter -> unit-norm vector (64*64)

// Render a source canvas into a 64x64 white-background canvas with the drawing
// cropped to its ink bbox, padded, centered, and scaled. Returns null if empty.
function renderToModelCanvas(src: HTMLCanvasElement): HTMLCanvasElement | null {
  const W = src.width, H = src.height;
  const sctx = src.getContext('2d');
  if (!sctx) return null;
  const img = sctx.getImageData(0, 0, W, H);
  const data = img.data;
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const r = data[i], g = data[i+1], b = data[i+2];
      const gray = (r + g + b) / 3; // 0..255
      const ink = 255 - gray;
      if (ink > 10) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0 || maxY < 0) return null;

  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const pad = 0.15;
  const cx = Math.max(0, Math.floor(minX - bw * pad));
  const cy = Math.max(0, Math.floor(minY - bh * pad));
  const cw = Math.min(W - cx, Math.floor(bw * (1 + 2 * pad)));
  const ch = Math.min(H - cy, Math.floor(bh * (1 + 2 * pad)));
  const side = Math.max(cw, ch);

  const tmp = document.createElement('canvas');
  tmp.width = side; tmp.height = side;
  const tctx = tmp.getContext('2d')!;
  tctx.fillStyle = '#fff'; tctx.fillRect(0, 0, side, side);
  const dx = Math.floor((side - cw) / 2);
  const dy = Math.floor((side - ch) / 2);
  tctx.drawImage(src, cx, cy, cw, ch, dx, dy, cw, ch);

  const off = document.createElement('canvas');
  off.width = MODEL_INPUT; off.height = MODEL_INPUT;
  const offctx = off.getContext('2d')!;
  offctx.imageSmoothingEnabled = true;
  offctx.fillStyle = '#fff'; offctx.fillRect(0, 0, MODEL_INPUT, MODEL_INPUT);
  offctx.drawImage(tmp, 0, 0, MODEL_INPUT, MODEL_INPUT);
  return off;
}

// Unit-normed ink-intensity vector for prototype KNN.
export function preprocessCanvasToVector(src: HTMLCanvasElement): Float32Array {
  const off = renderToModelCanvas(src);
  if (!off) return new Float32Array(MODEL_INPUT * MODEL_INPUT);
  const ctx = off.getContext('2d')!;
  const img = ctx.getImageData(0, 0, MODEL_INPUT, MODEL_INPUT).data;
  const vec = new Float32Array(MODEL_INPUT * MODEL_INPUT);
  for (let i = 0; i < MODEL_INPUT * MODEL_INPUT; i++) {
    const r = img[i * 4], g = img[i * 4 + 1], b = img[i * 4 + 2];
    const gray = (r + g + b) / 3; // 0..255
    vec[i] = (255 - gray) / 255; // ink=high
  }
  let norm = 1e-6;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return vec;
}

// Return BOTH a CNN-ready input (64*64*3 white-background grayscale in [0,1])
// and a KNN-ready unit-normed ink vector. Both computed from the same cropped
// 64x64 render, so the prototype KNN and CNN see the same geometry.
export function preprocessCanvasForInference(src: HTMLCanvasElement): {
  cnnInput: Float32Array | null;
  knnVec: Float32Array;
} {
  const off = renderToModelCanvas(src);
  if (!off) {
    return { cnnInput: null, knnVec: new Float32Array(MODEL_INPUT * MODEL_INPUT) };
  }
  const ctx = off.getContext('2d')!;
  const img = ctx.getImageData(0, 0, MODEL_INPUT, MODEL_INPUT).data;
  const cnn = new Float32Array(MODEL_INPUT * MODEL_INPUT * 3);
  const knn = new Float32Array(MODEL_INPUT * MODEL_INPUT);
  for (let i = 0; i < MODEL_INPUT * MODEL_INPUT; i++) {
    const r = img[i * 4], g = img[i * 4 + 1], b = img[i * 4 + 2];
    const grayNorm = (r + g + b) / 3 / 255; // 0..1, white=1, ink=0
    cnn[i * 3] = grayNorm;
    cnn[i * 3 + 1] = grayNorm;
    cnn[i * 3 + 2] = grayNorm;
    knn[i] = 1 - grayNorm;
  }
  let norm = 1e-6;
  for (let i = 0; i < knn.length; i++) norm += knn[i] * knn[i];
  norm = Math.sqrt(norm);
  for (let i = 0; i < knn.length; i++) knn[i] /= norm;
  return { cnnInput: cnn, knnVec: knn };
}

export function cosine(a: Float32Array, b: Float32Array): number {
  const n = a.length;
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}

export function predictTopK(vec: Float32Array, protos: ProtoMap, k = 3) {
  const scores: { letter: string; score: number }[] = [];
  for (const letter of Object.keys(protos)) {
    const s = cosine(vec, protos[letter]);
    scores.push({ letter, score: s });
  }
  scores.sort((a,b) => b.score - a.score);
  const top = scores.slice(0, k);
  const temp = 10;
  const exps = top.map(s => Math.exp(s.score * temp));
  const sum = exps.reduce((a,b)=>a+b, 0) || 1;
  return top.map((s,i) => ({ letter: s.letter, prob: exps[i]/sum, raw: s.score }));
}

// Final-form helpers
const FINAL_MAP: Record<string, string> = { 'כ': 'ך', 'מ': 'ם', 'נ': 'ן', 'פ': 'ף', 'צ': 'ץ' };
const BASE_MAP: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
export function toFinalIfWordEnd(letter: string, isEnd: boolean): string {
  if (!isEnd) return letter in BASE_MAP ? BASE_MAP[letter] : letter; // normalize to base in mid-word
  const base = BASE_MAP[letter] ?? letter;
  return FINAL_MAP[base] ?? base;
}

export function toBase(letter: string): string {
  return BASE_MAP[letter] ?? letter;
}

export function lettersEquivalent(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return toBase(a) === toBase(b);
}
