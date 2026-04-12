#!/usr/bin/env python3
"""
Prepare HHD-style dataset with numeric class folders (0..26) into by-letter folders.

Usage:
  python prepare_hhd_numeric.py --root data/hhd_dataset --out data/hhd_by_letter \
    [--mapping scripts/cnn_hhd/hhd_mapping.json]

Mapping file formats supported:
  - Array of 27 letters in class-index order, e.g.: ["א","ב",...]
  - Object: {"0": "א", "1": "ב", ...}

If no mapping is provided, the default order in letters.json is used
(index 0 -> LETTERS[0], etc.). You should verify this by sampling images.
"""
import argparse, json, os, shutil, sys
from pathlib import Path

HERE = Path(__file__).parent
LETTERS = json.loads((HERE / 'letters.json').read_text(encoding='utf-8'))
IMG_EXTS = {'.png', '.jpg', '.jpeg', '.bmp'}

def load_mapping(path: str | None):
  if not path:
    return {str(i): LETTERS[i] for i in range(len(LETTERS))}
  p = Path(path)
  data = json.loads(p.read_text(encoding='utf-8'))
  if isinstance(data, list):
    if len(data) != len(LETTERS):
      raise ValueError('Mapping list length != 27')
    return {str(i): data[i] for i in range(len(data))}
  if isinstance(data, dict):
    return {str(k): v for k, v in data.items()}
  raise ValueError('Unknown mapping JSON format')

def copy_split(root: Path, split: str, out: Path, idx2glyph: dict[str,str]):
  """Copy a split with a progress bar. Falls back to simple prints if tqdm is missing."""
  src = root / split
  if not src.exists():
    return 0

  # Build copy plan
  tasks: list[tuple[Path, Path]] = []
  for sub in sorted(src.iterdir()):
    if not sub.is_dir():
      continue
    idx = sub.name
    glyph = idx2glyph.get(idx)
    if not glyph:
      print(f"[warn] no mapping for class {idx} — skipping")
      continue
    dst = out / glyph
    dst.mkdir(parents=True, exist_ok=True)
    n = 0
    for f in sub.rglob('*'):
      if not f.is_file():
        continue
      if f.suffix.lower() not in IMG_EXTS:
        continue
      name = f"{split}_{idx}_{n}{f.suffix.lower()}"
      tasks.append((f, dst / name))
      n += 1

  total = len(tasks)
  copied = 0

  # Progress helpers
  try:
    from tqdm import tqdm  # type: ignore
    bar = tqdm(total=total, unit='img', desc=f'{split}')
    for src_path, dst_path in tasks:
      shutil.copy2(src_path, dst_path)
      bar.update(1)
      copied += 1
    bar.close()
  except Exception:
    # Fallback: simple textual progress every 500 files
    print(f"{split}: copying {total} files...")
    next_tick = 0
    tick = max(1, total // 100)  # ~100 updates max
    for src_path, dst_path in tasks:
      shutil.copy2(src_path, dst_path)
      copied += 1
      if copied >= next_tick:
        pct = int((copied / total) * 100)
        sys.stdout.write(f"\r{split}: {copied}/{total} ({pct}%)")
        sys.stdout.flush()
        next_tick += tick
    sys.stdout.write("\n")

  return copied

def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--root', required=True, help='Path to numeric-labeled root containing TRAIN/ and/or TEST/')
  ap.add_argument('--out', required=True, help='Output folder (by-letter)')
  ap.add_argument('--mapping', default=None, help='JSON mapping file (array or {index: glyph})')
  args = ap.parse_args()

  root = Path(args.root)
  out = Path(args.out)
  out.mkdir(parents=True, exist_ok=True)
  idx2glyph = load_mapping(args.mapping)

  total = 0
  for split in ('TRAIN', 'TEST'):
    n = copy_split(root, split, out, idx2glyph)
    print(f"Copied {n} files from {split}")
    total += n
  print(f"Done. Total copied: {total}. Out: {out}")

if __name__ == '__main__':
  main()
