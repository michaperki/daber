import { NextResponse } from 'next/server';
import { getOpenAI } from '@/lib/openai';
import { toFile } from 'openai/uploads';
import { logEvent } from '@/lib/log';
import { rateLimitGuard } from '@/lib/rateLimit';
// text passthrough removed; only audio is accepted

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const start = Date.now();
    const perMin = Number.parseInt(process.env.RL_STT_PER_MIN || '', 10) || 20;
    const limited = rateLimitGuard(req, 'stt', perMin);
    if (limited) return limited;
    const contentType = req.headers.get('content-type') || '';
    const openai = getOpenAI();

    if (contentType.includes('application/json')) {
      return NextResponse.json({ error: 'Unsupported content type' }, { status: 415 });
    }

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const audio = form.get('audio');
      if (!audio || !(audio instanceof Blob)) {
        return NextResponse.json({ error: 'audio field missing' }, { status: 400 });
      }
      const file = await toFile(audio as Blob, 'speech.webm');
      const trx = await openai.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        language: 'he'
      });
      const transcript = (trx as any).text ?? '';
      logEvent({ type: 'stt_transcribed', payload: { source: 'multipart', length: transcript.length, duration_ms: Date.now() - start } });
      return NextResponse.json({ transcript, confidence: 0.85 });
    }

    const arrayBuf = await req.arrayBuffer();
    if (arrayBuf && arrayBuf.byteLength > 0) {
      const blob = new Blob([arrayBuf], { type: 'audio/webm' });
      const file = await toFile(blob, 'speech.webm');
      const trx = await openai.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        language: 'he'
      });
      const transcript = (trx as any).text ?? '';
      logEvent({ type: 'stt_transcribed', payload: { source: 'raw', length: transcript.length, duration_ms: Date.now() - start } });
      return NextResponse.json({ transcript, confidence: 0.85 });
    }

    return NextResponse.json({ error: 'Unsupported content type' }, { status: 415 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'STT failed' }, { status: 500 });
  }
}
