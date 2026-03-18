import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logEvent } from '@/lib/log';

const zClientLog = z.object({ type: z.string(), payload: z.any().optional(), sessionId: z.string().optional() });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = zClientLog.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    const { type, payload, sessionId } = parsed.data;
    await logEvent({ type: `client_${type}`, session_id: sessionId, payload: payload || undefined });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to log client event' }, { status: 500 });
  }
}

