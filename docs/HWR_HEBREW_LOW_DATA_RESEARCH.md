# Hebrew Handwriting Recognition (Low-Data, Single-User) — Practical Starting Point

This document synthesizes effective, reproducible approaches for low‑data, single‑user handwriting recognition for Hebrew. It emphasizes approaches we can implement locally (PyTorch/TensorFlow), with concrete preprocessing and model recommendations.

Primary implementation path for now: stroke‑based Conv1D + BiGRU end‑to‑end. Image models and log‑signature variants are useful as follow‑ups, but not the initial focus.

**What Works Best (Low‑Data, Single‑User)**

- Online beats offline when you have touch strokes
  - Use the sequence of (x, y, pen‑lift, timing) with models that are speed/ordering‑robust.
  - Strong, data‑efficient baselines: path signature features + small classifier; 1D Conv + BiGRU/Transformer on resampled points; Siamese/prototypical metric learning for personalization.

- Image models are a solid second track
  - Render strokes to 64–128 px grayscale; fine‑tune a lightweight CNN pretrained on characters/shapes (EMNIST/QuickDraw or self‑supervised pretraining).
  - Elastic distortions and structural augmentations can close much of the data gap.

- Personalization is key
  - Prototype/centroid adaptation in embedding space; last‑layer fine‑tuning on‑device; few‑shot updates with exponential moving averages.

- Hebrew specifics
  - 27 classes (22 + 5 final forms) with frequent confusions: ב/כ, ו/ז/ט, ר/ד, נ/ס/ע, ם/ס, ן/ו/י.
  - Avoid flips and large rotations; allow small rotations/shear/elastic.
  - Stroke order varies widely; don’t rely on fixed order.

**Preprocessing Pipelines**

- Online (stroke‑based)
  - Denoise: remove duplicate points, median filter on (x, y) with window 3.
  - Normalize: translate to centroid; scale to unit box while keeping aspect; no global rotation.
  - Resample: arc‑length resample to N points (64–128). Keep pen‑lift segments; insert a segment separator flag.
  - Features per point: [x, y, dx, dy, speed, sinθ, cosθ, curvature, pen_up] with masking for shorter sequences.
  - Optional invariance: also train on reversed stroke direction examples.

- Offline (image‑based)
  - Render: anti‑aliased polyline rasterization at 96×96 or 128×128; line width 2–4 px; center by mass; pad to square.
  - Normalize: grayscale in [0, 1] with mean/std; binarization often unnecessary if you render from strokes.
  - Augmentations: elastic distortion (Simard), mild rotation (±5°), scale/translate (≤10%), shear (≤0.1), thickness jitter, small morph dilate/erode, cutout/erase (small patches).

**Augmentation (Online Sequence)**

- Point jitter N(0, σ) with σ≈0.01 of box size.
- Time‑warp: random monotonic spline mapping of index → index.
- Segment drop: drop 5–10% of short subsegments; keep class semantics.
- Local affine: small shear/scale around random anchors.
- Stroke reversal duplicate (occasionally) for direction invariance.

**Lightweight Models For Mobile**

- Stroke sequence
  - Conv1D + BiGRU: 3×(Conv1D k=5, ch=64) → BiGRU(64–128) → attention pooling → MLP head. ~0.2–0.6M params. Very fast and data‑efficient.
  - Log‑signature + MLP: compute log‑signature (depth 2–3) on normalized path (with pen‑lift channel) → 1–2 layer MLP or linear. ~10–100k params. Very strong for low data.
  - Tiny Transformer: 2–3 layers, d=128, 4 heads, no absolute positions (use rotary or none); add CLS token + mean pooling. ~0.4–0.8M params.

- Image
  - MobileNetV3‑Small (width 0.5–1.0) or EfficientNet‑Lite0; fine‑tune head with strong regularization. 0.6–2.3M params.
  - ShuffleNetV2‑0.5 for smallest footprint (~0.7M).

- Deployment
  - TensorFlow Lite: post‑training INT8 quantization, or QAT with tfmot; batchnorm folded. PyTorch: `torch.ao.quantization` QAT → TorchScript or ExecuTorch. Expect 2–5 ms latency on modern phones.

**Training Setup (General)**

- Loss: cross‑entropy; add label smoothing 0.05; class‑weighting if class imbalance.
- Optimizer: AdamW, lr 1e‑3 (head‑only FT), 3e‑4 (full FT), weight decay 1e‑4.
- Schedule: cosine with 5–10 warmup epochs; 30–60 epochs total with early stop on val top‑1.
- Batch size: 64 (sequence), 128 (image).
- Regularization: dropout 0.1–0.2; Mixup/CutMix (image); stochastic depth off or ≤0.05.

**Evaluation Strategy**

- Splits: user‑dependent target → split by session/time for that user to reflect real usage. Also keep a small cross‑user test to gauge generalization.
- Metrics: top‑1/top‑3, per‑class accuracy, confusion matrix; calibration (ECE) optional; latency and model size.
- Error analysis: targeted confusions (e.g., ר/ד), visualize misclassifications; ablate augmentations.

**Examples And Evidence (brief pointers)**

