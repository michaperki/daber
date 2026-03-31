import { PrismaClient } from '@prisma/client';
import { PREP_DISPLAY_MAP, VerbGovernance } from '../Daber/lib/types/governance';

const prisma = new PrismaClient();

type Entry = { lemma: string; gov: VerbGovernance };

const DATA: Entry[] = [
  {
    lemma: 'לאהוב',
    gov: {
      transitivity: 'transitive',
      frames: [
        { prep: 'et', role: 'do', frame_he: 'לאהוב את ___', sense_en: 'to love (someone/something)' },
      ],
    },
  },
  {
    lemma: 'לכתוב',
    gov: {
      transitivity: 'both',
      frames: [
        { prep: 'et', role: 'do', frame_he: 'לכתוב את ___', sense_en: 'write (the letter)' },
        { prep: 'l', role: 'io', frame_he: 'לכתוב ל___', sense_en: 'write to (someone)' },
      ],
    },
  },
  {
    lemma: 'לחשוב',
    gov: {
      transitivity: 'intransitive',
      frames: [
        { prep: 'al', role: 'comp', frame_he: 'לחשוב על ___', sense_en: 'think about' },
      ],
    },
  },
  {
    lemma: 'לטפל',
    gov: {
      transitivity: 'intransitive',
      frames: [
        { prep: 'b', role: 'comp', frame_he: 'לטפל ב___', sense_en: 'take care of / treat' },
      ],
    },
  },
  {
    lemma: 'לחכות',
    gov: {
      transitivity: 'intransitive',
      frames: [
        { prep: 'l', role: 'comp', frame_he: 'לחכות ל___', sense_en: 'wait for' },
      ],
    },
  },
  {
    lemma: 'לדבר',
    gov: {
      transitivity: 'intransitive',
      frames: [
        { prep: 'im', role: 'comp', frame_he: 'לדבר עם ___', sense_en: 'talk with' },
        { prep: 'al', role: 'comp', frame_he: 'לדבר על ___', sense_en: 'talk about' },
      ],
    },
  },
  {
    lemma: 'להתקשר',
    gov: {
      transitivity: 'intransitive',
      frames: [
        { prep: 'el', role: 'comp', frame_he: 'להתקשר אל ___', sense_en: 'call (to)' },
        { prep: 'l', role: 'comp', frame_he: 'להתקשר ל___', sense_en: 'call (to)' },
      ],
      notes: 'Modern usage strongly prefers ל over אל in speech.',
    },
  },
  {
    lemma: 'להקשיב',
    gov: {
      transitivity: 'intransitive',
      frames: [
        { prep: 'l', role: 'comp', frame_he: 'להקשיב ל___', sense_en: 'listen to' },
      ],
    },
  },
  {
    lemma: 'לצעוק',
    gov: {
      transitivity: 'intransitive',
      frames: [
        { prep: 'al', role: 'comp', frame_he: 'לצעוק על ___', sense_en: 'shout at' },
      ],
    },
  },
  {
    lemma: 'לרוץ',
    gov: {
      transitivity: 'intransitive',
      frames: [
        { prep: 'none', role: 'comp', frame_he: 'לרוץ', sense_en: 'run' },
      ],
    },
  },
];

async function main() {
  let updated = 0;
  const missing: string[] = [];
  for (const { lemma, gov } of DATA) {
    const hit = await prisma.lexeme.findFirst({ where: { lemma, pos: { in: ['verb', 'Q24905'] } }, select: { id: true, lemma: true } });
    if (!hit) {
      missing.push(lemma);
      continue;
    }
    await prisma.lexeme.update({ where: { id: hit.id }, data: { verb_governance: gov as any } });
    updated += 1;
    const display = gov.frames?.[0]?.prep && (gov.frames[0].prep !== 'none') ? ` (${PREP_DISPLAY_MAP[gov.frames[0].prep as keyof typeof PREP_DISPLAY_MAP] || ''})` : '';
    console.log(`Updated ${hit.id} ${hit.lemma}${display}`);
  }
  if (missing.length) {
    console.log(`Not found (${missing.length}): ${missing.join(', ')}`);
  }
  console.log(`Done. Updated ${updated} lexemes.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
