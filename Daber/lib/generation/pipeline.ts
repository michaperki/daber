import { z } from 'zod';
import { prisma } from '../db';
import { getOpenAI } from '../openai';

type TargetMeta = { id: string; lemma: string; pos: string; english?: string | null; mastery: 'new' | 'weak' | 'review' };

const zLLMItem = z.object({
  hebrew: z.string().min(1),
  english: z.string().min(1),
  target_word: z.string().min(1),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  drill_type: z.enum(['he_to_en', 'en_to_he']),
  grammar_focus: z.string().optional().nullable()
});

const zLLMResponse = z.object({ items: z.array(zLLMItem).min(1) });

const HARD_GRAMMAR = [
  'present_tense',
  'past_tense',
  'future_tense',
  'definite_articles',
  'construct_state',
  'possession',
];

function mapDifficulty(d: 'easy' | 'medium' | 'hard'): number {
  return d === 'easy' ? 1 : d === 'medium' ? 2 : 3;
}

function stripHebrewNikkud(s: string): string {
  // Remove Hebrew diacritics (niqqud and cantillation) U+0591–U+05C7
  return s.replace(/[\u0591-\u05C7]/g, '');
}

function cleanLemma(raw: string): string {
  let s = stripHebrewNikkud(raw);
  // Remove ellipsis and repeated punctuation and quotes/parentheticals
  s = s.replace(/[\u2026…]+/g, ''); // ellipsis
  s = s.replace(/["'“”‘’\(\)\[\]{}]/g, '');
  // Remove non-letter punctuation except internal apostrophes/dashes if needed (keep spaces and Hebrew letters)
  s = s.replace(/[^\u0590-\u05FF\s\-]/g, '');
  // Collapse spaces and trim
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

export async function runGenerationJob(opts?: { userId?: string; targets?: number; itemsPerTarget?: number; model?: string }) {
  const targetsCount = Math.min(Math.max(opts?.targets ?? 4, 1), 8);
  const itemsPerTarget = Math.min(Math.max(opts?.itemsPerTarget ?? 3, 1), 6);

  const batch = await prisma.generatedBatch.create({
    data: {
      user_id: opts?.userId ?? null,
      status: 'pending',
      model: opts?.model ?? 'gpt-4o-mini',
    }
  });

  try {
    const { targets, known } = await selectTargetsAndKnown(targetsCount, 10);

    // Persist selection on batch
    await prisma.generatedBatch.update({ where: { id: batch.id }, data: { targets: targets as any, context: { known, grammar_exposure: HARD_GRAMMAR, level: 'intermediate' } as any } });

    // Prepare clean lemmas for LLM (no nikkud, punctuation)
    const targetsClean = targets.map(t => ({ ...t, lemma: cleanLemma(t.lemma) }));
    const { items: genItems, raw } = await callLLM({ targets: targetsClean, known, itemsPerTarget, model: opts?.model ?? 'gpt-4o-mini' });

    // Validate and auto-correct Hebrew using a second pass
    const validated = await validateHebrew(genItems);

    // Ensure each target has at least one en_to_he by flipping one he_to_en if needed
    const enforced = enforceDirectionMix(validated, targetsClean);

    const { itemIds } = await persistLLMItems(batch.id, enforced, targets);

    await prisma.generatedBatch.update({ where: { id: batch.id }, data: { status: 'complete', item_count: itemIds.length, completed_at: new Date() } });

    return { batchId: batch.id, created: itemIds.length, itemIds, llmItems: enforced, raw } as const;
  } catch (e: any) {
    await prisma.generatedBatch.update({ where: { id: batch.id }, data: { status: 'failed', error: e?.message || 'unknown error' } });
    throw e;
  }
}

async function selectTargetsAndKnown(targetsCount: number, knownCount: number): Promise<{ targets: TargetMeta[]; known: string[] }> {
  // Weak/new: prefer items with incorrect history or no streak
  const weakStats = await prisma.itemStat.findMany({
    orderBy: [{ incorrect_count: 'desc' }, { correct_streak: 'asc' }],
    take: 200,
  });
  const weakIds = weakStats.map(s => s.lesson_item_id);
  const weakItems = (await prisma.lessonItem.findMany({
    where: { id: { in: weakIds } },
    select: { id: true, english_prompt: true, lexeme_id: true, features: true },
  })) || [];

  const lexemeMap = new Map<string, { id: string; lemma: string; pos: string }>();
  if (weakItems.length) {
    const ids = Array.from(new Set(weakItems.map(i => i.lexeme_id).filter(Boolean))) as string[];
    if (ids.length) {
      const lexemes = await prisma.lexeme.findMany({ where: { id: { in: ids } }, select: { id: true, lemma: true, pos: true } });
      for (const l of lexemes) lexemeMap.set(l.id, { id: l.id, lemma: l.lemma, pos: l.pos });
    }
  }

  const targets: TargetMeta[] = [];
  for (const it of weakItems) {
    if (!it.lexeme_id) continue;
    const l = lexemeMap.get(it.lexeme_id);
    if (!l) continue;
    if (targets.find(t => t.id === l.id)) continue;
    const mastery: TargetMeta['mastery'] = 'weak';
    targets.push({ id: l.id, lemma: l.lemma, pos: l.pos, english: guessShortEnglish(it.english_prompt), mastery });
    if (targets.length >= targetsCount) break;
  }

  // Fallback: pick random lexemes if not enough
  if (targets.length < targetsCount) {
    const needed = targetsCount - targets.length;
    const pool = await prisma.lexeme.findMany({ take: needed * 3, where: { language: 'he' }, select: { id: true, lemma: true, pos: true } });
    for (const l of pool) {
      if (targets.find(t => t.id === l.id)) continue;
      targets.push({ id: l.id, lemma: l.lemma, pos: l.pos, english: null, mastery: 'new' });
      if (targets.length >= targetsCount) break;
    }
  }

  // Known words: high mastery lexemes
  const strongStats = await prisma.itemStat.findMany({
    where: { correct_streak: { gte: 2 } },
    orderBy: [{ correct_streak: 'desc' }, { correct_count: 'desc' }],
    take: 500,
  });
  const strongIds = strongStats.map(s => s.lesson_item_id);
  const strongItems = await prisma.lessonItem.findMany({ where: { id: { in: strongIds } }, select: { lexeme_id: true } });
  const strongLexemeIds = Array.from(new Set(strongItems.map(i => i.lexeme_id).filter(Boolean))) as string[];
  let knownLexemes: string[] = [];
  if (strongLexemeIds.length) {
    const rows = await prisma.lexeme.findMany({ where: { id: { in: strongLexemeIds } }, select: { lemma: true } });
    knownLexemes = rows.map(r => r.lemma);
  }
  // Fallback to general lexeme list if too few
  if (knownLexemes.length < knownCount) {
    const addRows = await prisma.lexeme.findMany({ take: knownCount, where: { language: 'he' }, select: { lemma: true } });
    knownLexemes = Array.from(new Set([...knownLexemes, ...addRows.map(r => r.lemma)]));
  }
  knownLexemes = knownLexemes.filter(k => !targets.some(t => t.lemma === k)).slice(0, knownCount);

  return { targets, known: knownLexemes };
}

function guessShortEnglish(en: string | null | undefined): string | null {
  if (!en) return null;
  const s = en.trim();
  const m = s.match(/['"]([^'"]+)['"]/);
  if (m) return m[1];
  return s.length <= 64 ? s : s.slice(0, 64);
}

async function callLLM(input: { targets: TargetMeta[]; known: string[]; itemsPerTarget: number; model: string }): Promise<{ items: Array<z.infer<typeof zLLMItem>>; raw: string }> {
  const openai = getOpenAI();
  const sys = `You are a Hebrew drill author for an intermediate learner. Create natural, unambiguous sentences that practice target lexemes with scaffolding from known words.
Rules:
- Only return strict JSON with shape {"items": Array<...>}.
- Only use drill_type values "he_to_en" or "en_to_he".
- 3 to 4 items per target lexeme.
- Ensure the target_word appears or is central to the item.
- Avoid slang and keep translations literal and single-intent.
- Keep sentences short and common.
- Write all Hebrew WITHOUT nikkud (vowel marks). Use plain unpointed Hebrew only.
- For each target, include at least one item of each drill_type: one "he_to_en" and one "en_to_he".
`;

  const grammarExposure = HARD_GRAMMAR;
  const user = {
    level: 'intermediate',
    grammar_exposure: grammarExposure,
    targets: input.targets.map(t => ({ id: t.id, lemma: t.lemma, pos: t.pos, english: t.english ?? null, mastery: t.mastery })),
    known_words: input.known,
    items_per_target: input.itemsPerTarget,
    schema: {
      item: {
        hebrew: 'string',
        english: 'string',
        target_word: 'one of the provided target lemmas EXACTLY (use the lemma string as given in targets)',
        difficulty: 'easy | medium | hard',
        drill_type: 'he_to_en | en_to_he',
        grammar_focus: 'string?'
      }
    },
    example: {
      items: [
        { hebrew: 'אני קורא ספר חדש', english: 'I am reading a new book', target_word: input.targets[0]?.lemma || '—', difficulty: 'easy', drill_type: 'he_to_en', grammar_focus: 'present_tense' }
      ]
    }
  } as const;

  const resp = await openai.chat.completions.create({
    model: input.model,
    temperature: 0.7,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: JSON.stringify(user) }
    ],
    response_format: { type: 'json_object' },
  });
  const content = resp.choices?.[0]?.message?.content ?? '';
  let parsed: z.infer<typeof zLLMResponse> | null = null;
  try {
    parsed = zLLMResponse.parse(JSON.parse(content));
  } catch {
    parsed = null;
  }
  if (!parsed) return { items: [], raw: content };
  // Filter to only known targets
  const allowed = new Set(input.targets.map(t => t.lemma));
  const items = parsed.items
    .filter(i => allowed.has(cleanLemma(i.target_word)))
    .map(i => ({ ...i, hebrew: stripHebrewNikkud(i.hebrew), target_word: cleanLemma(i.target_word) }));
  return { items, raw: content };
}

// Validation pass: ask LLM to check Hebrew grammar and fix common errors.
async function validateHebrew(items: Array<z.infer<typeof zLLMItem>>): Promise<Array<z.infer<typeof zLLMItem>>> {
  if (!items.length) return items;
  const openai = getOpenAI();
  const sys = `You are a Hebrew language expert. Review sentences for grammatical correctness: verb conjugation, adjective agreement, gender/number agreement, and word-form accuracy.
Respond with strict JSON matching {"reviews": Array<{index: number, correct: boolean, corrected?: string, explanation?: string}>}.
Write all Hebrew WITHOUT nikkud (vowel marks).`;
  const payload = {
    sentences: items.map((it, idx) => ({ index: idx, hebrew: stripHebrewNikkud(it.hebrew), english: it.english }))
  };
  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: JSON.stringify(payload) }
    ],
    response_format: { type: 'json_object' },
  });
  const content = resp.choices?.[0]?.message?.content ?? '';
  type Review = { index: number; correct: boolean; corrected?: string | null };
  let reviews: Review[] = [];
  try {
    const parsed = JSON.parse(content);
    reviews = Array.isArray(parsed.reviews) ? parsed.reviews : [];
  } catch {
    reviews = [];
  }
  if (!reviews.length) {
    // If validator fails, return original items after stripping nikkud
    return items.map(it => ({ ...it, hebrew: stripHebrewNikkud(it.hebrew) }));
  }
  const byIndex = new Map<number, Review>();
  for (const r of reviews) byIndex.set(Number(r.index), r);
  const out: Array<z.infer<typeof zLLMItem>> = [];
  items.forEach((it, idx) => {
    const r = byIndex.get(idx);
    if (!r) { out.push({ ...it, hebrew: stripHebrewNikkud(it.hebrew) }); return; }
    if (r.correct === true) {
      out.push({ ...it, hebrew: stripHebrewNikkud(it.hebrew) });
    } else if (r.correct === false && r.corrected && r.corrected.trim()) {
      out.push({ ...it, hebrew: stripHebrewNikkud(r.corrected) });
    } // else drop this item
  });
  return out;
}

