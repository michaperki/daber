"use client";
import React from 'react';

export type MicDevice = { deviceId: string; label: string };

export type UseMicRecorder = {
  listening: boolean;
  level: number;
  warmUp: (deviceId?: string) => Promise<void>;
  coolDown: () => void;
  recordOnce: () => Promise<Blob>;
  cancel: () => void;
};

/* ── Recorder state machine ──────────────────────────────────
 *   Idle ──▶ Recording ──▶ Stopping ──▶ Idle
 *              │                         ▲
 *              └── (cancel) ─────────────┘
 *
 *  cancel() from Recording → Stopping → Idle.
 *  cancel() from Idle or Stopping → no-op.
 *  recordOnce() from anything other than Idle → rejected.
 * ──────────────────────────────────────────────────────────── */
type RecorderPhase = 'idle' | 'recording' | 'stopping';

type PersistentResources = {
  stream: MediaStream;
  audioCtx: AudioContext;
  analyser: AnalyserNode;
  deviceId: string;
};

type RunResources = {
  id: number;
  recorder: MediaRecorder;
  rafId: number | null;
  checkInterval: number | null;
  chunks: BlobPart[];
  voiceSeen: boolean;
  lastVoiceTs: number;
  startTs: number;
  resolve: (b: Blob) => void;
  reject: (e: unknown) => void;
};

