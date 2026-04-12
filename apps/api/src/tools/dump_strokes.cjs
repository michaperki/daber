'use strict';
// Dump raw stroke samples from Postgres into data/strokes/<split>/<letter>/*.json
// Optionally, also rasterize PNGs for image-based models.
// Usage:
//   DATABASE_URL=... node apps/api/src/tools/dump_strokes.cjs \
//     --out data/strokes \
//     --png-out data/my_by_letter \
//     --device EEE2AA --split train

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { PNG } = require('pngjs');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') out.out = argv[++i];
    else if (a === '--png-out') out.pngOut = argv[++i];
    else if (a === '--device') out.device = argv[++i];
    else if (a === '--split') out.split = argv[++i];
    else if (a === '--padding') out.padding = Number(argv[++i]);
    else if (a === '--brush') out.brush = Number(argv[++i]);
  }
  return out;
}

function flatten(strokes) {
  const pts = [];
  (strokes || []).forEach((s, sid) => (s || []).forEach((p) => pts.push([p.x, p.y, p.t || 0, sid])));
  return pts;
}

async function main() {
  const args = parseArgs(process.argv);
  const outDir = args.out || path.resolve(process.cwd(), '../../data/strokes');
  fs.mkdirSync(outDir, { recursive: true });
  const pngOut = args.pngOut || null;
  if (pngOut) fs.mkdirSync(pngOut, { recursive: true });
  const prisma = new PrismaClient();
  await prisma.$connect();

  let rows;
  if (args.device && args.split) {
    rows = await prisma.$queryRaw`SELECT id, device_id, letter, split, strokes, created_at FROM "stroke_sample" WHERE device_id=${args.device} AND split=${args.split} ORDER BY created_at ASC`;
  } else if (args.device) {
    rows = await prisma.$queryRaw`SELECT id, device_id, letter, split, strokes, created_at FROM "stroke_sample" WHERE device_id=${args.device} ORDER BY created_at ASC`;
  } else if (args.split) {
    rows = await prisma.$queryRaw`SELECT id, device_id, letter, split, strokes, created_at FROM "stroke_sample" WHERE split=${args.split} ORDER BY created_at ASC`;
  } else {
    rows = await prisma.$queryRaw`SELECT id, device_id, letter, split, strokes, created_at FROM "stroke_sample" ORDER BY created_at ASC`;
  }
  console.log(`Exporting ${rows.length} stroke samples to ${outDir}`);

  for (const r of rows) {
    const letter = r.letter;
    const split = r.split || 'train';
    const dir = path.join(outDir, split, letter);
    fs.mkdirSync(dir, { recursive: true });
    const when = new Date(r.created_at).getTime();
    const name = `${when}_${r.device_id}_${r.id}.json`;
    const outPath = path.join(dir, name);
    const pts = flatten(r.strokes);
    const payload = {
      points: pts,
      device_id: r.device_id,
      letter: letter,
      created_at: r.created_at,
      source: 'db',
    };
    fs.writeFileSync(outPath, JSON.stringify(payload));

    // Optional PNG render per letter for image-based models
    if (pngOut) {
      const pngDir = path.join(pngOut, letter);
      fs.mkdirSync(pngDir, { recursive: true });
      const pngName = `${when}_${r.device_id}_${r.id}.png`;
      const pngPath = path.join(pngDir, pngName);
      const img = rasterizeStrokes64(r.strokes || [], { padding: args.padding ?? 2, brush: args.brush ?? 1 });
      writePngGray(img, pngPath);
    }
  }

  await prisma.$disconnect();
  console.log('Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });

// ---------------- Raster helpers ----------------
function createImage(w, h) { return { w, h, data: new Float32Array(w*h) }; }
function setPixel(img, x, y, brush) {
  const r = Math.max(1, brush|0);
  for (let dy=-r; dy<=r; dy++) {
    for (let dx=-r; dx<=r; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= img.w || ny >= img.h) continue;
      if (dx*dx + dy*dy > r*r) continue;
      const i = ny * img.w + nx;
      img.data[i] = Math.max(img.data[i], 1);
    }
  }
}
function drawLine(img, x0, y0, x1, y1, brush) {
  let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0;
  while (true) {
    setPixel(img, x, y, brush);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}
function rasterizeStrokes64(strokes, opts) {
  const padding = opts.padding ?? 2;
  const brush = opts.brush ?? 1;
  // Flatten bounds
  const all = [];
  for (const s of strokes) for (const p of (s||[])) all.push([p.x, p.y]);
  if (all.length === 0) return createImage(64,64);
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  for (const [x,y] of all) { if (x<minX) minX=x; if (y<minY) minY=y; if (x>maxX) maxX=x; if (y>maxY) maxY=y; }
  const w = Math.max(1e-6, maxX - minX), h = Math.max(1e-6, maxY - minY);
  const scale = (64 - padding*2) / Math.max(w, h);
  const img = createImage(64,64);
  for (const s of strokes) {
    if (!s || s.length === 0) continue;
    for (let i=1; i<s.length; i++) {
      const p0 = s[i-1], p1 = s[i];
      const x0 = Math.round((p0.x - minX) * scale) + padding;
      const y0 = Math.round((p0.y - minY) * scale) + padding;
      const x1 = Math.round((p1.x - minX) * scale) + padding;
      const y1 = Math.round((p1.y - minY) * scale) + padding;
      drawLine(img, x0, y0, x1, y1, brush);
    }
    if (s.length === 1) {
      const p0 = s[0];
      const x = Math.round((p0.x - minX) * scale) + padding;
      const y = Math.round((p0.y - minY) * scale) + padding;
      setPixel(img, x, y, brush);
    }
  }
  return img;
}
function writePngGray(img, outPath) {
  const png = new PNG({ width: img.w, height: img.h, colorType: 6 });
  for (let i=0; i<img.w*img.h; i++) {
    // img.data is 0..1 ink; write black ink (0) on white background (255)
    const ink = img.data[i];
    const gray = Math.round((1 - ink) * 255);
    const idx = i*4;
    png.data[idx] = gray;
    png.data[idx+1] = gray;
    png.data[idx+2] = gray;
    png.data[idx+3] = 255;
  }
  png.pack().pipe(fs.createWriteStream(outPath));
}
