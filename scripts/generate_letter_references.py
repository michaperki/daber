"""Generate averaged cursive letter reference images from the HHD dataset.

For each letter directory in data/hhd_by_letter/<glyph>/, loads all PNGs,
resizes to 128x128 grayscale, computes a per-pixel average, and saves the
result as a semi-transparent PNG to apps/web/public/letters/<glyph>.png.
"""

import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SRC_DIR = Path(__file__).resolve().parent.parent / "data" / "hhd_by_letter"
OUT_DIR = Path(__file__).resolve().parent.parent / "apps" / "web" / "public" / "letters"
SIZE = 128


def main():
    if not SRC_DIR.exists():
        print(f"Source directory not found: {SRC_DIR}", file=sys.stderr)
        sys.exit(1)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for letter_dir in sorted(SRC_DIR.iterdir()):
        if not letter_dir.is_dir():
            continue
        glyph = letter_dir.name
        pngs = list(letter_dir.glob("*.png"))
        if not pngs:
            print(f"  {glyph}: no PNGs, skipping")
            continue

        # Accumulate pixel values
        acc = np.zeros((SIZE, SIZE), dtype=np.float64)
        count = 0
        for p in pngs:
            try:
                img = Image.open(p).convert("L").resize((SIZE, SIZE), Image.LANCZOS)
                arr = np.array(img, dtype=np.float64) / 255.0
                acc += arr
                count += 1
            except Exception as e:
                print(f"  {glyph}: error reading {p.name}: {e}")

        if count == 0:
            continue

        avg = acc / count  # 0=black/ink, 1=white/bg

        # Convert to RGBA: ink pixels become dark with alpha proportional to ink density
        # ink_density: 0 = no ink (white), 1 = full ink (black)
        ink_density = 1.0 - avg
        # Threshold: ignore very faint pixels (noise)
        ink_density[ink_density < 0.05] = 0.0

        rgba = np.zeros((SIZE, SIZE, 4), dtype=np.uint8)
        rgba[:, :, 0] = 60   # dark gray R
        rgba[:, :, 1] = 60   # dark gray G
        rgba[:, :, 2] = 60   # dark gray B
        rgba[:, :, 3] = (ink_density * 200).clip(0, 255).astype(np.uint8)

        out_path = OUT_DIR / f"{glyph}.png"
        Image.fromarray(rgba, "RGBA").save(out_path)
        print(f"  {glyph}: averaged {count} images -> {out_path.name}")

    print(f"\nDone. Output: {OUT_DIR}")


if __name__ == "__main__":
    main()
