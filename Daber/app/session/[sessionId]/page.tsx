"use client";
import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAudioCoordinator } from '@/lib/client/audio/useAudioCoordinator';
import { apiNextItem, apiAttempt, apiSTTFromBlob, apiOverrideAttempt, apiMarkSeen, apiMarkKnown } from '@/lib/client/api';
import type { NextItemResponse, AttemptResponse } from '@/lib/contracts';
import { PromptHeader } from '@/app/components/PromptHeader';
import { PromptCard } from '@/app/components/PromptCard';
import { StatusStrip } from '@/app/components/StatusStrip';
import { MicControls } from '@/app/components/MicControls';
import { TranscriptPreview } from '@/app/components/TranscriptPreview';
import { TranscriptEditor } from '@/app/components/TranscriptEditor';
import { HebrewKeyboard } from '@/app/components/HebrewKeyboard';
import { FeedbackPanel } from '@/app/components/FeedbackPanel';
import { AudioPlayButton } from '@/app/components/AudioPlayButton';
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

  const [drillPhase, setDrillPhase] = React.useState<'intro' | 'recognition' | 'guided' | 'free_recall' | null>(null);
  const [introHebrew, setIntroHebrew] = React.useState<string | null>(null);
  const [introEnglish, setIntroEnglish] = React.useState<string | null>(null);
  const [debugMeta, setDebugMeta] = React.useState<{ sessionId: string; lessonId: string; itemId: string; lexemeId: string | null; familyId: string | null; path?: string | null } | null>(null);
  const [hints, setHints] = React.useState<{ baseForm?: string; firstLetter?: string; definiteness?: boolean } | null>(null);
  const [llmDebug, setLlmDebug] = React.useState<any | null>(null);
  const [hintLevel, setHintLevel] = React.useState<number>(0);
  // Track server TTS availability for server-side phase selection only
  const [ttsAvailable, setTtsAvailable] = React.useState<boolean>(true);
  const ttsUpRef = React.useRef<boolean | null>(null);

  const lastPromptIdRef = React.useRef<string | null>(null);
  const newContentToastShownRef = React.useRef<boolean>(false);
  const mountedRef = React.useRef<boolean>(false);
  const loadingItemRef = React.useRef<boolean>(false);
  const submittingRef = React.useRef<boolean>(false);
  const autoResumeRef = React.useRef<boolean>(false);

  function stripHowDoISay(text: string): string {
    const re = /^\s*how\s+do\s+i\s+say[:\s-]*/i;
    if (!re.test(text)) return text;
    return text.replace(re, '').replace(/\?+\s*$/, '').trim();
  }

  function stripEmoji(text: string): string {
    return text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{2702}-\u{27B0}]/gu, '');
  }

  const playTTS = async (text: string): Promise<void> => {
    if (!text) return;
    try {
      await audio.playTTS(text, settings.ttsRate);
    } catch (_: unknown) {
      toast.error('TTS failed');
    }
  };

  /* ── Warm up mic; pause on hide; cleanup ─────────── */
  React.useEffect(() => {
    audio.warmUp().catch(() => {});
    const onVis = () => {
      try {
        if (document.hidden) {
          audio.coolDown();
        } else {
          audio.warmUp().catch(() => {});
        }
      } catch {}
    };
    const onHide = () => {
      try { audio.coolDown(); } catch {}
    };
    try { document.addEventListener('visibilitychange', onVis); } catch {}
    try { window.addEventListener('pagehide', onHide); } catch {}
    return () => {
      try { audio.coolDown(); } catch {}
      try { document.removeEventListener('visibilitychange', onVis); } catch {}
      try { window.removeEventListener('pagehide', onHide); } catch {}
    };
  }, []);

  /* ── Fetch next item ───────────────────────────────────── */
  const [pacingOffer, setPacingOffer] = React.useState<'end' | 'extend' | null>(null);
  const [forcedDirection, setForcedDirection] = React.useState<'en_to_he' | 'he_to_en' | null>(null);
  const [showIntro, setShowIntro] = React.useState<boolean>(false);
  const isRecognition = drillPhase === 'recognition';
  const isGuided = drillPhase === 'guided';
  const isFreeRecallVoice = drillPhase === 'free_recall';
  const [englishInput, setEnglishInput] = React.useState('');
  const englishInputRef = React.useRef<HTMLInputElement | null>(null);
  const [hebrewInput, setHebrewInput] = React.useState('');
  const hebrewInputRef = React.useRef<HTMLInputElement | null>(null);

  // On iOS/mobile, prefer the native keyboard and hide the custom on-screen Hebrew keyboard.
  const [showNativeKeyboard, setShowNativeKeyboard] = React.useState<boolean>(false);
  React.useEffect(() => {
    try {
      const ua = navigator.userAgent || '';
      const isIOS = /iPhone|iPad|iPod/i.test(ua);
      const isCoarse = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      setShowNativeKeyboard(isIOS || isCoarse);
    } catch {}
  }, []);

  function deriveHebPronounFromFeatures(feat?: Record<string, string | null> | null): string | null {
    if (!feat) return null;
    const p = (feat.person || '').trim();
    const n = (feat.number || '').trim();
    const g = (feat.gender || '').trim();
    if (p === '1' && n === 'sg') return 'אני';
    if (p === '1' && n === 'pl') return 'אנחנו';
    if (p === '2' && n === 'sg' && g === 'm') return 'אתה';
    if (p === '2' && n === 'sg' && g === 'f') return 'את';
    if (p === '2' && n === 'pl' && g === 'm') return 'אתם';
    if (p === '2' && n === 'pl' && g === 'f') return 'אתן';
    if (p === '3' && n === 'sg' && g === 'm') return 'הוא';
    if (p === '3' && n === 'sg' && g === 'f') return 'היא';
    if (p === '3' && n === 'pl' && g === 'm') return 'הם';
    if (p === '3' && n === 'pl' && g === 'f') return 'הן';
    return null;
  }

  const fetchNextRaw = React.useCallback(async (forceLlm?: boolean): Promise<NextItemResponse> => {
    try {
      const data = await apiNextItem(sessionId, { random: true, mode: useLex ? 'lex' : undefined, focus: useLex ? 'weak' : undefined, due: 'blend', pacing: 'adaptive', forceLlm: !!forceLlm, tts: ttsUpRef.current !== false });
      if (data.offerEnd) setPacingOffer('end');
      else if (data.offerExtend) setPacingOffer('extend');
      else setPacingOffer(null);
      if (data.newContentReady && !newContentToastShownRef.current) {
        try { toast.success('New sentences ready'); } catch {}
        newContentToastShownRef.current = true;
      }
      return data;
    } catch {
      toast.error('Failed to fetch next item');
      return { done: true } as NextItemResponse;
    }
  }, [sessionId, useLex]);

  const loadItem = React.useCallback(async (forceLlm?: boolean) => {
    if (loadingItemRef.current) return;
    loadingItemRef.current = true;
    if (ttsUpRef.current === null) {
      try {
        const ok = await audio.prefetchTTS('שלום');
        ttsUpRef.current = !!ok;
        setTtsAvailable(!!ok);
      } catch {
        ttsUpRef.current = false;
        setTtsAvailable(false);
      }
    }
    const data = await fetchNextRaw(!!forceLlm);
    if (data.done) {
      dispatch({ type: 'SESSION_DONE' });
      router.push(`/session/${sessionId}/summary`);
      loadingItemRef.current = false;
      return;
    }
    if (!data.item) return;
    const mode: 'en_to_he' | 'he_to_en' = (data.phase === 'recognition' || data.phase === 'intro') ? 'he_to_en' : 'en_to_he';
    setShowIntro(data.phase === 'intro');
    setDrillPhase((data.phase as any) || null);
    setIntroHebrew((data.intro && data.intro.hebrew) || null);
    setIntroEnglish((data.intro && data.intro.english) || null);
    setHints((data as any).hints || null);
    setDebugMeta((data as any).meta || null);
    setHintLevel(0);
    setLlmDebug((data as any).llm_debug || null);
    setForcedDirection(mode);
    dispatch({
      type: 'ITEM_LOADED',
      item: data.item,
      index: data.index ?? 0,
      total: data.total ?? 0,
      showHint: settings.showTransliteration || false,
    });
    // Prepare prompt state once per item (no auto TTS)
    if (lastPromptIdRef.current !== data.item.id) {
      lastPromptIdRef.current = data.item.id;
      setEnglishInput('');
      setHebrewInput('');
      if (data.phase === 'recognition') {
        setEnglishInput('');
        try { englishInputRef.current?.focus(); } catch {}
      } else if (data.phase === 'guided') {
        setHebrewInput('');
        try { hebrewInputRef.current?.focus(); } catch {}
      }
    }
    
    try {
      if (ttsUpRef.current !== false) {
        await audio.prefetchTTS(data.item.target_hebrew);
        if (settings.speakPrompt) {
          await audio.prefetchTTS(stripHowDoISay(stripEmoji(data.item.english_prompt)));
        }
      }
    } catch {}
    loadingItemRef.current = false;
  }, [fetchNextRaw, dispatch, router, sessionId, settings.showTransliteration, settings.speakPrompt]);

  // Initial load
  React.useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    loadItem();
  }, [loadItem]);

  /* ── Keyboard shortcuts ───────────────────────────────── */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || (e as any).isComposing;
      if (isTyping) return;
      // Space: toggle mic
      if (e.code === 'Space') {
        e.preventDefault();
        if (state.phase === 'listening') stopVoice();
        else if (drillPhase === 'free_recall') startVoice();
      }
      // ArrowRight: next item when feedback visible
      if (e.code === 'ArrowRight') {
        if (feedback) nextItem();
      }
      // Enter: submit typed answer in recognition/guided
      if (e.code === 'Enter') {
        if (drillPhase === 'recognition') {
          if (englishInput.trim()) submitAnswer(englishInput.trim());
        } else if (drillPhase === 'guided') {
          if (hebrewInput.trim()) submitAnswer(hebrewInput.trim());
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [state.phase, drillPhase, feedback, englishInput, hebrewInput]);

  /* ── Voice capture ─────────────────────────────────────── */
  const startVoice = async () => {
    if (state.phase === 'listening' || state.phase === 'transcribing' || submittingRef.current) return;
    dispatch({ type: 'START_LISTENING' });
    try {
      try { audio.sfxMicStart(); } catch {}
      const blob = await audio.record();
      const { transcript: text } = await apiSTTFromBlob(blob);
      dispatch({ type: 'TRANSCRIPT_RECEIVED', transcript: text });
      // always review before submit
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
    if (submittingRef.current) return;
    submittingRef.current = true;
    dispatch({ type: 'SUBMIT' });
    try {
      const data: AttemptResponse = await apiAttempt(sessionId, item.id, raw, isRecognition ? 'he_to_en' : (isGuided ? 'en_to_he' : undefined), drillPhase || undefined as any);
      dispatch({ type: 'FEEDBACK_RECEIVED', feedback: data });
      // No auto TTS on feedback; play simple SFX only
      try { (data.grade === 'correct') ? audio.sfxGradeCorrect() : audio.sfxGradeIncorrect(); } catch {}
      if (data.grade !== 'correct' && !autoResumeRef.current) {
        autoResumeRef.current = true;
        try { await startVoice(); } catch {}
        autoResumeRef.current = false;
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Submission failed');
    }
    submittingRef.current = false;
  };

  const skip = async () => {
    await submitAnswer('');
  };

  const nextItem = async () => {
    dispatch({ type: 'NEXT_ITEM' });
    try { audio.cancelTTS(); } catch {}
    autoResumeRef.current = false;
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
          label: '',
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

  const cleanedPrompt = stripEmoji(stripHowDoISay(item.english_prompt));

  const emojiCue = deriveEmojiFromFeatures(item.features || null) || deriveEmojiCue(item.english_prompt, item?.id);
  const showReviewUI = (phase === 'reviewing' || phase === 'prompting');
  const showFeedback = feedback && (phase === 'feedback' || phase === 'evaluating');
  const micDisabled = phase === 'evaluating' || phase === 'advancing';

  const isDev = process.env.NODE_ENV !== 'production';
  const showLlmBadge = isDev && !!llmDebug && (llmDebug.source === 'generated' || llmDebug.source === 'cache_hit');

  return (
    <div className="drill-root">
      <PromptHeader index={progress.index} total={progress.total} onExit={() => router.push('/')} />

      {debugMeta ? (
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '6px 0', padding: '6px 10px', border: '1px dashed var(--color-border-tertiary)', borderRadius: 8 }}>
          <div>sid: {debugMeta.sessionId} · lesson: {debugMeta.lessonId} · item: {debugMeta.itemId}</div>
          <div>lexeme: {debugMeta.lexemeId || 'null'} · family: {debugMeta.familyId || 'null'} · path: {debugMeta.path || 'n/a'}</div>
        </div>
      ) : null}

      {showIntro ? (
        <div className="prompt-card" style={{ marginBottom: 12 }}>
          <div className="prompt-eyebrow">new word</div>
          <div className="audio-row" style={{ padding: 0, justifyContent: 'center' }}>
            <AudioPlayButton
              playing={audio.ttsPlaying}
              onPlay={() => playTTS(introHebrew || item.target_hebrew)}
              disabled={!ttsAvailable}
              title={!ttsAvailable ? 'Audio unavailable' : undefined}
            />
            <div>
              <div className="intro-hero-hebrew">{introHebrew || item.target_hebrew}</div>
              {item.transliteration ? (
                <div className="correct-transliteration" style={{ marginTop: 2 }}>{item.transliteration}</div>
              ) : null}
            </div>
          </div>
          {introEnglish ? (
            <div style={{ marginTop: 8, padding: '8px 16px', background: 'var(--color-background-secondary)', borderRadius: 12, fontSize: 13, color: 'var(--color-text-secondary)' }}>
              <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>english: </span>
              {introEnglish}
            </div>
          ) : null}
          <div className="intro-hint">Listen and look — no pressure to answer</div>
          <div className="cta-row" style={{ marginTop: 10, gap: 8 }}>
            <button
              className="btn-start"
              onClick={async () => {
                try {
                  await apiMarkSeen(sessionId, item.id);
                } catch {}
                setShowIntro(false);
              }}
            >
              start practice
            </button>
            <button
              className="btn-resume"
              onClick={async () => {
                try {
                  await apiMarkKnown(sessionId, item.id);
                  try { toast.success('Marked known'); } catch {}
                } catch {
                  toast.error('Failed to mark known');
                }
                await nextItem();
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Known
              </span>
            </button>
          </div>
        </div>
      ) : null}

      {!showIntro && (isRecognition ? (
        <>
          <div style={{ position: 'relative' }}>
            <PromptCard
              prompt={'Listen and translate to English'}
              transliteration={showFeedback ? item.transliteration : null}
              hintVisible={hintVisible}
              onToggleHint={() => dispatch({ type: 'TOGGLE_HINT' })}
              features={item.features || null}
            />
            {showLlmBadge ? (
              <span className="vocab-chip" style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(255,255,255,0.8)' }}>
                ✨ generated
              </span>
            ) : null}
          </div>

          <div className="audio-row">
            <AudioPlayButton
              playing={audio.ttsPlaying}
              onPlay={() => item && playTTS(item.target_hebrew)}
            />
            <StatusStrip dotClass={status.dotClass} active={status.dotActive} label={status.label} waveActive={false} level={0} />
          </div>

          

          <div className="editor-wrap" style={{ marginBottom: 12 }}>
            <input
              type="text"
              className="editor-textarea"
              style={{ height: 40, resize: 'none' }}
              placeholder="Type English translation..."
              value={englishInput}
              onChange={(e) => setEnglishInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && englishInput.trim()) submitAnswer(englishInput); }}
              disabled={phase === 'feedback' || phase === 'evaluating'}
              ref={englishInputRef}
              autoCorrect="off"
              autoCapitalize="sentences"
              inputMode="text"
              enterKeyHint="send"
            />
          </div>

          <div className="cta-row" style={{ marginBottom: 12, gap: 8, alignItems: 'center' }}>
            <button className="btn-start" onClick={() => submitAnswer(englishInput)} disabled={!englishInput.trim() || phase === 'feedback' || phase === 'evaluating'}>submit</button>
            <button className="qs-btn" onClick={skip}>skip</button>
            {isDev ? (
              <button className="qs-btn" onClick={() => loadItem(true)}>Force LLM</button>
            ) : null}
          </div>
        </>
      ) : isGuided ? (
        <>
          <div style={{ position: 'relative' }}>
            <PromptCard
              prompt={cleanedPrompt}
              transliteration={item.transliteration}
              hintVisible={hintVisible}
              onToggleHint={() => dispatch({ type: 'TOGGLE_HINT' })}
              features={item.features || null}
            />
            {showLlmBadge ? (
              <span className="vocab-chip" style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(255,255,255,0.8)' }}>
                ✨ generated
              </span>
            ) : null}
          </div>

          <div className="editor-wrap" style={{ marginBottom: 8 }}>
            <input
              type="text"
              className="editor-textarea"
              style={{ height: 44, resize: 'none' }}
              placeholder="Type Hebrew..."
              value={hebrewInput}
              onChange={(e) => setHebrewInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && hebrewInput.trim()) submitAnswer(hebrewInput); }}
              disabled={phase === 'feedback' || phase === 'evaluating'}
              ref={hebrewInputRef}
              autoCorrect="off"
              autoCapitalize="off"
              inputMode="none"
              enterKeyHint="send"
              dir="rtl"
            />
          </div>
          {showNativeKeyboard ? null : (
            <HebrewKeyboard onInsert={(txt) => setHebrewInput((v) => v + txt)} onBackspace={() => setHebrewInput((v) => v.slice(0, -1))} />
          )}

          {(() => {
            const pron = deriveHebPronounFromFeatures(item.features || null);
            const needsPron = pron && !hebrewInput.startsWith(pron + ' ');
            return needsPron ? (
              <div className="cta-row" style={{ marginTop: 6, gap: 8 }}>
                <button className="qs-btn" onClick={() => setHebrewInput((v) => (pron + (v ? ' ' + v : ' ')))}>
                  insert pronoun ({pron})
                </button>
              </div>
            ) : null;
          })()}

          {hints ? (
            <div className="cta-row" style={{ marginTop: 6, gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {hints.definiteness ? (
                <span className="vocab-chip">definite: add ה</span>
              ) : null}
              {hintLevel >= 1 && hints.baseForm ? (
                <span className="vocab-chip" dir="rtl">{hints.baseForm}</span>
              ) : null}
              {hintLevel >= 2 && hints.firstLetter ? (
                <span className="vocab-chip" dir="rtl">{hints.firstLetter}…</span>
              ) : null}
              {hintLevel < 2 ? (
                <button className="qs-btn" onClick={() => setHintLevel((n) => Math.min(n + 1, 2))}>
                  {hintLevel === 0 ? 'show base form' : 'show first letter'}
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="cta-row" style={{ marginTop: 8, marginBottom: 12, gap: 8, alignItems: 'center' }}>
            <button className="btn-start" onClick={() => submitAnswer(hebrewInput)} disabled={!hebrewInput.trim() || phase === 'feedback' || phase === 'evaluating'}>submit</button>
            <button className="qs-btn" onClick={skip}>skip</button>
            {isDev ? (
              <button className="qs-btn" onClick={() => loadItem(true)}>Force LLM</button>
            ) : null}
          </div>
        </>
      ) : (
        <>
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
              {showNativeKeyboard ? null : (
                <HebrewKeyboard onInsert={(ch) => dispatch({ type: 'EDIT_TRANSCRIPT', transcript: transcript + ch })} onBackspace={() => dispatch({ type: 'EDIT_TRANSCRIPT', transcript: transcript.slice(0, -1) })} />
              )}
              <div className="cta-row" style={{ marginTop: 8, gap: 8, alignItems: 'center' }}>
                <button className="btn-start" onClick={() => submitAnswer(transcript)} disabled={!transcript.trim()}>submit</button>
                <button className="btn-resume" onClick={startVoice}>record again</button>
                <button className="qs-btn" onClick={() => dispatch({ type: 'CLEAR_TRANSCRIPT' })}>clear</button>
                {isDev ? (
                  <button className="qs-btn" onClick={() => loadItem(true)}>Force LLM</button>
                ) : null}
              </div>
            </>
          ) : (
            <TranscriptPreview value={transcript} />
          )}
        </>
      ))}

      {pacingOffer && (
        <div style={{ padding: '12px 16px', marginBottom: 12, borderRadius: 12, background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
            {pacingOffer === 'end' ? 'Struggling? Want to end the session?' : "You're doing great! 5 more?"}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            {pacingOffer === 'end' ? (
              <>
                <button className="btn-start" style={{ flex: 'unset', padding: '0 20px', height: 36 }} onClick={() => { router.push(`/session/${sessionId}/summary`); }}>end session</button>
                <button className="btn-resume" style={{ flex: 'unset', padding: '0 20px', height: 36 }} onClick={() => setPacingOffer(null)}>keep going</button>
              </>
            ) : (
              <>
                <button className="btn-start" style={{ flex: 'unset', padding: '0 20px', height: 36 }} onClick={() => setPacingOffer(null)}>5 more!</button>
                <button className="btn-resume" style={{ flex: 'unset', padding: '0 20px', height: 36 }} onClick={() => { router.push(`/session/${sessionId}/summary`); }}>end session</button>
              </>
            )}
          </div>
        </div>
      )}

      {showFeedback && feedback ? (
        <>
          <FeedbackPanel grade={feedback.grade} reason={feedback.reason} correctHebrew={feedback.correct_hebrew} transliteration={item.transliteration} features={item.features || null} userTranscript={isGuided ? hebrewInput : (isRecognition ? undefined : transcript)} />
          {(!isRecognition) && (
            <div className="audio-row" style={{ justifyContent: 'center' }}>
              <AudioPlayButton
                playing={audio.ttsPlaying}
                onPlay={() => playTTS(feedback.correct_hebrew)}
              />
            </div>
          )}
          {isRecognition && (
            <div style={{ marginBottom: 12, padding: '8px 16px', background: 'var(--color-background-secondary)', borderRadius: 12, fontSize: 13, color: 'var(--color-text-secondary)' }}>
              <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>english: </span>
              {stripHowDoISay(item.english_prompt)}
            </div>
          )}
        </>
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
              override
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
            {feedback.grade !== 'correct' && (
              <button className="next-btn" onClick={handleOverride}>
                override
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
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
  if (id.startsWith('gen_vpa_') || id.startsWith('gen_vfu_')) {
    const parts = id.split('_');
    const number = parts[4] || 'na';
    const gender = parts[5] || 'na';
    if (number === 'pl') return gender === 'f' ? '👩👩' : '👨👩';
    if (gender === 'm') return '👨';
    if (gender === 'f') return '👩';
    return '';
  }
  return '';
}

function deriveEmojiFromFeatures(feat?: Record<string, string | null> | null): string {
  if (!feat) return '';
  const pos = (feat.pos || '').toLowerCase();
  // Do not show person emojis for nouns or when POS is missing
  if (!pos || pos === 'noun') return '';
  const number = feat.number || null;
  const gender = feat.gender || null;
  // We only use this when we have explicit features; otherwise we fall back to legacy heuristics.
  if (number === 'pl') return gender === 'f' ? '👩👩' : '👨👩';
  if (gender === 'm') return '👨';
  if (gender === 'f') return '👩';
  return '';
}

function deriveEmojiCue(en: string, id?: string): string {
  const fromId = id ? parseEmojiFromGeneratedId(id) : '';
  if (fromId) return fromId;
  const s = en.toLowerCase();
  const femaleCount = ((en.match(/👩/g) || []).length) + ((en.match(/🧕/g) || []).length);
  const maleCount = ((en.match(/👨/g) || []).length) + ((en.match(/🧔/g) || []).length);
  if (femaleCount >= 2 && maleCount === 0) return '👩👩';
  if (maleCount >= 1 && femaleCount >= 1) return '👨👩';
  if (femaleCount >= 1) return '👩';
  if (maleCount >= 1) return '👨';
  if (/(female\s*speaker|\(female\))/i.test(en)) return '👩';
  if (/(male\s*speaker|\(male\))/i.test(en)) return '👨';
  if (/\b(she|her)\b/.test(s)) return '👩';
  if (/\b(he|him)\b/.test(s)) return '👨';
  if (/they\s*\(f\)/.test(s) || /\bwomen\b/.test(s) || /\bgirls\b/.test(s)) return '👩👩';
  if (/they\s*\(m\)/.test(s) || /\bmen\b/.test(s) || /\bboys\b/.test(s)) return '👨👩';
  if (/\bthey\b/.test(s) || /\bwe\b/.test(s) || /\byou\b.*\b(pl|plural)\b/.test(s)) return '👨👩';
  return '';
}
