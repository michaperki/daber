import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type GenderInfo = {
  gender?: 'masculine' | 'feminine' | 'masculine/feminine';
  number?: 'plural';
};

function parseMarker(marker: string): GenderInfo | null {
  const m = marker.replace(/[()]/g, '').trim();
  const info: GenderInfo = {};

  if (/^ז$/.test(m)) return { gender: 'masculine' };
  if (/^נ$/.test(m)) return { gender: 'feminine' };
  if (/^ז\s*,\s*נ$|^נ\s*,\s*ז$/.test(m)) return { gender: 'masculine/feminine' };

  const parts = m.split(/\s*,\s*/);
  for (const p of parts) {
    if (p === 'ז') info.gender = 'masculine';
    else if (p === 'נ') info.gender = 'feminine';
    else if (p === 'רבים' || p === 'ר') info.number = 'plural';
  }

  return Object.keys(info).length > 0 ? info : null;
}

function cleanTargetHebrew(raw: string): { cleaned: string; genderInfo: GenderInfo | null } {
  let text = raw;
  let genderInfo: GenderInfo | null = null;

  // Handle multi-line: keep only the first line
  if (text.includes('\n')) {
    text = text.split('\n')[0];
  }
  // Handle \r
  text = text.replace(/\r/g, '');

  // Extract parenthetical gender/number markers: (ז), (נ), (רבים, ז), etc.
  const markerRe = /\s*\(((?:ז|נ|רבים|ר)(?:\s*,\s*(?:ז|נ|רבים|ר))*)\)\s*/g;
  let match;
  while ((match = markerRe.exec(text)) !== null) {
    const parsed = parseMarker(match[1]);
    if (parsed) {
      genderInfo = { ...genderInfo, ...parsed };
    }
  }
  text = text.replace(markerRe, '').trim();

  // Handle comma-separated forms like "טיסה, טיסות" — keep only the first form
  // Only do this if the marker was found (meaning this is a vocab entry, not a sentence)
  if (genderInfo && text.includes(',')) {
    const first = text.split(',')[0].trim();
    if (first) text = first;
  }

  return { cleaned: text, genderInfo };
}

async function main() {
  // Fetch all items with parenthetical markers
  const items = await prisma.lessonItem.findMany({
    where: {
      target_hebrew: { contains: '(' },
      lesson_id: { startsWith: 'cc_' },
    },
    select: { id: true, target_hebrew: true, features: true },
  });

  console.log(`Found ${items.length} items with parentheticals in cc_* lessons`);

  // Filter to only gender/number markers
  const genderMarkerRe = /\(((?:ז|נ|רבים|ר)(?:\s*,\s*(?:ז|נ|רבים|ר))*)\)/;
  const toUpdate = items.filter(i => genderMarkerRe.test(i.target_hebrew));
  console.log(`${toUpdate.length} items have gender/number markers to clean\n`);

  let updated = 0;
  let skipped = 0;

  for (const item of toUpdate) {
    const { cleaned, genderInfo } = cleanTargetHebrew(item.target_hebrew);

    if (cleaned === item.target_hebrew && !genderInfo) {
      skipped++;
      continue;
    }

    const existingFeatures = (item.features as Record<string, unknown>) || {};
    const newFeatures = {
      ...existingFeatures,
      ...(genderInfo?.gender ? { gender: genderInfo.gender } : {}),
      ...(genderInfo?.number ? { number: genderInfo.number } : {}),
    };

    if (updated < 10) {
      console.log(`  ${item.id}: "${item.target_hebrew}" → "${cleaned}" ${JSON.stringify(genderInfo)}`);
    }

    await prisma.lessonItem.update({
      where: { id: item.id },
      data: {
        target_hebrew: cleaned,
        features: newFeatures as any,
      },
    });

    updated++;
  }

  if (updated > 10) console.log(`  ... and ${updated - 10} more`);
  console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
