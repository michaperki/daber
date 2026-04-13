import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DrawCanvas, type DrawCanvasHandle } from '../canvas/DrawCanvas';
// Stroke-only recognizer; margin gating removed.
import { predictByStroke } from '../recognizer/stroke';
import type { LetterGlyph } from '../recognizer/types';
import type { Stroke } from '../recognizer/types';
import { baseToFinal, isFinalForm, toBaseForm } from '../recognizer/final-forms';
import { strokeSamples } from '../state/strokes';
import {
  addCalibrationSample,
  bumpVocabLetter,
  bumpVocabWord,
  bumpCell,
} from '../storage/mutations';
import { randomVocabEntry, vocab, type VocabEntry } from '../content';
import { playCorrect, playWrong, playWordComplete, playReveal, playPerfect, primeAudio } from '../audio';
import { progress } from '../state/signals';
import panels from './panels.module.css';
import study from './study.module.css';
import { appendLocalSample } from '../storage/strokes_store';
import { strokeSamples } from '../state/strokes';

// Heuristic: consider the current position to be at the end of a word if the
// next character is missing or a separator (space/punctuation/maqaf).
function isEndOfWord(text: string, pos: number): boolean {
  const i = pos + 1;
  if (i >= text.length) return true;
  const next = text[i];
  if (!next) return true;
  return /[\s.,!?;:\-־]/.test(next);
}

type VocabState = {
  current: VocabEntry | null;
  pos: number;
  output: string;
  revealed: boolean;
  // Track wrong attempts per character index and per-tile hints
  wrongCounts: Record<number, number>;
  hints: Record<number, boolean>;
};

const EMPTY_STATE: VocabState = {
  current: null,
  pos: 0,
  output: '',
  revealed: false,
  wrongCounts: {},
  hints: {},
};

// Whether `drawn` (the recognizer's top-1 letter) is acceptable for the
// `expected` letter at position `pos` in the word. Final-form rules:
//   - At the last position of the word: accept either the base or the final.
//   - Mid-word: only the base form is accepted.
function lettersMatch(drawn: LetterGlyph, expected: string, atEnd: boolean): boolean {
  if (drawn === expected) return true;
  if (atEnd) {
    if (toBaseForm(drawn) === toBaseForm(expected as LetterGlyph)) return true;
  } else {
    if (isFinalForm(drawn)) return false;
  }
  return false;
}

function normalizedExpected(expected: string, atEnd: boolean): string {
  // When the YAML stores a base letter at the end of a word but the user
  // (correctly) draws the final form, store the final form in the output so
  // the displayed word reads naturally. Symmetric on the other side too.
  if (!atEnd) return toBaseForm(expected as LetterGlyph);
  // Force final form at end if a base form is given.
  if (isFinalForm(expected)) return expected;
  return baseToFinal(expected);
}

