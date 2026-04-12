import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DrawCanvas, type DrawCanvasHandle } from '../canvas/DrawCanvas';
import { predictTop, topMargin } from '../recognizer';
import type { LetterGlyph } from '../recognizer/types';
import { baseToFinal, isFinalForm, toBaseForm } from '../recognizer/final-forms';
import { calibration, progress } from '../state/signals';
import { toPrototypes } from '../storage/calibration';
import {
  addCalibrationSample,
  bumpVocabLetter,
  bumpVocabWord,
  updatePrefs,
} from '../storage/mutations';
import { randomVocabEntry, vocab, type VocabEntry } from '../content';
import panels from './panels.module.css';

type VocabState = {
  current: VocabEntry | null;
  pos: number;
  output: string;
  revealed: boolean;
};

const EMPTY_STATE: VocabState = {
  current: null,
  pos: 0,
  output: '',
  revealed: false,
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
  const [state, setState] = useState<VocabState>(EMPTY_STATE);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'bad' | 'idle'; text: string }>({
    kind: 'idle',
    text: '',
  });
  const [lastReject, setLastReject] = useState<Float32Array | null>(null);
  const busyRef = useRef(false);

  const cal = calibration.value;
  const prefs = progress.value.prefs;
  const prototypes = useMemo(() => toPrototypes(cal), [cal]);

  function pickNext() {
    setFeedback({ kind: 'idle', text: '' });
    setLastReject(null);
    const entry = randomVocabEntry();
    setState({ current: entry, pos: 0, output: '', revealed: false });
    canvasRef.current?.clear();
  }

  // First-mount: pick a word.
  useEffect(() => {
    if (vocab.length > 0 && !state.current) pickNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onStroke(vec: Float32Array) {
    if (busyRef.current) return;
    const cur = state.current;
    if (!cur) return;
    const expected = cur.he[state.pos];
    if (!expected) return;

    let sum = 0;
    for (let i = 0; i < vec.length; i++) sum += vec[i];
    if (sum < 1e-3) return;

    const top = predictTop(vec, {
      mode: prefs.mode,
      k: prefs.k,
      augment: prefs.augment,
      prototypes,
      topN: 10,
    });
    if (!top.length) return;
    const top1 = top[0];
    const margin = topMargin(top);
    const threshold = prefs.practice_threshold;
    const atEnd = state.pos === cur.he.length - 1;
    const ok = lettersMatch(top1.letter, expected, atEnd) && margin >= threshold;

    bumpVocabLetter(ok);

    if (ok) {
      const display = normalizedExpected(expected, atEnd);
      // Auto-calibrate: store the sample under the canonical (drawn) glyph
      // so the model learns user-specific final-form variants.
      addCalibrationSample(top1.letter, vec);
      setLastReject(null);
      const nextPos = state.pos + 1;
      const newOutput = state.output + display;
      setState((s) => ({ ...s, pos: nextPos, output: newOutput }));
      navigator.vibrate?.(30);
      canvasRef.current?.flashAccept();
      canvasRef.current?.clear();
      if (nextPos >= cur.he.length) {
        setFeedback({ kind: 'ok', text: '✓ Correct' });
        bumpVocabWord(cur.he);
        busyRef.current = true;
        window.setTimeout(() => {
          busyRef.current = false;
          pickNext();
        }, 480);
      } else {
        setFeedback({ kind: 'idle', text: '' });
      }
    } else {
      setFeedback({
        kind: 'bad',
        text: `✗ expected ${expected}, got ${top1.letter} (${(top1.prob * 100).toFixed(0)}%)`,
      });
      setLastReject(vec);
      navigator.vibrate?.([50, 30, 50]);
      canvasRef.current?.shake();
    }
  }

  function onIdk() {
    if (!state.current) return;
    setState((s) => ({ ...s, revealed: true }));
  }
  function onBackspace() {
    if (!state.current || state.pos === 0) return;
    setState((s) => ({
      ...s,
      pos: s.pos - 1,
      output: s.output.slice(0, -1),
    }));
    setFeedback({ kind: 'idle', text: '' });
    setLastReject(null);
    canvasRef.current?.clear();
  }
  function onSkip() {
    pickNext();
  }

  function forceAccept() {
    if (!lastReject || !state.current) return;
    const cur = state.current;
    const expected = cur.he[state.pos];
    if (!expected) return;
    const atEnd = state.pos === cur.he.length - 1;
    const display = normalizedExpected(expected, atEnd);
    // Save the stroke under the expected letter to improve the model.
    addCalibrationSample(
      (atEnd ? display : toBaseForm(expected as LetterGlyph)) as LetterGlyph,
      lastReject,
    );
    bumpVocabLetter(true);
    setLastReject(null);
    const nextPos = state.pos + 1;
    const newOutput = state.output + display;
    setState((s) => ({ ...s, pos: nextPos, output: newOutput }));
    navigator.vibrate?.(30);
    canvasRef.current?.flashAccept();
    canvasRef.current?.clear();
    if (nextPos >= cur.he.length) {
      setFeedback({ kind: 'ok', text: '✓ Correct' });
      bumpVocabWord(cur.he);
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
      <DrawCanvas ref={canvasRef} onStrokeComplete={onStroke} />
      <div class={panels.row}>
        <button onClick={() => canvasRef.current?.clear()}>Clear</button>
        <button onClick={() => canvasRef.current?.undo()}>Undo</button>
      </div>

      <div class={panels.panel}>
        <div class={panels.prompt}>
          <span class={panels.promptLabel}>English:</span>
          <span class={panels.promptValueSmall}>{state.current?.en ?? '—'}</span>
        </div>
        <div class={panels.row}>
          <button onClick={onIdk} title="Reveal the Hebrew spelling">
            I don&rsquo;t know
          </button>
          <button onClick={onBackspace} title="Remove the last accepted letter">
            Backspace
          </button>
          <button onClick={onSkip} title="Skip to a new word">
            Skip
          </button>
          <label class="inline" title="Use CNN + KNN fusion if a model is available; otherwise falls back to Centroid">
            Hybrid
            <input
              type="checkbox"
              checked={prefs.mode === 'hybrid'}
              onChange={(e) => updatePrefs({ mode: (e.target as HTMLInputElement).checked ? 'hybrid' : 'knn' })}
            />
          </label>
        </div>
        <div class={panels.prompt}>
          <span class={panels.promptLabel}>Hebrew:</span>
          <span class={panels.hebrewOutput}>{state.output}</span>
        </div>
        <div class={feedbackClass}>{feedback.text}</div>
        {lastReject && (
          <div class={panels.row}>
            <button onClick={forceAccept} title="Save this drawing as a correct sample and advance">
              I drew it right
            </button>
          </div>
        )}
        {state.revealed && state.current && (
          <div class={panels.feedback}>Answer: {state.current.he}</div>
        )}
        <div class={panels.shortcuts}>
          Draw each letter; lift to submit. Space = clear · Enter = skip
        </div>
      </div>
    </>
  );
}
