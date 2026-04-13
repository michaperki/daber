import { useMemo } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import { lessons, type LessonJSON } from '../content';
import panels from './panels.module.css';
import study from './study.module.css';

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
        <div style={{ marginLeft: 'auto' }}>
          <button class={study.secondaryBtn} onClick={() => route(`/lesson/${lesson.id}/drill`)}>
            Start
          </button>
        </div>
      </div>
    </div>
  );
}
