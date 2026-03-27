import Link from 'next/link';
import StartOrContinueButton from '@/app/StartOrContinueButton';

export default function MaNaasehSongPackPage() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px' }}>
      <div className="pack-card" style={{ padding: '16px' }}>
        <div className="section-label" style={{ padding: 0, marginBottom: 8 }}>song pack (v1)</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>הדג נחש — מה נעשה</div>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
          Chorus-first. Infinitive-first intros for key verbs. We’ll expand to verse chunks next.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <a
            className="qs-btn"
            href="https://www.youtube.com/results?search_query=%D7%94%D7%93%D7%92+%D7%A0%D7%97%D7%A9+%D7%9E%D7%94+%D7%A0%D7%A2%D7%A9%D7%94+English+subtitles"
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: 'none', textAlign: 'center', height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            find YouTube (english subs)
          </a>

          <BootstrapAndStartButton />

          <Link className="qs-btn" href="/dictionary" style={{ textDecoration: 'none', textAlign: 'center', height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            browse dictionary
          </Link>
        </div>
      </div>
    </div>
  );
}

function BootstrapAndStartButton() {
  return (
    <StartOrContinueButton
      lessonId="song_ma_naaseh_chorus_v1"
      bootstrapUrl="/api/song-packs/ma-naaseh/bootstrap"
      label="start chorus"
      className="qs-btn"
    />
  );
}
