import { useLocation, useRoute } from 'preact-iso';
import { lessons } from '../content';
import { lastSessionSummary } from '../state/session';
import panels from './panels.module.css';
import study from './study.module.css';

export function LessonComplete() {
  const { route } = useLocation();
  const { params } = useRoute();
  const lesson = lessons.find((l) => l.id === params.id);
  const summary = lastSessionSummary.value;
  const title = summary?.lessonTitle || lesson?.title;

  return (
    <div class={panels.panel} style={{ textAlign: 'center' }}>
      <div style={{ fontWeight: 600, fontSize: 20, marginBottom: 8 }}>
        {title ? `${title} — Complete` : 'Session Complete'}
      </div>
      {summary ? (
        <>
          <div class={panels.stats}>Items completed: {summary.itemsCompleted}/{summary.targetCount}</div>
          <div class={panels.stats}>Clean: {summary.clean} · Unclean: {summary.unclean}</div>
          <div class={panels.stats}>New items seen: {summary.newItemsSeen}</div>
          {summary.mode === 'lesson' && (
            <div class={panels.stats}>Lesson finished: {summary.lessonFinished ? 'yes' : 'no'}</div>
          )}
        </>
      ) : (
        <div class={panels.muted} style={{ marginBottom: 16 }}>No session summary is available.</div>
      )}
      <button class={study.secondaryBtn} onClick={() => route('/')}>Done</button>
    </div>
  );
}
