"use client";
import React from 'react';
import { useSettings } from '@/lib/client/settings';
import { useMicRecorder } from '@/lib/client/audio/useMicRecorder';
import type { MicDevice } from '@/lib/client/audio/useMicRecorder';

export default function SettingsCard() {
  const { showTransliteration, stayOnFlawed, speakPrompt, manualAdvance, ttsRate, uiSoundEffects, micDeviceId, micSensitivity, micSilenceMs, setShowTransliteration, setStayOnFlawed, setSpeakPrompt, setManualAdvance, setTtsRate, setUiSoundEffects, setMicDeviceId, setMicSensitivity, setMicSilenceMs } = useSettings();

  const [micDevices, setMicDevices] = React.useState<MicDevice[]>([]);
  const [testing, setTesting] = React.useState(false);
  const [micError, setMicError] = React.useState<string | null>(null);

  const mic = useMicRecorder({
    deviceId: micDeviceId,
    threshold: micSensitivity,
    silenceMs: micSilenceMs,
  });

  const refreshDevices = React.useCallback(async () => {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      const audioIns = devs.filter(d => d.kind === 'audioinput').map(d => ({ deviceId: d.deviceId, label: d.label }));
      setMicDevices(audioIns);
    } catch {}
  }, []);

  React.useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  React.useEffect(() => {
    const handler = () => { refreshDevices().catch(() => {}); };
    try { navigator.mediaDevices.addEventListener('devicechange', handler); } catch {}
    return () => { try { navigator.mediaDevices.removeEventListener('devicechange', handler); } catch {} };
  }, [refreshDevices]);

  const toggleTest = React.useCallback(async () => {
    if (testing) {
      mic.coolDown();
      setTesting(false);
      setMicError(null);
    } else {
      setMicError(null);
      try {
        await mic.warmUp(micDeviceId || undefined);
        setTesting(true);
        // Also refresh devices — getUserMedia grants label access
        refreshDevices().catch(() => {});
      } catch (e) {
        setMicError(e instanceof Error ? e.message : 'Could not access microphone');
      }
    }
  }, [testing, mic, micDeviceId, refreshDevices]);

  // Sensitivity: low=0.08, medium=0.035, high=0.015
  const sensitivityLabel = micSensitivity <= 0.02 ? 'high' : micSensitivity <= 0.05 ? 'medium' : 'low';
  // Silence: quick=400, normal=900, patient=1500
  const silenceLabel = micSilenceMs <= 500 ? 'quick' : micSilenceMs <= 1200 ? 'normal' : 'patient';

  // For the level meter: threshold position as percentage (inverted since higher threshold = less sensitive)
  // mic.level is 0-1, threshold maps from RMS space (0-~0.33 raw, displayed as rms*3 clamped to 1)
  // The threshold in the level display corresponds to threshold * 3 (matching the rms * 3 scaling)
  const thresholdDisplay = Math.min(1, micSensitivity * 3);
  const aboveThreshold = mic.level > thresholdDisplay;

  return (
    <div className="pack-card" style={{ padding: '1rem 1rem' }}>
      <div className="section-label" style={{ padding: 0, marginBottom: 8 }}>settings</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={showTransliteration} onChange={e => setShowTransliteration(e.target.checked)} />
          show transliteration
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={stayOnFlawed} onChange={e => setStayOnFlawed(e.target.checked)} />
          stay on flawed
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={speakPrompt} onChange={e => setSpeakPrompt(e.target.checked)} />
          speak English prompt (TTS)
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={manualAdvance} onChange={e => setManualAdvance(e.target.checked)} />
          manual next (no auto-advance)
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <span style={{ width: 160 }}>TTS speed</span>
          <select value={String(ttsRate)} onChange={e => setTtsRate(Number(e.target.value))}>
            <option value="0.85">0.85x</option>
            <option value="1">1.0x</option>
            <option value="1.15">1.15x</option>
          </select>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={uiSoundEffects} onChange={e => setUiSoundEffects(e.target.checked)} />
          UI sound effects (mic + grade)
        </label>
      </div>

      <div className="section-label" style={{ padding: 0, marginTop: 16, marginBottom: 8 }}>audio</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <span style={{ width: 160 }}>mic device</span>
          <select
            style={{ flex: 1 }}
            value={micDeviceId}
            onChange={e => setMicDeviceId(e.target.value)}
          >
            <option value="">default</option>
            {micDevices.map(d => (
              <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>
            ))}
          </select>
          <button className="qs-btn" style={{ height: 28, padding: '0 8px', flexShrink: 0, fontSize: 12 }} onClick={() => refreshDevices()}>refresh</button>
        </div>
        {(!micDevices.length || micDevices.every(d => !d.label)) ? (
          <div style={{ padding: '6px 0', fontSize: 12, color: 'var(--color-text-secondary)' }}>
            If your mic isn't listed: ensure HTTPS, allow microphone permissions in your browser, and click refresh. On desktop, check OS input settings.
          </div>
        ) : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <span style={{ width: 160 }}>mic sensitivity ({sensitivityLabel})</span>
          <input
            type="range"
            min="0.01"
            max="0.1"
            step="0.005"
            value={micSensitivity}
            onChange={e => setMicSensitivity(Number(e.target.value))}
            style={{ flex: 1, direction: 'rtl' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <span style={{ width: 160 }}>silence timeout ({silenceLabel})</span>
          <input
            type="range"
            min="300"
            max="2000"
            step="100"
            value={micSilenceMs}
            onChange={e => setMicSilenceMs(Number(e.target.value))}
            style={{ flex: 1 }}
          />
        </div>

        <div style={{ marginTop: 4 }}>
          <button
            className="qs-btn"
            style={{ height: 32, padding: '0 12px', fontSize: 13 }}
            onClick={toggleTest}
          >
            {testing ? 'stop test' : 'test mic'}
          </button>
        </div>
        {micError ? (
          <div style={{ fontSize: 12, color: 'var(--color-error, #e53e3e)' }}>{micError}</div>
        ) : null}
        {testing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ position: 'relative', height: 24, background: 'var(--color-bg-secondary, #1a1a2e)', borderRadius: 6, overflow: 'hidden' }}>
              {/* Level bar */}
              <div style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${Math.round(mic.level * 100)}%`,
                background: aboveThreshold ? 'var(--color-success, #38a169)' : 'var(--color-text-secondary, #666)',
                borderRadius: 6,
                transition: 'width 60ms linear',
              }} />
              {/* Threshold marker */}
              <div style={{
                position: 'absolute',
                left: `${Math.round(thresholdDisplay * 100)}%`,
                top: 0,
                bottom: 0,
                width: 2,
                background: 'var(--color-warning, #dd6b20)',
                opacity: 0.8,
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-secondary)' }}>
              <span>level: {Math.round(mic.level * 100)}%</span>
              <span style={{ color: aboveThreshold ? 'var(--color-success, #38a169)' : 'var(--color-text-secondary)' }}>
                {aboveThreshold ? 'voice detected' : 'below threshold'}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
