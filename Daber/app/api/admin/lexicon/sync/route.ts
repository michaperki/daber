import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const ct = req.headers.get('content-type') || '';
    let lessonItemId: string | undefined;
    let action: string | undefined;
    if (ct.includes('application/json')) {
      const body = await req.json();
      lessonItemId = body?.lessonItemId;
      action = body?.action;
    } else if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
      const form = await req.formData();
      lessonItemId = String(form.get('lessonItemId') || '');
      action = String(form.get('action') || '');
    } else {
      const body = await req.json().catch(() => ({} as any));
      lessonItemId = (body as any)?.lessonItemId;
      action = (body as any)?.action;
    }
    if (!lessonItemId || (action !== 'sync' && action !== 'unlink')) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    const item = await prisma.lessonItem.findUnique({ where: { id: lessonItemId }, select: { id: true, lexeme_id: true, features: true, target_hebrew: true } });
    if (!item) return NextResponse.json({ error: 'Lesson item not found' }, { status: 404 });
    if (action === 'unlink') {
      await prisma.lessonItem.update({ where: { id: lessonItemId }, data: { lexeme_id: null } });
      return NextResponse.json({ ok: true });
    }
    const lexemeId = (item as any).lexeme_id as string | null;
    if (!lexemeId) return NextResponse.json({ error: 'No lexeme link' }, { status: 400 });
    const pronouns = ['אני','אתה','את','הוא','היא','אנחנו','אתם','אתן','הם','הן'];
    let form = item.target_hebrew || '';
    for (const p of pronouns) {
      if (form.startsWith(p + ' ')) { form = form.slice(p.length).trim(); break; }
    }
    form = form.replace(/[\u2000-\u206F\s]+$/g, '').replace(/[!?,.;:]+$/g, '').trim();
    const infls = await prisma.inflection.findMany({ where: { lexeme_id: lexemeId }, select: { form: true, tense: true, person: true, number: true, gender: true } });
    const norm = (s: string) => s.replace(/[\u2000-\u206F]+/g, '').replace(/[!?,.;:]+/g, '').trim();
    const match = infls.find(f => norm(f.form) === norm(form)) || null;
    const infl = match;
    if (!infl) return NextResponse.json({ error: 'No matching inflection for target form' }, { status: 404 });
    await prisma.lessonItem.update({ where: { id: lessonItemId }, data: { features: { pos: (item.features as any)?.pos || 'unknown', tense: infl.tense || null, person: infl.person || null, number: infl.number || null, gender: infl.gender || null } as any } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 });
  }
}
