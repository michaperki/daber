import { NextResponse } from 'next/server';
import { zGenerateDrillsRequest } from '../../../lib/contracts';
import { runGenerationJob } from '../../../lib/generation/pipeline';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = zGenerateDrillsRequest.safeParse(body || {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    const { userId, targets, itemsPerTarget, background } = parsed.data;

    if (background) {
      runGenerationJob({ userId, targets, itemsPerTarget }).catch(() => {});
      return NextResponse.json({ ok: true, batchId: 'background', started: true });
    }

    const { batchId, created, itemIds, raw, llmItems } = await runGenerationJob({ userId, targets, itemsPerTarget });
    const payload: any = { ok: true, batchId, created, itemIds };
    if (process.env.NODE_ENV !== 'production') {
      payload.raw = raw;
      payload.items = llmItems;
    }
    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to generate drills' }, { status: 500 });
  }
}
