import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logEvent } from '@/lib/log';
import { generateNextFromLexicon } from '@/lib/drill/generators';
import fs from 'fs';
import path from 'path';

// Cache for green glosses (lexemeId -> { gloss, pos })
let GREEN_GLOSS_MAP: Record<string, { gloss?: string | null; pos?: string | null }> | null = null;
function getGreenGlossEntry(lexId: string): { gloss?: string | null; pos?: string | null } | null {
  try {
    if (!GREEN_GLOSS_MAP) {
      const p = path.join(process.cwd(), 'data', 'green_glosses.json');
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      GREEN_GLOSS_MAP = (raw && raw.items) ? raw.items : {};
    }
    return (GREEN_GLOSS_MAP as any)[lexId] || null;
  } catch {
    return null;
  }
}

export async function GET(req: Request, { params }: { params: { sessionId: string } }) {
  const { sessionId } = params;
  try {
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
    const dueParam = url.searchParams.get('due'); // 'feature' | 'item'
    if (debug) {
      explain.query = { pacing: pacing || 'fixed', random: useRandom, mode: useLex ? 'lex' : 'db', focus: focusWeak ? 'weak' : undefined, due: dueParam || 'off' };
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
    const session = await prisma.session.findUnique({ where: { id: sessionId }, include: { lesson: { select: { id: true, type: true } } } });
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    const userId = (session.user_id || 'anon');
    const sessionLessonId = session.lesson_id; // capture for inner closures to avoid nullable narrowing issues

    const isCrossVocab = sessionLessonId === 'vocab_all';
    const allowedLessonIds: string[] = isCrossVocab
      ? (
        [
          ...(await prisma.lesson.findMany({ where: { type: 'vocab' }, select: { id: true } })).map(l => l.id),
          ...(await prisma.lesson.findMany({ where: { type: 'vocab_generated' }, select: { id: true } })).map(l => l.id),
        ]
      )
      : [session.lesson_id];
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
        function stripHebPronoun(s: string): string {
          const pronouns = ['אני','אתה','את','הוא','היא','אנחנו','אתם','אתן','הם','הן'];
          let out = s.trim();
          for (const p of pronouns) {
            if (out.startsWith(p + ' ')) { out = out.slice(p.length).trim(); break; }
          }
          return out.replace(/[\u2000-\u206F\s]+$/g, '').replace(/[!?,.;:]+$/g, '').trim();
        }
        function stripHebNikkud(s: string): string { return s.replace(/[\u0591-\u05C7]/g, ''); }
        function cleanEnglishBase(s: string): string {
          const t = s.replace(/^\s*how\s+do\s+i\s+say[:\s-]*/i, '').replace(/\?+\s*$/i, '').trim();
          return t;
        }
        function lowerFirst(s: string): string { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
        function dropLeadingThe(s: string): string { return s.replace(/^\s*the\s+/i, '').trim(); }
        function pickToVerb(cands: string[]): string | null {
          for (const c of cands) {
            const t = cleanEnglishBase(c);
            if (/^to\s+[A-Za-z]/.test(t)) return 'to ' + t.slice(3).trim().toLowerCase();
          }
          return null;
        }
        function fromContinuousToInfinitive(s: string): string | null {
          const t = cleanEnglishBase(s).toLowerCase();
          if (/getting\s+ready/.test(t)) return 'to get ready';
          const m = t.match(/\b(?:am|is|are|was|were|'m|'s|'re)\s+([a-z]+?ing)\b/);
          if (!m) return null;
          const ing = m[1];
          let base = ing;
          if (/ying$/.test(ing)) { base = ing.slice(0, -4) + 'y'; }
          else if (/([b-df-hj-np-tv-z])\1ing$/.test(ing)) { base = ing.slice(0, -4); }
          else if (/ing$/.test(ing)) { base = ing.slice(0, -3); }
          if (/mak$/.test(base)) base = base + 'e';
          if (/tak$/.test(base)) base = base + 'e';
          return 'to ' + base;
        }

        const li = await prisma.lessonItem.findUnique({ where: { id: itemId }, select: { id: true, english_prompt: true, target_hebrew: true, features: true, lexeme_id: true } });
        if (!li) return null;
        let lexId = li.lexeme_id as string | null;
        let lexPos: string | null = null;
        let lexLemma: string | null = null;
        let lexFeat: Record<string, any> | null = null;
        if (lexId) {
          const lex = await prisma.lexeme.findUnique({ where: { id: lexId }, select: { id: true, pos: true, lemma: true, features: true } });
          if (lex) { lexPos = lex.pos; lexLemma = lex.lemma; lexFeat = (lex.features as any) || null; }
        }
        if (!lexId) {
          const form = stripHebPronoun(li.target_hebrew || '');
          const inf = await prisma.inflection.findFirst({ where: { form } });
          if (inf) {
            lexId = inf.lexeme_id;
            const lex = await prisma.lexeme.findUnique({ where: { id: lexId }, select: { id: true, pos: true, lemma: true, features: true } });
            if (lex) { lexPos = lex.pos; lexLemma = lex.lemma; lexFeat = (lex.features as any) || null; }
          }
        }
        const pos = (lexPos || ((li.features as any)?.pos as string | null) || '').toLowerCase();

        // Hebrew canonical
        let heb: string | null = null;
        if (pos === 'verb' && lexLemma) {
          heb = stripHebNikkud(lexLemma);
        } else if (pos === 'adjective' && lexId) {
          const adjBase = await prisma.inflection.findFirst({ where: { lexeme_id: lexId, number: 'sg', gender: 'm' }, select: { form: true } });
          heb = stripHebNikkud((adjBase?.form || lexLemma || li.target_hebrew || '').trim());
        } else if (pos === 'noun' && lexId) {
          const isCompound = !!(lexLemma && lexLemma.includes(' ')) || !!(lexFeat && (lexFeat as any).definite_form);
          if (isCompound) {
            const def = (lexFeat && (lexFeat as any).definite_form) || null;
            heb = stripHebNikkud((def || lexLemma || '').trim());
          } else {
            const sg = await prisma.inflection.findFirst({ where: { lexeme_id: lexId, number: 'sg' }, select: { form: true } });
            const base = (sg?.form || lexLemma || '').trim();
            heb = stripHebNikkud(base.replace(/^ה+/, ''));
          }
        } else if (lexLemma) {
          heb = stripHebNikkud(lexLemma);
        } else {
          const fallback = stripHebPronoun(li.target_hebrew || '');
          heb = stripHebNikkud(fallback.replace(/^ה+/, ''));
        }

        // English canonical
        let eng: string | undefined;
        const liEnglish = cleanEnglishBase(li.english_prompt || '');
        // Prefer curated gloss for green drill when available
        if (sessionLessonId === 'vocab_green' && lexId) {
          const entry = getGreenGlossEntry(lexId);
          if (entry && typeof entry.gloss === 'string' && entry.gloss.trim()) {
            const gloss = entry.gloss.trim();
            const isVerbPos = (pos === 'verb') || (typeof entry.pos === 'string' && (entry.pos.toLowerCase() === 'verb' || entry.pos === 'Q24905'));
            eng = isVerbPos && !/^to\s+/i.test(gloss) ? `to ${gloss}` : gloss;
          }
        }
        if (!eng && pos === 'verb') {
          if (lexId) {
            const linked = await prisma.lessonItem.findMany({ where: { lexeme_id: lexId }, select: { english_prompt: true }, take: 20 });
            const byTo = pickToVerb(linked.map(r => r.english_prompt));
            if (byTo) eng = byTo;
          }
          if (!eng) {
            const naive = fromContinuousToInfinitive(liEnglish);
            if (naive) eng = naive;
          }
          if (!eng) eng = lowerFirst(liEnglish);
        } else if (!eng && pos === 'adjective') {
          eng = lowerFirst(liEnglish.replace(/\([^)]*\)/g, '').trim());
        } else if (!eng && pos === 'noun') {
          eng = dropLeadingThe(lowerFirst(liEnglish));
        } else if (!eng) {
          eng = lowerFirst(liEnglish);
        }

        return { hebrew: heb || '', english: eng || undefined };
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

    if ((useLex || dueParam === 'feature' || dueParam === 'blend') && session.lesson?.type === 'vocab') {
      try {
        const gen = await generateNextFromLexicon(sessionId, attemptedIds, { focusWeakness: focusWeak });
        if (gen) {
          if (debug) {
            explain.path = 'lex';
            explain.pick = { id: gen.id, source: 'lex' };
          }
          const adjBase = await maybeSwapToFamilyBase(gen, allowedLessonIds);
          let adj = await maybePromoteFamilyProgress(adjBase, attemptedIds, allowedLessonIds);
          adj = await maybeApplyFamilySpacing(adj, attemptedIds, allowedLessonIds, useRandom);
          const phase = await computePhaseFor(adj.id);
          logEvent({ type: 'next_item_pick', session_id: sessionId, lesson_id: session.lesson_id, payload: { item_id: gen.id, source: 'lex', cross: isCrossVocab, phase, random: useRandom } }).catch(() => {});
          const newGenReady = await prisma.generatedDrill.count({ where: { created_at: { gt: session.started_at } } })
            .then(c => c > 0)
            .catch(() => false);
          const intro = phase === 'intro' ? await buildIntroFor(adj.id).catch(() => null) : null;
          const hints = phase === 'guided' ? await buildHintsFor(adj.id).catch(() => null) : null;
          const resp: any = { done: false, item: adj, offerEnd: offerEnd || undefined, offerExtend: offerExtend || undefined, phase, intro: intro || undefined, hints: hints || undefined, newContentReady: newGenReady || undefined };
          if (debug) resp.explain = explain;
          return NextResponse.json(resp);
        }
      } catch {
        // fall through to regular selection when generator fails
      }
      // fall through to regular selection when no generated item is available
    }
    // Feature due selection: prioritize items whose features match due/weak FeatureStat rows
    if (dueParam === 'feature' || dueParam === 'blend') {
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
        const featureCandidates = remainingPool.filter(r => featsMatch((r as any).features));
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
        if (dueParam === 'feature') {
          const total = cap > 0 ? cap : await prisma.lessonItem.count({ where: { lesson_id: { in: allowedLessonIds } } });
          return NextResponse.json({ done: true, index: attemptedIds.size, total });
        }
      } catch {
        // ignore and fall through
      }
    }
    if (!dueParam || dueParam === 'item' || dueParam === 'blend') {
      // Pick an authored item from this lesson that is due in ItemStat
      const now = new Date();
      const dueItems = await prisma.itemStat.findMany({ where: { user_id: userId, next_due: { lte: now } } });
      const dueSet = new Set(dueItems.map(d => d.lesson_item_id));
      const remaining = await prisma.lessonItem.findMany({ where: { lesson_id: { in: allowedLessonIds }, id: { in: Array.from(dueSet) }, NOT: { id: { in: Array.from(attemptedIds) } } }, select: { id: true, english_prompt: true, target_hebrew: true, transliteration: true, features: true } });
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
        const resp: any = { done: false, item: adj, index, total, offerEnd: offerEnd || undefined, offerExtend: offerExtend || undefined, phase, intro: intro || undefined, hints: hints || undefined, newContentReady: newGenReady || undefined };
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
      const pickId = useRandom ? remainingIds[Math.floor(Math.random() * remainingIds.length)] : remainingIds[0];
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
      const resp: any = { done: false, item: adj, index, total, offerEnd: offerEnd || undefined, offerExtend: offerExtend || undefined, phase, intro: intro || undefined, hints: hints || undefined, newContentReady: newGenReady || undefined };
      if (debug) {
        explain.path = 'subset';
        explain.candidates = { subsetRemaining: remainingIds.length };
        explain.pick = { id: item.id, source: useRandom ? 'random' : 'sequential' };
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
          pickId = useRandom ? weakIds[Math.floor(Math.random() * weakIds.length)] : weakIds[0];
        }
        if (!pickId) {
          // No weak items — pick a new item
          pickId = useRandom ? remainingIds[Math.floor(Math.random() * remainingIds.length)] : remainingIds[0];
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
      const resp: any = { done: false, item: adj, index, total, offerEnd: offerEnd || undefined, offerExtend: offerExtend || undefined, phase, intro: intro || undefined, hints: hints || undefined, newContentReady: newGenReady || undefined };
      if (debug) resp.explain = explain;
      return NextResponse.json(resp);
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to get next item' }, { status: 500 });
  }
}
