# Stroke-Based Conv1D + BiGRU — Quickstart

This is a focused, end-to-end pipeline for Hebrew character recognition from finger-drawn strokes using a lightweight Conv1D + BiGRU model with attention pooling.

Primary goal: replace broad planning with one working path we can iterate on for accuracy.

## Data Layout

Expected structure under `data/strokes`:

```
data/
  strokes/
    train/
      א/
        0001.json
        0002.json
      ב/
        0003.json
      ... (27 classes total)
    val/            # optional; if absent, we split from train
      ...
    test/           # optional
      ...
```

JSON format (flexible): either an object with `points` or a raw array. Each point is `[x, y, t, stroke_id]`. `t` and `stroke_id` are optional; if missing, all points are treated as a single stroke.

Example:

```
{
  "points": [
    [10.1, 21.2, 0.001, 0],
    [12.0, 21.9, 0.004, 0],
    [13.2, 22.2, 0.007, 0],
    [35.0, 50.0, 0.120, 1],
    [36.2, 49.3, 0.123, 1]
  ],
  "user_id": "u1",
  "session_id": "s1"
}
```

## Install

- Create a Python 3.10+ environment and install requirements:
  - `pip install -r requirements-ml.txt`

## Train

Option 1 — via wrapper script (adds `src` to PYTHONPATH):
- `python scripts/train_stroke.py --data-root data --epochs 40 --batch-size 64 --n-points 96`

Option 2 — direct module (ensure `src` is on PYTHONPATH):
- `PYTHONPATH=src python -m stroke_recognizer.train --data-root data`

Outputs are saved to `runs/stroke_conv_bigru/` with the best checkpoint at `best.pt`.

## Inference

- Predict from a saved JSON stroke file:
  - `PYTHONPATH=src python -m stroke_recognizer.infer --model runs/stroke_conv_bigru/best.pt --json data/strokes/test/א/your_sample.json`

## Model

- Features per point: `[x, y, dx, dy, speed, sinθ, cosθ, curvature, pen_up]` after denoise, normalization, and resampling to `N=96` points.
- Backbone: 2×(Conv1D k=5, ch=64) → BiGRU(128) → attention pooling → MLP head → softmax(27).

## Evaluation

- Reports top‑1/top‑3 on val/test and prints per‑class accuracy. Confusion matrix is computed internally.
- Use top‑3 in UI for better UX while we iterate on accuracy.

## Next Steps

- Iterate on augmentations (time‑warp/shear magnitudes) and N points (64/96/128).
- Add few‑shot personalization (prototype averaging on embeddings) after base accuracy stabilizes.
