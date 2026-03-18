"use client";
import React from 'react';
import { useSettings } from '@/lib/client/settings';

export type UseSFX = {
  playMicStart: () => void;
  playMicStop: () => void;
  playGradeCorrect: () => void;
  playGradeIncorrect: () => void;
};

export function useSFX(): UseSFX {
  const settings = useSettings();
  const ctxRef = React.useRef<AudioContext | null>(null);
  const unlockedRef = React.useRef(false);
  const ensureCtx = React.useCallback(() => {
    if (!settings.uiSoundEffects) return null;
    if (!ctxRef.current) {
      try { ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch {}
    }
    return ctxRef.current;
  }, [settings.uiSoundEffects]);

  const resumeIfNeeded = React.useCallback(async (ctx: AudioContext) => {
    try { if (ctx.state === 'suspended') await ctx.resume(); } catch {}
  }, []);

  const beep = React.useCallback(async (freq: number, ms: number, type: OscillatorType = 'sine') => {
    const ctx = ensureCtx();
    if (!ctx) return;
    await resumeIfNeeded(ctx);
    try {
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.3, t0 + 0.01);
      gain.gain.linearRampToValueAtTime(0.22, t0 + ms / 1000 - 0.02);
      gain.gain.linearRampToValueAtTime(0, t0 + ms / 1000);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + ms / 1000 + 0.01);
    } catch {}
  }, [ensureCtx, resumeIfNeeded]);

  const playMicStart = React.useCallback(() => beep(880, 80, 'sine'), [beep]);
  const playMicStop = React.useCallback(() => beep(500, 80, 'sine'), [beep]);
  const playGradeCorrect = React.useCallback(() => { beep(660, 70, 'triangle'); setTimeout(() => beep(990, 90, 'triangle'), 60); }, [beep]);
  const playGradeIncorrect = React.useCallback(() => { beep(320, 120, 'sawtooth'); }, [beep]);

  React.useEffect(() => {
    if (!settings.uiSoundEffects) return;
    const unlock = async () => {
      if (unlockedRef.current) return;
      const ctx = ensureCtx();
      if (!ctx) return;
      try { await ctx.resume(); unlockedRef.current = true; } catch {}
    };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    return () => {
      document.removeEventListener('pointerdown', unlock as any);
      document.removeEventListener('keydown', unlock as any);
      try { ctxRef.current?.close(); } catch {}
      ctxRef.current = null;
      unlockedRef.current = false;
    };
  }, [settings.uiSoundEffects, ensureCtx]);

  return { playMicStart, playMicStop, playGradeCorrect, playGradeIncorrect };
}
