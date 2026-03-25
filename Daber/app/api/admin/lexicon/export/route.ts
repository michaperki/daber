import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

function stripHebPronoun(s: string): string {
  const pronouns = ['אני','אתה','את','הוא','היא','אנחנו','אתם','אתן','הם','הן'];
  let out = s;
  for (const p of pronouns) {
    if (out.startsWith(p + ' ')) { out = out.slice(p.length).trim(); break; }
  }
  return out.replace(/[\u2000-\u206F\s]+$/g, '').replace(/[!?,.;:]+$/g, '').trim();
}

function normalizeFormForMatch(s: string): string {
  return stripHebPronoun(s).replace(/[\u2000-\u206F]+/g, '').replace(/[!?,.;:]+/g, '').trim();
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const scope = url.searchParams.get('scope') || 'mismatches'; // 'mismatches' | 'all'
    const lessonId = url.searchParams.get('lessonId') || undefined;

    const items = await prisma.lessonItem.findMany({
      where: { NOT: { lexeme_id: null }, ...(lessonId ? { lesson_id: lessonId } : {}) },
      select: { id: true, lesson_id: true, english_prompt: true, target_hebrew: true, features: true, lexeme_id: true, lexeme: { select: { lemma: true } } }
    });
    const out: any[] = [];
    for (const it of items) {
      const lexemeId = (it as any).lexeme_id as string | null;
      const lemma = (it as any).lexeme?.lemma || null;
      if (!lexemeId) continue;
      const form = stripHebPronoun(it.target_hebrew || '');
      const infls = await prisma.inflection.findMany({ where: { lexeme_id: lexemeId }, select: { form: true, tense: true, person: true, number: true, gender: true } });
      const normItem = normalizeFormForMatch(it.target_hebrew || '');
      const match = infls.find((f: { form: string; tense?: string | null; person?: string | null; number?: string | null; gender?: string | null }) => normalizeFormForMatch(f.form) === normItem) || null;
      const f = (it.features as any) || {};
      const diffs: string[] = [];
      if (match) {
        if (f.tense && match.tense && f.tense !== match.tense) diffs.push(`tense=${f.tense}!=${match.tense}`);
        if (f.person && match.person && f.person !== match.person) diffs.push(`person=${f.person}!=${match.person}`);
        if (f.number && match.number && f.number !== match.number) diffs.push(`number=${f.number}!=${match.number}`);
        if (f.gender && match.gender && f.gender !== match.gender) diffs.push(`gender=${f.gender}!=${match.gender}`);
      }
      const issue = !match ? 'missing_inflection_form' : (diffs.length ? 'feature_mismatch' : null);
      if (scope === 'all' || issue) {
        out.push({
          lessonItemId: it.id,
          lessonId: it.lesson_id,
          lexemeId,
          lemma,
          english: it.english_prompt,
          target: it.target_hebrew,
          target_stripped: form,
          features: it.features,
          matchedInflection: match,
          issue,
          details: diffs
        });
      }
    }
    return NextResponse.json({ items: out, count: out.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to export' }, { status: 500 });
  }
}