export function useMicRecorder(opts?: { deviceId?: string; threshold?: number; silenceMs?: number; maxMs?: number }): UseMicRecorder {
  const deviceId = opts?.deviceId ?? '';
  const threshold = opts?.threshold ?? 0.035;
  const silenceMs = opts?.silenceMs ?? 900;
  const maxMs = opts?.maxMs ?? 7000;

  const [level, setLevel] = React.useState(0);

  const phaseRef = React.useRef<RecorderPhase>('idle');
  const runRef = React.useRef<RunResources | null>(null);
  const runIdCounter = React.useRef(0);
  const persistRef = React.useRef<PersistentResources | null>(null);
  const ambientRafRef = React.useRef<number | null>(null);
  const [listening, setListening] = React.useState(false);

  /* ── Ambient level loop (runs while stream is warm) ────── */
  const startAmbientLoop = React.useCallback((analyser: AnalyserNode) => {
    if (ambientRafRef.current != null) return;
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const loop = () => {
      // Don't update level during recording — the recording loop handles it
      if (phaseRef.current === 'recording') {
        ambientRafRef.current = requestAnimationFrame(loop);
        return;
      }
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      setLevel(Math.max(0, Math.min(1, rms * 3)));
      ambientRafRef.current = requestAnimationFrame(loop);
    };
    ambientRafRef.current = requestAnimationFrame(loop);
  }, []);

  const stopAmbientLoop = React.useCallback(() => {
    if (ambientRafRef.current != null) {
      cancelAnimationFrame(ambientRafRef.current);
      ambientRafRef.current = null;
    }
  }, []);

  /* ── warmUp: acquire persistent stream ──────────────────── */
  const warmUp = React.useCallback(async (devId?: string) => {
    const targetDevice = devId ?? deviceId;

    // Already warm with the same device
    if (persistRef.current && persistRef.current.deviceId === targetDevice) {
      // Check stream is still active
      if (persistRef.current.stream.active) return;
    }

    // Cool down any existing resources
    if (persistRef.current) {
      stopAmbientLoop();
      try { persistRef.current.analyser.disconnect(); } catch {}
      try { persistRef.current.audioCtx.close(); } catch {}
      try { persistRef.current.stream.getTracks().forEach(t => t.stop()); } catch {}
      persistRef.current = null;
      setLevel(0);
    }

    const constraints: MediaStreamConstraints = {
      audio: {
        deviceId: targetDevice ? { exact: targetDevice } as unknown as string : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1
      },
      video: false
    } as MediaStreamConstraints;

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);

    persistRef.current = { stream, audioCtx: ctx, analyser, deviceId: targetDevice };
    startAmbientLoop(analyser);
  }, [deviceId, startAmbientLoop, stopAmbientLoop]);

  /* ── coolDown: release persistent resources ─────────────── */
  const coolDown = React.useCallback(() => {
    // Cancel any active recording first
    const run = runRef.current;
    if (run) {
      if (run.rafId != null) { cancelAnimationFrame(run.rafId); run.rafId = null; }
      if (run.checkInterval != null) { clearInterval(run.checkInterval); run.checkInterval = null; }
      try { run.recorder.stop(); } catch {}
      runRef.current = null;
      phaseRef.current = 'idle';
      setListening(false);
    }

    stopAmbientLoop();

    if (persistRef.current) {
      try { persistRef.current.analyser.disconnect(); } catch {}
      try { persistRef.current.audioCtx.close(); } catch {}
      try { persistRef.current.stream.getTracks().forEach(t => t.stop()); } catch {}
      persistRef.current = null;
    }
    setLevel(0);
  }, [stopAmbientLoop]);

  /* ── Teardown a single run's resources ─────────────────── */
  const teardownRun = React.useCallback((run: RunResources, teardownPersistent: boolean) => {
    if (run.rafId != null) { cancelAnimationFrame(run.rafId); run.rafId = null; }
    if (run.checkInterval != null) { clearInterval(run.checkInterval); run.checkInterval = null; }
    if (teardownPersistent && persistRef.current) {
      try { persistRef.current.analyser.disconnect(); } catch {}
      try { persistRef.current.audioCtx.close(); } catch {}
      try { persistRef.current.stream.getTracks().forEach(t => t.stop()); } catch {}
      persistRef.current = null;
    }
  }, []);

  /* ── Called from MediaRecorder.onstop ───────────────────── */
  const finishRun = React.useCallback((run: RunResources, expectedRunId: number) => {
    if (runIdCounter.current !== expectedRunId) return;
    if (phaseRef.current !== 'stopping' && phaseRef.current !== 'recording') return;

    teardownRun(run, false);
    const blob = new Blob(run.chunks, { type: 'audio/webm' });
    phaseRef.current = 'idle';
    setListening(false);
    runRef.current = null;
    run.resolve(blob);
  }, [teardownRun]);

  /* ── Public: cancel ────────────────────────────────────── */
  const cancel = React.useCallback(() => {
    const run = runRef.current;
    if (!run) return;
    if (phaseRef.current === 'stopping' || phaseRef.current === 'idle') return;
    phaseRef.current = 'stopping';
    if (run.recorder.state === 'recording') {
      try { run.recorder.stop(); } catch {}
    } else {
      teardownRun(run, false);
      phaseRef.current = 'idle';
      setListening(false);
      runRef.current = null;
      run.reject(new Error('Recording cancelled'));
    }
  }, [teardownRun]);

  /* ── Public: recordOnce ────────────────────────────────── */
  const recordOnce = React.useCallback(async (): Promise<Blob> => {
    if (phaseRef.current !== 'idle') {
      throw new Error('Already recording');
    }

    const thisRunId = ++runIdCounter.current;
    setListening(true);

    let stream: MediaStream;
    let analyser: AnalyserNode;
    let usedFallback = false;

    // Try to use persistent resources; fall back to inline getUserMedia
    if (persistRef.current && persistRef.current.stream.active) {
      stream = persistRef.current.stream;
      analyser = persistRef.current.analyser;
    } else {
      usedFallback = true;
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } as unknown as string : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        },
        video: false
      } as MediaStreamConstraints;

      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        phaseRef.current = 'idle';
        setListening(false);
        throw err;
      }

      if (runIdCounter.current !== thisRunId) {
        stream.getTracks().forEach(t => t.stop());
        phaseRef.current = 'idle';
        setListening(false);
        throw new Error('Recording cancelled');
      }

      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      persistRef.current = { stream, audioCtx: ctx, analyser, deviceId };
      startAmbientLoop(analyser);
    }

    phaseRef.current = 'recording';

    const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);

    return new Promise<Blob>((resolve, reject) => {
      const run: RunResources = {
        id: thisRunId,
        recorder,
        rafId: null,
        checkInterval: null,
        chunks: [],
        voiceSeen: false,
        lastVoiceTs: Date.now(),
        startTs: Date.now(),
        resolve,
        reject,
      };
      runRef.current = run;

      recorder.ondataavailable = e => {
        if (e.data?.size) run.chunks.push(e.data);
      };
      recorder.onstop = () => finishRun(run, thisRunId);

      recorder.start();

      // RAF loop for level metering during recording
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        if (runIdCounter.current !== thisRunId) return;
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        setLevel(Math.max(0, Math.min(1, rms * 3)));
        const now = Date.now();
        if (rms > threshold) {
          run.voiceSeen = true;
          run.lastVoiceTs = now;
        }
        run.rafId = requestAnimationFrame(loop);
      };
      run.rafId = requestAnimationFrame(loop);

      // Interval for silence/max detection
      run.checkInterval = window.setInterval(() => {
        if (runIdCounter.current !== thisRunId) {
          if (run.checkInterval != null) clearInterval(run.checkInterval);
          return;
        }
        if (phaseRef.current !== 'recording') return;
        const now = Date.now();
        if (run.voiceSeen && now - run.lastVoiceTs > silenceMs) {
          phaseRef.current = 'stopping';
          try { recorder.stop(); } catch {}
        } else if (now - run.startTs > maxMs) {
          phaseRef.current = 'stopping';
          try { recorder.stop(); } catch {}
        }
      }, 100);

      // Final guard: if cancel was called between check and recorder.start
      if (runIdCounter.current !== thisRunId) {
        cancel();
      }
    });
  }, [deviceId, threshold, silenceMs, maxMs, finishRun, cancel, startAmbientLoop]);

  /* ── Re-warm on deviceId change ────────────────────────── */
  React.useEffect(() => {
    if (persistRef.current && persistRef.current.deviceId !== deviceId) {
      warmUp(deviceId).catch(() => {});
    }
  }, [deviceId, warmUp]);

  // Cleanup on unmount
  React.useEffect(() => () => {
    coolDown();
  }, [coolDown]);

  return { listening, level, warmUp, coolDown, recordOnce, cancel };
}
