# Models Comparison Plan

Purpose: build a small, reproducible set of baselines we can iterate quickly.

- Stroke models
  - Conv1D + BiGRU (implemented): notebooks/02_train_stroke_model.ipynb
  - Tiny Transformer (new): notebooks/06_train_stroke_transformer.ipynb
  - Log-signature + MLP (optional): notebooks/05_train_stroke_signature_mlp.ipynb

- Image models
  - Small CNN baseline (implemented): notebooks/03_train_image_cnn_baseline.ipynb
  - Personal PNGs from strokes: generate with dump tool `--png-out data/my_by_letter`.

- Compare
  - notebooks/07_eval_compare.ipynb: unified evaluation: top-1/top-3, per-class, confusion.

# Export data for both pipelines

1) Capture on device (Heroku app): Practice / Calibrate
2) Dump raw strokes to repo and render PNGs for image models:

   DATABASE_URL="..." \\
   node apps/api/src/tools/dump_strokes.cjs \\
     --out data/strokes \\
     --png-out data/my_by_letter \\
     --device <DEVICE_ID> --split train

3) Train
   - Stroke: notebooks/02_train_stroke_model.ipynb
   - Image: notebooks/03_train_image_cnn_baseline.ipynb (set BASE to ../data/my_by_letter)

4) Evaluate & compare: notebooks/07_eval_compare.ipynb

