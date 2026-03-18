import { NextResponse } from 'next/server';
import { getOpenAI } from '@/lib/openai';
import { logEvent } from '@/lib/log';
import { rateLimitGuard } from '@/lib/rateLimit';
import { zTTSRequest } from '@/lib/contracts';

// Simple in-process LRU cache for TTS audio buffers
type Entry = { key: string; buf: Buffer; size: number };
const CACHE_MAX_ENTRIES = 100;
const CACHE_MAX_BYTES = 20 * 1024 * 1024; // 20MB
const cacheMap: Map<string, Entry> = new Map();
let cacheBytes = 0;

function cacheGet(key: string): Buffer | null {
  const e = cacheMap.get(key);
  if (!e) return null;
  // refresh LRU order
  cacheMap.delete(key);
  cacheMap.set(key, e);
  return e.buf;
}

function cacheSet(key: string, buf: Buffer) {
  const size = buf.length || 0;
  const existing = cacheMap.get(key);
  if (existing) {
    cacheBytes -= existing.size;
    cacheMap.delete(key);
  }
  cacheMap.set(key, { key, buf, size });
  cacheBytes += size;
  // Evict oldest until within limits
  while ((cacheMap.size > CACHE_MAX_ENTRIES) || (cacheBytes > CACHE_MAX_BYTES)) {
    const oldestKey = cacheMap.keys().next().value as string | undefined;
    if (!oldestKey) break;
    const oldest = cacheMap.get(oldestKey);
    if (oldest) cacheBytes -= oldest.size;
    cacheMap.delete(oldestKey);
  }
}

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const start = Date.now();
    const perMin = Number.parseInt(process.env.RL_TTS_PER_MIN || '', 10) || 40;
    const limited = rateLimitGuard(req, 'tts', perMin);
    if (limited) return limited;
    const body = await req.json();
    const parsed = zTTSRequest.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    const { text, voice } = parsed.data;
    const v = voice || 'alloy';
    const key = `v:${v};t:${text}`;
    let buf = cacheGet(key);
    if (!buf) {
      const openai = getOpenAI();
      const resp = await openai.audio.speech.create({
        model: 'gpt-4o-mini-tts',
        voice: v,
        input: text
      });
      buf = Buffer.from(await resp.arrayBuffer());
      cacheSet(key, buf);
      logEvent({ type: 'tts_generated', payload: { length: text.length, duration_ms: Date.now() - start } });
    } else {
      logEvent({ type: 'tts_cache_hit', payload: { length: text.length, duration_ms: Date.now() - start } });
    }
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(buf.length)
      }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'TTS failed' }, { status: 500 });
  }
}