function enforceDirectionMix(items: Array<z.infer<typeof zLLMItem>>, targets: Array<TargetMeta>): Array<z.infer<typeof zLLMItem>> {
  const byLemma = new Map<string, { hasENtoHE: boolean; exampleHEtoEN?: z.infer<typeof zLLMItem> }>();
  const cleanedTargets = new Set(targets.map(t => cleanLemma(t.lemma)));
  for (const it of items) {
    const lemma = cleanLemma(it.target_word);
    if (!byLemma.has(lemma)) byLemma.set(lemma, { hasENtoHE: false });
    const rec = byLemma.get(lemma)!;
    if (it.drill_type === 'en_to_he') rec.hasENtoHE = true;
    if (it.drill_type === 'he_to_en' && !rec.exampleHEtoEN) rec.exampleHEtoEN = it;
  }
  const out = [...items];
  for (const lemma of cleanedTargets) {
    const rec = byLemma.get(lemma);
    if (!rec) continue; // No items for this target (unlikely); skip
    if (!rec.hasENtoHE && rec.exampleHEtoEN) {
      const base = rec.exampleHEtoEN;
      out.push({ ...base, hebrew: base.english, english: base.hebrew, drill_type: 'en_to_he' });
    }
  }
  return out;
}

async function persistLLMItems(batchId: string, items: Array<z.infer<typeof zLLMItem>>, targets: TargetMeta[]) {
  const lessonId = 'vocab_all_gen';
  await prisma.lesson.upsert({
    where: { id: lessonId },
    update: { title: 'Generated Drills', language: 'he', level: 'mixed', type: 'vocab_generated', description: 'LLM-generated content' },
    create: { id: lessonId, title: 'Generated Drills', language: 'he', level: 'mixed', type: 'vocab_generated', description: 'LLM-generated content' }
  });

  // Map by cleaned lemma to handle diacritics/punctuation in DB lemmas
  const byLemmaClean = new Map(targets.map(t => [cleanLemma(stripHebrewNikkud(t.lemma)), t] as const));
  const itemIds: string[] = [];

  function containsHebrew(s: string): boolean { return /[\u0590-\u05FF]/.test(s); }
  function containsLatin(s: string): boolean { return /[A-Za-z]/.test(s); }
  function englishOk(s: string): boolean { return !containsHebrew(s) && containsLatin(s); }
  function hebrewOk(s: string): boolean { return containsHebrew(s) && !containsLatin(s); }

  for (const i of items) {
    const difficulty = mapDifficulty(i.difficulty);
    // Dedup by exact pair if already exists
    let heb = stripHebrewNikkud(i.hebrew);
    let eng = i.english;
    // Fix swapped fields when en_to_he returns flipped
    if (!containsHebrew(heb) && containsHebrew(eng)) {
      const swappedHeb = stripHebrewNikkud(eng);
      const swappedEng = i.hebrew;
      if (containsHebrew(swappedHeb) && !containsLatin(swappedHeb)) {
        heb = swappedHeb;
        eng = swappedEng;
      }
    }
    // Final validation: drop if mismatched scripts
    if (!englishOk(eng) || !hebrewOk(heb)) {
      continue;
    }
    const existing = await prisma.lessonItem.findFirst({ where: { lesson_id: lessonId, english_prompt: eng, target_hebrew: heb } });
    if (existing) {
      // Ensure link exists
      await upsertGeneratedDrillLink(existing.id, byLemmaClean.get(cleanLemma(i.target_word))?.id || null, batchId, i.drill_type, difficulty, i.grammar_focus || null);
      itemIds.push(existing.id);
      continue;
    }
    const id = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const li = await prisma.lessonItem.create({
      data: {
        id,
        lesson_id: lessonId,
        english_prompt: eng,
        target_hebrew: heb,
        transliteration: null,
        accepted_variants: [],
        near_miss_patterns: [],
        tags: ['generated'],
        difficulty,
        features: { pos: 'sentence', source: 'llm' } as any,
      }
    });
    await upsertGeneratedDrillLink(li.id, byLemmaClean.get(cleanLemma(i.target_word))?.id || null, batchId, i.drill_type, difficulty, i.grammar_focus || null);
    itemIds.push(li.id);
  }

  return { itemIds };
}

async function upsertGeneratedDrillLink(lessonItemId: string, targetLexemeId: string | null, batchId: string, drillType: 'he_to_en' | 'en_to_he', difficulty: number, grammarFocus: string | null) {
  // Ensure a link row exists for this item
  const found = await prisma.generatedDrill.findUnique({ where: { lesson_item_id: lessonItemId } }).catch(() => null);
  if (found) return found;
  return prisma.generatedDrill.create({
    data: {
      lesson_item_id: lessonItemId,
      target_lexeme_id: targetLexemeId,
      batch_id: batchId,
      drill_type: drillType,
      difficulty,
      grammar_focus: grammarFocus,
    }
  });
}
