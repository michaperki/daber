import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PRONOUNS = ['אני','אתה','את','הוא','היא','אנחנו','אתם','אתן','הם','הן'];

type SimpleItem = { id: string; lesson_id: string; english_prompt: string; target_hebrew: string };

async function showVerb(lemma: string, forms: string[]) {
  console.log(`\n=== VERB: ${lemma} ===`);
  // Lexeme by lemma
  const lex = await prisma.lexeme.findMany({ where: { lemma }, select: { id: true, lemma: true, pos: true } });
  if (lex.length === 0) {
    console.log('Lexeme: none');
  } else {
    console.log('Lexeme rows:');
    for (const l of lex) console.log(`  ${l.id} | lemma=${l.lemma} pos=${l.pos}`);
    const lexIds = lex.map(l => l.id);
    const infl = await prisma.inflection.findMany({ where: { lexeme_id: { in: lexIds } }, orderBy: [{ tense: 'asc' }, { person: 'asc' }, { number: 'asc' }, { gender: 'asc' }] });
    console.log(`Inflections (${infl.length}):`);
    for (const f of infl.slice(0, 50)) {
      console.log(`  ${f.form} | tense=${f.tense || '-'} person=${f.person || '-'} number=${f.number || '-'} gender=${f.gender || '-'} binyan=${f.binyan || '-'}`);
    }
    if (infl.length > 50) console.log(`  ...and ${infl.length - 50} more`);

    const liLinked = await prisma.lessonItem.findMany({
      where: { lexeme_id: { in: lexIds } },
      include: { lesson: { select: { id: true, title: true, type: true } } },
    });
    console.log(`LessonItems linked to lexeme (${liLinked.length}):`);
    for (const it of liLinked) {
      console.log(`  ${it.id} [${it.lesson?.id}] ${it.english_prompt} → ${it.target_hebrew}`);
    }
  }

  // LessonItems matching any provided form string (substring or pronoun+form exact)
  const orContains = forms.map(f => ({ target_hebrew: { contains: f } }));
  const liByContains = await prisma.lessonItem.findMany({ where: { OR: orContains }, include: { lesson: { select: { id: true, title: true, type: true } } } });
  console.log(`LessonItems containing any of [${forms.join(', ')}] (${liByContains.length}):`);
  for (const it of liByContains.slice(0, 40)) {
    console.log(`  ${it.id} [${it.lesson?.id}] ${it.english_prompt} → ${it.target_hebrew}`);
  }
  if (liByContains.length > 40) console.log(`  ...and ${liByContains.length - 40} more`);

  // Exact matches of pronoun+form or bare form
  const candidates: string[] = [];
  for (const f of forms) {
    candidates.push(f);
    for (const p of PRONOUNS) candidates.push(`${p} ${f}`);
  }
  const liExact = await prisma.lessonItem.findMany({ where: { target_hebrew: { in: candidates } }, include: { lesson: { select: { id: true, title: true, type: true } } } });
  console.log(`LessonItems exactly equal to a bare/pronoun form (${liExact.length}):`);
  for (const it of liExact) {
    console.log(`  ${it.id} [${it.lesson?.id}] ${it.english_prompt} → ${it.target_hebrew}`);
  }
}

async function countVerbConjugationItems() {
  console.log('\n=== GLOBAL COUNTS (verb conjugations as standalone items) ===');
  // Count LessonItems that are exactly an Inflection.form or pronoun + form, restricted to verb lexemes
  const sql = `
    WITH pronouns(p) AS (
      SELECT unnest(ARRAY['אני','אתה','את','הוא','היא','אנחנו','אתם','אתן','הם','הן'])
    )
    SELECT COUNT(DISTINCT li.id) AS conj_items,
           COUNT(DISTINCT lx.lemma) AS infinitives
    FROM "LessonItem" li
    JOIN "Inflection" inf ON (
      li.target_hebrew = inf.form
      OR EXISTS (
        SELECT 1 FROM pronouns pr WHERE li.target_hebrew = pr.p || ' ' || inf.form
      )
    )
    JOIN "Lexeme" lx ON lx.id = inf.lexeme_id
    WHERE lx.pos = 'verb'
  `;
  const rows = await prisma.$queryRawUnsafe<Array<{ conj_items: bigint; infinitives: bigint }>>(sql);
  const one = rows[0];
  const conjItems = one ? Number(one.conj_items) : 0;
  const infinitives = one ? Number(one.infinitives) : 0;
  console.log(`Standalone conjugation items: ${conjItems}`);
  console.log(`Unique infinitives among those: ${infinitives}`);

  // Same, limited to CC imported lessons (ids starting with cc_)
  const sqlCC = `
    WITH pronouns(p) AS (
      SELECT unnest(ARRAY['אני','אתה','את','הוא','היא','אנחנו','אתם','אתן','הם','הן'])
    )
    SELECT COUNT(DISTINCT li.id) AS conj_items,
           COUNT(DISTINCT lx.lemma) AS infinitives
    FROM "LessonItem" li
    JOIN "Lesson" l ON l.id = li.lesson_id
    JOIN "Inflection" inf ON (
      li.target_hebrew = inf.form
      OR EXISTS (
        SELECT 1 FROM pronouns pr WHERE li.target_hebrew = pr.p || ' ' || inf.form
      )
    )
    JOIN "Lexeme" lx ON lx.id = inf.lexeme_id
    WHERE lx.pos = 'verb' AND l.id LIKE 'cc_%'
  `;
  const rowsCC = await prisma.$queryRawUnsafe<Array<{ conj_items: bigint; infinitives: bigint }>>(sqlCC);
  const rcc = rowsCC[0];
  const ccItems = rcc ? Number(rcc.conj_items) : 0;
  const ccInf = rcc ? Number(rcc.infinitives) : 0;
  console.log(`CC-only conjugation items: ${ccItems}`);
  console.log(`CC-only unique infinitives: ${ccInf}`);
}

async function sampleCCDataForForms(forms: string[]) {
  console.log('\n=== CC IMPORT EXAMPLES (raw items containing requested forms) ===');
  const li = await prisma.lessonItem.findMany({
    where: {
      lesson: { id: { startsWith: 'cc_' } },
      OR: forms.map(f => ({ target_hebrew: { contains: f } })),
    },
    include: { lesson: { select: { id: true, title: true } } },
    take: 20,
  });
  for (const it of li) {
    console.log(`  ${it.id} [${it.lesson?.id}] ${it.target_hebrew}  ←  ${it.english_prompt}`);
  }
}

async function main() {
  // Focus verbs
  await showVerb('לכתוב', ['לכתוב','כותב','כותבת','כותבים','כותבות','כתבתי','כתבת','כתב','כתבה','כתבו']);
  await showVerb('ללמוד', ['ללמוד','לומד','לומדת','לומדים','לומדות','למדתי','למדת','למד','למדה','למדו']);

  await countVerbConjugationItems();

  await sampleCCDataForForms(['כותב','כותבת','לומד','לומדת','ללמוד','לכתוב']);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

