/*
Dump calibration samples from Postgres (Heroku) to local files.

Usage:
  # Ensure DATABASE_URL is set (Heroku Postgres connection string)
  # Or pass --url explicitly
  npx -w apps/api tsx src/tools/dump_calibrations.ts \
    --out-json data/calibration_dump \
    --out-png data/db_by_letter

Options:
  --url <postgres_url>     Override DATABASE_URL env var
  --out-json <dir>         Write one JSON per device with payload as stored
  --out-png <dir>          Write aggregated per-letter PNGs (64x64)
  --limit <n>              Limit number of devices (for quick tests)
*/

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { PrismaClient } from '@prisma/client';
import { PNG } from 'pngjs';

type Args = {
  url?: string;
  outJson?: string;
  outPng?: string;
  limit?: number;
};

const LETTERS = [
  'א','ב','ג','ד','ה','ו','ז','ח','ט','י','ך','כ','ל','ם','מ','ן','נ','ס','ע','ף','פ','ץ','צ','ק','ר','ש','ת'
] as const;

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') out.url = argv[++i];
    else if (a === '--out-json') out.outJson = argv[++i];
    else if (a === '--out-png') out.outPng = argv[++i];
    else if (a === '--limit') out.limit = Number(argv[++i]);
  }
  return out;
}

async function writePng64(vec: Uint8Array | Float32Array, outPath: string) {
  const png = new PNG({ width: 64, height: 64, colorType: 6 });
  // First 4096 entries are pixels in [0,255] (Uint8) or [0,1] (Float32)
  const get = (i: number): number => {
    const v = (vec as any)[i];
    const f = typeof v === 'number' ? v : 0;
    const g = vec instanceof Uint8Array ? f / 255 : f;
    return Math.max(0, Math.min(1, g));
  };
  for (let i = 0; i < 64 * 64; i++) {
    const v = get(i);
    const gray = Math.round((1 - v) * 255);
    const idx = i * 4;
    png.data[idx + 0] = gray;
    png.data[idx + 1] = gray;
    png.data[idx + 2] = gray;
    png.data[idx + 3] = 255;
  }
  await new Promise<void>((resolve, reject) => {
    png
      .pack()
      .pipe(fs.createWriteStream(outPath))
      .on('finish', () => resolve())
      .on('error', reject);
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const url = args.url || process.env.DATABASE_URL;
  if (!url) {
    console.error('ERROR: DATABASE_URL not set and no --url provided.');
    process.exit(1);
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  console.log('Connecting to database...');
  // Prime the connection
  await prisma.$connect();

  console.log('Fetching device_calibration rows...');
  const rows = await prisma.deviceCalibration.findMany({
    take: args.limit && args.limit > 0 ? args.limit : undefined,
    orderBy: { created_at: 'asc' },
  });
  console.log(`Found ${rows.length} devices with calibration.`);

  // Out dirs
  if (args.outJson) fs.mkdirSync(args.outJson, { recursive: true });
  if (args.outPng) fs.mkdirSync(args.outPng, { recursive: true });

  // Aggregate counters
  const counts: Record<string, number> = {};

  for (const row of rows) {
    const deviceId = row.device_id;
    const payload: any = row.payload as any;
    if (!payload || payload.version !== 1 || !payload.samples) continue;

    if (args.outJson) {
      const outPath = path.join(args.outJson, `${deviceId}.json`);
      fs.writeFileSync(outPath, JSON.stringify(payload));
    }

    if (args.outPng) {
      for (const L of LETTERS) {
        const arr: string[] = payload.samples[L] || [];
        if (!arr.length) continue;
        const letterDir = path.join(args.outPng, L);
        fs.mkdirSync(letterDir, { recursive: true });
        for (let i = 0; i < arr.length; i++) {
          const b64 = arr[i];
          const u8 = Buffer.from(b64, 'base64');
          const vec = new Uint8Array(u8.buffer, u8.byteOffset, u8.byteLength);
          const n = counts[L] = (counts[L] || 0) + 1;
          const name = `${deviceId}_${String(n).padStart(5, '0')}.png`;
          const outPath = path.join(letterDir, name);
          // eslint-disable-next-line no-await-in-loop
          await writePng64(vec, outPath);
        }
      }
    }
  }

  console.log('Done.');
  if (args.outPng) {
    console.log('Per-letter counts:');
    for (const L of LETTERS) console.log(`  ${L}: ${counts[L] || 0}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

