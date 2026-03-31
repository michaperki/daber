import fs from 'node:fs';
import path from 'node:path';

function findLatestReport(): string | null {
  const dir = path.join(process.cwd(), 'scripts', 'out');
  try {
    const files = fs.readdirSync(dir).filter(f => /^mini_expand_report_\d+\.json$/.test(f));
    if (!files.length) return null;
    const withTime = files.map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }));
    withTime.sort((a, b) => b.t - a.t);
    return path.join(dir, withTime[0].f);
  } catch { return null; }
}

function h1(s: string) { return `# ${s}`; }
function h2(s: string) { return `\n\n## ${s}`; }
function code(s: string) { return '`' + s + '`'; }

function fmtVerb(verb: any): string {
  const lines: string[] = [];
  if (verb?.present) {
    const p = verb.present as Array<any>;
    const present = [
      p.find(x => x.number === 'sg' && x.gender === 'm'),
      p.find(x => x.number === 'sg' && x.gender === 'f'),
      p.find(x => x.number === 'pl' && x.gender === 'm'),
      p.find(x => x.number === 'pl' && x.gender === 'f')
    ];
    lines.push(`- Present: msg=${present[0]?.form || '—'}, fsg=${present[1]?.form || '—'}, mpl=${present[2]?.form || '—'}, fpl=${present[3]?.form || '—'}`);
  }
  const order = [
    ['1','sg',null], ['2','sg','m'], ['2','sg','f'], ['3','sg','m'], ['3','sg','f'],
    ['1','pl',null], ['2','pl',null], ['3','pl',null]
  ] as const;
  function lineFor(arr?: Array<any>, label?: string) {
    if (!arr?.length) return;
    const parts: string[] = [];
    for (const [pe, nu, ge] of order) {
      const f = arr.find(x => x.person === pe && x.number === nu && (x.gender ?? null) === ge);
      const tag = `${pe}${nu}${ge ? ge : ''}`;
      parts.push(`${tag}=${f?.form || '—'}`);
    }
    lines.push(`- ${label}: ${parts.join(', ')}`);
  }
  lineFor(verb?.past as Array<any>, 'Past');
  lineFor(verb?.future as Array<any>, 'Future');
  return lines.join('\n');
}

function fmtAdj(adj: any): string {
  if (!adj) return '';
  return `- Forms: msg=${adj.msg || '—'}, fsg=${adj.fsg || '—'}, mpl=${adj.mpl || '—'}, fpl=${adj.fpl || '—'}`;
}

function fmtNoun(noun: any): string {
  if (!noun) return '';
  const sg = noun.sg?.form || '—';
  const pl = noun.pl?.form || '—';
  return `- Singular: ${sg}\n- Plural: ${pl}`;
}

function main() {
  const reportPath = findLatestReport();
  if (!reportPath) {
    console.error('No mini expansion report found in scripts/out');
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const outLines: string[] = [];
  outLines.push(h1('Mini Expansion Summary'));
  outLines.push(`Generated: ${raw.generatedAt || new Date().toISOString()}`);
  outLines.push(`Report: ${path.basename(reportPath)}`);
  outLines.push(`Counts: added=${raw.addedCount} skipped=${raw.skippedCount}`);

  outLines.push(h2(`Added Lexemes (${raw.addedCount})`));
  for (const a of (raw.added || [])) {
    const head = `- ${a.lemma} (${a.gloss}) — ${code(a.id)} [${a.pos}]`;
    outLines.push(head);
    if (a.verb) outLines.push(fmtVerb(a.verb));
    if (a.adjective) outLines.push(fmtAdj(a.adjective));
    if (a.noun) outLines.push(fmtNoun(a.noun));
  }

  outLines.push(h2(`Skipped (${raw.skippedCount})`));
  for (const s of (raw.skipped || [])) {
    const line = `- ${code(s.id)}${s.lemma ? ` (${s.lemma})` : ''}: ${s.reason || 'reason_unknown'}`;
    outLines.push(line);
  }

  const outDir = path.dirname(reportPath);
  const ts = Date.now();
  const outPath = path.join(outDir, `mini_expand_summary_${ts}.md`);
  fs.writeFileSync(outPath, outLines.join('\n') + '\n', 'utf8');
  // eslint-disable-next-line no-console
  console.log(outPath);
}

main();

