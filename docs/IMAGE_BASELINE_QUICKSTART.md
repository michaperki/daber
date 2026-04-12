# Image Baseline (CNN) — Quickstart

Use this to train a quick CNN baseline on letter-labeled PNGs.

Sources you can use:
- Public dataset: `data/hhd_by_letter/<letter>/*.png`
- Your DB dump: `apps/api/data/db_by_letter/<letter>/*.png`

Train
- Public dataset:
  - `python scripts/cnn_hhd/train.py --data data/hhd_by_letter --epochs 40 --batch 64 --out runs/cnn_hhd`
- DB dump (your personal samples):
  - `python scripts/cnn_hhd/train.py --data apps/api/data/db_by_letter --epochs 40 --batch 64 --out runs/cnn_db`
- Optional skeletonize to thin strokes (closer to app raster):
  - Add `--thin`

Evaluate / Confusion Matrix (optional helper)
- `python scripts/cnn_hhd/confusion_matrix.py --data apps/api/data/db_by_letter --model runs/cnn_db/model.h5 --out runs/cnn_db/confusion.png`

Notes
- This Keras model is small and fast to iterate. It’s separate from the stroke-based PyTorch model and provides a quick accuracy baseline on PNGs.
- For on-device, we can later export to TFJS or TFLite; see `--export_tfjs` flag in the training script.
