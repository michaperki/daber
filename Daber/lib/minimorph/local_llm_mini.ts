/**
 * Mini‑Morph LLM integration (per‑session cache + prefetch)
 *
 * Scopes vocabulary to the mini‑morph lexeme set.
 *
 * Env:
 * - LOCAL_LLM_ENABLED=true
 */

import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '@/lib/db';
import { logEvent } from '@/lib/log';
import { generateBatch, getUserVocabScopeForLexemeSet } from '@/lib/generation/local_llm';

type CachedItem = { lexeme_id: string; hebrew: string; english: string };
const MINI_CACHE = new Map<string, Map<string, CachedItem[]>>(); // sessionId -> (lexemeId -> items)

function loadMiniAllowlist(): string[] {
  try {
    const p = path.join(process.cwd(), 'Daber', 'data', 'mini_allowlist.json');
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const ids = Array.isArray(raw?.lexemeIds) ? raw.lexemeIds.map(String) : [];
    return ids.filter(Boolean);
  } catch {
    return [
      'mini_lex_write', 'mini_lex_book', 'mini_lex_big',
      'mini_lex_speak', 'mini_lex_icecream', 'mini_lex_new',
      'mini_lex_read', 'mini_lex_hear', 'mini_lex_song', 'mini_lex_smart',
    ];
  }
}

function llmEnabled(): boolean {
  return (process.env.LOCAL_LLM_ENABLED || '').toLowerCase() === 'true';
}

async function chooseUpcomingMiniLexemes(userId: string, count: number, allowedLexIds: string[]): Promise<string[]> {
  // Prefer due items within mini; then weak within mini
  const allow = new Set(allowedLexIds);
  const now = new Date();
  const dueStats = await prisma.itemStat.findMany({ where: { user_id: userId, next_due: { lte: now } }, orderBy: { next_due: 'asc' }, take: 200, select: { lesson_item_id: true } });
  const dueLis = await prisma.lessonItem.findMany({ where: { id: { in: dueStats.map(s => s.lesson_item_id) }, lexeme_id: { not: null } }, select: { lexeme_id: true } });
  const ids: string[] = [];
  for (const r of dueLis) {
    const id = r.lexeme_id as string;
    if (id && allow.has(id) && !ids.includes(id)) ids.push(id);
    if (ids.length >= count) break;
  }
  if (ids.length < count) {
    const weak = await prisma.itemStat.findMany({ where: { user_id: userId }, orderBy: [{ incorrect_count: 'desc' }, { correct_streak: 'asc' }], take: 200, select: { lesson_item_id: true } });
    const weakLis = await prisma.lessonItem.findMany({ where: { id: { in: weak.map(s => s.lesson_item_id) }, lexeme_id: { not: null } }, select: { lexeme_id: true } });
    for (const r of weakLis) {
      const id = r.lexeme_id as string;
      if (id && allow.has(id) && !ids.includes(id)) ids.push(id);
      if (ids.length >= count) break;
    }
  }
  return ids.slice(0, count);
}

export async function popCachedLocalMiniItemForLexeme(sessionId: string, lessonId: string, lexemeId: string): Promise<{ id: string; english_prompt: string; target_hebrew: string; transliteration: string | null; features: Record<string, string | null> | null } | null> {
  if (!llmEnabled()) return null;
  const m = MINI_CACHE.get(sessionId);
  if (!m) return null;
  const bucket = m.get(lexemeId) || [];
  const next = bucket.shift();
  if (!next) return null;
  if (!bucket.length) m.delete(lexemeId); else m.set(lexemeId, bucket);
  const genLessonId = `${lessonId}_gen`;
  const id = `llm_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
  const li = await prisma.lessonItem.create({
    data: {
      id,
      lesson_id: genLessonId,
      english_prompt: next.english,
      target_hebrew: next.hebrew,
      transliteration: null,
      accepted_variants: [], near_miss_patterns: [], tags: ['generated','local_llm','mini'], difficulty: 1,
      lexeme_id: lexemeId,
      features: { pos: 'sentence', source: 'local_llm' } as any
    }
  });
  try { logEvent({ type: 'local_llm_served', payload: { target_lexeme_id: lexemeId, was_cached: true, scope: 'mini' } }); } catch {}
  return { id: li.id, english_prompt: li.english_prompt, target_hebrew: li.target_hebrew, transliteration: li.transliteration, features: (li as any).features as any };
}

export async function maybeRefillMiniCache(sessionId: string, lessonId: string, userId: string) {
  if (!llmEnabled()) return;
  const m = MINI_CACHE.get(sessionId);
  const total = m ? Array.from(m.values()).reduce((s, a) => s + a.length, 0) : 0;
  if (total >= 2) return;
  await generateMiniBatchIntoCache(sessionId, lessonId, userId, 3).catch(() => {});
}

export async function generateMiniBatchIntoCache(sessionId: string, lessonId: string, userId: string, targetCount: number, timeoutMs?: number): Promise<boolean> {
  if (!llmEnabled()) return false;
  try {
    const allowed = loadMiniAllowlist();
    const { knownLemmas, allowedTenses } = await getUserVocabScopeForLexemeSet(userId, allowed);
    const targets = await chooseUpcomingMiniLexemes(userId, Math.max(1, targetCount), allowed);
    if (!targets.length) return false;
    const lexRows = await prisma.lexeme.findMany({ where: { id: { in: targets } }, select: { id: true, lemma: true } });
    const targetLemmas = lexRows.map(r => r.lemma);
    const items = await generateBatch({ targetLemmas, knownLemmas, allowedTenses, direction: 'he_to_en', timeoutMs });
    if (!items.length) { logEvent({ type: 'local_llm_batch', payload: { batch_size: targetLemmas.length, valid_count: 0, scope: 'mini' } }); return false; }
    let m = MINI_CACHE.get(sessionId); if (!m) { m = new Map(); MINI_CACHE.set(sessionId, m); }
    for (const it of items) {
      const lexId = it.target_lexeme_id as string | undefined;
      if (!lexId) continue;
      const bucket = m.get(lexId) || [];
      bucket.push({ lexeme_id: lexId, hebrew: it.hebrew, english: it.english });
      m.set(lexId, bucket);
    }
    logEvent({ type: 'local_llm_batch', payload: { batch_size: targetLemmas.length, valid_count: items.length, scope: 'mini' } });
    return items.length > 0;
  } catch (e) {
    logEvent({ type: 'local_llm_batch', payload: { error: (e as any)?.message || 'error', scope: 'mini' } });
    return false;
  }
}

export async function prefetchLocalLLMForMiniSession(sessionId: string) {
  if (!llmEnabled()) return;
  const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { lesson_id: true, user_id: true } });
  if (!session) return;
  if (session.lesson_id !== 'vocab_mini_morph') return;
  await generateMiniBatchIntoCache(sessionId, session.lesson_id, session.user_id || 'anon', 5).catch(() => {});
}

export function getMiniCacheSize(sessionId: string): number {
  const m = MINI_CACHE.get(sessionId);
  if (!m) return 0;
  return Array.from(m.values()).reduce((s, arr) => s + arr.length, 0);
}
