import type { Stroke } from './types';

type Image = {
  w: number;
  h: number;
  data: Float32Array; // length = w*h, [0..1]
};

function createImage(w: number, h: number): Image {
  return { w, h, data: new Float32Array(w * h) };
}

// Draw a small circular brush (radius=1) to produce canvas-like stroke width
// instead of single-pixel thin lines. This stabilizes matching across small
// subpixel/aliasing differences and helps close confusions.
const BRUSH_RADIUS = 1;
function setPixel(img: Image, x: number, y: number, v = 1) {
  for (let dy = -BRUSH_RADIUS; dy <= BRUSH_RADIUS; dy++) {
    for (let dx = -BRUSH_RADIUS; dx <= BRUSH_RADIUS; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= img.w || ny >= img.h) continue;
      if (dx * dx + dy * dy > BRUSH_RADIUS * BRUSH_RADIUS) continue;
      const i = ny * img.w + nx;
      img.data[i] = Math.max(img.data[i], v);
    }
  }
}

function drawLine(img: Image, x0: number, y0: number, x1: number, y1: number) {
  // Simple Bresenham
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  // stroke thickness ~1px
  // eslint-disable-next-line no-constant-condition
  while (true) {
    setPixel(img, x, y, 1);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

export function measureBounds(strokes: Stroke[]): {
  minX: number; minY: number; maxX: number; maxY: number; width: number; height: number;
} | null {
  if (!strokes.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes) {
    for (const p of s) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return null;
  const width = maxX - minX;
  const height = maxY - minY;
  return { minX, minY, maxX, maxY, width, height };
}

export function rasterizeStrokesTo64(strokes: Stroke[], padding = 2): Float32Array {
  const b = measureBounds(strokes);
  if (!b) return new Float32Array(64 * 64);
  const { minX, minY, width, height } = b;
  const safeW = width || 1;
  const safeH = height || 1;
  const scale = (64 - padding * 2) / Math.max(safeW, safeH);

  const img = createImage(64, 64);
  for (const s of strokes) {
    if (s.length === 0) continue;
    let prev = s[0];
    for (let i = 1; i < s.length; i++) {
      const curr = s[i];
      const x0 = Math.round((prev.x - minX) * scale) + padding;
      const y0 = Math.round((prev.y - minY) * scale) + padding;
      const x1 = Math.round((curr.x - minX) * scale) + padding;
      const y1 = Math.round((curr.y - minY) * scale) + padding;
      drawLine(img, x0, y0, x1, y1);
      prev = curr;
    }
    // Dot for single-point strokes
    if (s.length === 1) {
      const x = Math.round((prev.x - minX) * scale) + padding;
      const y = Math.round((prev.y - minY) * scale) + padding;
      setPixel(img, x, y, 1);
    }
  }

  return img.data;
}
