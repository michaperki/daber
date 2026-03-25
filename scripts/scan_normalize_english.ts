import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{2702}-\u{27B0}]/gu;

type Rule = { name: string; apply: (s: string) => string };

const rules: Rule[] = [
  { name: 'strip_emoji', apply: (s) => s.replace(EMOJI_RE, '') },
  { name: 'strip_how_do_i_say', apply: (s) => s.replace(/^\s*how\s+do\s+i\s+say[:\s-]*/i, '').replace(/\?+\s*$/, '') },
  { name: 'normalize_punctuation', apply: (s) => s.replace(/([!?.,:;])\1+/g, '$1') },
  { name: 'drop_leading_the', apply: (s) => s.replace(/^\s*the\s+/i, '') },
  { name: 'drop_parentheticals', apply: (s) => s.replace(/\([^)]*\)/g, '') },
  { name: 'collapse_whitespace', apply: (s) => s.replace(/\s{2,}/g, ' ').trim() },
  { name: 'lowercase_first', apply: (s) => {
    if (s.length > 1 && s !== s.toUpperCase()) {
      return s.charAt(0).toLowerCase() + s.slice(1);
    }
    return s;
  }},
];

function normalize(en: string): string {
  let s = en;
  for (const rule of rules) s = rule.apply(s);
  return s;
}

function detectRules(before: string, after: string): string[] {
  const triggered: string[] = [];
  let s = before;
  for (const rule of rules) {
    const next = rule.apply(s);
    if (next !== s) triggered.push(rule.name);
    s = next;
  }
  return triggered;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const verbose = process.argv.includes('--verbose');

  const items = await prisma.lessonItem.findMany({
    select: { id: true, english_prompt: true, features: true }
  });

  const changes: Array<{ id: string; before: string; after: string; rules: string[] }> = [];
  const ruleCounts: Record<string, number> = {};

  for (const it of items) {
    const en = (it.english_prompt || '').trim();
    if (!en) continue;
    const after = normalize(en);
    if (after !== en && after.length > 0) {
      const triggered = detectRules(en, after);
      changes.push({ id: it.id, before: en, after, rules: triggered });
      for (const r of triggered) ruleCounts[r] = (ruleCounts[r] || 0) + 1;
    }
  }

  console.log(`Scanned: ${items.length} items`);
  console.log(`Changes: ${changes.length}`);
  if (Object.keys(ruleCounts).length) {
    console.log('Rules triggered:');
    for (const [rule, count] of Object.entries(ruleCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${rule}: ${count}`);
    }
  }

  if (verbose || !apply) {
    const show = verbose ? changes : changes.slice(0, 15);
    for (const c of show) {
      console.log(`\n  [${c.id}] ${c.rules.join(', ')}`);
      console.log(`    before: ${c.before}`);
      console.log(`    after:  ${c.after}`);
    }
    if (!verbose && changes.length > 15) console.log(`\n  ... and ${changes.length - 15} more (use --verbose to see all)`);
  }

  if (apply && changes.length) {
    let updated = 0;
    for (const c of changes) {
      await prisma.lessonItem.update({ where: { id: c.id }, data: { english_prompt: c.after } }).catch(() => {});
      updated++;
    }
    console.log(`\nApplied: ${updated} updates`);
  } else if (!apply && changes.length) {
    console.log('\nDry run. Use --apply to write changes.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
