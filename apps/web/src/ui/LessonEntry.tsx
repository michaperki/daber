import { useMemo } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import { lessons, type LessonJSON } from '../content';
import { progress } from '../state/signals';
import { lessonProgressFor, type LessonProgress } from '../storage/progress';
import panels from './panels.module.css';
import study from './study.module.css';

function statusLabel(status: LessonProgress['status']) {
  if (status === 'completed') return 'Completed';
  if (status === 'in_progress') return 'In progress';
  return 'Not started';
}

function actionLabel(status: LessonProgress['status']) {
  if (status === 'completed') return 'Practice again';
  if (status === 'in_progress') return 'Continue';
  return 'Start';
}

function statusDetail(p: LessonProgress) {
  if (p.status === 'completed' && p.last_completed_at) {
    return `Completed ${new Date(p.last_completed_at).toLocaleDateString()}`;
  }
  if (p.last_practiced_at) {
    return `Last practiced ${new Date(p.last_practiced_at).toLocaleDateString()}`;
  }
  return 'No attempts yet';
}

export function LessonEntry() {
  const { route } = useLocation();
  const { params } = useRoute();
  const lesson = lessons.find((l) => l.id === params.id);

  if (!lesson) {
    return (
      <div class={panels.panel}>
        <div>Lesson not found.</div>
        <button class={study.secondaryBtn} onClick={() => route('/')}>Back</button>
      </div>
      );
  }

  const lessonProgress = lessonProgressFor(progress.value, lesson.id);

  const coreCount = useMemo(() => {
    const v = Object.keys(lesson.core?.verbs || {}).length;
    const a = Object.keys(lesson.core?.adjectives || {}).length;
    const n = Object.keys(lesson.core?.nouns || {}).length;
    return v + a + n;
  }, [lesson]);

  const supCount = useMemo(() => {
    const v = Object.keys(lesson.supporting?.verbs || {}).length;
    const a = Object.keys(lesson.supporting?.adjectives || {}).length;
    const n = Object.keys(lesson.supporting?.nouns || {}).length;
    return v + a + n;
  }, [lesson]);

  return (
    <div class={panels.panel}>
      <div class={panels.row}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{lesson.title}</div>
          {lesson.tagline && <div class={panels.muted}>{lesson.tagline}</div>}
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button class={study.secondaryBtn} onClick={() => route('/')}>Back</button>
        </div>
      </div>
      {lesson.endpoint?.description && (
        <div>
          <div class={panels.muted}>Payoff</div>
          <div>{lesson.endpoint.description}</div>
        </div>
      )}
      <div class={panels.row}>
        <div>
          <div class={panels.muted}>Vocab scope</div>
          <div>{coreCount} core, {supCount} supporting</div>
        </div>
        <div>
          <div class={panels.muted}>Lesson status</div>
          <div>{statusLabel(lessonProgress.status)}</div>
          <div class={panels.progress}>
            {statusDetail(lessonProgress)}
            {lessonProgress.target_count > 0 ? ` · ${Math.min(lessonProgress.items_completed, lessonProgress.target_count)}/${lessonProgress.target_count} items` : ''}
          </div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button class={study.secondaryBtn} onClick={() => route(`/lesson/${lesson.id}/drill`)}>
            {actionLabel(lessonProgress.status)}
          </button>
        </div>
      </div>
    </div>
  );
}
