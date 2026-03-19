"use client";
import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAudioCoordinator } from '@/lib/client/audio/useAudioCoordinator';
import { apiNextItem, apiAttempt, apiSTTFromBlob, apiOverrideAttempt } from '@/lib/client/api';
import type { NextItemResponse, AttemptResponse } from '@/lib/contracts';
import { PromptHeader } from '@/app/components/PromptHeader';
import { PromptCard } from '@/app/components/PromptCard';
import { StatusStrip } from '@/app/components/StatusStrip';
import { MicControls } from '@/app/components/MicControls';
import { TranscriptPreview } from '@/app/components/TranscriptPreview';
import { TranscriptEditor } from '@/app/components/TranscriptEditor';
import { HebrewKeyboard } from '@/app/components/HebrewKeyboard';
import { FeedbackPanel } from '@/app/components/FeedbackPanel';
import { useSettings } from '@/lib/client/settings';
import { useToast } from '@/lib/client/toast';
import { useSessionMachine } from '@/lib/client/state/sessionMachine';

export default function DaberSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const settings = useSettings();
  const useLex = settings.useLexiconDrills;

  const toast = useToast();
  const audio = useAudioCoordinator({
    deviceId: settings.micDeviceId,
    threshold: settings.micSensitivity,
    silenceMs: settings.micSilenceMs,
  });

  const { state, dispatch } = useSessionMachine();
  const { phase, item, progress, transcript, feedback, hintVisible } = state;

  const lastPromptIdRef = React.useRef<string | null>(null);

  function stripHowDoISay(text: string): string {
    const re = /^\s*how\s+do\s+i\s+say[:\s-]*/i;
    return text.replace(re, '').trim();
  }

  const playTTS = async (text: string): Promise<void> => {
    if (!text) return;
    try {
      await audio.playTTS(text, settings.ttsRate);
    } catch (_: unknown) {
      toast.error('TTS failed');
    }
  };

  /* ── Warm up mic on mount, cool down on unmount ─────────── */
  React.useEffect(() => {
    audio.warmUp().catch(() => {});
    return () => { audio.coolDown(); };
  }, []);

  /* ── Fetch next item ───────────────────────────────────── */
  const fetchNextRaw = React.useCallback(async (): Promise<NextItemResponse> => {
    try {
      const due = settings.dueMode === 'feature' ? 'feature' : (settings.dueMode === 'item' ? 'item' : (settings.dueMode === 'blend' ? 'blend' : undefined));
      return await apiNextItem(sessionId, { random: settings.randomOrder, mode: (useLex || settings.dueMode === 'feature' || settings.dueMode === 'blend') ? 'lex' : undefined, focus: (useLex && settings.targetWeakness) ? 'weak' : undefined, due });
    } catch {
      toast.error('Failed to fetch next item');
      return { done: true } as NextItemResponse;
    }
  }, [sessionId, settings.randomOrder, useLex, settings.targetWeakness, settings.dueMode]);

  const loadItem = React.useCallback(async () => {
    const data = await fetchNextRaw();
    if (data.done) {
      dispatch({ type: 'SESSION_DONE' });
      router.push(`/session/${sessionId}/summary`);
      return;
    }
    if (!data.item) return;
    dispatch({
      type: 'ITEM_LOADED',
      item: data.item,
      index: data.index ?? 0,
      total: data.total ?? 0,
      showHint: settings.showTransliteration || false,
    });
    // Speak the English prompt once per item (guard dev double-invoke)
    if (lastPromptIdRef.current !== data.item.id) {
      lastPromptIdRef.current = data.item.id;
      if (settings.speakPrompt) {
        await playTTS(stripHowDoISay(data.item.english_prompt));
      }
    }
    // Prefetch TTS for correction and prompt
    try {
      await audio.prefetchTTS(data.item.target_hebrew);
      if (settings.speakPrompt) {
        await audio.prefetchTTS(stripHowDoISay(data.item.english_prompt));
      }
    } catch {}
  }, [fetchNextRaw, dispatch, router, sessionId, settings.showTransliteration, settings.speakPrompt]);

  // Initial load
  React.useEffect(() => { loadItem(); }, [loadItem]);

  /* ── Voice capture ─────────────────────────────────────── */
  const startVoice = async () => {
    dispatch({ type: 'START_LISTENING' });
    try {
      try { audio.sfxMicStart(); } catch {}
      const blob = await audio.record();
      const { transcript: text } = await apiSTTFromBlob(blob);
      dispatch({ type: 'TRANSCRIPT_RECEIVED', transcript: text });
      if (!settings.reviewBeforeSubmit) {
        await submitAnswer(text);
      }
    } catch (e: unknown) {
      // If cancelled or failed, return to prompting
      dispatch({ type: 'CANCEL_LISTENING' });
      if (e instanceof Error && e.message.includes('cancelled')) return;
      toast.error(e instanceof Error ? e.message : 'Unable to access microphone');
    }
  };

  const stopVoice = () => {
    try { audio.stopRecording(); } catch {}
    try { audio.sfxMicStop(); } catch {}
  };

  /* ── Submit answer ─────────────────────────────────────── */
  const submitAnswer = async (raw: string) => {
    if (!item) return;
    dispatch({ type: 'SUBMIT' });
    try {
      const data: AttemptResponse = await apiAttempt(sessionId, item.id, raw);
      dispatch({ type: 'FEEDBACK_RECEIVED', feedback: data });
      // Play correction without blocking UI
      if (data.correct_hebrew) {
        playTTS(data.correct_hebrew).catch(() => {
          try { audio.sfxGradeIncorrect(); } catch {}
        });
      } else {
        try { (data.grade === 'correct') ? audio.sfxGradeCorrect() : audio.sfxGradeIncorrect(); } catch {}
      }
      if (settings.autoResumeListening && data.grade !== 'correct') {
        try { await startVoice(); } catch {}
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Submission failed');
    }
  };

  const skip = async () => {
    await submitAnswer('');
  };

  const nextItem = async () => {
    dispatch({ type: 'NEXT_ITEM' });
    try { audio.cancelTTS(); } catch {}
    await loadItem();
  };

  /* ── Override ──────────────────────────────────────────── */
  const handleOverride = async () => {
    if (!item) return;
    try {
      const r = await apiOverrideAttempt(sessionId, item.id);
      dispatch({ type: 'OVERRIDE_FEEDBACK', feedback: { grade: r.grade, reason: r.reason, correct_hebrew: r.correct_hebrew } });
      audio.sfxGradeCorrect();
      toast.success('Marked correct');
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : null) || 'Override failed');
    }
  };

  /* ── Loading state ─────────────────────────────────────── */
  if (!item) {
    return (
      <div className="drill-root">
        <div className="prompt-card"><div className="prompt-text">Loading…</div></div>
      </div>
    );
  }

  /* ── Derived UI state ──────────────────────────────────── */
  const status: { dotClass: string; dotActive: boolean; label: string; waveActive: boolean; micRecording: boolean } = (() => {
    if (phase === 'feedback' || phase === 'evaluating') {
      const fb = feedback;
      if (fb) {
        return {
          dotClass: fb.grade === 'incorrect' ? 'error' : '',
          dotActive: false,
          label: fb.grade === 'correct' ? 'correct' : fb.grade === 'flawed' ? 'close' : 'not quite',
          waveActive: false,
          micRecording: false,
        };
      }
      // Evaluating but feedback not yet available
      if (phase === 'evaluating') {
        return { dotClass: '', dotActive: true, label: 'checking…', waveActive: false, micRecording: false };
      }
    }
    if (phase === 'listening' || phase === 'transcribing') {
      return { dotClass: '', dotActive: true, label: phase === 'listening' ? 'listening…' : 'transcribing…', waveActive: phase === 'listening', micRecording: phase === 'listening' };
    }
    // Idle/prompting/reviewing
    return { dotClass: '', dotActive: true, label: 'ready', waveActive: false, micRecording: false };
  })();

  const cleanedPrompt = stripHowDoISay(item.english_prompt);

  const emojiCue = deriveEmojiCue(cleanedPrompt, item?.id);
  const showReviewUI = settings.reviewBeforeSubmit && (phase === 'reviewing' || phase === 'prompting');
  const showFeedback = feedback && (phase === 'feedback' || phase === 'evaluating');
  const micDisabled = audio.ttsPlaying || phase === 'evaluating' || phase === 'advancing';

  return (
    <div className="drill-root">
      <PromptHeader index={progress.index} total={progress.total} onExit={() => router.push('/')} />

      <PromptCard
        prompt={cleanedPrompt}
        emojiHint={emojiCue}
        transliteration={item.transliteration}
        hintVisible={hintVisible}
        onToggleHint={() => dispatch({ type: 'TOGGLE_HINT' })}
        features={item.features || null}
      />

      <StatusStrip dotClass={status.dotClass} active={status.dotActive} label={status.label} waveActive={status.waveActive} level={audio.micLevel} />

      <MicControls
        canReplayPrompt={settings.speakPrompt}
        onReplayPrompt={() => playTTS(cleanedPrompt)}
        listening={audio.micListening}
        onStart={startVoice}
        onStop={stopVoice}
        onSkip={skip}
        disabled={micDisabled}
      />

      {showReviewUI ? (
        <>
          <TranscriptEditor value={transcript} onChange={(v) => dispatch({ type: 'EDIT_TRANSCRIPT', transcript: v })} />
          <HebrewKeyboard onInsert={(ch) => dispatch({ type: 'EDIT_TRANSCRIPT', transcript: transcript + ch })} onBackspace={() => dispatch({ type: 'EDIT_TRANSCRIPT', transcript: transcript.slice(0, -1) })} />
          <div className="cta-row" style={{ marginTop: 8 }}>
            <button className="btn-start" onClick={() => submitAnswer(transcript)} disabled={!transcript.trim()}>submit</button>
            <button className="btn-resume" onClick={startVoice}>record again</button>
            <button className="qs-btn" onClick={() => dispatch({ type: 'CLEAR_TRANSCRIPT' })}>clear</button>
          </div>
        </>
      ) : (
        <TranscriptPreview value={transcript} />
      )}

      {showFeedback && feedback ? (
        <FeedbackPanel grade={feedback.grade} reason={feedback.reason} correctHebrew={feedback.correct_hebrew} transliteration={item.transliteration} features={item.features || null} userTranscript={transcript} />
      ) : null}

      {showFeedback && feedback ? (
        settings.stayOnFlawed && feedback.grade === 'flawed' ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="next-btn" onClick={startVoice}>
              try again
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 7a5 5 0 1 0 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M2 3.5v3.5h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button className="next-btn" onClick={handleOverride}>
              I said it right
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button className="next-btn" onClick={nextItem}>
              next prompt
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="next-btn" onClick={handleOverride}>
              I said it right
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button className="next-btn" onClick={nextItem}>
              next prompt
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        )
      ) : null}
    </div>
  );
}

