import { prisma } from '@/lib/db';

type LogEvent = {
  type: string;
  session_id?: string;
  user_id?: string;
  lesson_id?: string;
  payload?: Record<string, any>;
};

export async function logEvent(evt: LogEvent) {
  const entry = {
    ts: new Date().toISOString(),
    ...evt
  } as any;
  try {
    // Console JSON line for easy ingestion
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ level: 'info', event: entry }));
  } catch {}
  try {
    await prisma.event.create({
      data: {
        type: evt.type,
        session_id: evt.session_id ?? null,
        user_id: evt.user_id ?? null,
        lesson_id: evt.lesson_id ?? null,
        payload: evt.payload ?? null
      }
    });
  } catch (e) {
    // ignore DB log failures
  }
}

