import fs from 'node:fs';
import path from 'node:path';
import Module from 'module';

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
  const count = Number(argOf('--count', '30')) || 30;
  const random = boolOf('--random', true);
  const pacing = argOf('--pacing', 'fixed') === 'adaptive' ? 'adaptive' : 'fixed';
  const lessonId = 'vocab_mini_morph';

  const outDir = path.join('scripts', 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `mini_morph_${Date.now()}.jsonl`);

  const makeReq = (url: string, body?: any, method = 'GET') => {
    return new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }) as any;
  };

  // Alias resolver for '@/'
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

  // Track intros per family
  const seenFamilies = new Set<string>();

  for (let i = 0; i < count; i++) {
    const params = new URLSearchParams();
    params.set('random', random ? '1' : '0');
    if (pacing === 'adaptive') params.set('pacing', 'adaptive');
    params.set('debug', '1');
    const url = `http://local/api/sessions/${sessionId}/next-item?${params.toString()}`;
    const res = await getNextItem(makeReq(url), { params: { sessionId } } as any);
    const data = await (res as Response).json();
    if (data.done) {
      console.log(`Done at ${i}/${count}`);
      break;
    }
    const item = data.item as { id: string; english_prompt: string; target_hebrew: string };
    const phase = data.phase as string | null;
    const intro = data.intro || null;
    const explain = (data as any).explain || null;
    const meta = explain?.meta || {};
    const english = (phase === 'intro' && intro?.english) ? intro.english : item.english_prompt;
    const hebrew = (phase === 'intro' && intro?.hebrew) ? intro.hebrew : item.target_hebrew;

    const line = {
      idx: i + 1,
      phase,
      english,
      hebrew,
      id: item.id,
      family: meta.family_id || null,
      lexeme_id: meta.lexeme_id || null,
      pos: meta.pos || null,
      features: meta.features || null,
      why: explain?.pick || explain?.path || null
    };
    fs.appendFileSync(outFile, JSON.stringify(line) + '\n');
    console.log(`${String(i + 1).padStart(2)} [${phase || 'unknown'}] ${english} ⇄ ${hebrew}`);

    // Mark intro seen; auto-grade others
    if (phase === 'intro') {
      // gather family id
      if (meta.family_id) seenFamilies.add(meta.family_id);
      try { await postSeen(makeReq(`http://local/api/sessions/${sessionId}/seen`, { lessonItemId: item.id }, 'POST'), { params: { sessionId } } as any); } catch {}
    } else {
      const dir = phase === 'recognition' ? 'he_to_en' : 'en_to_he';
      try { await postAttempt(makeReq('http://local/api/attempts', { sessionId, lessonItemId: item.id, rawTranscript: '', direction: dir, phase }, 'POST')); } catch {}
    }
  }

  console.log(`\nFamilies introduced: ${Array.from(seenFamilies).length}`);
  console.log(`Wrote: ${outFile}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

