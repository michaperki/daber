#!/usr/bin/env python3
"""Generate an HTML report showing random sample images per letter for visual
label verification. Open the output HTML in a browser to review."""
import argparse, json, random, base64, io
from pathlib import Path
import cv2
import numpy as np

HERE = Path(__file__).parent
LETTERS = json.loads((HERE / 'letters.json').read_text(encoding='utf-8'))

SAMPLES_PER_LETTER = 8


def img_to_data_uri(img_bgr: np.ndarray, size: int = 128) -> str:
    """Resize and encode an image as a base64 PNG data URI."""
    resized = cv2.resize(img_bgr, (size, size), interpolation=cv2.INTER_AREA)
    _, buf = cv2.imencode('.png', resized)
    b64 = base64.b64encode(buf.tobytes()).decode('ascii')
    return f'data:image/png;base64,{b64}'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', required=True, help='Path to by-letter dataset')
    ap.add_argument('--n', type=int, default=SAMPLES_PER_LETTER,
                    help=f'Samples per letter (default {SAMPLES_PER_LETTER})')
    ap.add_argument('--out', default='sample_audit.html', help='Output HTML path')
    ap.add_argument('--seed', type=int, default=42, help='Random seed')
    args = ap.parse_args()

    random.seed(args.seed)
    root = Path(args.data)

    rows_html = []
    total_files = 0
    for L in LETTERS:
        d = root / L
        if not d.exists():
            rows_html.append(f'<tr><td class="letter">{L}</td>'
                             f'<td colspan="2" class="warn">No folder found</td></tr>')
            continue
        files = sorted([f for f in d.rglob('*')
                        if f.is_file() and f.suffix.lower() in ('.png', '.jpg', '.jpeg', '.bmp')])
        total_files += len(files)
        sample = random.sample(files, min(args.n, len(files)))

        imgs_html = []
        for f in sample:
            img = cv2.imread(str(f))
            if img is None:
                imgs_html.append('<div class="img-cell bad">unreadable</div>')
                continue
            uri = img_to_data_uri(img)
            fname = f.name[:20]
            imgs_html.append(
                f'<div class="img-cell">'
                f'<img src="{uri}" title="{f.name}"/>'
                f'<div class="fname">{fname}</div>'
                f'</div>'
            )

        rows_html.append(
            f'<tr>'
            f'<td class="letter">{L}<br/><span class="count">{len(files)} imgs</span></td>'
            f'<td class="samples">{"".join(imgs_html)}</td>'
            f'</tr>'
        )

    html = f"""<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8"/>
<title>Sample Audit — {total_files} images</title>
<style>
  body {{ font-family: system-ui, sans-serif; margin: 20px; background: #fafafa; direction: ltr; }}
  h1 {{ font-size: 1.4em; }}
  table {{ border-collapse: collapse; width: 100%; }}
  tr {{ border-bottom: 1px solid #ddd; }}
  td {{ padding: 8px; vertical-align: top; }}
  .letter {{ font-size: 2em; text-align: center; width: 80px; font-family: serif; }}
  .count {{ font-size: 0.5em; color: #888; }}
  .samples {{ display: flex; flex-wrap: wrap; gap: 6px; }}
  .img-cell {{ text-align: center; }}
  .img-cell img {{ width: 96px; height: 96px; border: 1px solid #ccc; background: #fff; }}
  .fname {{ font-size: 0.6em; color: #999; max-width: 96px; overflow: hidden; text-overflow: ellipsis; }}
  .warn {{ color: #c00; }}
  .bad {{ color: #c00; font-size: 0.8em; }}
</style>
</head>
<body>
<h1>Sample Audit — {total_files} total images, {args.n} random per letter</h1>
<p>Visually verify that images match the target letter label. Flag any mislabeled samples.</p>
<table>
<thead><tr><th>Letter</th><th>Random Samples</th></tr></thead>
<tbody>
{"".join(rows_html)}
</tbody>
</table>
</body>
</html>"""

    Path(args.out).write_text(html, encoding='utf-8')
    print(f'Audit report written to {args.out} ({total_files} total images)')
    print(f'Open in a browser to review.')


if __name__ == '__main__':
    main()
