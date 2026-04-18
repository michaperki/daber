import { useEffect } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import { selectedLessonId } from '../state/signals';
import { VocabTab } from './VocabTab';

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

  return <VocabTab lessonId={lessonId} onExit={() => route(backHref)} />;
}
