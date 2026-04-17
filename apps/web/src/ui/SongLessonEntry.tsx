import { useLocation, useRoute } from 'preact-iso';
import { songLessons, type UnitRole } from '../content';
import panels from './panels.module.css';
import study from './study.module.css';

const ROLE_LABEL: Record<UnitRole, string> = {
  teaching_target: 'teaching targets',
  vocabulary: 'vocabulary',
  annotation: 'annotations',
};
const ROLE_ORDER: UnitRole[] = ['teaching_target', 'vocabulary', 'annotation'];

export function SongLessonEntry() {
  const { route } = useLocation();
  const { params } = useRoute();
  const song = songLessons.find((s) => s.id === params.id);

  if (!song) {
    return (
      <div class={panels.panel}>
        <div>Song lesson not found.</div>
        <button class={study.secondaryBtn} onClick={() => route('/')}>Back</button>
      </div>
    );
  }

  const roleCounts = song.teachable_units.reduce<Record<UnitRole, number>>((acc, unit) => {
    acc[unit.role] = (acc[unit.role] || 0) + 1;
    return acc;
  }, { teaching_target: 0, vocabulary: 0, annotation: 0 });

  return (
    <div class={panels.panel}>
      <div class={panels.row}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{song.title}</div>
          <div class={panels.muted}>Teaching targets drive the study walk; vocabulary and annotations are reference panels.</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button class={study.secondaryBtn} onClick={() => route('/')}>Back</button>
        </div>
      </div>

      {song.source?.normalized_hebrew_note && (
        <div class={panels.progress}>{song.source.normalized_hebrew_note}</div>
      )}

      <div class={study.badgeRow}>
        {ROLE_ORDER.map((role) => (
          <span key={role} class={study.badge}>{roleCounts[role] || 0} {ROLE_LABEL[role]}</span>
        ))}
      </div>

      <div class={study.hebrewLine}>{song.lyrics.he}</div>

      <div class={panels.row}>
        <button class={study.secondaryBtn} onClick={() => route(`/lesson/song_${song.id}`)}>
          Start lesson
        </button>
      </div>
    </div>
  );
}
