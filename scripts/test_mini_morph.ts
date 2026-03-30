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
  // Canonical base checks
  assert(seenByPos['verb'].heb === 'לכתוב', `verb intro must be infinitive; got ${seenByPos['verb'].heb}`);
  assert(seenByPos['noun'].heb === 'ספר', `noun intro must be singular; got ${seenByPos['noun'].heb}`);
  assert(seenByPos['adjective'].heb === 'גדול', `adjective intro must be m.sg; got ${seenByPos['adjective'].heb}`);
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

  // Family stats: ensure exactly 3 families introduced for anon
  const fams = await prisma.familyStat.findMany({ where: { user_id: 'anon' } });
  const miniFams = fams.filter(f => ['lex:mini_lex_write','lex:mini_lex_book','lex:mini_lex_big'].includes(f.family_id));
  assert(miniFams.length === 3, `expected 3 mini families introduced, got ${miniFams.length}`);

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
