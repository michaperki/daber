"use client";
import React from 'react';
import { apiTTS } from '@/lib/client/api';
import { useSettings } from '@/lib/client/settings';

export type UseTTS = {
  playing: boolean;
  play: (text: string, rate?: number) => Promise<void>;
  prefetch: (text?: string | null) => Promise<void>;
  cancel: () => void;
};

export function useTTS(maxEntries = 40, maxBytes = 10 * 1024 * 1024): UseTTS {
  const [playing, setPlaying] = React.useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const cacheRef = React.useRef<Map<string, Blob>>(new Map());
  const orderRef = React.useRef<string[]>([]);
  const bytesRef = React.useRef<number>(0);
  const settings = useSettings();
  const busyRef = React.useRef<boolean>(false);

  const put = React.useCallback((key: string, blob: Blob) => {
    const prev = cacheRef.current.get(key);
    if (prev) {
      try { bytesRef.current -= prev.size; } catch {}
    }
    cacheRef.current.set(key, blob);
    bytesRef.current += blob.size || 0;
    const i = orderRef.current.indexOf(key);
    if (i >= 0) orderRef.current.splice(i, 1);
    orderRef.current.push(key);
    while (orderRef.current.length > maxEntries || bytesRef.current > maxBytes) {
      const oldest = orderRef.current.shift();
      if (!oldest) break;
      const b = cacheRef.current.get(oldest);
      if (b) {
        try { bytesRef.current -= b.size; } catch {}
      }
      cacheRef.current.delete(oldest);
    }
  }, [maxEntries, maxBytes]);

  const get = React.useCallback((key: string): Blob | undefined => {
    const blob = cacheRef.current.get(key);
    if (!blob) return undefined;
    const i = orderRef.current.indexOf(key);
    if (i >= 0) orderRef.current.splice(i, 1);
    orderRef.current.push(key);
    return blob;
  }, []);

  const cancel = React.useCallback(() => {
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch {}
      try { URL.revokeObjectURL(audioRef.current.src); } catch {}
      audioRef.current = null;
    }
    setPlaying(false);
  }, []);

  const play = React.useCallback(async (text: string, rate?: number) => {
    if (!text) return;
    if (busyRef.current || playing) return;
    busyRef.current = true;
    setPlaying(true);
    try {
      let blob = get(text);
      if (!blob) {
        try {
          blob = await apiTTS(text);
          put(text, blob);
        } catch (e) {
          if (!settings.browserTTSFallback) throw e;
          await new Promise<void>((resolve, reject) => {
            try {
              const u = new SpeechSynthesisUtterance(text);
              u.rate = typeof rate === 'number' && rate > 0 ? rate : 1;
              u.onend = () => resolve();
              u.onerror = () => reject(new Error('speechSynthesis failed'));
              window.speechSynthesis.speak(u);
            } catch (err) {
              reject(err as any);
            }
          });
          return;
        }
      }
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      if (typeof rate === 'number' && rate > 0) {
        try { audio.playbackRate = rate; } catch {}
      }
      audioRef.current = audio;
      await new Promise<void>((resolve, reject) => {
        const onEnd = () => { cleanup(); resolve(); };
        const onErr = () => { cleanup(); reject(new Error('TTS playback failed')); };
        const cleanup = () => {
          audio.removeEventListener('ended', onEnd);
          audio.removeEventListener('error', onErr);
          try { URL.revokeObjectURL(url); } catch {}
          try { audioRef.current = null; } catch {}
          setPlaying(false);
        };
        audio.addEventListener('ended', onEnd, { once: true });
        audio.addEventListener('error', onErr, { once: true });
        audio.play().catch(onErr);
      });
    } finally {
      busyRef.current = false;
      setPlaying(false);
    }
  }, [playing, get, put]);

  const prefetch = React.useCallback(async (text?: string | null) => {
    if (!text) return;
    if (cacheRef.current.has(text)) return;
    try {
      const blob = await apiTTS(text);
      put(text, blob);
    } catch {}
  }, [put]);

  React.useEffect(() => cancel, [cancel]);

  return { playing, play, prefetch, cancel };
}
