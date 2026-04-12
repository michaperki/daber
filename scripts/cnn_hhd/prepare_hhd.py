#!/usr/bin/env python3
"""
Best-effort HHD prep: extracts a ZIP archive and rearranges images into
data/<out>/<glyph>/*.png folders expected by train.py.

Because HHD variants differ, this script tries common patterns:
- Directory-per-class where names are Hebrew glyphs already
- Filenames containing the glyph
Unclassified images go to <out>/_unlabeled for manual triage.
"""
import argparse, os, zipfile, shutil, re, sys
from pathlib import Path

LETTERS = [
  'א','ב','ג','ד','ה','ו','ז','ח','ט','י',
  'ך','כ','ל','ם','מ','ן','נ','ס','ע','ף',
  'פ','ץ','צ','ק','ר','ש','ת'
]

def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--zip', required=True, help='Path to HHD zip')
  ap.add_argument('--out', required=True, help='Output folder (by-letter)')
  args = ap.parse_args()

  tmp = Path('data/_hhd_tmp')
  if tmp.exists():
    shutil.rmtree(tmp)
  tmp.mkdir(parents=True, exist_ok=True)

  with zipfile.ZipFile(args.zip, 'r') as z:
    names = z.namelist()
    total = len(names)
    copied = 0
    try:
      from tqdm import tqdm  # type: ignore
      for name in tqdm(names, desc='Extract', unit='file'):
        z.extract(name, tmp)
        copied += 1
    except Exception:
      print(f'Extract: {total} files...')
      next_tick = 0
      tick = max(1, total // 100)
      for name in names:
        z.extract(name, tmp)
        copied += 1
        if copied >= next_tick:
          pct = int((copied / total) * 100)
          sys.stdout.write(f"\rExtract: {copied}/{total} ({pct}%)")
          sys.stdout.flush()
          next_tick += tick
      sys.stdout.write("\n")

  out = Path(args.out)
  if out.exists():
    shutil.rmtree(out)
  out.mkdir(parents=True, exist_ok=True)
  unlabeled = out / '_unlabeled'
  unlabeled.mkdir(parents=True, exist_ok=True)
  for L in LETTERS:
    (out / L).mkdir(parents=True, exist_ok=True)

  # Heuristics: if immediate subdirectories are glyphs, use them.
  subs = [p for p in tmp.rglob('*') if p.is_dir()]
  used = False
  for sd in subs:
    name = sd.name
    if name in LETTERS:
      for f in sd.rglob('*'):
        if f.is_file() and f.suffix.lower() in ('.png', '.jpg', '.jpeg', '.bmp'):
          dest = out / name / f.name
          dest.write_bytes(f.read_bytes())
          used = True
  if used:
    print('Copied by folder names.')
    return

  # Fallback: infer from filenames.
  PAT = re.compile('|'.join(map(re.escape, LETTERS)))
  for f in tmp.rglob('*'):
    if not f.is_file():
      continue
    if f.suffix.lower() not in ('.png', '.jpg', '.jpeg', '.bmp'):
      continue
    m = PAT.search(f.name)
    if m:
      L = m.group(0)
      dest = out / L / f.name
      dest.write_bytes(f.read_bytes())
    else:
      dest = unlabeled / f.name
      dest.write_bytes(f.read_bytes())
  print('Copied by filename heuristic. Check _unlabeled for leftovers.')

if __name__ == '__main__':
  main()
