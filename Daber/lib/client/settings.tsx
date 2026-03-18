"use client";
import React from 'react';

export type Settings = {
  showTransliteration: boolean;
  stayOnFlawed: boolean;
  speakPrompt: boolean;
  manualAdvance: boolean;
  randomOrder: boolean;
  useLexiconDrills: boolean;
  reviewBeforeSubmit: boolean;
  targetWeakness: boolean;
  autoResumeListening: boolean;
  ttsRate: number;
  browserTTSFallback: boolean;
  uiSoundEffects: boolean;
  dueMode: 'off' | 'feature' | 'item' | 'blend';
  micDeviceId: string;
  micSensitivity: number;
  micSilenceMs: number;
  setShowTransliteration: (v: boolean) => void;
  setStayOnFlawed: (v: boolean) => void;
  setSpeakPrompt: (v: boolean) => void;
  setManualAdvance: (v: boolean) => void;
  setRandomOrder: (v: boolean) => void;
  setUseLexiconDrills: (v: boolean) => void;
  setReviewBeforeSubmit: (v: boolean) => void;
  setTargetWeakness: (v: boolean) => void;
  setAutoResumeListening: (v: boolean) => void;
  setTtsRate: (v: number) => void;
  setBrowserTTSFallback: (v: boolean) => void;
  setUiSoundEffects: (v: boolean) => void;
  setDueMode: (v: 'off'|'feature'|'item'|'blend') => void;
  setMicDeviceId: (v: string) => void;
  setMicSensitivity: (v: number) => void;
  setMicSilenceMs: (v: number) => void;
};

const Ctx = React.createContext<Settings | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [showTransliteration, setShowTransliteration] = React.useState(false);
  const [stayOnFlawed, setStayOnFlawed] = React.useState(false);
  const [speakPrompt, setSpeakPrompt] = React.useState(false);
  const [manualAdvance, setManualAdvance] = React.useState(true);
  const [randomOrder, setRandomOrder] = React.useState(true);
  const [useLexiconDrills, setUseLexiconDrills] = React.useState(false);
  const [reviewBeforeSubmit, setReviewBeforeSubmit] = React.useState(true);
  const [targetWeakness, setTargetWeakness] = React.useState(true);
  const [autoResumeListening, setAutoResumeListening] = React.useState(false);
  const [ttsRate, setTtsRate] = React.useState<number>(1);
  const [browserTTSFallback, setBrowserTTSFallback] = React.useState(false);
  const [uiSoundEffects, setUiSoundEffects] = React.useState(true);
  const [dueMode, setDueMode] = React.useState<'off'|'feature'|'item'|'blend'>('off');
  const [micDeviceId, setMicDeviceId] = React.useState<string>('');
  const [micSensitivity, setMicSensitivity] = React.useState<number>(0.035);
  const [micSilenceMs, setMicSilenceMs] = React.useState<number>(900);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem('daber.settings');
      if (raw) {
        const obj = JSON.parse(raw) as Partial<{ showTransliteration: boolean; stayOnFlawed: boolean; speakPrompt: boolean; manualAdvance: boolean; randomOrder: boolean; useLexiconDrills: boolean; reviewBeforeSubmit: boolean; targetWeakness: boolean; autoResumeListening: boolean; ttsRate: number; browserTTSFallback: boolean; uiSoundEffects: boolean; dueMode: 'off'|'feature'|'item'|'blend'; micDeviceId: string; micSensitivity: number; micSilenceMs: number }>;
        if (typeof obj.showTransliteration === 'boolean') setShowTransliteration(obj.showTransliteration);
        if (typeof obj.stayOnFlawed === 'boolean') setStayOnFlawed(obj.stayOnFlawed);
        if (typeof obj.speakPrompt === 'boolean') setSpeakPrompt(obj.speakPrompt);
        if (typeof obj.manualAdvance === 'boolean') setManualAdvance(obj.manualAdvance);
        if (typeof obj.randomOrder === 'boolean') setRandomOrder(obj.randomOrder);
        if (typeof obj.useLexiconDrills === 'boolean') setUseLexiconDrills(obj.useLexiconDrills);
        if (typeof obj.reviewBeforeSubmit === 'boolean') setReviewBeforeSubmit(obj.reviewBeforeSubmit);
        if (typeof obj.targetWeakness === 'boolean') setTargetWeakness(obj.targetWeakness);
        if (typeof obj.autoResumeListening === 'boolean') setAutoResumeListening(obj.autoResumeListening);
        if (typeof obj.ttsRate === 'number') setTtsRate(obj.ttsRate);
        if (typeof obj.browserTTSFallback === 'boolean') setBrowserTTSFallback(obj.browserTTSFallback);
        if (typeof obj.uiSoundEffects === 'boolean') setUiSoundEffects(obj.uiSoundEffects);
        if (obj.dueMode === 'feature' || obj.dueMode === 'item' || obj.dueMode === 'off' || obj.dueMode === 'blend') setDueMode(obj.dueMode);
        if (typeof obj.micDeviceId === 'string') setMicDeviceId(obj.micDeviceId);
        if (typeof obj.micSensitivity === 'number') setMicSensitivity(obj.micSensitivity);
        if (typeof obj.micSilenceMs === 'number') setMicSilenceMs(obj.micSilenceMs);
      }
    } catch {}
  }, []);

  React.useEffect(() => {
    try {
      localStorage.setItem('daber.settings', JSON.stringify({ showTransliteration, stayOnFlawed, speakPrompt, manualAdvance, randomOrder, useLexiconDrills, reviewBeforeSubmit, targetWeakness, autoResumeListening, ttsRate, browserTTSFallback, uiSoundEffects, dueMode, micDeviceId, micSensitivity, micSilenceMs }));
    } catch {}
  }, [showTransliteration, stayOnFlawed, speakPrompt, manualAdvance, randomOrder, useLexiconDrills, reviewBeforeSubmit, targetWeakness, autoResumeListening, ttsRate, browserTTSFallback, uiSoundEffects, dueMode, micDeviceId, micSensitivity, micSilenceMs]);

  const value: Settings = React.useMemo(
    () => ({ showTransliteration, stayOnFlawed, speakPrompt, manualAdvance, randomOrder, useLexiconDrills, reviewBeforeSubmit, targetWeakness, autoResumeListening, ttsRate, browserTTSFallback, uiSoundEffects, dueMode, micDeviceId, micSensitivity, micSilenceMs, setShowTransliteration, setStayOnFlawed, setSpeakPrompt, setManualAdvance, setRandomOrder, setUseLexiconDrills, setReviewBeforeSubmit, setTargetWeakness, setAutoResumeListening, setTtsRate, setBrowserTTSFallback, setUiSoundEffects, setDueMode, setMicDeviceId, setMicSensitivity, setMicSilenceMs }),
    [showTransliteration, stayOnFlawed, speakPrompt, manualAdvance, randomOrder, useLexiconDrills, reviewBeforeSubmit, targetWeakness, autoResumeListening, ttsRate, browserTTSFallback, uiSoundEffects, dueMode, micDeviceId, micSensitivity, micSilenceMs]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): Settings {
  const v = React.useContext(Ctx);
  if (!v) throw new Error('useSettings must be used within SettingsProvider');
  return v;
}
