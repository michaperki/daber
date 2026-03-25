"use client";
import { z } from 'zod';
import {
  zCreateSessionResponse,
  zNextItemResponse,
  zAttemptResponse,
  zSummaryResponse,
  zSTTResponse,
  zOkResponse
} from '@/lib/contracts';

async function json<T>(res: Response, schema: z.ZodType<T>): Promise<T> {
  const data = await res.json();
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error('Invalid response');
  }
  return parsed.data;
}

export async function apiCreateSession(lessonId: string, userId?: string, subset?: string[]) {
  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lessonId, userId, subset })
  });
  if (!res.ok) throw new Error('Failed to create session');
  return json(res, zCreateSessionResponse);
}

export async function apiNextItem(sessionId: string, opts?: { random?: boolean; mode?: 'lex'|'db'; focus?: 'weak'; due?: 'feature'|'item'|'blend'; pacing?: 'fixed'|'adaptive' }) {
  const params = new URLSearchParams();
  if (opts?.random) params.set('random', '1');
  if (opts?.mode === 'lex') params.set('mode', 'lex');
  if (opts?.focus === 'weak') params.set('focus', 'weak');
  if (opts?.due) params.set('due', opts.due);
  if (opts?.pacing === 'adaptive') params.set('pacing', 'adaptive');
  const q = params.toString();
  const res = await fetch(`/api/sessions/${sessionId}/next-item${q ? `?${q}` : ''}`);
  if (!res.ok) throw new Error('Failed to fetch next item');
  return json(res, zNextItemResponse);
}

export async function apiAttempt(sessionId: string, lessonItemId: string, rawTranscript: string, direction?: 'en_to_he' | 'he_to_en', phase?: 'intro' | 'recognition' | 'guided' | 'free_recall') {
  const res = await fetch('/api/attempts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, lessonItemId, rawTranscript, direction: direction || undefined, phase: phase || undefined })
  });
  if (!res.ok) throw new Error('Failed to submit attempt');
  return json(res, zAttemptResponse);
}

export async function apiSummary(sessionId: string) {
  const res = await fetch(`/api/sessions/${sessionId}/summary`);
  if (!res.ok) throw new Error('Failed to load summary');
  return json(res, zSummaryResponse);
}

export async function apiSTTFromBlob(audio: Blob) {
  const fd = new FormData();
  fd.append('audio', audio, 'speech.webm');
  const res = await fetch('/api/stt', { method: 'POST', body: fd });
  if (!res.ok) throw new Error('STT failed');
  return json(res, zSTTResponse);
}

export async function apiTTS(text: string, voice?: string): Promise<Blob> {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice })
  });
  if (!res.ok) throw new Error('TTS failed');
  return res.blob();
}

export async function apiOverrideAttempt(sessionId: string, lessonItemId: string) {
  const res = await fetch('/api/attempts/override', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, lessonItemId })
  });
  if (!res.ok) throw new Error('Failed to override attempt');
  return json(res, zAttemptResponse);
}

export async function apiMarkSeen(sessionId: string, lessonItemId: string) {
  const res = await fetch(`/api/sessions/${sessionId}/seen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lessonItemId })
  });
  if (!res.ok) throw new Error('Failed to record intro seen');
  return json(res, zOkResponse);
}

export async function apiMarkKnown(sessionId: string, lessonItemId: string) {
  const res = await fetch(`/api/sessions/${sessionId}/known`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lessonItemId })
  });
  if (!res.ok) throw new Error('Failed to mark known');
  return json(res, zOkResponse);
}
