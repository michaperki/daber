import { useEffect, useImperativeHandle, useRef } from 'preact/hooks';
import { forwardRef } from 'preact/compat';
import type { Stroke } from '../recognizer/types';
import type { LetterGlyph } from '../recognizer/types';
import { extractFeaturesFromStrokes } from '../recognizer';
import { redrawAll } from './strokes';
import styles from './DrawCanvas.module.css';

export type DrawCanvasHandle = {
  clear(): void;
  undo(): void;
  flashAccept(): void;
  shake(): void;
  extract(): Float32Array;
  hasInk(): boolean;
  getStrokes(): Stroke[];
};

export type DrawCanvasProps = {
  // Fired on pen-up whenever a stroke completes. The payload is the full
  // Float32Array feature vector extracted from the current canvas contents,
  // so callers don't need to re-run extraction.
  onStrokeComplete?: (vec: Float32Array, strokes: Stroke[]) => void;
  // Fired on pen-up even for empty strokes. Used by tabs to know when to
  // recheck things like live prediction.
  onPenUp?: () => void;
  // Optional debounced live vector updates while drawing
  onLiveVector?: (vec: Float32Array) => void;
  // Optional letter glyph to show as a faint watermark reference
  watermarkLetter?: LetterGlyph;
};

// Square drawing surface that mirrors the reference HebrewHandwritingWeb
// canvas: pointer events unified across mouse / touch / pen, `touch-action:
// none` to prevent page scroll, DPR-aware buffer sizing, stroke width
// proportional to CSS width. See reference/hebrewhandwritingweb/app.js ~97.
// Simple cache for watermark images so we don't re-fetch on every render.
const _wmCache = new Map<string, HTMLImageElement>();
function getWatermarkImage(glyph: string, onLoad: () => void): HTMLImageElement | null {
  const cached = _wmCache.get(glyph);
  if (cached) return cached;
  const img = new Image();
  img.src = `/letters/${encodeURIComponent(glyph)}.png`;
  img.onload = () => {
    _wmCache.set(glyph, img);
    onLoad();
  };
  return null;
}

export const DrawCanvas = forwardRef<DrawCanvasHandle, DrawCanvasProps>(
  function DrawCanvas({ onStrokeComplete, onPenUp, onLiveVector, watermarkLetter }, ref) {
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const strokesRef = useRef<Stroke[]>([]);
    const currentRef = useRef<Stroke>([]);
    const drawingRef = useRef(false);
    const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
    // Keep the most recent callback refs so handlers bound in mount-only
    // useEffect always call the latest versions.
    const onStrokeCompleteRef = useRef(onStrokeComplete);
    const onPenUpRef = useRef(onPenUp);
    const onLiveVectorRef = useRef(onLiveVector);
    const watermarkRef = useRef<HTMLImageElement | null>(null);
    onStrokeCompleteRef.current = onStrokeComplete;
    onPenUpRef.current = onPenUp;
    onLiveVectorRef.current = onLiveVector;

    function ctx2d() {
      const c = canvasRef.current!;
      return c.getContext('2d')!;
    }
    function strokeWidth() {
      return Math.max(6, Math.round(sizeRef.current.w / 28));
    }

    function resize() {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = wrap.getBoundingClientRect();
      const side = Math.max(200, Math.round(rect.width || 280));
      canvas.width = Math.round(side * dpr);
      canvas.height = Math.round(side * dpr);
      canvas.style.width = side + 'px';
      canvas.style.height = side + 'px';
      const ctx = ctx2d();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w: side, h: side, dpr };
      fullRedraw();
    }

    function fullRedraw() {
      const { w, h } = sizeRef.current;
      redrawAll(ctx2d(), w, h, strokeWidth(), strokesRef.current, currentRef.current, watermarkRef.current);
    }

    function clear() {
      strokesRef.current = [];
      currentRef.current = [];
      fullRedraw();
    }

    function undo() {
      strokesRef.current.pop();
      fullRedraw();
    }

    function getPos(e: PointerEvent): { x: number; y: number } {
      const rect = canvasRef.current!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function onDown(e: PointerEvent) {
      const c = canvasRef.current!;
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* some browsers throw — ignore */
      }
      drawingRef.current = true;
      currentRef.current = [getPos(e)];
      fullRedraw();
    }
    function onMove(e: PointerEvent) {
      if (!drawingRef.current) return;
      currentRef.current.push(getPos(e));
      fullRedraw();
      // Debounced live vector update including the in-progress stroke
      if (onLiveVectorRef.current) {
        // store timer on function to avoid extra refs
        const anyMove = onMove as any;
        if (anyMove._liveTimer) window.clearTimeout(anyMove._liveTimer);
        anyMove._liveTimer = window.setTimeout(() => {
          const strokesAll = currentRef.current.length
            ? [...strokesRef.current, currentRef.current]
            : strokesRef.current;
          const vec = extractFeaturesFromStrokes(strokesAll);
          onLiveVectorRef.current?.(vec);
        }, 120);
      }
    }
    function onUp() {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      if (currentRef.current.length > 1) {
        strokesRef.current.push(currentRef.current);
      }
      currentRef.current = [];
      fullRedraw();
      onPenUpRef.current?.();
      const cb = onStrokeCompleteRef.current;
      if (cb) {
        const vec = extractFeaturesFromStrokes(strokesRef.current);
        cb(vec, strokesRef.current);
      }
    }

    function hasInk(): boolean {
      return strokesRef.current.length > 0 || currentRef.current.length > 1;
    }

    function extract(): Float32Array {
      return extractFeaturesFromStrokes(strokesRef.current);
    }

    function flashAccept() {
      const w = wrapRef.current;
      if (!w) return;
      w.classList.remove(styles.accept);
      // Force reflow so the keyframe restarts.
      void w.offsetWidth;
      w.classList.add(styles.accept);
    }
    function shake() {
      const w = wrapRef.current;
      if (!w) return;
      w.classList.remove(styles.shake);
      void w.offsetWidth;
      w.classList.add(styles.shake);
    }

    useImperativeHandle(
      ref,
      () => ({
        clear,
        undo,
        flashAccept,
        shake,
        extract,
        hasInk,
        getStrokes: () => strokesRef.current,
      }),
      [],
    );

    useEffect(() => {
      resize();
      const onResize = () => resize();
      window.addEventListener('resize', onResize);
      const canvas = canvasRef.current!;
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);
      return () => {
        window.removeEventListener('resize', onResize);
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onUp);
      };
      // Mount-only; callbacks are captured via refs inside handlers. Deps
      // intentionally empty to keep the canvas stable across re-renders.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Load/update watermark image when watermarkLetter changes
    useEffect(() => {
      if (!watermarkLetter) {
        watermarkRef.current = null;
        fullRedraw();
        return;
      }
      const cached = getWatermarkImage(watermarkLetter, () => {
        watermarkRef.current = _wmCache.get(watermarkLetter) ?? null;
        fullRedraw();
      });
      watermarkRef.current = cached;
      fullRedraw();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [watermarkLetter]);

    return (
      <div class={styles.wrap} ref={wrapRef}>
        <canvas class={styles.canvas} ref={canvasRef} />
      </div>
    );
  },
);
