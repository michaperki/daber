"use client";
import React from 'react';

export type Settings = {
  showTransliteration: boolean;
  stayOnFlawed: boolean;
  speakPrompt: boolean;
  manualAdvance: boolean;
  useLexiconDrills: boolean;
  ttsRate: number;
  uiSoundEffects: boolean;
  micDeviceId: string;
  micSensitivity: number;
  micSilenceMs: number;
  setShowTransliteration: (v: boolean) => void;
  setStayOnFlawed: (v: boolean) => void;
  setSpeakPrompt: (v: boolean) => void;
  setManualAdvance: (v: boolean) => void;
  setUseLexiconDrills: (v: boolean) => void;
  setTtsRate: (v: number) => void;
  setUiSoundEffects: (v: boolean) => void;
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
  const [useLexiconDrills, setUseLexiconDrills] = React.useState(false);
  const [ttsRate, setTtsRate] = React.useState<number>(1);
  const [uiSoundEffects, setUiSoundEffects] = React.useState(true);
  const [micDeviceId, setMicDeviceId] = React.useState<string>('');
  const [micSensitivity, setMicSensitivity] = React.useState<number>(0.035);
  const [micSilenceMs, setMicSilenceMs] = React.useState<number>(900);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem('daber.settings');
      if (raw) {
        const obj = JSON.parse(raw) as Partial<{ showTransliteration: boolean; stayOnFlawed: boolean; speakPrompt: boolean; manualAdvance: boolean; useLexiconDrills: boolean; ttsRate: number; uiSoundEffects: boolean; micDeviceId: string; micSensitivity: number; micSilenceMs: number }>;
        if (typeof obj.showTransliteration === 'boolean') setShowTransliteration(obj.showTransliteration);
        if (typeof obj.stayOnFlawed === 'boolean') setStayOnFlawed(obj.stayOnFlawed);
        if (typeof obj.speakPrompt === 'boolean') setSpeakPrompt(obj.speakPrompt);
        if (typeof obj.manualAdvance === 'boolean') setManualAdvance(obj.manualAdvance);
        if (typeof obj.useLexiconDrills === 'boolean') setUseLexiconDrills(obj.useLexiconDrills);
        if (typeof obj.ttsRate === 'number') setTtsRate(obj.ttsRate);
        if (typeof obj.uiSoundEffects === 'boolean') setUiSoundEffects(obj.uiSoundEffects);
        if (typeof obj.micDeviceId === 'string') setMicDeviceId(obj.micDeviceId);
        if (typeof obj.micSensitivity === 'number') setMicSensitivity(obj.micSensitivity);
        if (typeof obj.micSilenceMs === 'number') setMicSilenceMs(obj.micSilenceMs);
      }
    } catch {}
  }, []);

  React.useEffect(() => {
    try {
      localStorage.setItem('daber.settings', JSON.stringify({ showTransliteration, stayOnFlawed, speakPrompt, manualAdvance, useLexiconDrills, ttsRate, uiSoundEffects, micDeviceId, micSensitivity, micSilenceMs }));
    } catch {}
  }, [showTransliteration, stayOnFlawed, speakPrompt, manualAdvance, useLexiconDrills, ttsRate, uiSoundEffects, micDeviceId, micSensitivity, micSilenceMs]);

  const value: Settings = React.useMemo(
    () => ({ showTransliteration, stayOnFlawed, speakPrompt, manualAdvance, useLexiconDrills, ttsRate, uiSoundEffects, micDeviceId, micSensitivity, micSilenceMs, setShowTransliteration, setStayOnFlawed, setSpeakPrompt, setManualAdvance, setUseLexiconDrills, setTtsRate, setUiSoundEffects, setMicDeviceId, setMicSensitivity, setMicSilenceMs }),
    [showTransliteration, stayOnFlawed, speakPrompt, manualAdvance, useLexiconDrills, ttsRate, uiSoundEffects, micDeviceId, micSensitivity, micSilenceMs]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): Settings {
  const v = React.useContext(Ctx);
  if (!v) throw new Error('useSettings must be used within SettingsProvider');
  return v;
}
