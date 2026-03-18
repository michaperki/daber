"use client";
import { z } from 'zod';

const ENABLE_SERVER = process.env.NEXT_PUBLIC_LOG_CLIENT_EVENTS === '1';

export type ClientLog = { type: string; payload?: Record<string, unknown>; sessionId?: string };

const schema = z.object({ type: z.string(), payload: z.any().optional(), sessionId: z.string().optional() });

export async function logClientEvent(e: ClientLog) {
  try {
    const evt = schema.parse(e);
    const ts = new Date().toISOString();
    // eslint-disable-next-line no-console
    console.debug('[DaberClient]', ts, evt.type, evt.payload || {});
    if (!ENABLE_SERVER) return;
    await fetch('/api/client-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(evt)
    }).catch(() => {});
  } catch {
    // ignore
  }
}

