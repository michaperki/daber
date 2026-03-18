"use client";
import React from 'react';

export type Toast = { id: string; kind?: 'info'|'success'|'error'; message: string; ttlMs?: number };

type Ctx = {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
  info: (message: string, ttlMs?: number) => void;
  success: (message: string, ttlMs?: number) => void;
  error: (message: string, ttlMs?: number) => void;
};

const Ctx = React.createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const timers = React.useRef<Map<string, number>>(new Map());

  const dismiss = React.useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const tm = timers.current.get(id);
    if (tm) { window.clearTimeout(tm); timers.current.delete(id); }
  }, []);

  const schedule = React.useCallback((id: string, ttlMs: number) => {
    const tm = window.setTimeout(() => dismiss(id), ttlMs);
    timers.current.set(id, tm);
  }, [dismiss]);

  const push = React.useCallback((t: Omit<Toast, 'id'>) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const ttl = typeof t.ttlMs === 'number' ? t.ttlMs : 3000;
    const item: Toast = { id, kind: t.kind || 'info', message: t.message, ttlMs: ttl };
    setToasts(prev => [...prev, item]);
    schedule(id, ttl);
  }, [schedule]);

  const info = React.useCallback((message: string, ttlMs?: number) => push({ kind: 'info', message, ttlMs }), [push]);
  const success = React.useCallback((message: string, ttlMs?: number) => push({ kind: 'success', message, ttlMs }), [push]);
  const error = React.useCallback((message: string, ttlMs?: number) => push({ kind: 'error', message, ttlMs }), [push]);

  const value = React.useMemo(() => ({ toasts, push, dismiss, info, success, error }), [toasts, push, dismiss, info, success, error]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <ToastViewport />
    </Ctx.Provider>
  );
}

export function useToast(): Ctx {
  const v = React.useContext(Ctx);
  if (!v) throw new Error('useToast must be used within ToastProvider');
  return v;
}

export function ToastViewport() {
  const ctx = React.useContext(Ctx);
  if (!ctx) return null;
  return (
    <div className="toast-container">
      {ctx.toasts.map(t => (
        <div key={t.id} className={`toast ${t.kind || 'info'}`}>
          <span className="toast-msg">{t.message}</span>
          <button className="toast-x" onClick={() => ctx.dismiss(t.id)} title="dismiss">✕</button>
        </div>
      ))}
    </div>
  );
}

