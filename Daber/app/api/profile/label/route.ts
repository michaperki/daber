import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { logEvent } from '@/lib/log';

const zLabelBody = z.object({ label: z.string().max(60) });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = zLabelBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    const raw = parsed.data.label ?? '';
    const label = (raw || '').trim();
    const uid = cookies().get('daber.uid')?.value || 'anon';

    await logEvent({ type: 'user_label', user_id: uid, payload: { label } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to save label' }, { status: 500 });
  }
}