- Online stroke RNNs/1D‑CNNs: proven on Quick, Draw! (GRU/LSTM stroke models), and on online Chinese/Japanese datasets (Conv‑RNN hybrids).
- Path signatures (Lyons/Graham; libraries: Signatory/iisignature): high accuracy with limited data thanks to reparameterization invariance; widely used on online handwriting.
- Elastic distortions (Simard et al. 2003): classic, still effective on character data; strong gains with tiny datasets.
- Mobile backbones (MobileNetV3/EfficientNet‑Lite): state‑of‑the‑art trade‑offs for on‑device CV; fine‑tuning works even across scripts because low‑level features transfer.

**What To Try First (2–3 Approaches)**

- A. Stroke Conv1D + BiGRU (primary)
  - Input: N=96 points, features [x,y,dx,dy,speed,sinθ,cosθ,curv,pen_up].
  - Arch: Conv1D(64,k=5)×2 → BiGRU(128) → attention pooling → 128‑d → softmax(27).
  - Strong augmentations listed above. Expect big jump over KNN with tens of samples/class.

- B. Log‑Signature + Small MLP (low‑data booster)
  - Compute log‑signature depth 2–3 over concatenated path with a channel for pen‑lift; pool over segments.
  - Classifier: 1–2 layers (e.g., 256‑ReLU‑Dropout‑27).
  - Tiny, fast, very sample‑efficient; great as fallback and for quick personalization.

- C. Image MobileNetV3‑Small FT (backup + ensembling)
  - Render 96×96; elastic + affine aug.
  - Initialize from ImageNet or EMNIST‑pretrained weights (if available), replace head, fine‑tune.
  - Often complementary to stroke model; simple to ship via TFLite.

Optionally, D. Prototypical head for personalization

- Train an embedding (use A or C without final softmax); classify by nearest class prototype.
- On device, update prototypes with per‑user examples (EMA), enabling instant improvement without gradient updates.

**Concrete Notebook Plan**

- 0. Setup
  - Define label set (27 classes). Set seeds; choose backend (PyTorch or TF/Keras).
  - Install optional signature lib (`signatory`/`iisignature`) if using approach B.

- 1. Data Structures
  - Strokes: `data/strokes/{split}/{class}/{id}.json` with fields: `points: [[x,y,t,stroke_id], ...]`, `user_id`, `session_id`.
  - Images (optional): `data/images/{split}/{class}/{id}.png`.
  - Metadata CSV: `id,class,user_id,session_id,split`.
  - Collate functions with padding/masks for sequences.

- 2. Preprocessing/Transforms
  - Stroke pipeline: denoise → normalize → resample to N → feature engineering → augment (train only).
  - Image pipeline: render from strokes → augment (train only).
  - Visual sanity checks for a random batch (strokes and images).

- 3. Models
  - A: Conv1D + BiGRU with attention pooling.
  - B: Log‑signature feature extractor + MLP.
  - C: MobileNetV3‑Small head; selectable pretrained weights.
  - D (optional): Prototypical head wrapper for A/C embeddings.

- 4. Training Loop (shared)
  - Cross‑entropy with label smoothing; AdamW; cosine schedule.
  - Early stopping on val top‑1; checkpoint best weights.
  - Log per‑epoch loss, top‑1/top‑3.

- 5. Evaluation
  - Compute top‑1/top‑3, per‑class metrics, confusion matrix.
  - Save misclassified samples; visualize pairs most confused.
  - Latency benchmark on CPU (simulate int8 by torch.quantize or TFLite if using TF).

- 6. Personalization (few‑shot)
  - Collect k=5–10 samples/class from the user.
  - A: fine‑tune last layer for 1–3 epochs at lr=1e‑3; or
  - D: update prototypes with EMA: P_c ← (1−α)P_c + α·mean(E_user_c).
  - Re‑evaluate on held‑out session.

- 7. Export
  - PyTorch: dynamic quantization (LSTM/GRU) or QAT; `torch.jit.script` for TorchScript; size/latency report.
  - TF/Keras: TFLite converter with int8 (calibration on a few hundred samples).

- 8. Ablations
  - Turn off/on key augmentations; vary N points (64/96/128); compare A vs B vs C; with/without prototypes.

**Recommended Hyperparameters (starting points)**

- Sequence N: 96 (try 64 if latency‑critical).
- A model: Conv1D 64→64 (k=5), BiGRU 128, attention 128; dropout 0.1; ~0.45M params.
- B features: log‑sig depth=2 (or 3 if stable), channel dim=3–4 (x,y,pen_up,[t]); MLP 256→27; dropout 0.1.
- C input: 96×96; MobileNetV3‑Small width=0.75; head 128→27; freeze 50% of backbone for first 5 epochs then unfreeze.
- LR: 3e‑4 full FT; 1e‑3 head‑only; WD 1e‑4; epochs 40; early stop patience 8.

**Practical Tips**

- Balance per‑class batches to avoid collapse to frequent letters.
- Render/feature transforms must be identical between train and eval except augmentation.
- Keep a “no‑rotation” mode for Hebrew (only ±5°) and never flip; shear ≤0.1; elastic sigma 4–6 px, alpha 30–40 px.
- Use top‑3 in UI; add per‑class thresholds if needed to suppress low‑confidence predictions.

**Why These First**

- A (Conv1D+BiGRU) captures local geometry + global structure, is robust to stroke order/speed, and trains well with little data.
- B (log‑signature) encodes path invariances, giving excellent sample efficiency and tiny models—great for on‑device and cold‑start.
- C (MobileNetV3 FT) is simple, complementary, and leverages mature mobile tooling; ensembling A+C often helps on tricky pairs.

