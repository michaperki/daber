import fs from 'node:fs';
import path from 'node:path';
import Module from 'module';

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

function normalizePos(pos?: string | null): 'verb' | 'noun' | 'adjective' | 'other' {
  const p = (pos || '').toLowerCase();
  if (!p) return 'other';
  if (p === 'verb' || p === 'q24905') return 'verb';
  if (p === 'noun' || p === 'q1084') return 'noun';
  if (p === 'adjective' || p === 'q34698') return 'adjective';
  return 'other';
}

function labelFromFeatures(f?: Record<string, string | null> | null): string {
  if (!f) return 'unknown';
  const pos = normalizePos(f.pos || null);
  if (pos === 'verb') {
    const tense = (f.tense || '').toLowerCase();
    if (tense) return `verb ${tense}`;
    return 'verb';
  }
  if (pos === 'adjective') return 'adjective';
  if (pos === 'noun') return 'noun';
  return 'other';
}

async function main() {
  const count = Number(argOf('--count', '20')) || 20;
  const random = boolOf('--random', true);
  const due: Due = (argOf('--due', 'off') as Due) || 'off';
  const pacing = argOf('--pacing', 'fixed') === 'adaptive' ? 'adaptive' : 'fixed';
  const lessonId = 'vocab_green';

  const outDir = path.join('scripts', 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `green_session_${Date.now()}.jsonl`);

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

  for (let i = 0; i < count; i++) {
    const params = new URLSearchParams();
    params.set('random', random ? '1' : '0');
    params.set('mode', 'lex'); // exercise lexicon generators for Green
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
    const item = data.item as { id: string; english_prompt: string; target_hebrew: string; features?: Record<string,string|null>|null };
    const phase = data.phase as string | null;
    const intro = data.intro || null;
    const typeLabel = labelFromFeatures(item.features || null);
    const english = (phase === 'intro' && intro?.english) ? intro.english : item.english_prompt;
    const hebrew = (phase === 'intro' && intro?.hebrew) ? intro.hebrew : item.target_hebrew;
    const line = `${String(i+1).padStart(2)} ${String(typeLabel).padEnd(12)} [${phase || 'unknown'}] • ${english} ⇄ ${hebrew}`;
    fs.appendFileSync(outFile, line + '\n');
    console.log(line);

    // Mark intro seen and auto-answer to advance
    const dir = phase === 'recognition' ? 'he_to_en' : 'en_to_he';
    if (phase === 'intro') {
      try { await postSeen(makeReq(`http://local/api/sessions/${sessionId}/seen`, { lessonItemId: item.id }, 'POST'), { params: { sessionId } } as any); } catch {}
    }
    try {
      await postAttempt(makeReq('http://local/api/attempts', { sessionId, lessonItemId: item.id, rawTranscript: '', direction: dir, phase }, 'POST'));
    } catch {}
  }

  console.log(`\nWrote: ${outFile}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

