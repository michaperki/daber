import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

type TagItem = { form: string; lemma: string; pos: string; confidence: number };

const prisma = new PrismaClient();

function readTags(filePath: string): { total_forms: number; items: TagItem[] } {
  const raw = fs.readFileSync(filePath, 'utf8');
  const json = JSON.parse(raw);
  if (!json || !Array.isArray(json.items)) throw new Error('Invalid tags file: missing items');
  return json as { total_forms: number; items: TagItem[] };
}

async function main() {
  const outArgIdx = process.argv.indexOf('--in');
  const inPath = outArgIdx > -1 ? process.argv[outArgIdx + 1] : 'cc_family_tags.json';
  const file = path.isAbsolute(inPath) ? inPath : path.join(process.cwd(), inPath);
  if (!fs.existsSync(file)) throw new Error(`Tags file not found: ${file}`);

  const tags = readTags(file);
  const minIdx = process.argv.indexOf('--min');
  const min = minIdx > -1 ? Number(process.argv[minIdx + 1]) : 0.8;
  const updates: Array<{ form: string; lemma: string; pos: string; updated: number }> = [];
  let totalUpdated = 0;
  for (const t of tags.items) {
    if (typeof t.confidence !== 'number' || t.confidence < min) continue;
    const form = (t.form || '').trim();
    const lemma = (t.lemma || '').trim();
    const pos = (t.pos || '').trim().toLowerCase();
    if (!form || !lemma) continue;
    // Only link when POS is one of our core categories to avoid cross-POS contamination
    if (!['verb','noun','adjective'].includes(pos)) continue;
    const fam = `lemma:${lemma}|pos:${pos}`;
    const res = await prisma.lessonItem.updateMany({
      where: { lesson: { id: { startsWith: 'cc_' } }, target_hebrew: form, family_id: null },
      data: { family_id: fam, family_base: form === lemma }
    });
    if (res.count > 0) {
      updates.push({ form, lemma, pos, updated: res.count });
      totalUpdated += res.count;
    }
  }
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ total_updated: totalUpdated, changed_pairs: updates.length, min_confidence: min }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
