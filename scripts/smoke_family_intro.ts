import { NextResponse } from 'next/server';
import { prisma } from '../Daber/lib/db';
import * as nextItem from '../Daber/app/api/sessions/[sessionId]/next-item/route';
import * as seen from '../Daber/app/api/sessions/[sessionId]/seen/route';

async function callNextItem(sessionId: string): Promise<any> {
  const url = `http://local/next?random=true`; // random to avoid deterministic order
  const req = new Request(url);
  const res = (await (nextItem as any).GET(req, { params: { sessionId } })) as NextResponse;
  const json = await res.json();
  return json;
}

async function callSeen(sessionId: string, lessonItemId: string): Promise<any> {
  const req = new Request('http://local/seen', { method: 'POST', body: JSON.stringify({ lessonItemId }) } as any);
  const res = (await (seen as any).POST(req, { params: { sessionId } })) as NextResponse;
  const json = await res.json();
  return json;
}

async function main() {
  // Create a fresh session limited to the כתב family items for determinism
  const subset = ['ptb01_005','ptb01_006','ptb01_007','ptb01_008'];
  const session = await prisma.session.create({ data: { lesson_id: 'present_tense_basics_01', subset_item_ids: subset as any } });
  console.log('Session:', session.id);

  // 1) First next-item → should be intro and swapped to base (ptb01_005) if family not introduced
  const first = await callNextItem(session.id);
  console.log('First pick:', first.item?.id, first.item?.target_hebrew, 'phase=', first.phase);
  // Mark seen to introduce family
  if (first.item?.id) {
    const seenRes = await callSeen(session.id, first.item.id);
    console.log('Seen marked:', seenRes?.ok === true);
  }

  // 2) Second next-item → should be recognition (not intro) for another family member
  const second = await callNextItem(session.id);
  console.log('Second pick:', second.item?.id, second.item?.target_hebrew, 'phase=', second.phase);

  // 3) Third next-item → likewise recognition/free_recall depending on item stat; since only base has ItemStat(0), others rely on FamilyStat
  const third = await callNextItem(session.id);
  console.log('Third pick:', third.item?.id, third.item?.target_hebrew, 'phase=', third.phase);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });

