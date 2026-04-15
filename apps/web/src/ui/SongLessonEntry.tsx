import { useLocation, useRoute } from 'preact-iso';
import { songLessons } from '../content';
import panels from './panels.module.css';
import study from './study.module.css';

function countByType(songId: string) {
  const song = songLessons.find((s) => s.id === songId);
  const counts: Record<string, number> = {};
  for (const unit of song?.teachable_units || []) {
    counts[unit.unit_type] = (counts[unit.unit_type] || 0) + 1;
  }
  return counts;
}

function typeLabel(type: string) {
  return type.replace(/_/g, ' ');
}

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

  const counts = countByType(song.id);

  return (
    <div class={panels.panel}>
      <div class={panels.row}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{song.title}</div>
          <div class={panels.muted}>Teachable units before lyric payoff.</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button class={study.secondaryBtn} onClick={() => route('/')}>Back</button>
        </div>
      </div>

      {song.source?.normalized_hebrew_note && (
        <div class={panels.progress}>{song.source.normalized_hebrew_note}</div>
      )}

      <div class={study.badgeRow}>
        <span class={study.badge}>{song.teachable_units.length} units</span>
        {Object.entries(counts).map(([type, count]) => (
          <span key={type} class={study.badge}>{count} {typeLabel(type)}</span>
        ))}
      </div>

      <div class={study.hebrewLine}>{song.lyrics.he}</div>

      <div class={panels.row}>
        <button class={study.secondaryBtn} onClick={() => route(`/song/${song.id}/study`)}>
          Study units
        </button>
      </div>
    </div>
  );
}
