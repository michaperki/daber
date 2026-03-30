import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logEvent } from '@/lib/log';
import { generateNextFromLexicon } from '@/lib/drill/generators';
import fs from 'node:fs';
import path from 'node:path';

export async function GET(req: Request, { params }: { params: { sessionId: string } }) {
  const { sessionId } = params;
  try {
    // Helpers for canonical intro enforcement
    const containsHebrew = (s: string) => /[\u0590-\u05FF]/.test(s || '');
    const containsLatin = (s: string) => /[A-Za-z]/.test(s || '');
    const englishOk = (s: string) => !!s && !containsHebrew(s) && containsLatin(s);
    const stripHowDoISay = (s: string) => s.replace(/^\s*how\s+do\s+i\s+say[:\s-]*/i, '').replace(/\?+\s*$/, '').trim();
    const sanitizeEnglish = (s: string) => stripHowDoISay((s || '').replace(/[\u0590-\u05FF]/g, '')).trim();
    const stripNikkud = (s: string) => (s || '').replace(/[\u0591-\u05C7]/g, '');
    const isSingleToken = (s: string) => (s || '').split(/\s+/).filter(Boolean).length === 1;
    const looksPlural = (s: string) => /(?:ים|ות)$/.test(s || '');
    const hasPossessiveSuffix = (s: string) => /(?:י|ך|ךָ|ךְ|נו|כם|כן|יהם|יהן)$/.test(s || '');

    // Lazy-load Green gloss fallback
    let GREEN_GLOSSES: Record<string, { gloss: string | null; pos?: string }> | null = null;
    function getGreenGloss(lexId: string): string | null {
      try {
        if (!GREEN_GLOSSES) {
          const p = path.join(process.cwd(), 'Daber', 'data', 'green_glosses.json');
          const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
          GREEN_GLOSSES = raw?.items || {};
        }
        const rec = GREEN_GLOSSES![lexId];
        const g = rec?.gloss;
        return (typeof g === 'string' && g && !containsHebrew(g)) ? g : null;
      } catch {
        return null;
      }
    }

    const url = new URL(req.url);
    const debug = url.searchParams.get('debug') === '1' || url.searchParams.get('debug') === 'true';
    const explain: any = { sessionId };
    // Session cap (applies to all sessions; tune via env)
    const baseCap = Number.parseInt(process.env.SESSION_DUE_CAP || '', 10) || 20;
    const hardMax = 25;
    const attemptsCount = await prisma.attempt.count({ where: { session_id: sessionId } });
    const pacing = url.searchParams.get('pacing'); // 'adaptive' | null
    const useRandom = url.searchParams.get('random') === '1' || url.searchParams.get('random') === 'true';
    const useLex = url.searchParams.get('mode') === 'lex';
    const focusWeak = url.searchParams.get('focus') === 'weak';
    const dueParam = url.searchParams.get('due'); // 'feature' | 'item' | null
    const dueMode: 'feature' | 'item' | 'blend' = ((): any => {
      const d = (dueParam || '').toLowerCase();
      if (d === 'feature' || d === 'item' || d === 'blend') return d as any;
      // Default to blend (feature + item) when not specified
      return 'blend';
    })();
    if (debug) {
      explain.query = { pacing: pacing || 'fixed', random: useRandom, mode: useLex ? 'lex' : 'db', focus: focusWeak ? 'weak' : undefined, due: dueMode };
      explain.attemptsCount = attemptsCount;
      explain.cap = { base: baseCap, hardMax };
    }

    // Adaptive pacing logic
    let offerEnd = false;
    let offerExtend = false;
    const cap = pacing === 'adaptive' ? hardMax : baseCap;
    if (cap > 0 && attemptsCount >= cap) {
      return NextResponse.json({ done: true, index: attemptsCount, total: cap });
    }
    if (pacing === 'adaptive' && attemptsCount >= 3) {
      const recent = await prisma.attempt.findMany({
        where: { session_id: sessionId },
        orderBy: { created_at: 'desc' },
        take: 3,
        select: { grade: true }
      });
      const allIncorrect = recent.every(a => a.grade === 'incorrect');
      const allCorrect = recent.every(a => a.grade === 'correct');
      if (allIncorrect) offerEnd = true;
      if (attemptsCount >= baseCap && allCorrect) offerExtend = true;
    }
    if (!pacing && baseCap > 0 && attemptsCount >= baseCap) {
      return NextResponse.json({ done: true, index: attemptsCount, total: baseCap });
    }
    const session = await prisma.session.findUnique({ where: { id: sessionId }, include: { lesson: { select: { id: true, type: true, language: true, level: true, description: true } } } });
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    const userId = (session.user_id || 'anon');
    const sessionLessonId = session.lesson_id; // capture for inner closures to avoid nullable narrowing issues
    const isMini = sessionLessonId === 'vocab_mini_morph';
    const MINI_ALLOW = new Set<string>([
      'mini_lex_write', 'mini_lex_book', 'mini_lex_big',
      // Phase 1 expansion
      'mini_lex_speak', 'mini_lex_icecream', 'mini_lex_new',
      // Phase 2 expansion
      'mini_lex_read', 'mini_lex_hear', 'mini_lex_song', 'mini_lex_smart',
    ]);

    // Mini-drill validation helpers (only used for vocab_mini_morph)
    // Reuse top-level englishOk; define only hebrewOk/strippers here
    const hebrewOk = (s: string) => !!s && /[\u0590-\u05FF]/.test(s || '') && !/[A-Za-z]/.test(s || '');
    const stripPronoun = (s: string) => {
      const pronouns = ['אני','אתה','את','הוא','היא','אנחנו','אתם','אתן','הם','הן'];
      let out = (s || '').trim();
      for (const p of pronouns) { if (out.startsWith(p + ' ')) { out = out.slice(p.length).trim(); break; } }
      return out;
    };
    const stripHa = (s: string) => (s || '').replace(/^ה+/, '');
    async function metaFor(id: string): Promise<{ lexeme_id: string | null; family_id: string | null; pos: string | null; features: Record<string,string|null>|null }> {
      try {
        const li = await prisma.lessonItem.findUnique({ where: { id }, select: { lexeme_id: true, family_id: true, features: true } });
        if (!li) return { lexeme_id: null, family_id: null, pos: null, features: null };
        const pos = ((li.features as any)?.pos as string | null) || null;
        return { lexeme_id: li.lexeme_id || null, family_id: (li.family_id || (li.lexeme_id ? `lex:${li.lexeme_id}` : null)), pos, features: (li.features as any) || null };
      } catch { return { lexeme_id: null, family_id: null, pos: null, features: null }; }
    }
    async function validateMiniItem(it: { id: string; english_prompt: string; target_hebrew: string; features?: Record<string,string|null>|null }): Promise<{ ok: true } | { ok: false; reason: string }> {
      if (!isMini) return { ok: true };
      const en = (it.english_prompt || '').trim();
      const he = (it.target_hebrew || '').trim();
      if (!englishOk(en)) return { ok: false, reason: 'english_not_clean' };
      if (!hebrewOk(he)) return { ok: false, reason: 'hebrew_not_clean' };
      const meta = await metaFor(it.id);
      if (!meta.lexeme_id) return { ok: false, reason: 'missing_lexeme' };
      if (!MINI_ALLOW.has(meta.lexeme_id)) return { ok: false, reason: 'lexeme_not_allowed' };
      // Ensure Hebrew surface (without pronoun/definite) exists among the lexeme's inflections
      const core = stripHa(stripPronoun(he));
      const infl = await prisma.inflection.findFirst({ where: { lexeme_id: meta.lexeme_id, form: core } });
      if (!infl) return { ok: false, reason: 'surface_not_in_lexeme' };
      // POS alignment when provided
      const lex = await prisma.lexeme.findUnique({ where: { id: meta.lexeme_id }, select: { pos: true } });
      const fpos = (it.features?.pos || '').toLowerCase();
      const lpos = (lex?.pos || '').toLowerCase();
      if (fpos && lpos && fpos !== lpos) return { ok: false, reason: 'pos_mismatch' };
      // If adjective or verb, require a pronoun prefix
      if (fpos === 'adjective' || fpos === 'verb') {
        if (stripPronoun(he) === he) return { ok: false, reason: 'missing_pronoun' };
      }
      return { ok: true };
    }
    async function filterMiniAllowed(ids: string[]): Promise<string[]> {
      if (!isMini) return ids;
      const lis = await prisma.lessonItem.findMany({ where: { id: { in: ids } }, select: { id: true, lexeme_id: true } });
      return lis.filter(l => l.lexeme_id && MINI_ALLOW.has(l.lexeme_id)).map(l => l.id);
    }
    async function pickValidFromIds(ids: string[]): Promise<{ id: string; explain?: any } | null> {
      if (!isMini) return { id: (ids[0] || null) } as any;
      let skipped = 0;
      for (const cid of ids) {
        const raw = await prisma.lessonItem.findUnique({ where: { id: cid }, select: { id: true, english_prompt: true, target_hebrew: true, transliteration: true, features: true } });
        if (!raw) continue;
        const shaped = { id: raw.id, english_prompt: raw.english_prompt, target_hebrew: raw.target_hebrew, transliteration: raw.transliteration, features: (raw.features as any) || null } as any;
        const ok = await validateMiniItem(shaped);
        if (ok.ok) return { id: cid, explain: skipped ? { skippedInvalid: skipped } : undefined };
        skipped++;
        try { logEvent({ type: 'mini_morph_validation_skip', session_id: sessionId, lesson_id: sessionLessonId, payload: { item_id: cid, reason: (!ok.ok ? ok.reason : 'unknown') } }); } catch {}
      }
      return null;
    }

    const isCrossVocab = sessionLessonId === 'vocab_all';
    const genLessonId = `${sessionLessonId}_gen`;
    const allowedLessonIds: string[] = isCrossVocab
      ? (
        [
          ...(await prisma.lesson.findMany({ where: { type: 'vocab' }, select: { id: true } })).map(l => l.id),
          ...(await prisma.lesson.findMany({ where: { type: 'vocab_generated' }, select: { id: true } })).map(l => l.id),
        ]
      )
      : [session.lesson_id, genLessonId];
    if (debug) {
      explain.lesson = { id: session.lesson_id, cross: isCrossVocab, allowedLessonIds };
    }

    const attempted = await prisma.attempt.findMany({
      where: { session_id: sessionId },
      select: { lesson_item_id: true }
    });
    const attemptedIds = new Set(attempted.map(a => a.lesson_item_id));
    if (debug) explain.attemptedCount = attemptedIds.size;

    const subsetRaw = (session as any).subset_item_ids as unknown;
    const subset = Array.isArray(subsetRaw) ? (subsetRaw as unknown[]).map(String) : [];

    async function computePhaseFor(itemId: string): Promise<'intro' | 'recognition' | 'guided' | 'free_recall'> {
      try {
        const stat = await prisma.itemStat.findUnique({ where: { lesson_item_id_user_id: { lesson_item_id: itemId, user_id: userId } } });
        if (stat) {
          const streak = stat.correct_streak || 0;
          if (streak === 0) return 'recognition';
          if (streak === 1) return 'guided';
          return 'free_recall';
        }
        // No per-item stat: check word family
        const li = await prisma.lessonItem.findUnique({ where: { id: itemId }, select: { family_id: true, lexeme_id: true } });
        const familyId = li?.family_id || (li?.lexeme_id ? `lex:${li.lexeme_id}` : null);
        if (!familyId) return 'intro';
        const fam = await prisma.familyStat.findUnique({ where: { family_id_user_id: { family_id: familyId, user_id: userId } } });
        if (fam) return 'recognition';
        return 'intro';
      } catch {
        return 'free_recall';
      }
    }

  async function maybeSwapToFamilyBase(
      item: { id: string },
      allowedLessonIds: string[]
    ): Promise<{ id: string; english_prompt: string; target_hebrew: string; transliteration: string | null; features: Record<string, string | null> | null }> {
      try {
        // If item would be intro and belongs to a family that wasn't introduced, prefer a base form within that family
        const li = await prisma.lessonItem.findUnique({ where: { id: item.id }, select: { family_id: true, lexeme_id: true } });
        const familyId = li?.family_id || (li?.lexeme_id ? `lex:${li.lexeme_id}` : null);
        if (familyId) {
          const famIntro = await prisma.familyStat.findUnique({ where: { family_id_user_id: { family_id: familyId, user_id: userId } } });
          if (!famIntro) {
            // Look for an existing base; if missing, synthesize and persist a canonical base for this family
            const base = await prisma.lessonItem.findFirst({
              where: { family_id: familyId, lesson_id: { in: allowedLessonIds }, family_base: true },
              select: { id: true, english_prompt: true, target_hebrew: true, transliteration: true, features: true },
            });
            if (base) {
              if (debug && item.id !== base.id) {
                explain.familySwap = { from: item.id, to: base.id, reason: 'family_base' };
              }
              return { ...base, features: (base.features as any) || null } as any;
            }

            // Resolve lexeme ID
            const lexId = li?.lexeme_id || (familyId.startsWith('lex:') ? familyId.slice(4) : null);
            if (lexId) {
              const lex = await prisma.lexeme.findUnique({ where: { id: lexId }, select: { id: true, lemma: true, pos: true, gloss: true } });
              if (lex) {
                const pos = (lex.pos || '').toLowerCase();
                // Canonical base selection by POS
                let heb: string | null = null;
                let feat: Record<string, string | null> = {};
                if (pos === 'verb' || pos === 'q24905') {
                  // Structured first
                  const inf = await prisma.inflection.findFirst({ where: { lexeme_id: lex.id, tense: 'infinitive' }, select: { form: true } });
                  if (inf?.form) {
                    heb = stripNikkud(inf.form);
                  } else {
                    // Heuristic: pick a single-token form starting with ל
                    const infls = await prisma.inflection.findMany({ where: { lexeme_id: lex.id }, select: { form: true } });
                    const cand = infls.map(r => stripNikkud(r.form)).find(f => /^ל\S+$/.test(f));
                    if (cand) heb = cand;
                  }
                  if (heb) feat = { pos: 'verb', tense: 'infinitive' } as any;
                } else if (pos === 'adjective' || pos === 'q34698') {
                  const adj = await prisma.inflection.findFirst({ where: { lexeme_id: lex.id, number: 'sg', gender: 'm' }, select: { form: true, number: true, gender: true } });
                  if (adj?.form) {
                    heb = stripNikkud(adj.form);
                    feat = { pos: 'adjective', number: 'sg', gender: 'm' } as any;
                  } else {
                    const base = stripNikkud((lex.lemma || '').trim());
                    if (isSingleToken(base) && !looksPlural(base)) {
                      heb = base;
                      feat = { pos: 'adjective', number: 'sg', gender: 'm' } as any;
                    }
                  }
                } else if (pos === 'noun' || pos === 'q1084') {
                  const sg = await prisma.inflection.findFirst({ where: { lexeme_id: lex.id, number: 'sg' }, select: { form: true, number: true, gender: true } });
                  if (sg?.form) {
                    let form = stripNikkud(sg.form).replace(/^ה+/, '').trim();
                    if (!looksPlural(form) && !hasPossessiveSuffix(form)) heb = form;
                    feat = { pos: 'noun', number: 'sg', gender: (sg?.gender || null) as any } as any;
                  }
                  if (!heb) {
                    let base = stripNikkud((lex.lemma || '').trim()).replace(/^ה+/, '');
                    if (isSingleToken(base) && !looksPlural(base) && !hasPossessiveSuffix(base)) heb = base;
                    if (heb) feat = { pos: 'noun', number: 'sg' } as any;
                  }
                } else {
                  const base = stripNikkud(lex.lemma || '');
                  if (base) { heb = base; feat = { pos: (lex.pos || 'unknown').toLowerCase() as any } as any; }
                }

                // If canonical base cannot be resolved, do not create; fallback to original item path
                if (!heb) {
                  return await prisma.lessonItem.findUnique({ where: { id: item.id }, select: { id: true, english_prompt: true, target_hebrew: true, transliteration: true, features: true } }) as any;
                }

                const english = lex.gloss || getGreenGloss(lex.id) || undefined;
                const englishPrompt = english ? `How do I say: ${english}?` : `How do I say: ${lex.lemma}?`;
                const id = `lexbase_${lex.id}`;
                const lessonId = genLessonId; // place base items in the generated lesson alongside dynamic items
                const created = await prisma.lesson.upsert({
                  where: { id: lessonId },
                  update: { title: 'Dynamic Drills', language: session?.lesson?.language || 'he', level: session?.lesson?.level || 'mixed', type: 'vocab_generated', description: session?.lesson?.description || null },
                  create: { id: lessonId, title: 'Dynamic Drills', language: session?.lesson?.language || 'he', level: session?.lesson?.level || 'mixed', type: 'vocab_generated', description: session?.lesson?.description || null }
                }).catch(() => null);
                void created; // no-op; ensure lesson exists

                const up = await prisma.lessonItem.upsert({
                  where: { id },
                  update: { lesson_id: lessonId, english_prompt: englishPrompt, target_hebrew: heb || '', transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['base','family_base'], difficulty: 1, lexeme_id: lex.id, family_id: familyId, family_base: true, features: feat as any },
                  create: { id, lesson_id: lessonId, english_prompt: englishPrompt, target_hebrew: heb || '', transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['base','family_base'], difficulty: 1, lexeme_id: lex.id, family_id: familyId, family_base: true, features: (feat as any) }
                });
                if (debug && item.id !== up.id) {
                  explain.familySwap = { from: item.id, to: up.id, reason: 'family_base_created' };
                }
                return { id: up.id, english_prompt: up.english_prompt, target_hebrew: up.target_hebrew, transliteration: up.transliteration, features: (up.features as any) || null } as any;
              }
            }
          }
        }
        const orig = await prisma.lessonItem.findUnique({ where: { id: item.id }, select: { id: true, english_prompt: true, target_hebrew: true, transliteration: true, features: true } });
        if (orig) return { ...orig, features: (orig.features as any) || null } as any;
        // Fallback minimal shape
        return { id: item.id, english_prompt: '', target_hebrew: '', transliteration: null, features: null };
      } catch {
        const orig = await prisma.lessonItem.findUnique({ where: { id: item.id }, select: { id: true, english_prompt: true, target_hebrew: true, transliteration: true, features: true } }).catch(() => null);
        if (orig) return { ...orig, features: (orig.features as any) || null } as any;
        return { id: item.id, english_prompt: '', target_hebrew: '', transliteration: null, features: null };
    }
    }

    async function buildIntroFor(itemId: string): Promise<{ hebrew: string; english?: string } | null> {
      try {
        function stripHebNikkud(s: string): string { return s.replace(/[\u0591-\u05C7]/g, ''); }
        function stripHebPronoun(s: string): string {
          const pronouns = ['אני','אתה','את','הוא','היא','אנחנו','אתם','אתן','הם','הן'];
          let out = s.trim();
          for (const p of pronouns) {
            if (out.startsWith(p + ' ')) { out = out.slice(p.length).trim(); break; }
          }
          return out.replace(/[\u2000-\u206F\s]+$/g, '').replace(/[!?,.;:]+$/g, '').trim();
        }

        const li = await prisma.lessonItem.findUnique({ where: { id: itemId }, select: { id: true, english_prompt: true, target_hebrew: true, features: true, lexeme_id: true } });
        if (!li) return null;

        // Resolve lexeme (direct link or parse from generated ID)
        let lexId = li.lexeme_id as string | null;
        if (!lexId) {
          const m = li.id.match(/^gen_(?:adj|noun|vpr|vpa|vfu)_([^_]+)_/);
          lexId = m ? m[1] : null;
        }
        if (!lexId) {
          const form = stripHebPronoun(li.target_hebrew || '');
          const inf = await prisma.inflection.findFirst({ where: { form } });
          if (inf) lexId = inf.lexeme_id;
        }

        const lex = lexId ? await prisma.lexeme.findUnique({ where: { id: lexId }, select: { lemma: true, pos: true, gloss: true, features: true } }) : null;
        const pos = (lex?.pos || ((li.features as any)?.pos as string | null) || '').toLowerCase();

        // Hebrew: canonical base form by POS
        let heb: string | null = null;
        if (pos === 'verb' && lexId) {
          const inf = await prisma.inflection.findFirst({ where: { lexeme_id: lexId, tense: 'infinitive' }, select: { form: true } });
          if (inf?.form) {
            heb = stripHebNikkud(inf.form);
          } else {
            // Heuristic: pick single-token ל* form
            const infls = await prisma.inflection.findMany({ where: { lexeme_id: lexId }, select: { form: true } });
            const cand = infls.map(r => stripHebNikkud(r.form)).find(f => /^ל\S+$/.test(f));
            if (cand) heb = cand;
          }
        } else if (pos === 'adjective' && lexId) {
          const adjBase = await prisma.inflection.findFirst({ where: { lexeme_id: lexId, number: 'sg', gender: 'm' }, select: { form: true } });
          if (adjBase?.form) {
            heb = stripHebNikkud(adjBase.form);
          } else if (lex?.lemma) {
            const base = stripHebNikkud((lex.lemma || '').trim());
            if (isSingleToken(base) && !looksPlural(base)) heb = base;
          }
        } else if (pos === 'noun' && lexId) {
          const feat = (lex?.features as any) || null;
          const isCompound = !!(lex?.lemma && lex.lemma.includes(' ')) || !!(feat?.definite_form);
          if (isCompound) {
            const df = (feat?.definite_form || lex?.lemma || '').trim();
            heb = stripHebNikkud(df);
          } else {
            const sg = await prisma.inflection.findFirst({ where: { lexeme_id: lexId, number: 'sg' }, select: { form: true } });
            let form = stripHebNikkud(((sg?.form || lex?.lemma || '').trim())).replace(/^ה+/, '');
            if (isSingleToken(form) && !looksPlural(form) && !hasPossessiveSuffix(form)) heb = form;
          }
        } else if (lex?.lemma) {
          const base = stripHebNikkud(lex.lemma);
          if (base) heb = base;
        } else {
          const base = stripHebPronoun(li.target_hebrew || '').replace(/^ה+/, '');
          heb = stripHebNikkud(base);
        }

        if (!heb) return null; // cannot reliably resolve canonical — let caller skip

        // English: prefer lexeme.gloss; fallback to Green gloss; fallback to sanitized prompt if valid English
        let eng: string | undefined = undefined;
        if (lex?.gloss && englishOk(lex.gloss)) eng = lex.gloss;
        else if (lexId) {
          const gg = getGreenGloss(lexId);
          if (gg) eng = gg;
        }
        if (!eng && li.english_prompt) {
          const s = sanitizeEnglish(li.english_prompt);
          if (englishOk(s)) eng = s;
        }
        if (!eng) return null;

        return { hebrew: heb, english: eng };
      } catch {
        return null;
      }
    }

    async function getFamilyIdForItem(itemId: string): Promise<string | null> {
      try {
        const li = await prisma.lessonItem.findUnique({ where: { id: itemId }, select: { family_id: true, lexeme_id: true } });
        if (!li) return null;
        return li.family_id || (li.lexeme_id ? `lex:${li.lexeme_id}` : null);
      } catch {
        return null;
      }
    }

    async function getRecentFamilyRun(sessionId: string): Promise<{ familyId: string | null; runLength: number }> {
      try {
        const recent = await prisma.attempt.findMany({
          where: { session_id: sessionId },
          orderBy: { created_at: 'desc' },
          take: 3,
          select: { lesson_item_id: true }
        });
        if (!recent.length) return { familyId: null, runLength: 0 };
        const ids = recent.map(r => r.lesson_item_id);
        const lis = await prisma.lessonItem.findMany({ where: { id: { in: ids } }, select: { id: true, family_id: true, lexeme_id: true } });
        const famOf = (id: string): (string | null) => {
          const li = lis.find(x => x.id === id);
          if (!li) return null;
          return li.family_id || (li.lexeme_id ? `lex:${li.lexeme_id}` : null);
        };
        const firstFam = famOf(ids[0]) || null;
        if (!firstFam) return { familyId: null, runLength: 0 };
        let run = 0;
        for (const id of ids) {
          if (famOf(id) === firstFam) run += 1; else break;
        }
        return { familyId: firstFam, runLength: run };
      } catch {
        return { familyId: null, runLength: 0 };
      }
    }

    async function maybeApplyFamilySpacing(
      item: { id: string; english_prompt: string; target_hebrew: string; transliteration: string | null; features: Record<string, string | null> | null },
      attemptedIds: Set<string>,
      allowedLessonIds: string[],
      useRandom: boolean
    ): Promise<{ id: string; english_prompt: string; target_hebrew: string; transliteration: string | null; features: Record<string, string | null> | null }> {
      const run = await getRecentFamilyRun(sessionId);
      const curFam = await getFamilyIdForItem(item.id);
      if (run.runLength >= 2 && run.familyId && curFam && run.familyId === curFam) {
        try {
          const pool = await prisma.lessonItem.findMany({
            where: { lesson_id: { in: allowedLessonIds }, NOT: { id: { in: Array.from(attemptedIds) } } },
            select: { id: true, english_prompt: true, target_hebrew: true, transliteration: true, features: true, family_id: true, lexeme_id: true },
            take: 1000,
          });
          const famOf = (li: any): string | null => (li.family_id || (li.lexeme_id ? `lex:${li.lexeme_id}` : null));
          const alts = pool.filter(li => famOf(li) !== curFam);
          const pick = useRandom ? (alts.length ? alts[Math.floor(Math.random() * alts.length)] : null) : (alts[0] || null);
          if (pick) {
            if (debug) explain.familySpacing = { from: item.id, to: pick.id, runLength: run.runLength };
            return { id: pick.id, english_prompt: pick.english_prompt, target_hebrew: pick.target_hebrew, transliteration: pick.transliteration, features: (pick.features as any) || null } as any;
          }
        } catch {
          // ignore, keep original
        }
      }
      return item;
    }

    async function buildHintsFor(itemId: string): Promise<{ baseForm?: string; firstLetter?: string; definiteness?: boolean } | null> {
      try {
        const li = await prisma.lessonItem.findUnique({ where: { id: itemId }, select: { target_hebrew: true, features: true, lexeme_id: true } });
        if (!li) return null;
        const stripHebPronoun = (s: string): string => {
          const pronouns = ['אני','אתה','את','הוא','היא','אנחנו','אתם','אתן','הם','הן'];
          let out = (s || '').trim();
          for (const p of pronouns) { if (out.startsWith(p + ' ')) { out = out.slice(p.length).trim(); break; } }
          return out;
        };
        const stripHebNikkud = (s: string): string => s.replace(/[\u0591-\u05C7]/g, '');
        let baseForm: string | undefined;
        if (li.lexeme_id) {
          const lex = await prisma.lexeme.findUnique({ where: { id: li.lexeme_id }, select: { lemma: true } });
          if (lex?.lemma) baseForm = stripHebNikkud(lex.lemma);
        }
        const core = stripHebNikkud(stripHebPronoun(li.target_hebrew || ''));
        const firstLetter = core ? core.charAt(0) : undefined;
        const fx = (li.features as any) || {};
        let definiteness: boolean | undefined;
        if (typeof fx.definite === 'boolean') definiteness = fx.definite;
        else if (typeof fx.definite === 'string') definiteness = ['true','yes','1','def'].includes(fx.definite.toLowerCase());
        else if (typeof fx.article === 'string') definiteness = ['ha','def'].includes((fx.article || '').toLowerCase());
        return { baseForm, firstLetter, definiteness };
      } catch {
        return null;
      }
    }

    async function maybePromoteFamilyProgress(
      item: { id: string },
      attemptedIds: Set<string>,
      allowedLessonIds: string[]
    ): Promise<{ id: string; english_prompt: string; target_hebrew: string; transliteration: string | null; features: Record<string, string | null> | null }> {
      try {
        const li = await prisma.lessonItem.findUnique({ where: { id: item.id }, select: { id: true, family_id: true, lexeme_id: true } });
        const familyId = li?.family_id || (li?.lexeme_id ? `lex:${li.lexeme_id}` : null);
        if (!familyId) {
          const orig = await prisma.lessonItem.findUnique({ where: { id: item.id }, select: { id: true, english_prompt: true, target_hebrew: true, transliteration: true, features: true } });
          if (orig) return { ...orig, features: (orig.features as any) || null } as any;
          return { id: item.id, english_prompt: '', target_hebrew: '', transliteration: null, features: null };
        }
        const famIntro = await prisma.familyStat.findUnique({ where: { family_id_user_id: { family_id: familyId, user_id: userId } } });
        if (!famIntro) {
          const orig = await prisma.lessonItem.findUnique({ where: { id: item.id }, select: { id: true, english_prompt: true, target_hebrew: true, transliteration: true, features: true } });
          if (orig) return { ...orig, features: (orig.features as any) || null } as any;
          return { id: item.id, english_prompt: '', target_hebrew: '', transliteration: null, features: null };
        }
        // Prefer a reasonable next step within this family for recognition phase
        const famItems = await prisma.lessonItem.findMany({
          where: { family_id: familyId, lesson_id: { in: allowedLessonIds } },
          select: { id: true, english_prompt: true, target_hebrew: true, transliteration: true, features: true }
        });
        const candidates = famItems.filter(fi => !attemptedIds.has(fi.id));
        if (!candidates.length) {
          const orig = famItems.find(fi => fi.id === item.id) || null;
          if (orig) return { ...orig, features: (orig.features as any) || null } as any;
          const fallback = await prisma.lessonItem.findUnique({ where: { id: item.id }, select: { id: true, english_prompt: true, target_hebrew: true, transliteration: true, features: true } });
          if (fallback) return { ...fallback, features: (fallback.features as any) || null } as any;
          return { id: item.id, english_prompt: '', target_hebrew: '', transliteration: null, features: null };
        }
        const score = (f: any): number => {
          const fx = (f?.features || {}) as Record<string, string | null>;
          const pos = (fx.pos || '').toLowerCase();
          const tense = (fx.tense || '').toLowerCase();
          const person = fx.person || '';
          const number = fx.number || '';
          const gender = fx.gender || '';
          // High priority: present 3sg masc, then 3sg fem, then 1sg, then 3pl masc
          if (pos === 'verb' && tense === 'present' && person === '3' && number === 'sg' && gender === 'm') return 100;
          if (pos === 'verb' && tense === 'present' && person === '3' && number === 'sg' && gender === 'f') return 95;
          if (pos === 'verb' && tense === 'present' && person === '1' && number === 'sg') return 90;
          if (pos === 'verb' && tense === 'present' && person === '3' && number === 'pl' && gender === 'm') return 85;
          if (pos === 'adjective' && number === 'sg' && gender === 'm') return 80;
          if (pos === 'noun' && number === 'sg') return 75;
          return 10; // default low preference
        };
        const ranked = candidates
          .map(ci => ({ ci, s: score(ci as any) }))
          .sort((a, b) => b.s - a.s);
        const best = ranked[0]?.ci || null;
        const selected = best || candidates[0];
        if (selected && selected.id !== item.id) {
          if (debug) explain.familyProgress = { from: item.id, to: selected.id };
          return { id: selected.id, english_prompt: selected.english_prompt, target_hebrew: selected.target_hebrew, transliteration: selected.transliteration, features: (selected.features as any) || null } as any;
        }
        const orig = famItems.find(fi => fi.id === item.id) || null;
        if (orig) return { ...orig, features: (orig.features as any) || null } as any;
        const fallback = await prisma.lessonItem.findUnique({ where: { id: item.id }, select: { id: true, english_prompt: true, target_hebrew: true, transliteration: true, features: true } });
        if (fallback) return { ...fallback, features: (fallback.features as any) || null } as any;
        return { id: item.id, english_prompt: '', target_hebrew: '', transliteration: null, features: null };
      } catch {
        const fallback = await prisma.lessonItem.findUnique({ where: { id: item.id }, select: { id: true, english_prompt: true, target_hebrew: true, transliteration: true, features: true } }).catch(() => null);
        if (fallback) return { ...fallback, features: (fallback.features as any) || null } as any;
        return { id: item.id, english_prompt: '', target_hebrew: '', transliteration: null, features: null };
      }
    }

    if (!isMini && (useLex || dueParam === 'feature' || dueParam === 'blend') && session.lesson?.type === 'vocab') {
      try {
        const gen = await generateNextFromLexicon(sessionId, attemptedIds, { focusWeakness: focusWeak });
        if (gen) {
          if (debug) {
            explain.path = 'lex';
            explain.pick = { id: gen.id, source: 'lex' };
          }
          const tried = new Set<string>();
          let adjBase = await maybeSwapToFamilyBase(gen, allowedLessonIds);
          let adj = await maybePromoteFamilyProgress(adjBase, attemptedIds, allowedLessonIds);
          adj = await maybeApplyFamilySpacing(adj, attemptedIds, allowedLessonIds, useRandom);
          let phase = await computePhaseFor(adj.id);
          let intro = phase === 'intro' ? await buildIntroFor(adj.id).catch(() => null) : null;
          // Enforce intro contract: must have canonical hebrew + english; try a few alternative picks if missing
          let attempts = 0;
          while (phase === 'intro' && (!intro || !intro.hebrew || !intro.english) && attempts < 3) {
            tried.add(adj.id);
            const genAlt = await generateNextFromLexicon(sessionId, attemptedIds, { focusWeakness: focusWeak }).catch(() => null);
            if (!genAlt || tried.has(genAlt.id)) break;
            let baseAlt = await maybeSwapToFamilyBase(genAlt, allowedLessonIds);
            let adjAlt = await maybePromoteFamilyProgress(baseAlt, attemptedIds, allowedLessonIds);
            adjAlt = await maybeApplyFamilySpacing(adjAlt, attemptedIds, allowedLessonIds, useRandom);
            const phaseAlt = await computePhaseFor(adjAlt.id);
            const introAlt = phaseAlt === 'intro' ? await buildIntroFor(adjAlt.id).catch(() => null) : null;
            adj = adjAlt; phase = phaseAlt; intro = introAlt; attempts++;
          }
          logEvent({ type: 'next_item_pick', session_id: sessionId, lesson_id: session.lesson_id, payload: { item_id: gen.id, source: 'lex', cross: isCrossVocab, phase, random: useRandom } }).catch(() => {});
          const newGenReady = await prisma.generatedDrill.count({ where: { created_at: { gt: session.started_at } } })
            .then(c => c > 0)
            .catch(() => false);
          const hints = phase === 'guided' ? await buildHintsFor(adj.id).catch(() => null) : null;
          const resp: any = { done: false, item: adj, offerEnd: offerEnd || undefined, offerExtend: offerExtend || undefined, phase, intro: intro || undefined, hints: hints || undefined, newContentReady: newGenReady || undefined, meta: { sessionId, lessonId: sessionLessonId, itemId: adj.id, lexemeId: null, familyId: null, path: (explain as any)?.path || 'lex' } };
          if (debug) resp.explain = explain;
          return NextResponse.json(resp);
        }
      } catch {
        // fall through to regular selection when generator fails
      }
      // fall through to regular selection when no generated item is available
    }
    // Feature due selection: prioritize items whose features match due/weak FeatureStat rows
    if (dueMode === 'feature' || dueMode === 'blend') {
      const now = new Date();
      try {
        const dueFeatures = await prisma.featureStat.findMany({
          where: {
            user_id: userId,
            OR: [
              { next_due: { lte: now } },
              { correct_streak: { lte: 1 } },
              { incorrect_count: { gt: 0 } },
            ]
          },
          take: 500,
        });
        const mkKey = (r: { pos?: string | null; tense?: string | null; person?: string | null; number?: string | null; gender?: string | null }) => {
          const pos = (r.pos || '').toLowerCase();
          const tense = (r.tense || '').toLowerCase();
          const person = (r.person || '').toLowerCase();
          const number = (r.number || '').toLowerCase();
          const gender = (r.gender || '').toLowerCase();
          return [pos, tense, person, number, gender].join('|');
        };
        const dueSet = new Set(dueFeatures.map(mkKey));
        // Pull a pool of remaining items with features
        const remainingPool = await prisma.lessonItem.findMany({
          where: { lesson_id: { in: allowedLessonIds }, NOT: { id: { in: Array.from(attemptedIds) } } },
          select: { id: true, english_prompt: true, target_hebrew: true, transliteration: true, features: true },
          take: 1000,
        });
        const featsMatch = (f: any): boolean => {
          if (!f || typeof f !== 'object') return false;
          const pos = (f.pos || '').toLowerCase();
          const tense = (f.tense || '').toLowerCase();
          const person = (f.person || '').toLowerCase();
          const number = (f.number || '').toLowerCase();
          const gender = (f.gender || '').toLowerCase();
          if (!pos) return false;
          return dueSet.has([pos, tense, person, number, gender].join('|'));
        };
        let featureCandidates = remainingPool.filter(r => featsMatch((r as any).features));
        if (isMini) {
          const allowedIds = await filterMiniAllowed(featureCandidates.map(c => c.id));
          const allowedSet = new Set(allowedIds);
          featureCandidates = featureCandidates.filter(c => allowedSet.has(c.id));
        }
        if (debug) {
          explain.path = 'due_feature';
          explain.candidates = { ...(explain.candidates || {}), featureDue: dueFeatures.length, featureCandidates: featureCandidates.length };
        }
        const pick = useRandom ? (featureCandidates.length ? featureCandidates[Math.floor(Math.random() * featureCandidates.length)] : null) : (featureCandidates[0] || null);
        if (pick) {
          const total = cap > 0 ? cap : await prisma.lessonItem.count({ where: { lesson_id: { in: allowedLessonIds } } });
          const index = attemptedIds.size + 1;
          const adjBase = await maybeSwapToFamilyBase(pick as any, allowedLessonIds);
          let adj = await maybePromoteFamilyProgress(adjBase, attemptedIds, allowedLessonIds);
          adj = await maybeApplyFamilySpacing(adj, attemptedIds, allowedLessonIds, useRandom);
          const phase = await computePhaseFor(adj.id);
          logEvent({ type: 'next_item_pick', session_id: sessionId, lesson_id: session.lesson_id, payload: { item_id: pick.id, source: 'due_feature', cross: isCrossVocab, phase, random: useRandom } }).catch(() => {});
          const newGenReady = await prisma.generatedDrill.count({ where: { created_at: { gt: session.started_at } } })
            .then(c => c > 0)
            .catch(() => false);
          const intro = phase === 'intro' ? await buildIntroFor(adj.id).catch(() => null) : null;
          const hints = phase === 'guided' ? await buildHintsFor(adj.id).catch(() => null) : null;
          const resp: any = { done: false, item: adj, index, total, offerEnd: offerEnd || undefined, offerExtend: offerExtend || undefined, phase, intro: intro || undefined, hints: hints || undefined, newContentReady: newGenReady || undefined };
          if (debug) resp.explain = explain;
          return NextResponse.json(resp);
        }
        // If blend: fall through to other due modes; if pure feature and none found, return done
        if (dueMode === 'feature') {
          const total = cap > 0 ? cap : await prisma.lessonItem.count({ where: { lesson_id: { in: allowedLessonIds } } });
          return NextResponse.json({ done: true, index: attemptedIds.size, total });
        }
      } catch {
        // ignore and fall through
      }
    }
    if (dueMode === 'item' || dueMode === 'blend') {
      // Pick an authored item from this lesson that is due in ItemStat
      const now = new Date();
      const dueItems = await prisma.itemStat.findMany({ where: { user_id: userId, next_due: { lte: now } } });
      const dueSet = new Set(dueItems.map(d => d.lesson_item_id));
      let remaining = await prisma.lessonItem.findMany({ where: { lesson_id: { in: allowedLessonIds }, id: { in: Array.from(dueSet) }, NOT: { id: { in: Array.from(attemptedIds) } } }, select: { id: true, english_prompt: true, target_hebrew: true, transliteration: true, features: true } });
      if (isMini) {
        const allowedIds = await filterMiniAllowed(remaining.map(r => r.id));
        const allowedSet = new Set(allowedIds);
        remaining = remaining.filter(r => allowedSet.has(r.id));
      }
      if (debug) {
        explain.path = 'due_item';
        explain.candidates = { dueCount: remaining.length };
      }
      const pick = useRandom ? (remaining.length ? remaining[Math.floor(Math.random() * remaining.length)] : null) : (remaining[0] || null);
      if (pick) {
        const total = cap > 0 ? cap : await prisma.lessonItem.count({ where: { lesson_id: { in: allowedLessonIds } } });
        const index = attemptedIds.size + 1;
        const adjBase = await maybeSwapToFamilyBase(pick as any, allowedLessonIds);
        let adj = await maybePromoteFamilyProgress(adjBase, attemptedIds, allowedLessonIds);
        adj = await maybeApplyFamilySpacing(adj, attemptedIds, allowedLessonIds, useRandom);
        const phase = await computePhaseFor(adj.id);
        logEvent({ type: 'next_item_pick', session_id: sessionId, lesson_id: session.lesson_id, payload: { item_id: pick.id, source: 'due_item', cross: isCrossVocab, phase, random: useRandom } }).catch(() => {});
        const newGenReady = await prisma.generatedDrill.count({ where: { created_at: { gt: session.started_at } } })
          .then(c => c > 0)
          .catch(() => false);
        const intro = phase === 'intro' ? await buildIntroFor(adj.id).catch(() => null) : null;
        const hints = phase === 'guided' ? await buildHintsFor(adj.id).catch(() => null) : null;
        const resp: any = { done: false, item: adj, index, total, offerEnd: offerEnd || undefined, offerExtend: offerExtend || undefined, phase, intro: intro || undefined, hints: hints || undefined, newContentReady: newGenReady || undefined, meta: { sessionId, lessonId: sessionLessonId, itemId: adj.id, lexemeId: null, familyId: null, path: (explain as any)?.path || 'due_item' } };
        if (debug) {
          explain.pick = { id: pick.id, source: useRandom ? 'random' : 'sequential' };
          resp.explain = explain;
        }
        return NextResponse.json(resp);
      }
      // continue to normal selection if none due
    }
    if (subset.length) {
      const remainingIds = subset.filter(id => !attemptedIds.has(id));
      const total = subset.length;
      let chosen: { id: string; explain?: any } | null;
      if (isMini) {
        chosen = await pickValidFromIds(useRandom ? [...remainingIds].sort(() => Math.random() - 0.5) : remainingIds);
      } else {
        chosen = { id: (useRandom ? remainingIds[Math.floor(Math.random() * remainingIds.length)] : remainingIds[0]) } as any;
      }
      const pickId = chosen?.id || null;
      if (!pickId) return NextResponse.json({ done: true, index: attemptedIds.size, total });
      const item = await prisma.lessonItem.findUnique({ where: { id: pickId }, select: { id: true, english_prompt: true, target_hebrew: true, transliteration: true, features: true } });
      if (!item) return NextResponse.json({ done: true, index: attemptedIds.size, total });
      const index = attemptedIds.size + 1;
      const adjBase = await maybeSwapToFamilyBase(item as any, allowedLessonIds);
      let adj = await maybePromoteFamilyProgress(adjBase, attemptedIds, allowedLessonIds);
      adj = await maybeApplyFamilySpacing(adj, attemptedIds, allowedLessonIds, useRandom);
      const phase = await computePhaseFor(adj.id);
      logEvent({ type: 'next_item_pick', session_id: sessionId, lesson_id: session.lesson_id, payload: { item_id: item.id, source: 'subset', cross: isCrossVocab, phase, random: useRandom } }).catch(() => {});
      const newGenReady = await prisma.generatedDrill.count({ where: { created_at: { gt: session.started_at } } })
        .then(c => c > 0)
        .catch(() => false);
      const intro = phase === 'intro' ? await buildIntroFor(adj.id).catch(() => null) : null;
      const hints = phase === 'guided' ? await buildHintsFor(adj.id).catch(() => null) : null;
      const meta = await metaFor(adj.id);
      const resp: any = { done: false, item: adj, index, total, offerEnd: offerEnd || undefined, offerExtend: offerExtend || undefined, phase, intro: intro || undefined, hints: hints || undefined, newContentReady: newGenReady || undefined, meta: { sessionId, lessonId: sessionLessonId, itemId: adj.id, lexemeId: (meta as any)?.lexeme_id || null, familyId: (meta as any)?.family_id || null, path: 'subset' } };
      if (debug) {
        explain.path = 'subset';
        explain.candidates = { subsetRemaining: remainingIds.length };
        explain.pick = { id: item.id, source: useRandom ? 'random' : 'sequential' };
        if (chosen?.explain) explain.validation = chosen.explain;
        explain.meta = { ...meta };
        resp.explain = explain;
      }
      return NextResponse.json(resp);
    } else {
      // SRS priority when not using due mode explicitly: weak items before new
      const remaining = await prisma.lessonItem.findMany({
        where: { lesson_id: { in: allowedLessonIds }, NOT: { id: { in: Array.from(attemptedIds) } } },
        select: { id: true }
      });
      const remainingIds = remaining.map(r => r.id);
      if (debug) explain.candidates = { ...(explain.candidates || {}), remainingCount: remainingIds.length };
      let nextItem: { id: string; english_prompt: string; target_hebrew: string; transliteration: string | null; features: Record<string, string | null> | null } | null = null;
      if (remainingIds.length) {
        const weakStats = await prisma.itemStat.findMany({
          where: { user_id: userId, lesson_item_id: { in: remainingIds }, OR: [{ correct_streak: { lte: 1 } }, { incorrect_count: { gt: 0 } }] },
          orderBy: [{ incorrect_count: 'desc' }, { last_attempt: 'desc' }]
        });
        const weakIds = weakStats.map(s => s.lesson_item_id);
        if (debug) explain.candidates.weakCount = weakIds.length;
        let pickId: string | null = null;
        if (weakIds.length) {
          if (isMini) {
            // Filter weakIds to allowed lexemes
            const weakLis = await prisma.lessonItem.findMany({ where: { id: { in: weakIds } }, select: { id: true, lexeme_id: true } });
            const filtered = weakLis.filter(w => w.lexeme_id && MINI_ALLOW.has(w.lexeme_id)).map(w => w.id);
            weakIds.length = 0; weakIds.push(...filtered);
          }
          if (isMini) {
            const picked = await pickValidFromIds(useRandom ? [...weakIds].sort(() => Math.random() - 0.5) : weakIds);
            pickId = picked?.id || null;
            if (picked?.explain) (explain.validation = picked.explain);
          } else {
            pickId = useRandom ? weakIds[Math.floor(Math.random() * weakIds.length)] : weakIds[0];
          }
        }
        if (!pickId) {
          // No weak items — pick a new item
          if (isMini) {
            // Filter remainingIds to allowed lexemes
            const remLis = await prisma.lessonItem.findMany({ where: { id: { in: remainingIds } }, select: { id: true, lexeme_id: true } });
            const allowedRem = remLis.filter(r => r.lexeme_id && MINI_ALLOW.has(r.lexeme_id)).map(r => r.id);
            const picked = await pickValidFromIds(useRandom ? [...allowedRem].sort(() => Math.random() - 0.5) : allowedRem);
            pickId = picked?.id || null;
            if (picked?.explain) (explain.validation = picked.explain);
          } else {
            pickId = useRandom ? remainingIds[Math.floor(Math.random() * remainingIds.length)] : remainingIds[0];
          }
        }
        if (pickId) {
          const raw = await prisma.lessonItem.findUnique({ where: { id: pickId }, select: { id: true, english_prompt: true, target_hebrew: true, transliteration: true, features: true } });
          if (raw) nextItem = { ...raw, features: raw.features as Record<string, string | null> | null };
          if (debug) explain.pick = { id: pickId, source: weakIds.length ? (useRandom ? 'weak_random' : 'weak_first') : (useRandom ? 'new_random' : 'new_first') };
        }
      }
      const total = cap > 0 ? cap : await prisma.lessonItem.count({ where: { lesson_id: { in: allowedLessonIds } } });
      if (!nextItem) return NextResponse.json({ done: true, index: attemptedIds.size, total });
      const index = attemptedIds.size + 1;
      const adjBase = await maybeSwapToFamilyBase(nextItem as any, allowedLessonIds);
      let adj = await maybePromoteFamilyProgress(adjBase, attemptedIds, allowedLessonIds);
      adj = await maybeApplyFamilySpacing(adj, attemptedIds, allowedLessonIds, useRandom);
      const phase = await computePhaseFor(adj.id);
      logEvent({ type: 'next_item_pick', session_id: sessionId, lesson_id: session.lesson_id, payload: { item_id: nextItem.id, source: useRandom ? 'random' : 'sequential', cross: isCrossVocab, phase, random: useRandom } }).catch(() => {});
      const newGenReady = await prisma.generatedDrill.count({ where: { created_at: { gt: session.started_at } } })
        .then(c => c > 0)
        .catch(() => false);
      const intro = phase === 'intro' ? await buildIntroFor(adj.id).catch(() => null) : null;
      const hints = phase === 'guided' ? await buildHintsFor(adj.id).catch(() => null) : null;
      const meta = await metaFor(adj.id);
      const resp: any = { done: false, item: adj, index, total, offerEnd: offerEnd || undefined, offerExtend: offerExtend || undefined, phase, intro: intro || undefined, hints: hints || undefined, newContentReady: newGenReady || undefined, meta: { sessionId, lessonId: sessionLessonId, itemId: adj.id, lexemeId: (meta as any)?.lexeme_id || null, familyId: (meta as any)?.family_id || null, path: (explain as any)?.path || 'srs', pick: (explain as any)?.pick || null } };
      if (debug) { explain.meta = { ...meta }; resp.explain = explain; }
      return NextResponse.json(resp);
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to get next item' }, { status: 500 });
  }
}
