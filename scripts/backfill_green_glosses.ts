/**
 * One-time script to backfill `gloss` on all 82 Green lexemes.
 * Run: npx ts-node --compiler-options '{"module":"commonjs","strict":false}' scripts/backfill_green_glosses.ts
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const GLOSSES: Record<string, string> = {
  // ── Verbs (Q24905) ──
  'wd:L184903':  'to go, to walk',
  'wd:L204394':  'to love',
  'wd:L204454':  'to be delayed',
  'wd:L204729':  'to unite',
  'wd:L204735':  'to be late',
  'wd:L206575':  'to speak, to talk',
  'wd:L208125':  'to bring in, to insert',
  'wd:L208128':  'to turn gray',
  'wd:L208354':  'to scratch',
  'wd:L208445':  'to pass, to transfer',
  'wd:L208663':  'to suggest, to offer',
  'wd:L208804':  'to wake up',
  'wd:L208859':  'to increase, to multiply',
  'wd:L208927':  'to make noise',
  'wd:L209077':  'to try, to make an effort',
  'wd:L209176':  'to improve',
  'wd:L209673':  'to hesitate, to deliberate',
  'wd:L209908':  'to wake up',
  'wd:L210431':  'to invite, to summon',
  'wd:L210829':  'to wait',
  'wd:L212065':  'to finish, to complete',
  'wd:L213196':  'to realize, to fulfill',
  'wd:L214893':  'to open',
  'wd:L215099':  'to get burned',
  'wd:L216859':  'to develop',
  'wd:L218449':  'to read, to call',
  'wd:L219549':  'to make happy',

  // ── Adjectives (Q34698) ──
  'wd:L204656':  'other, different',
  'wd:L211407':  'stupid, foolish',
  'wd:L219202':  'broken',
  'wd:L219408':  'black',

  // ── Nouns (Q1084) ──
  'wd:L208137':  'necessity',
  'wd:L208822':  'credit, buying on tab',
  'wd:L213550':  'document',
  'wd:L63749':   'ear',
  'wd:L63778':   'university',
  'wd:L63879':   'delay, lateness',
  'wd:L63898':   'email',
  'wd:L64157':   'bummer, disappointment',
  'wd:L64201':   'morning',
  'wd:L64356':   'request',
  'wd:L64414':   'genius',
  'wd:L64420':   'eyebrow',
  'wd:L64501':   'guitar',
  'wd:L64752':   'road, way',
  'wd:L65086':   'tail',
  'wd:L65128':   'friend, partner',
  'wd:L65168':   'sand',
  'wd:L66016':   'test, exam',
  'wd:L66209':   'umbrella',
  'wd:L66237':   'water',
  'wd:L66316':   'waiter',
  'wd:L66377':   'party',
  'wd:L66388':   'restaurant',
  'wd:L66481':   'camera',
  'wd:L66599':   'glasses, eyeglasses',
  'wd:L66600':   'office',
  'wd:L67023':   'story',
  'wd:L67101':   'mug, cup',
  'wd:L67146':   'work, job',
  'wd:L67155':   'Hebrew (language)',
  'wd:L67435':   'crumb',
  'wd:L67648':   'grade, mark',
  'wd:L67821':   'box',
  'wd:L67827':   'ponytail',
  'wd:L68262':   'table',
  'wd:L68357':   'service, restroom',
  'wd:L68434':   'tooth',
  'wd:L68587':   'result, outcome',
  'wd:L75590':   'English (language)',
  'wd:L75911':   'April',
  'wd:L77039':   'depression',
  'wd:L81603':   'segment, passage',
  'wd:L81684':   'pitcher, jug',

  // ── Particles / function words (Q4833830) ──
  'wd:L1348294': 'with',
  'wd:L1555922': 'direct object marker',
  'wd:L492122':  'but, rather',

  // ── Numerals (Q63116) ──
  'wd:L491804':  'one',
  'wd:L491918':  'five',

  // ── Demonstrative (Q576271) ──
  'wd:L492094':  'this, that',

  // ── Conjunction (Q36484) ──
  'wd:L492155':  'despite, although',

  // ── Month (Q147276) ──
  'wd:L77100':   'December',
};

async function main() {
  let updated = 0;
  let missing = 0;
  for (const [id, gloss] of Object.entries(GLOSSES)) {
    try {
      await prisma.lexeme.update({ where: { id }, data: { gloss } });
      updated++;
    } catch (e: any) {
      console.error(`MISSING lexeme ${id}: ${e.message}`);
      missing++;
    }
  }
  console.log(`Done. Updated: ${updated}, Missing: ${missing}, Total: ${Object.keys(GLOSSES).length}`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
