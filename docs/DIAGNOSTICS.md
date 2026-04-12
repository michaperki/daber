Diagnostics and Bench

Purpose: speed up testing/tuning without deploy loops, and make issues actionable.

Recognize Debug
- Toggle Debug in Recognize.
- Shows:
  - 64×64 preview of the input (black ink on white)
  - Per-mode top-3: KNN, Centroid, CNN, Hybrid
  - Hybrid contributions: logp(cnn), α·prototype, prior
  - Model info: input shape, output size, labels count
  - Export JSON for a single draw

Bench tab (leave‑one‑out)
- Location: top nav → Bench
- Runs leave‑one‑out per letter with ≥2 samples; reports accuracy per mode and top confusions.
- Options: k (KNN), augment on/off, include CNN/Hybrid (if TFJS model present), save per‑sample predictions in the export.
- Export JSON for post‑hoc analysis or diffing across changes.

CNN model checks
- Ensure a TFJS model is available under `/models/…/model.json`.
- Optionally add `/models/…/labels.json` with class names:
  - 27-class: `["א",… ,"ת"]` in Unicode order
  - 28-class: `["stop", "א", …, "ת"]`
- With Debug on, verify Model info shows expected input channels and output length.

Gotchas addressed by the app
- CNN input channels (1 vs 3) are detected automatically.
- Outputs are softmaxed and mapped by labels; if absent, 27/28-class assumptions apply.
- Queries fed to CNN/Hybrid use raw 64×64 pixels; KNN/Centroid normalize internally.

Interpreting results
- If CNN/Hybrid collapse to one class: labels missing/misaligned or domain mismatch; verify labels and model input shape. Consider light data augmentation or fine‑tuning.
- If KNN underperforms Centroid on small data: try `augment = on` and `k = 7..9`.
