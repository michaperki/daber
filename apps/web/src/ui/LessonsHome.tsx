import { useMemo, useState } from 'preact/hooks';
import { lessons } from '../content';
import panels from './panels.module.css';
import study from './study.module.css';
import { selectedLessonId } from '../state/signals';
import { VocabTab } from './VocabTab';

type Lesson = {
  id: string;
  title: string;
  tagline?: string;
  estimated_minutes?: number;
  endpoint?: { description?: string };
  core?: { verbs?: Record<string, string[]>; adjectives?: Record<string, string[]>; nouns?: Record<string, string[]> };
  supporting?: { verbs?: Record<string, string[]>; adjectives?: Record<string, string[]>; nouns?: Record<string, string[]> };
  phases?: { id: string; title?: string; goal?: string }[];
  wishlist?: string[];
};

function LessonCard({ lesson, onOpen }: { lesson: Lesson; onOpen: (l: Lesson) => void }) {
  return (
    <button class={panels.panel} onClick={() => onOpen(lesson)} style={{ textAlign: 'left' }}>
      <div class={panels.row}>
        <div style={{ fontWeight: 600 }}>{lesson.title}</div>
        <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--muted)' }}>
          {lesson.estimated_minutes ? `${lesson.estimated_minutes} min` : ''}
        </div>
      </div>
      {lesson.tagline && <div class={panels.muted}>{lesson.tagline}</div>}
    </button>
  );
}

function LessonEntry({ lesson, onStart, onClose }: { lesson: Lesson; onStart: (id: string) => void; onClose: () => void }) {
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
          <button class={study.secondaryBtn} onClick={onClose}>Back</button>
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
          <button class={study.secondaryBtn} onClick={() => onStart(lesson.id)}>Start</button>
        </div>
      </div>
    </div>
  );
}

export function LessonsHome() {
  const [open, setOpen] = useState<Lesson | null>(null);
  const [drilling, setDrilling] = useState(false);

  function onOpen(l: Lesson) {
    setOpen(l);
  }

  function onStart(id: string) {
    selectedLessonId.value = id;
    window.scrollTo(0, 0);
    setOpen(null);
    setDrilling(true);
  }

  return (
    <>
      {!open && (
        <>
          <div class={panels.panel}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Missions</div>
            <div class={panels.muted}>Short, curated lessons with a clear payoff.</div>
          </div>
          {lessons.length ? (
            lessons.map((l) => <LessonCard key={l.id} lesson={l} onOpen={onOpen} />)
          ) : (
            <div class={panels.panel}>No lessons found. Build content or add data under packages/content/data/v2/lessons.</div>
          )}
          <div class={panels.panel}>
            <div class={panels.row}>
              <div>
                <div style={{ fontWeight: 600 }}>Free practice</div>
                <div class={panels.muted}>Drill broadly from the lexicon.</div>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <button class={study.secondaryBtn} onClick={() => { selectedLessonId.value = null; setDrilling(true); }}>Start</button>
              </div>
            </div>
          </div>
        </>
      )}
      {open && (
        <LessonEntry lesson={open} onStart={onStart} onClose={() => setOpen(null)} />
      )}

      {/* Inline drill shows below when started */}
      {drilling && <VocabTab />}
    </>
  );
}
