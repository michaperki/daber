import type { Stroke } from '../recognizer/types';

// Minimal state helpers for a stack of completed strokes plus an optional
// in-progress stroke. Kept pure so DrawCanvas stays easy to reason about.

export function redrawAll(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  strokeWidth: number,
  strokes: Stroke[],
  current: Stroke,
) {
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = strokeWidth;
  for (const s of strokes) drawPath(ctx, s);
  drawPath(ctx, current);
  ctx.restore();
}

function drawPath(ctx: CanvasRenderingContext2D, path: Stroke) {
  if (!path || path.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
  ctx.stroke();
}
