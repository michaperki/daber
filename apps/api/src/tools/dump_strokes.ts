/*
Dump raw stroke samples from Postgres into repo-level data/strokes/<split>/<letter>/*.json

Usage:
  npx -w apps/api tsx src/tools/dump_strokes.ts --out data/strokes [--device <id>] [--split train]
*/

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { PrismaClient } from '@prisma/client';

type Args = { out?: string; device?: string; split?: string; };
function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') out.out = argv[++i];
    else if (a === '--device') out.device = argv[++i];
    else if (a === '--split') out.split = argv[++i];
  }
  return out;
}

function flatten(strokes: Array<Array<{ x: number; y: number; t?: number }>>): number[][] {
  const pts: number[][] = [];
  strokes.forEach((s, sid) => s.forEach(p => pts.push([p.x, p.y, p.t ?? 0, sid])));
  return pts;
}

type StrokeSampleRow = {
  id: string;
  device_id: string;
  letter: string;
  split: string | null;
  strokes: unknown;
  created_at: Date;
};

async function main() {
  const args = parseArgs(process.argv);
  const outDir = args.out || path.resolve(process.cwd(), '../../data/strokes');
  fs.mkdirSync(outDir, { recursive: true });
  const prisma = new PrismaClient();
  await prisma.$connect();

  const clauses: string[] = [];
  const params: string[] = [];
  if (args.device) {
    params.push(args.device);
    clauses.push(`device_id = $${params.length}`);
  }
  if (args.split) {
    params.push(args.split);
    clauses.push(`split = $${params.length}`);
  }
  const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
  const rows = await prisma.$queryRawUnsafe<StrokeSampleRow[]>(
    `SELECT id, device_id, letter, split, strokes, created_at FROM stroke_sample${where} ORDER BY created_at ASC`,
    ...params,
  );
  console.log(`Exporting ${rows.length} stroke samples to ${outDir}`);

  for (const r of rows) {
    const letter = r.letter;
    const split = (r.split as string) || 'train';
    const dir = path.join(outDir, split, letter);
    fs.mkdirSync(dir, { recursive: true });
    const when = new Date(r.created_at).getTime();
    const name = `${when}_${r.device_id}_${r.id}.json`;
    const outPath = path.join(dir, name);
    const pts = flatten(r.strokes as any);
    const payload = {
      points: pts,
      device_id: r.device_id,
      letter: letter,
      created_at: r.created_at,
      source: 'db',
    };
    fs.writeFileSync(outPath, JSON.stringify(payload));
  }

  await prisma.$disconnect();
  console.log('Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
