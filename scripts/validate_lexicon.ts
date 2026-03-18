import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PRONOUNS = ['אני','אתה','את','הוא','היא','אנחנו','אתם','אתן','הם','הן'];
function stripPronoun(s: string): string {
  for (const p of PRONOUNS) {
    if (s.startsWith(p + ' ')) return s.slice(p.length).trim();
  }
  return s;
}

async function main() {
  const items = await prisma.lessonItem.findMany({ where: { NOT: { lexeme_id: null } }, select: { id: true, english_prompt: true, target_hebrew: true, features: true, lexeme_id: true } });
  const issues: any[] = [];
  for (const it of items) {
    const lexemeId = (it as any).lexeme_id as string | null;
    if (!lexemeId) continue;
    const form = stripPronoun(it.target_hebrew || '');
    const infl = await prisma.inflection.findMany({ where: { lexeme_id: lexemeId } });
    const match = infl.find(f => f.form === form) || null;
    if (!match) {
      issues.push({ id: it.id, reason: 'missing_inflection_form', details: { expectedForm: form } });
      continue;
    }
    const f = (it.features as any) || {};
    const diffs: string[] = [];
    if (f.tense && match.tense && f.tense !== match.tense) diffs.push(`tense=${f.tense}!=${match.tense}`);
    if (f.person && match.person && f.person !== match.person) diffs.push(`person=${f.person}!=${match.person}`);
    if (f.number && match.number && f.number !== match.number) diffs.push(`number=${f.number}!=${match.number}`);
    if (f.gender && match.gender && f.gender !== match.gender) diffs.push(`gender=${f.gender}!=${match.gender}`);
    if (diffs.length) {
      issues.push({ id: it.id, reason: 'feature_mismatch', details: diffs });
    }
  }
  console.log(JSON.stringify({ issues }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });

