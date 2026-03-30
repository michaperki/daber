import path from 'node:path';
import Module from 'module';
import { prisma } from '../Daber/lib/db';

function assert(cond: any, msg: string) {
  if (!cond) throw new Error(msg);
}

async function createSession(lessonId: string): Promise<string> {
  const origResolve = (Module as any)._resolveFilename as Function;
  (Module as any)._resolveFilename = function patched(request: string, parent: any, isMain: boolean, options: any) {
    if (request && request.startsWith('@@/')) request = request.replace(/^@@\//, path.join(process.cwd(), 'Daber/'));
    else if (request && request.startsWith('@/')) request = request.replace(/^@\//, path.join(process.cwd(), 'Daber/'));
    return origResolve.call(this, request, parent, isMain, options);
  };
  const { POST: createSession } = await import('../Daber/app/api/sessions/route');
  const userId = `test_mini_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  const res = await createSession(new Request('http://local/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lessonId, userId }) }) as any);
  const data = await (res as Response).json();
  return data.session.id as string;
}

async function getNext(sessionId: string, params?: Record<string, string>): Promise<any> {
  const { GET: nextItem } = await import('../Daber/app/api/sessions/[sessionId]/next-item/route');
  const sp = new URLSearchParams({ debug: '1', ...(params || {}) });
  const res = await nextItem(new Request(`http://local/api/sessions/${sessionId}/next-item?${sp.toString()}`) as any, { params: { sessionId } } as any);
  return (await (res as Response).json());
}

async function postSeen(sessionId: string, lessonItemId: string): Promise<void> {
  const { POST: seen } = await import('../Daber/app/api/sessions/[sessionId]/seen/route');
  await seen(new Request(`http://local/api/sessions/${sessionId}/seen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lessonItemId }) }) as any, { params: { sessionId } } as any);
}

async function run() {
  const lessonId = 'vocab_mini_morph';
  const sessionId = await createSession(lessonId);
  const seenByPos: Record<string, { heb: string; en?: string; itemId: string }> = {};

  const MINI_ALLOW = new Set<string>([
    'mini_lex_write','mini_lex_book','mini_lex_big',
    'mini_lex_speak','mini_lex_icecream','mini_lex_new',
  ]);

  function isHebrew(s: string) { return /[\u0590-\u05FF]/.test(s); }
  function isSingleToken(s: string) { return (s || '').trim().split(/\s+/).filter(Boolean).length === 1; }
  function startsWithHa(s: string) { return /^ה+/.test(s || ''); }
  function looksPlural(s: string) { return /(?:ים|ות)$/.test(s || ''); }
  function looksInfinitive(s: string) { return /^ל\S+$/.test(s || ''); }

  // Collect first intros for verb, noun, adjective
  for (let i = 0; i < 30; i++) {
    const data = await getNext(sessionId, { random: '1' });
    if (data.done) break;
    const item = data.item;
    const phase = data.phase as string | null;
    const intro = data.intro || null;
    const pos = (data?.explain?.meta?.pos || '').toLowerCase();
    if (phase === 'intro' && intro?.hebrew) {
      await postSeen(sessionId, item.id);
      if (pos && !seenByPos[pos]) {
        seenByPos[pos] = { heb: intro.hebrew, en: intro.english, itemId: item.id };
      }
    }
    if (seenByPos['verb'] && seenByPos['noun'] && seenByPos['adjective']) break;
  }
  assert(seenByPos['verb'], 'verb intro not seen');
  assert(seenByPos['noun'], 'noun intro not seen');
  assert(seenByPos['adjective'], 'adjective intro not seen');
  // Canonical base form sanity
  assert(isHebrew(seenByPos['verb'].heb) && isSingleToken(seenByPos['verb'].heb) && looksInfinitive(seenByPos['verb'].heb), `verb intro must be an infinitive; got ${seenByPos['verb'].heb}`);
  assert(isHebrew(seenByPos['noun'].heb) && isSingleToken(seenByPos['noun'].heb) && !startsWithHa(seenByPos['noun'].heb) && !looksPlural(seenByPos['noun'].heb), `noun intro must be singular, no ה-; got ${seenByPos['noun'].heb}`);
  assert(isHebrew(seenByPos['adjective'].heb) && isSingleToken(seenByPos['adjective'].heb) && !looksPlural(seenByPos['adjective'].heb), `adjective intro must be m.sg base; got ${seenByPos['adjective'].heb}`);
  // English must be present on intros
  assert(!!seenByPos['verb'].en, 'verb intro missing English');
  assert(!!seenByPos['noun'].en, 'noun intro missing English');
  assert(!!seenByPos['adjective'].en, 'adjective intro missing English');

  // Later exposures from the same families should not be intros again
  for (let i = 0; i < 10; i++) {
    const data = await getNext(sessionId, { random: '1' });
    if (data.done) break;
    const phase = data.phase as string | null;
    assert(phase !== 'intro', 'variant created a new intro');
  }

  // Family stats: ensure introduced families are a subset of the mini allowlist
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  const userId = (session?.user_id || 'anon');
  const fams = await prisma.familyStat.findMany({ where: { user_id: userId } });
  const miniFams = fams.filter(f => f.family_id.startsWith('lex:mini_lex_'));
  const famIds = new Set(miniFams.map(f => f.family_id));
  for (const fid of famIds) {
    const lexId = fid.replace(/^lex:/, '');
    assert(MINI_ALLOW.has(lexId), `introduced family not in allowlist: ${fid}`);
  }
  assert(miniFams.length >= 3 && miniFams.length <= MINI_ALLOW.size, `unexpected number of mini families introduced: ${miniFams.length}`);

  // Invalid item rejection: create a mismatched item in the mini lesson and ensure it is skipped in subset
  await prisma.lessonItem.upsert({
    where: { id: 'mini_invalid' },
    update: { lesson_id: lessonId, english_prompt: 'How do I say: big?', target_hebrew: 'הוא קטן', transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['mini','adjective','invalid'], difficulty: 1, lexeme_id: 'mini_lex_big', family_id: 'lex:mini_lex_big', features: { pos: 'adjective', number: 'sg', gender: 'm' } as any },
    create: { id: 'mini_invalid', lesson_id: lessonId, english_prompt: 'How do I say: big?', target_hebrew: 'הוא קטן', transliteration: null, accepted_variants: [], near_miss_patterns: [], tags: ['mini','adjective','invalid'], difficulty: 1, lexeme_id: 'mini_lex_big', family_id: 'lex:mini_lex_big', features: { pos: 'adjective', number: 'sg', gender: 'm' } as any }
  });
  const s2 = await createSession(lessonId);
  const { GET: nextItem } = await import('../Daber/app/api/sessions/[sessionId]/next-item/route');
  const body = new Request(`http://local/api/sessions/${s2}/next-item?debug=1`, { method: 'GET' });
  const res = await nextItem(body as any, { params: { sessionId: s2 } } as any);
  const d0 = await (res as Response).json();
  // We can't guarantee there are other items due first, but we can ensure the handler did not return the invalid item as first pick when subset contains only it.
  // Force subset containing only mini_invalid
  const s3res = await (await import('../Daber/app/api/sessions/route')).POST(new Request('http://local/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lessonId, subset: ['mini_invalid'] }) }) as any);
  const s3data = await (s3res as Response).json();
  const s3 = s3data.session.id as string;
  const r3 = await nextItem(new Request(`http://local/api/sessions/${s3}/next-item?debug=1`) as any, { params: { sessionId: s3 } } as any);
  const j3 = await (r3 as Response).json();
  assert(j3.done === true, 'invalid subset item was not rejected');

  await prisma.$disconnect();
  // eslint-disable-next-line no-console
  console.log('Mini morph tests passed');
}

run().catch((e) => { console.error('Mini morph tests failed:', e?.message || e); process.exit(1); });
