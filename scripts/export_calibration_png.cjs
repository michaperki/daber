'use strict';
// Export calibration JSON to per-letter 64x64 PNGs for training.
// Usage: node scripts/export_calibration_png.cjs <calibration.json> <outdir>

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const LETTERS = [
  'א','ב','ג','ד','ה','ו','ז','ח','ט','י','ך','כ','ל','ם','מ','ן','נ','ס','ע','ף','פ','ץ','צ','ק','ר','ש','ת'
];

function writePng(vec, outPath) {
  const png = new PNG({ width: 64, height: 64, colorType: 6 });
  // vec is Float32 [0..1], first 4096 are pixels (ink-high)
  for (let i = 0; i < 64 * 64; i++) {
    const v = Math.max(0, Math.min(1, vec[i] || 0));
    const gray = Math.round((1 - v) * 255); // white background
    const idx = i * 4;
    png.data[idx] = gray;
    png.data[idx + 1] = gray;
    png.data[idx + 2] = gray;
    png.data[idx + 3] = 255;
  }
  return new Promise((resolve, reject) => {
    png
      .pack()
      .pipe(fs.createWriteStream(outPath))
      .on('finish', resolve)
      .on('error', reject);
  });
}

async function main() {
  const [,, inPath, outDir] = process.argv;
  if (!inPath || !outDir) {
    console.error('Usage: node scripts/export_calibration_png.cjs <calibration.json> <outdir>');
    process.exit(1);
  }
  const raw = fs.readFileSync(inPath, 'utf-8');
  const cal = JSON.parse(raw);
  if (!cal || cal.version !== 1 || !cal.samples) {
    throw new Error('Invalid calibration JSON');
  }
  fs.mkdirSync(outDir, { recursive: true });
  let total = 0;
  for (const L of LETTERS) total += (cal.samples[L] || []).length;
  let done = 0;
  const tickEvery = Math.max(1, Math.floor(total / 100));

  for (const L of LETTERS) {
    const arr = cal.samples[L] || [];
    if (!arr.length) continue;
    const letterDir = path.join(outDir, L);
    fs.mkdirSync(letterDir, { recursive: true });
    for (let i = 0; i < arr.length; i++) {
      const b64 = arr[i];
      const buf = Buffer.from(b64, 'base64');
      // dequantize to float [0,1]
      const vec = new Float32Array(buf.length);
      for (let j = 0; j < buf.length; j++) vec[j] = buf[j] / 255;
      const outPath = path.join(letterDir, `${String(i).padStart(4, '0')}.png`);
      // ignore appended features beyond first 4096 implicitly
      // eslint-disable-next-line no-await-in-loop
      await writePng(vec, outPath);
      done++;
      if (done % tickEvery === 0 || done === total) {
        const pct = Math.floor((done / total) * 100);
        process.stdout.write(`\rExporting PNGs: ${done}/${total} (${pct}%)`);
      }
    }
  }
  process.stdout.write('\n');
  console.log('Exported PNGs to', outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
