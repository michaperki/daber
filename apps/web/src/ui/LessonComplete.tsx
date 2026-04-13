import { useLocation, useRoute } from 'preact-iso';
import { lessons } from '../content';
import panels from './panels.module.css';
import study from './study.module.css';

export function LessonComplete() {
  const { route } = useLocation();
  const { params } = useRoute();
  const lesson = lessons.find((l) => l.id === params.id);

  return (
    <div class={panels.panel} style={{ textAlign: 'center' }}>
      <div style={{ fontWeight: 600, fontSize: 20, marginBottom: 8 }}>
        {lesson ? `${lesson.title} — Complete` : 'Lesson Complete'}
      </div>
      <div class={panels.muted} style={{ marginBottom: 16 }}>Nice work!</div>
      <button class={study.secondaryBtn} onClick={() => route('/')}>Done</button>
    </div>
  );
}