/* ── Emoji derivation (pure, no state) ───────────────────── */
function parseEmojiFromGeneratedId(id: string): string | '' {
  if (id.startsWith('gen_vpr_')) {
    const parts = id.split('_');
    const number = parts[3] || 'na';
    const gender = parts[4] || 'na';
    if (number === 'pl') return gender === 'f' ? '👩👩' : '👨👩';
    if (gender === 'm') return '👨';
    if (gender === 'f') return '👩';
    return '';
  }
  if (id.startsWith('gen_adj_')) {
    const parts = id.split('_');
    const number = parts[3] || 'na';
    const gender = parts[4] || 'na';
    if (number === 'pl') return gender === 'f' ? '👩👩' : '👨👩';
    if (gender === 'm') return '👨';
    if (gender === 'f') return '👩';
    return '';
  }
  return '';
}

function deriveEmojiCue(en: string, id?: string): string {
  const fromId = id ? parseEmojiFromGeneratedId(id) : '';
  if (fromId) return fromId;
  const s = en.toLowerCase();
  if (/(female\s*speaker|\(female\))/i.test(en)) return '👩';
  if (/(male\s*speaker|\(male\))/i.test(en)) return '👨';
  if (/\b(she|her)\b/.test(s)) return '👩';
  if (/\b(he|him)\b/.test(s)) return '👨';
  if (/they\s*\(f\)/.test(s) || /\bwomen\b/.test(s) || /\bgirls\b/.test(s)) return '👩👩';
  if (/they\s*\(m\)/.test(s) || /\bmen\b/.test(s) || /\bboys\b/.test(s)) return '👨👩';
  if (/\bthey\b/.test(s) || /\bwe\b/.test(s) || /\byou\b.*\b(pl|plural)\b/.test(s)) return '👨👩';
  return '';
}