export function VocabTab() {
  const canvasRef = useRef<DrawCanvasHandle | null>(null);
  // Force-remount key for the canvas to guarantee a fresh drawing surface
  // after accepts/force-accepts (defensive against any lingering state).
  const [canvasKey, setCanvasKey] = useState(0);
  const [state, setState] = useState<VocabState>(EMPTY_STATE);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'bad' | 'idle'; text: string }>({
    kind: 'idle',
    text: '',
  });
  const [lastReject, setLastReject] = useState<Float32Array | null>(null);
  const busyRef = useRef(false);
  // Track whether the current word attempt had any mistakes, user reveal, or force-accepts
  const attemptRef = useRef<{ mistake: boolean; reveal: boolean; force: boolean }>({
    mistake: false,
    reveal: false,
    force: false,
  });

  // no prefs used here after simplification

  function pickNext() {
    setFeedback({ kind: 'idle', text: '' });
    setLastReject(null);
    const entry = randomVocabEntry();
    setState({ current: entry, pos: 0, output: '', revealed: false, wrongCounts: {}, hints: {} });
    canvasRef.current?.clear();
    attemptRef.current = { mistake: false, reveal: false, force: false };
  }

  // First-mount: pick a word.
  useEffect(() => {
    if (vocab.length > 0 && !state.current) pickNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Always auto-advance past spaces at the current position so the user never
  // needs to input a space. This runs on state changes too (e.g., reveal or
  // after accept) and is idempotent.
  useEffect(() => {
    const cur = state.current;
    if (!cur) return;
    const adv = advancePastSpaces(cur.he, state.pos, state.output);
    if (adv.pos !== state.pos || adv.out !== state.output) {
      setState((s) => ({ ...s, pos: adv.pos, output: adv.out }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.current, state.pos, state.output]);

  // Helper: skip over spaces in the Hebrew word and prefill them in the output
  function advancePastSpaces(he: string, from: number, currentOut: string): { pos: number; out: string } {
    let pos = from;
    let out = currentOut;
    while (pos < he.length && he[pos] === ' ') {
      out += ' ';
      pos++;
    }
    return { pos, out };
  }

  const wrongTimerRef = useRef<number | null>(null);

  function cancelWrongTimer() {
    if (wrongTimerRef.current) {
      window.clearTimeout(wrongTimerRef.current);
      wrongTimerRef.current = null;
    }
  }

  function onPenDown() {
    cancelWrongTimer();
    // Prime Web Audio on first user gesture to satisfy iOS Safari
    void primeAudio();
  }

  function onStroke(vec: Float32Array, strokes?: Stroke[]) {
    if (busyRef.current) return;
    const cur = state.current;
    if (!cur) return;
    // Skip spaces at current position
    const advanced = advancePastSpaces(cur.he, state.pos, state.output);
    if (advanced.pos !== state.pos || advanced.out !== state.output) {
      setState((s) => ({ ...s, pos: advanced.pos, output: advanced.out }));
    }
    const expected = cur.he[advanced.pos];
    if (!expected) return;

    let sum = 0;
    for (let i = 0; i < vec.length; i++) sum += vec[i];
    if (sum < 1e-3) return;

    if (!strokes || strokes.length === 0) return;
    const top = predictByStroke(strokes, strokeSamples.value as any, { topN: 10 });
    if (!top.length) return;
    const top1 = top[0];
    const atEnd = isEndOfWord(cur.he, advanced.pos);
    let ok = lettersMatch(top1.letter, expected, atEnd);

    // Forgiveness rule: י/ו/ן are visually similar; accept any within the set.
    if (!ok) {
      const F = new Set<LetterGlyph>(['י','ו','ן']);
      // Treat end-of-word base nun as final for forgiveness purposes
      const expectedForForgive = (atEnd ? (baseToFinal(expected) as LetterGlyph) : (expected as LetterGlyph));
      if (F.has(expectedForForgive) && F.has(top1.letter)) {
        ok = true;
      }
    }

    bumpVocabLetter(ok);

    if (ok) {
      const display = normalizedExpected(expected, atEnd);
      // Auto-calibrate: store the sample under the canonical (drawn) glyph
      // so the model learns user-specific final-form variants.
      addCalibrationSample(top1.letter, vec);
      // Also capture raw strokes to server for continued training (best-effort)
      if (strokes && strokes.length) {
        // Append to canonical stroke dataset immediately
        const updated = appendLocalSample(top1.letter, strokes);
        strokeSamples.value = updated.samples as any;
        import('../storage/strokes').then(m => m.captureStroke(top1.letter, strokes).catch(() => {}));
      }
      setLastReject(null);
      let nextPos = advanced.pos + 1;
      let newOutput = advanced.out + display;
      // Auto-fill any following spaces
      const skip = advancePastSpaces(cur.he, nextPos, newOutput);
      nextPos = skip.pos;
      newOutput = skip.out;
      // Sound: play special chime on perfect attempt, else normal chime
      if (nextPos >= cur.he.length) {
        const clean = !(attemptRef.current.mistake || attemptRef.current.reveal || attemptRef.current.force);
        if (clean) playPerfect(); else playWordComplete();
      } else {
        playCorrect();
      }
      // On position advance, reset wrong-attempt counts and any hints
      setState((s) => ({ ...s, pos: nextPos, output: newOutput, wrongCounts: {}, hints: {} }));
      if (progress.value.prefs?.haptics_enabled) navigator.vibrate?.(30);
      canvasRef.current?.flashAccept();
      canvasRef.current?.clear();
      setCanvasKey((k) => k + 1);
      if (nextPos >= cur.he.length) {
        setFeedback({ kind: 'ok', text: '✓ Correct' });
        const attemptClean = !(attemptRef.current.mistake || attemptRef.current.reveal || attemptRef.current.force);
        bumpVocabWord(cur.he, attemptClean);
        const token = cur.variant || (cur.pos === 'verb' ? 'lemma' : cur.pos === 'noun' ? 'sg' : 'm_sg');
        if (cur.lemma) bumpCell(cur.pos, cur.lemma, token, attemptClean);
        busyRef.current = true;
        window.setTimeout(() => {
          busyRef.current = false;
          pickNext();
        }, 1000);
      } else {
        setFeedback({ kind: 'idle', text: '' });
      }
    } else {
      // On wrong: brief red flash, schedule auto-clear after idle; cancel if a new stroke starts
      setFeedback({ kind: 'bad', text: '' });
      setLastReject(vec);
      if (progress.value.prefs?.haptics_enabled) navigator.vibrate?.([40]);
      canvasRef.current?.shake();
      playWrong();
      attemptRef.current.mistake = true;
      // Track wrong attempts for this character position. After 2 in a row, reveal this letter's tile.
      setState((s) => {
        const idx = advanced.pos;
        const count = (s.wrongCounts[idx] || 0) + 1;
        const nextCounts = { ...s.wrongCounts, [idx]: count };
        const nextHints = count >= 2 ? { ...s.hints, [idx]: true } : s.hints;
        return { ...s, wrongCounts: nextCounts, hints: nextHints };
      });
      cancelWrongTimer();
      wrongTimerRef.current = window.setTimeout(() => {
        wrongTimerRef.current = null;
        // Clear only if no new stroke has begun in the meantime
        canvasRef.current?.clear();
      }, 400);
    }
  }

  function onIdk() {
    if (!state.current) return;
    // Reveal the full word but stay on this item so the user can trace it.
    attemptRef.current.reveal = true;
    setState((s) => ({ ...s, revealed: true }));
    void primeAudio();
    playReveal();
  }
  function onSkip() {
    pickNext();
  }

  function forceAccept() {
    if (!lastReject || !state.current) return;
    const cur = state.current;
    const expected = cur.he[state.pos];
    if (!expected) return;
    const atEnd = isEndOfWord(cur.he, state.pos);
    const display = normalizedExpected(expected, atEnd);
    // Learn from force-accepted strokes so the model adapts to the user's intent.
    addCalibrationSample(
      (atEnd ? display : toBaseForm(expected as LetterGlyph)) as LetterGlyph,
      lastReject,
    );
    // Also capture last stroke if present
    const s = canvasRef.current?.getStrokes?.();
    if (s && s.length) {
      const letter = (atEnd ? display : toBaseForm(expected as LetterGlyph)) as LetterGlyph;
      import('../storage/strokes').then(m => m.captureStroke(letter, s).catch(() => {}));
    }
    bumpVocabLetter(true);
    setLastReject(null);
    attemptRef.current.force = true;
    const nextPos = state.pos + 1;
    const newOutput = state.output + display;
    // Sounds
    if (nextPos >= cur.he.length) {
      const clean = !(attemptRef.current.mistake || attemptRef.current.reveal || attemptRef.current.force);
      if (clean) playPerfect(); else playWordComplete();
    } else {
      playCorrect();
    }
    // On position advance via force-accept, also reset wrong-attempt counts and hints
    setState((s) => ({ ...s, pos: nextPos, output: newOutput, wrongCounts: {}, hints: {} }));
    if (progress.value.prefs?.haptics_enabled) navigator.vibrate?.(30);
    canvasRef.current?.flashAccept();
    canvasRef.current?.clear();
    setCanvasKey((k) => k + 1);
    if (nextPos >= cur.he.length) {
      setFeedback({ kind: 'ok', text: '✓ Correct' });
      const attemptClean = !(attemptRef.current.mistake || attemptRef.current.reveal || attemptRef.current.force);
      bumpVocabWord(cur.he, attemptClean);
      busyRef.current = true;
      window.setTimeout(() => {
        busyRef.current = false;
        pickNext();
      }, 480);
    } else {
      setFeedback({ kind: 'idle', text: '' });
    }
  }

  // Keyboard: Enter = skip, Space = clear.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = (e.target as HTMLElement | null)?.tagName;
      if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return;
      if (e.key === 'Enter') {
        e.preventDefault();
        onSkip();
      } else if (e.key === ' ') {
        e.preventDefault();
        canvasRef.current?.clear();
      } else if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        canvasRef.current?.undo();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const feedbackClass =
    feedback.kind === 'ok'
      ? `${panels.feedback} ${panels.feedbackOk}`
      : feedback.kind === 'bad'
        ? `${panels.feedback} ${panels.feedbackBad}`
        : panels.feedback;

  if (vocab.length === 0) {
    return (
      <>
        <DrawCanvas ref={canvasRef} />
        <div class={panels.panel}>
          <div class={panels.feedback}>
            No vocab loaded. Run <code>npm -w packages/content run build</code> to generate <code>packages/content/dist/vocab.json</code>, then restart Vite.
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div class={study.topWord}>
        {state.current ? <span>{state.current.en}</span> : '—'}
      </div>
      {/* Tiles grouped by word: preserve i and idx numbering across full phrase */}
      <div class={study.tilesRow + (feedback.kind === 'ok' && state.pos >= (state.current?.he.length || 0) ? ' ' + study.pulse : '')}>
        {(() => {
          const he = state.current?.he || '';
          const chars = he.split('');
          const accepted = state.output.replace(/\s/g, '').length;
          const revealAll = !!state.revealed;
          let idx = 0; // index over non-space letters across the full phrase

          // First pass: compute render info per character, preserving i and idx semantics
          type Info =
            | { kind: 'space'; i: number }
            | { kind: 'letter'; i: number; ch: string; filled: boolean; show: boolean };
          const info: Info[] = chars.map((ch, i) => {
            if (ch === ' ') return { kind: 'space', i } as const;
            const filled = accepted > idx;
            const show = revealAll || filled || !!state.hints[i];
            idx++;
            return { kind: 'letter', i, ch, filled, show } as const;
          });

          // Split into word groups on spaces
          const groups: Info[][] = [];
          let cur: Info[] = [];
          for (const item of info) {
            if (item.kind === 'space') {
              if (cur.length) groups.push(cur);
              cur = [];
            } else {
              cur.push(item);
            }
          }
          if (cur.length) groups.push(cur);

          // Render each word group as its own container, without spacers
          return groups.map((group, gi) => (
            <div key={`g-${gi}`} class={study.wordGroup}>
              {group.map((it) => (
                <div key={`t-${it.i}`} class={`${study.tile} ${it.filled ? study.tileOk : ''}`}>{it.show ? it.ch : ''}</div>
              ))}
            </div>
          ));
        })()}
      </div>
      <div class={study.canvasWrap}>
        <DrawCanvas key={canvasKey} ref={canvasRef} onStrokeComplete={onStroke} onPenDown={onPenDown} />
      </div>
      <div class={study.controlsRow}>
        <button class={study.secondaryBtn} onClick={onIdk} title="Reveal the word and advance">I don’t know</button>
        <button class={study.secondaryBtn} onClick={onSkip} title="Skip to a new word">Skip</button>
      </div>

      <div class={feedbackClass}>{feedback.text}</div>
    </>
  );
}
