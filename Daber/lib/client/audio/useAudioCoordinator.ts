"use client";
import React from 'react';
import { useTTS } from './useTTS';
import { useMicRecorder } from './useMicRecorder';
import { useSFX } from './useSFX';

/* ── Audio Coordinator ─────────────────────────────────────
 *
 * Wraps TTS, mic recorder, and SFX to enforce mutual exclusion:
 *   - record(): cancels TTS, records
 *   - playTTS(): cancels mic if recording, then plays TTS
 *   - SFX methods are fire-and-forget (never block transitions)
 *
 * The session page should use this instead of calling tts/mic/sfx
 * individually to avoid resource collisions.
 * ──────────────────────────────────────────────────────────── */

export type UseAudioCoordinator = {
  // Passthrough state
  ttsPlaying: boolean;
  micListening: boolean;
  micLevel: number;

  // Coordinated actions
  warmUp: (deviceId?: string) => Promise<void>;
  coolDown: () => void;
  record: () => Promise<Blob>;
  stopRecording: () => void;
  playTTS: (text: string, rate?: number) => Promise<void>;
  cancelTTS: () => void;
  prefetchTTS: (text?: string | null) => Promise<void>;

  // SFX (fire-and-forget)
  sfxMicStart: () => void;
  sfxMicStop: () => void;
  sfxGradeCorrect: () => void;
  sfxGradeIncorrect: () => void;
};

export function useAudioCoordinator(micOpts?: { deviceId?: string; threshold?: number; silenceMs?: number }): UseAudioCoordinator {
  const tts = useTTS();
  const mic = useMicRecorder(micOpts);
  const sfx = useSFX();

  const record = React.useCallback(async (): Promise<Blob> => {
    // Cancel TTS before recording
    try { tts.cancel(); } catch {}
    return mic.recordOnce();
  }, [tts, mic]);

  const stopRecording = React.useCallback(() => {
    try { mic.cancel(); } catch {}
  }, [mic]);

  const playTTSCoordinated = React.useCallback(async (text: string, rate?: number): Promise<void> => {
    // Cancel mic before playing TTS
    try { mic.cancel(); } catch {}
    await tts.play(text, rate);
  }, [tts, mic]);

  const cancelTTS = React.useCallback(() => {
    try { tts.cancel(); } catch {}
  }, [tts]);

  const prefetchTTS = React.useCallback(async (text?: string | null) => {
    await tts.prefetch(text);
  }, [tts]);

  return {
    ttsPlaying: tts.playing,
    micListening: mic.listening,
    micLevel: mic.level,

    warmUp: mic.warmUp,
    coolDown: mic.coolDown,
    record,
    stopRecording,
    playTTS: playTTSCoordinated,
    cancelTTS,
    prefetchTTS,

    sfxMicStart: sfx.playMicStart,
    sfxMicStop: sfx.playMicStop,
    sfxGradeCorrect: sfx.playGradeCorrect,
    sfxGradeIncorrect: sfx.playGradeIncorrect,
  };
}
