import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../Daber/lib/db';
import Module from 'module';

type Mode = 'db' | 'lex';
type Due = 'off' | 'item' | 'feature' | 'blend';

function argOf(flag: string, def?: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? (process.argv[i + 1] || '') : def;
}

function boolOf(flag: string, def = false): boolean {
  const v = argOf(flag);
  if (v === undefined) return def;
  if (v === '1' || v?.toLowerCase() === 'true') return true;
  if (v === '0' || v?.toLowerCase() === 'false') return false;
  return def;
}

async function main() {
  const count = Number(argOf('--count', '25')) || 25;
  const random = boolOf('--random', true);
  const mode: Mode = (argOf('--mode', 'db') as Mode) || 'db';
  const due: Due = (argOf('--due', 'off') as Due) || 'off';
  const pacing = argOf('--pacing', 'fixed') === 'adaptive' ? 'adaptive' : 'fixed';
  const lessonId = argOf('--lesson', 'vocab_all') || 'vocab_all';

  const outDir = path.join('scripts', 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `drill_run_${Date.now()}.jsonl`);

  const makeReq = (url: string, body?: any, method = 'GET') => {
    return new Request(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }) as any;
  };

  // Install a lightweight alias resolver for imports like '@/lib/db'
  const origResolve = (Module as any)._resolveFilename as Function;
  (Module as any)._resolveFilename = function patched(request: string, parent: any, isMain: boolean, options: any) {
    if (request && request.startsWith('@@/')) {
      request = request.replace(/^@@\//, path.join(process.cwd(), 'Daber/'));
    } else if (request && request.startsWith('@/')) {
      request = request.replace(/^@\//, path.join(process.cwd(), 'Daber/'));
    }
    return origResolve.call(this, request, parent, isMain, options);
  };

  const { POST: createSession } = await import('../Daber/app/api/sessions/route');
  const { GET: getNextItem } = await import('../Daber/app/api/sessions/[sessionId]/next-item/route');
  const { POST: postAttempt } = await import('../Daber/app/api/attempts/route');
  const { POST: postSeen } = await import('../Daber/app/api/sessions/[sessionId]/seen/route');

  const createRes = await createSession(makeReq('http://local/api/sessions', { lessonId }, 'POST'));
  const createData = await (createRes as Response).json();
  if (!createData?.session?.id) throw new Error('Failed to create session');
  const sessionId = createData.session.id as string;
  console.log(`Session: ${sessionId} (lesson=${lessonId})`);

  const rows: any[] = [];
  for (let i = 0; i < count; i++) {
    const params = new URLSearchParams();
    if (random) params.set('random', '1');
    if (mode === 'lex') params.set('mode', 'lex');
    if (due !== 'off') params.set('due', due);
    if (pacing === 'adaptive') params.set('pacing', 'adaptive');
    params.set('debug', '1');
    const url = `http://local/api/sessions/${sessionId}/next-item?${params.toString()}`;
    const res = await getNextItem(makeReq(url), { params: { sessionId } } as any);
    const data = await (res as Response).json();
    if (data.done) {
      console.log(`Done at ${i}/${count}`);
      break;
    }
    const item = data.item;
    const phase = data.phase || null;
    const explain = data.explain || null;
    rows.push({
      t: new Date().toISOString(),
      idx: data.index || i + 1,
      phase,
      item: { id: item.id, en: item.english_prompt, he: item.target_hebrew },
      path: explain?.path || null,
      pick: explain?.pick || null,
      candidates: explain?.candidates || null,
      lesson: explain?.lesson || null,
    });
    const dir = phase === 'recognition' ? 'he_to_en' : 'en_to_he';
    if (phase === 'intro') {
      try { await postSeen(makeReq(`http://local/api/sessions/${sessionId}/seen`, { lessonItemId: item.id }, 'POST'), { params: { sessionId } } as any); } catch {}
    }
    const attRes = await postAttempt(makeReq('http://local/api/attempts', { sessionId, lessonItemId: item.id, rawTranscript: '', direction: dir, phase }, 'POST'));
    const att = await (attRes as Response).json();
    const row = rows[rows.length - 1];
    row.grade = att.grade;
    row.reason = att.reason || null;
    fs.appendFileSync(outFile, JSON.stringify(row) + '\n');
    console.log(`${String(row.idx).padStart(2)} [${row.path || 'srs'}] ${phase?.padEnd(12)} • ${item.english_prompt} ⇄ ${item.target_hebrew}`);
  }

  const events = await prisma.event.findMany({ where: { session_id: sessionId, type: 'next_item_pick' }, orderBy: { created_at: 'asc' }, select: { created_at: true, payload: true } });
  console.log(`\nEvents (next_item_pick): ${events.length}`);
  for (const e of events) {
    const p = (e as any).payload || {};
    console.log(`- ${new Date(e.created_at).toISOString()} • source=${p.source} id=${p.item_id}`);
  }

  await prisma.$disconnect();
  console.log(`\nWrote trace: ${outFile}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
