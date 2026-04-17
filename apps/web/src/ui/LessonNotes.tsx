import type { LessonNote } from '../content';
import panels from './panels.module.css';
import study from './study.module.css';

const KIND_LABEL: Record<LessonNote['kind'], string> = {
  bound_form: 'Bound form',
  literary_form: 'Literary form',
  grammar_pattern: 'Grammar pattern',
  function_word: 'Function word',
  teaching_pattern: 'Teaching pattern',
  usage_note: 'Usage note',
  lyric_note: 'Lyric note',
};

// Annotations from song units that don't fit the drill-cell model:
// bound/literary forms, grammar patterns, and function words. Surfaces as
// contextual cards alongside the drill flow.
export function LessonNotes({ notes, heading }: { notes: LessonNote[]; heading?: string }) {
  if (!notes.length) return null;
  return (
    <div class={panels.panel}>
      <div style={{ fontWeight: 600 }}>{heading || 'Notes from the song'}</div>
      <div class={panels.muted}>Reference cards for forms that live outside the drill cells.</div>
      {notes.map((note) => (
        <div key={note.id} class={study.vocabCard}>
          <div class={study.vocabCardHeader}>
            <div style={{ fontWeight: 600 }}>{note.title}</div>
            <span class={study.badge}>{KIND_LABEL[note.kind]}</span>
          </div>
          {note.body && <div class={panels.muted} style={{ fontSize: 13 }}>{note.body}</div>}
          {(note.surface || note.ordinary) && (
            <div class={study.inlineList}>
              {note.surface && <span>{note.surface}</span>}
              {note.ordinary && <span class={panels.muted}>≈ {note.ordinary}</span>}
            </div>
          )}
          {note.related_he && (
            <div class={study.inlineList}>
              <span>{note.related_he}</span>
            </div>
          )}
          {note.lyric_he && (
            <div class={study.examplePair}>
              <div class={study.hebrewLine} style={{ fontSize: 16 }}>{note.lyric_he}</div>
              {note.lyric_en && <div class={study.englishLine} style={{ fontSize: 13 }}>{note.lyric_en}</div>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
