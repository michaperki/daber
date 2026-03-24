import { PrismaClient } from '@prisma/client';
import { getOpenAI } from '../Daber/lib/openai';
import fs from 'node:fs';

const prisma = new PrismaClient();

function isBareHebrew(str: string): boolean {
  const s = (str || '').trim();
  if (!s) return false;
  if (!/^[\p{Script=Hebrew}\s]+$/u.test(s)) return false;
  const tokens = s.split(/\s+/).filter(Boolean);
  return tokens.length <= 2;
}

type TagItem = { form: string; lemma: string; pos: 'verb'|'noun'|'adjective'|'phrase'|'expression'|'other'|'unknown'; confidence: number };

async function fetchUniqueForms(): Promise<string[]> {
  const items = await prisma.lessonItem.findMany({
    where: { lesson: { id: { startsWith: 'cc_' } } },
    select: { target_hebrew: true }
  });
  const unique = new Set<string>();
  for (const it of items) {
    const he = (it.target_hebrew || '').trim();
    if (isBareHebrew(he)) unique.add(he);
  }
  return Array.from(unique);
}

async function tagBatch(forms: string[]): Promise<TagItem[]> {
  const openai = getOpenAI();
  const sys = `You are a Hebrew linguistics assistant. Given a list of Hebrew forms (without nikkud), identify for each:
- lemma: the dictionary base form (if multi-word fixed expression, return the expression itself)
- pos: one of verb | noun | adjective | phrase | expression | other | unknown
- confidence: 0..1 numeric confidence
Return strict JSON: {"items": Array<{form, lemma, pos, confidence}>} with the same order as input.`;
  const user = { forms };
  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: JSON.stringify(user) }
    ]
  });
  const content = resp.choices?.[0]?.message?.content ?? '{}';
  let parsed: { items?: TagItem[] } = {};
  try { parsed = JSON.parse(content); } catch { parsed = {}; }
  const out = Array.isArray(parsed.items) ? parsed.items : [];
  // Ensure we always return the same length; fill holes if LLM dropped entries
  if (out.length !== forms.length) {
    const byForm = new Map(out.map(i => [i.form, i] as const));
    return forms.map(f => byForm.get(f) || { form: f, lemma: f, pos: 'unknown', confidence: 0.0 });
  }
  return out;
}

async function main() {
  const forms = await fetchUniqueForms();
  const chunk = Number(process.env.TAG_BATCH_SIZE || 40);
  const results: TagItem[] = [];
  for (let i = 0; i < forms.length; i += chunk) {
    const batch = forms.slice(i, i + chunk);
    // eslint-disable-next-line no-console
    console.log(`Tagging forms ${i + 1}..${Math.min(i + batch.length, forms.length)} of ${forms.length}`);
    const tags = await tagBatch(batch);
    results.push(...tags);
  }
  const out = { total_forms: forms.length, items: results };
  const outPath = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : '';
  if (outPath) fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });

