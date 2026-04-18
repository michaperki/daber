import { useEffect } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import { selectedLessonId } from '../state/signals';
import { VocabTab } from './VocabTab';
import study from './study.module.css';

function useWakeLock() {
  useEffect(() => {
    if (!navigator.wakeLock) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    navigator.wakeLock.request('screen').then(
      (s) => {
        if (cancelled) { s.release(); return; }
        sentinel = s;
      },
      () => {},
    );
    return () => {
      cancelled = true;
      sentinel?.release();
    };
  }, []);
}

export function DrillScreen() {
  const { route } = useLocation();
  const { params } = useRoute();
  const lessonId = params.id ?? null;
  const backHref = lessonId ? `/journey/${lessonId}` : '/review';

  useEffect(() => {
    selectedLessonId.value = lessonId;
  }, [lessonId]);

  useWakeLock();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <button
          class={study.secondaryBtn}
          onClick={() => route(backHref)}
          aria-label="Exit drill"
        >
          Back
        </button>
      </div>
      <VocabTab lessonId={lessonId} />
    </div>
  );
}
