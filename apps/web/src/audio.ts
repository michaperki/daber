// Minimal Web Audio helpers for short UI sounds. No external libs.
// Lazily initializes a single AudioContext on first user gesture-triggered call.

type Ctx = AudioContext;
let ctx: Ctx | null = null;

function getAudioContext(): Ctx | null {
  try {
    if (typeof window === 'undefined') return null;
    const AC: typeof AudioContext | undefined = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

function playTone(opts: { freq: number; durationMs: number; type?: OscillatorType; volume?: number; startAt?: number; freqEnd?: number }) {
  const c = getAudioContext();
  if (!c) return;
  const now = c.currentTime + (opts.startAt || 0);
  const osc = c.createOscillator();
  const gain = c.createGain();
  const vol = Math.max(0, Math.min(1, opts.volume ?? 0.2));
  const dur = Math.max(0.01, (opts.durationMs || 100) / 1000);

  osc.type = opts.type || 'sine';
  osc.frequency.setValueAtTime(opts.freq, now);
  if (opts.freqEnd && opts.freqEnd > 0 && opts.freqEnd !== opts.freq) {
    osc.frequency.linearRampToValueAtTime(opts.freqEnd, now + dur);
  }

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(vol, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  osc.connect(gain);
  gain.connect(c.destination);

  osc.start(now);
  osc.stop(now + dur + 0.02);
}

export function playCorrect() {
  // Short high tick
  playTone({ freq: 880, durationMs: 120, type: 'triangle', volume: 0.15 });
}

export function playWrong() {
  // Short low thud with slight downward sweep
  playTone({ freq: 180, freqEnd: 140, durationMs: 160, type: 'sine', volume: 0.18 });
}

export function playWordComplete() {
  // Two-note chime: E5 -> A5, quick, pleasant
  playTone({ freq: 659.25, durationMs: 220, type: 'sine', volume: 0.16 });
  playTone({ freq: 880, durationMs: 260, type: 'triangle', volume: 0.14, startAt: 0.16 });
}

export function playReveal() {
  // Soft neutral tone
  playTone({ freq: 440, durationMs: 180, type: 'sine', volume: 0.12 });
}

