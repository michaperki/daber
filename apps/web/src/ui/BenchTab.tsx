import { useMemo, useState } from 'preact/hooks';
import { calibration, progress } from '../state/signals';
import { toPrototypes, toRawVectors } from '../storage/calibration';
import { LETTERS, type LetterGlyph, type Ranked } from '../recognizer/types';
import { predictTop } from '../recognizer';
import panels from './panels.module.css';

type ModeKey = 'knn' | 'centroid' | 'hybrid' | 'cnn';

type BenchResult = {
  total: number;
  perMode: Record<ModeKey, { correct: number; total: number }>;
  perLetter: Record<LetterGlyph, Record<ModeKey, { correct: number; total: number }>>;
  confusions: Record<ModeKey, Record<string, number>>; // key: `${gt}->${pred}`
  examples?: { gt: LetterGlyph; pred: Record<ModeKey, Ranked[]> }[];
};

export function BenchTab() {
  const cal = calibration.value;
  const prefs = progress.value.prefs;
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BenchResult | null>(null);
  const [useAugment, setUseAugment] = useState<boolean>(prefs.augment);
  const [kVal, setKVal] = useState<number>(prefs.k);
  const [includeCnn, setIncludeCnn] = useState<boolean>(true);
  const [saveExamples, setSaveExamples] = useState<boolean>(false);

  const db = useMemo(() => toPrototypes(cal), [cal]);
  const rawDb = useMemo(() => toRawVectors(cal), [cal]);
  const counts = useMemo(() => {
    const out: Record<LetterGlyph, number> = {} as any;
    for (const L of LETTERS) out[L] = rawDb[L]?.length || 0;
    return out;
  }, [rawDb]);

  async function runBench() {
    setRunning(true);
    try {
      const modes: ModeKey[] = ['knn', 'centroid'];
      const hasCnn = typeof window !== 'undefined' && !!(window as any).daberCnnModel;
      if (includeCnn && hasCnn) modes.push('cnn', 'hybrid');

      const perMode: BenchResult['perMode'] = {
        knn: { correct: 0, total: 0 },
        centroid: { correct: 0, total: 0 },
        hybrid: { correct: 0, total: 0 },
        cnn: { correct: 0, total: 0 },
      };
      const perLetter: BenchResult['perLetter'] = {} as any;
      for (const L of LETTERS) {
        perLetter[L] = {
          knn: { correct: 0, total: 0 },
          centroid: { correct: 0, total: 0 },
          hybrid: { correct: 0, total: 0 },
          cnn: { correct: 0, total: 0 },
        };
      }
      const confusions: BenchResult['confusions'] = {
        knn: {}, centroid: {}, hybrid: {}, cnn: {},
      };
      const examples: BenchResult['examples'] = saveExamples ? [] : undefined;

      // Leave-one-out per letter; skip letters with <2 samples.
      let total = 0;
      for (const L of LETTERS) {
        const arr = rawDb[L] || [];
        if (!arr || arr.length < 2) continue;
        for (let i = 0; i < arr.length; i++) {
          const heldRaw = arr[i];
          // Build holdout DB (normalized prototypes): copy arrays but omit current sample for its letter
          const hold: typeof db = {} as any;
          for (const LL of LETTERS) {
              if (!db[LL] || db[LL]!.length === 0) continue;
            if (LL === L) {
              const tmp = db[LL]!.slice();
              tmp.splice(i, 1);
              hold[LL] = tmp;
            } else {
              hold[LL] = db[LL]!.slice();
            }
          }

          const modePreds: Record<ModeKey, Ranked[]> = {} as any;
          for (const m of modes) {
            const preds = predictTop(heldRaw, {
              mode: m,
              k: kVal,
              augment: useAugment,
              prototypes: hold,
              topN: 5,
            });
            modePreds[m] = preds;
            const top = preds[0]?.letter as LetterGlyph | undefined;
            perMode[m].total++;
            perLetter[L][m].total++;
            total++;
            if (top === L) {
              perMode[m].correct++;
              perLetter[L][m].correct++;
            } else if (top) {
              const key = `${L}->${top}`;
              confusions[m][key] = (confusions[m][key] || 0) + 1;
            }
          }
          if (examples) examples.push({ gt: L, pred: modePreds });
        }
      }

      setResult({ total, perMode, perLetter, confusions, examples });
    } finally {
      setRunning(false);
    }
  }

  function exportJson() {
    if (!result) return;
    const blob = new Blob([JSON.stringify({ params: { augment: useAugment, k: kVal }, result }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bench_results.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  const eligible = LETTERS.filter((L) => (counts[L] || 0) >= 2);

  return (
    <>
      <div class={panels.panel}>
        <div class={panels.prompt}>
          <span class={panels.promptLabel}>Bench:</span>
          <span class={panels.promptValue}>Leave-one-out on my samples</span>
        </div>
        <div class={panels.row}>
          <label class="inline" title="K used for KNN mode during benchmark">
            k
            <input type="number" min={1} max={25} value={kVal} onChange={(e) => setKVal(Math.max(1, Math.min(25, Number((e.target as HTMLInputElement).value) || 5)))} />
          </label>
          <label class="inline" title="Shift-augment samples during scoring">
            Augment
            <input type="checkbox" checked={useAugment} onChange={(e) => setUseAugment((e.target as HTMLInputElement).checked)} />
          </label>
          <label class="inline" title="Include CNN/Hybrid if a TFJS model is loaded">
            Include CNN/Hybrid
            <input type="checkbox" checked={includeCnn} onChange={(e) => setIncludeCnn((e.target as HTMLInputElement).checked)} />
          </label>
          <label class="inline" title="Save per-sample predictions in the result JSON">
            Save examples
            <input type="checkbox" checked={saveExamples} onChange={(e) => setSaveExamples((e.target as HTMLInputElement).checked)} />
          </label>
          <button disabled={running || eligible.length === 0} onClick={runBench}>
            {running ? 'Running…' : `Run (${eligible.length} letters)`}
          </button>
          {result && (
            <button onClick={exportJson}>Export JSON</button>
          )}
        </div>

        <div class={panels.feedback}>
          {eligible.length === 0
            ? 'Collect at least 2 samples for any letter to run LOO.'
            : `Eligible letters: ${eligible.length} / ${LETTERS.length}`}
        </div>

        {result && (
          <div style={{ marginTop: '8px', fontSize: '14px' }}>
            <div>Tested samples: {result.total}</div>
            <div style={{ marginTop: '6px' }}>
              Overall accuracy:
              <ul style={{ marginTop: '4px' }}>
                <li>KNN: {result.perMode.knn.total ? Math.round((100 * result.perMode.knn.correct) / result.perMode.knn.total) : 0}%</li>
                <li>Centroid: {result.perMode.centroid.total ? Math.round((100 * result.perMode.centroid.correct) / result.perMode.centroid.total) : 0}%</li>
                <li>Hybrid: {result.perMode.hybrid.total ? Math.round((100 * result.perMode.hybrid.correct) / result.perMode.hybrid.total) : 0}%</li>
                <li>CNN: {result.perMode.cnn.total ? Math.round((100 * result.perMode.cnn.correct) / result.perMode.cnn.total) : 0}%</li>
              </ul>
            </div>
            <div style={{ marginTop: '6px' }}>
              Top confusions (KNN): {Object.entries(result.confusions.knn).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`${k}(${v})`).join('  ·  ') || '—'}
            </div>
            <div>
              Top confusions (CNN): {Object.entries(result.confusions.cnn).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`${k}(${v})`).join('  ·  ') || '—'}
            </div>
            <div>
              Top confusions (Hybrid): {Object.entries(result.confusions.hybrid).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`${k}(${v})`).join('  ·  ') || '—'}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
