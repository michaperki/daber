import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(req: Request) {
  try {
    if (process.env.ADMIN_ENABLED !== '1') {
      return NextResponse.json({ error: 'Admin disabled' }, { status: 403 });
    }
    const ct = req.headers.get('content-type') || '';
    let lessonItemId = '';
    let action = '';
    let familyId: string | null = null;
    let useLexeme = false;
    if (ct.includes('application/json')) {
      const body = await req.json();
      lessonItemId = String(body?.lessonItemId || '');
      action = String(body?.action || '');
      familyId = (body?.familyId ? String(body.familyId) : null);
      useLexeme = !!body?.useLexeme;
    } else {
      const form = await req.formData();
      lessonItemId = String(form.get('lessonItemId') || '');
      action = String(form.get('action') || '');
      const fid = form.get('familyId');
      familyId = fid ? String(fid) : null;
      useLexeme = String(form.get('useLexeme') || '') === '1';
    }
    if (!lessonItemId || !action) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    const item = await prisma.lessonItem.findUnique({ where: { id: lessonItemId }, select: { id: true, lexeme_id: true, target_hebrew: true, family_id: true } });
    if (!item) return NextResponse.json({ error: 'Lesson item not found' }, { status: 404 });

    let resolvedFamilyId = familyId && familyId.trim() ? familyId.trim() : null;
    if (!resolvedFamilyId && useLexeme && item.lexeme_id) {
      resolvedFamilyId = `lex:${item.lexeme_id}`;
    }
    if (!resolvedFamilyId && item.family_id) {
      resolvedFamilyId = item.family_id;
    }
    if (!resolvedFamilyId) {
      // Fallback: derive from target_hebrew as lemma key
      const lemma = (item.target_hebrew || '').replace(/[\u0591-\u05C7]/g, '').trim();
      if (lemma) resolvedFamilyId = `lemma:${lemma}`;
    }
    if (!resolvedFamilyId) return NextResponse.json({ error: 'Unable to resolve family id' }, { status: 400 });

    if (action === 'set_base') {
      await prisma.lessonItem.update({ where: { id: lessonItemId }, data: { family_id: resolvedFamilyId, family_base: true } });
      return NextResponse.redirect(new URL('/admin/lexicon/validate', req.url));
    }
    if (action === 'set_family') {
      await prisma.lessonItem.update({ where: { id: lessonItemId }, data: { family_id: resolvedFamilyId } });
      return NextResponse.redirect(new URL('/admin/lexicon/validate', req.url));
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 });
  }
}

