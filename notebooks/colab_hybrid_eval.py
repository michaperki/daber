"""
Colab-ready utilities for evaluating KNN / Centroid / CNN / Hybrid recognizers
on the HHD-by-letter dataset (or any 64×64 grayscale dataset organized as
<root>/<letter>/*.png). Mirrors the logic used in apps/web/src/recognizer.

Quick start (in a Colab cell):

  from google.colab import drive
  drive.mount('/content/drive')

  import sys
  sys.path.append('/content')   # if you upload this file to /content
  import colab_hybrid_eval as chev

  # Load dataset: folder with subdirs named by Hebrew letters, each containing images
  DATA_ROOT = '/content/drive/MyDrive/hhd_by_letter'
  db = chev.load_by_letter_dataset(DATA_ROOT, limit_per_letter=None)

  # Optional: load a Keras CNN model (must match LETTERS order below or provide labels)
  # import tensorflow as tf
  # model = tf.keras.models.load_model('/content/drive/MyDrive/models/hhd_cnn.h5', compile=False)
  # labels = chev.HEB_LETTERS  # or load from a JSON matching your model's class order
  model, labels = None, None

  # Run leave-one-out benchmark (mirrors the app's Bench tab)
  res = chev.leave_one_out_bench(
      db,
      modes=['knn','centroid','hybrid','cnn'],
      k=6,
      augment=True,
      model=model,
      labels=labels,
      save_examples=False,
  )
  chev.print_summary(res)

Notes
- If your CNN model was trained with a labels list, pass it via the `labels`
  argument so outputs map to the correct glyphs. If omitted, the default
  order below is assumed. For 28-class models with a stop token at index 0,
  the code will detect and skip it if you pass labels including 'stop'/'<stop>'.
- Images are assumed white=1, ink=0; they are resized to 64×64 if needed.
- Augmentation mirrors the web app: shifts, small rotations, scale jitter, dilation.
- Hybrid mixing matches the web: proto + cnnW * gamma * (p - uniform) + prior,
  with gamma=0.22 and entropy gate cnnW in [0,1] from 1.5–3.0 bits.
"""

from __future__ import annotations

import os
import math
import json
from dataclasses import dataclass
from typing import Dict, List, Tuple, Optional

import numpy as np
from PIL import Image

try:
    import cv2  # type: ignore
except Exception:
    cv2 = None  # Colab typically has it; if missing, some augmentations will be unavailable


# ---------------------------------------------------------------------------
# Constants and helpers
# ---------------------------------------------------------------------------

HEB_LETTERS: List[str] = [
    'א','ב','ג','ד','ה','ו','ז','ח','ט','י',
    'ך','כ','ל','ם','מ','ן','נ','ס','ע','ף',
    'פ','ץ','צ','ק','ר','ש','ת'
]

FEATURE_PIXELS = 64 * 64
UNIFORM_P = 1.0 / len(HEB_LETTERS)


def to_uint8(img: np.ndarray) -> np.ndarray:
    x = np.clip(img * 255.0, 0, 255).astype(np.uint8)
    return x


def from_uint8(u: np.ndarray) -> np.ndarray:
    return u.astype(np.float32) / 255.0


def load_gray_64(path: str) -> np.ndarray:
    """Load image as 64×64 float32, range [0,1], white=1, ink=0."""
    im = Image.open(path).convert('L')
    if im.size != (64, 64):
        im = im.resize((64, 64), Image.BILINEAR)
    arr = np.asarray(im, dtype=np.float32) / 255.0
    # Heuristic: if mean < 0.5, likely ink=1, bg=0; invert to white=1
    if arr.mean() < 0.5:
        arr = 1.0 - arr
    return arr


def load_by_letter_dataset(root: str, limit_per_letter: Optional[int] = None) -> Dict[str, List[np.ndarray]]:
    """Load dataset organized as <root>/<letter>/*.png into a dict of lists of 64×64 float images.

    Returns dict(letter -> [H×W float32 images]).
    """
    db: Dict[str, List[np.ndarray]] = {}
    if not os.path.isdir(root):
        raise FileNotFoundError(f'Dataset root not found: {root}')
    # Collect letters present under root
    for letter in sorted(os.listdir(root)):
        d = os.path.join(root, letter)
        if not os.path.isdir(d):
            continue
        paths = []
        for fn in os.listdir(d):
            if fn.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp')):
                paths.append(os.path.join(d, fn))
        if not paths:
            continue
        paths.sort()
        if limit_per_letter is not None:
            paths = paths[:limit_per_letter]
        imgs = [load_gray_64(p) for p in paths]
        db[letter] = imgs
    return db


def normalize_unit(vec: np.ndarray) -> np.ndarray:
    v = vec.astype(np.float32).reshape(-1)
    n = np.linalg.norm(v)
    if not np.isfinite(n) or n == 0:
        return np.zeros_like(v)
    return (v / n).astype(np.float32)


def dot_pixels(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity over 64×64 pixels."""
    a = a.reshape(-1).astype(np.float32)
    b = b.reshape(-1).astype(np.float32)
    sa = np.dot(a, a)
    sb = np.dot(b, b)
    if sa <= 0 or sb <= 0:
        return 0.0
    return float(np.dot(a, b) / (math.sqrt(sa) * math.sqrt(sb)))


# ---------------------------------------------------------------------------
# Augmentation (mirrors apps/web/src/recognizer/augment.ts)
# ---------------------------------------------------------------------------

def _affine(img: np.ndarray, M: np.ndarray, border_value: float = 1.0) -> np.ndarray:
    if cv2 is None:
        # Fallback: no augmentation available
        return img.copy()
    u8 = to_uint8(img)
    out = cv2.warpAffine(u8, M, (64, 64), flags=cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT, borderValue=int(border_value * 255))
    return from_uint8(out)


def shift64(img: np.ndarray, dx: int, dy: int) -> np.ndarray:
    M = np.float32([[1, 0, dx], [0, 1, dy]])
    return _affine(img, M, border_value=1.0)


def rotate64(img: np.ndarray, deg: float) -> np.ndarray:
    if cv2 is None:
        return img.copy()
    M = cv2.getRotationMatrix2D((32, 32), deg, 1.0)
    return _affine(img, M, border_value=1.0)


def scale64(img: np.ndarray, factor: float) -> np.ndarray:
    if cv2 is None:
        return img.copy()
    M = cv2.getRotationMatrix2D((32, 32), 0, factor)
    return _affine(img, M, border_value=1.0)


def dilate64(img: np.ndarray) -> np.ndarray:
    if cv2 is None:
        return img.copy()
    u8 = to_uint8(1.0 - img)  # operate on ink mask
    kern = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    d = cv2.dilate(u8, kern, iterations=1)
    return 1.0 - from_uint8(d)


def augment_rich(img: np.ndarray) -> List[np.ndarray]:
    out: List[np.ndarray] = []
    for dx, dy in [(1,0),(-1,0),(0,1),(0,-1)]:
        out.append(normalize_unit(shift64(img, dx, dy)))
    for dx, dy in [(2,0),(-2,0),(0,2),(0,-2)]:
        out.append(normalize_unit(shift64(img, dx, dy)))
    out.append(normalize_unit(rotate64(img, 5)))
    out.append(normalize_unit(rotate64(img, -5)))
    out.append(normalize_unit(rotate64(img, 10)))
    out.append(normalize_unit(rotate64(img, -10)))
    out.append(normalize_unit(scale64(img, 1.1)))
    out.append(normalize_unit(scale64(img, 0.9)))
    out.append(normalize_unit(dilate64(img)))
    return out


# ---------------------------------------------------------------------------
# Centroids and KNN
# ---------------------------------------------------------------------------

def compute_centroids(db: Dict[str, List[np.ndarray]], augment: bool) -> Dict[str, np.ndarray]:
    out: Dict[str, np.ndarray] = {}
    for letter, arr in db.items():
        if not arr:
            continue
        acc = np.zeros((FEATURE_PIXELS,), dtype=np.float32)
        n = 0
        for img in arr:
            v = img.reshape(-1).astype(np.float32)
            acc += v
            n += 1
            if augment:
                for aug in augment_rich(img):
                    acc += aug.reshape(-1)
                    n += 1
        if n > 0:
            acc /= float(n)
            out[letter] = normalize_unit(acc)
    return out


def build_flat_db(db: Dict[str, List[np.ndarray]], augment: bool) -> Tuple[List[np.ndarray], List[str]]:
    vectors: List[np.ndarray] = []
    labels: List[str] = []
    for letter, arr in db.items():
        for img in arr:
            vectors.append(img.reshape(-1).astype(np.float32))
            labels.append(letter)
            if augment:
                for aug in augment_rich(img):
                    vectors.append(aug.reshape(-1))
                    labels.append(letter)
    return vectors, labels


def alpha_for(count: int) -> float:
    if count <= 0:
        return 0.0
    if count >= 8:
        return 0.8
    return 0.3 + (count - 1) * (0.5 / 7.0)


# ---------------------------------------------------------------------------
# CNN helpers
# ---------------------------------------------------------------------------

def softmax(x: np.ndarray) -> np.ndarray:
    x = x.astype(np.float32)
    m = np.max(x)
    exps = np.exp(x - m)
    s = np.sum(exps)
    if not np.isfinite(s) or s <= 0:
        return np.zeros_like(x)
    return exps / s


def looks_like_probabilities(x: np.ndarray) -> bool:
    if x.size == 0:
        return False
    if np.any(x < -1e-6):
        return False
    s = float(np.sum(x))
    return abs(s - 1.0) < 0.01


def map_model_output_to_letters(raw: np.ndarray, labels: Optional[List[str]]) -> Dict[str, float]:
    probs = raw if looks_like_probabilities(raw) else softmax(raw)
    out: Dict[str, float] = {}
    if labels and len(labels) == len(probs):
        first = str(labels[0]).lower()
        skip_first = first in ('stop', '<stop>', 'pad', '<pad>')
        for i, p in enumerate(probs):
            if skip_first and i == 0:
                continue
            lab = str(labels[i])
            out[lab] = float(p)
    else:
        # Assume HEB_LETTERS order or stop + letters
        if len(probs) == len(HEB_LETTERS) + 1:
            for i, L in enumerate(HEB_LETTERS):
                out[L] = float(probs[i + 1])
        else:
            n = min(len(probs), len(HEB_LETTERS))
            for i in range(n):
                out[HEB_LETTERS[i]] = float(probs[i])
    return out


def cnn_entropy(probs: Dict[str, float]) -> float:
    h = 0.0
    for L in HEB_LETTERS:
        p = float(probs.get(L, 0.0))
        if p > 1e-10:
            h -= p * math.log2(p)
    return h


def cnn_reliability(probs: Dict[str, float]) -> float:
    h = cnn_entropy(probs)
    if h < 1.5:
        return 0.0
    if h > 3.0:
        return 1.0
    return (h - 1.5) / 1.5


# ---------------------------------------------------------------------------
# Predictors
# ---------------------------------------------------------------------------

@dataclass
class Ranked:
    letter: str
    prob: float
    raw: float


def predict_by_centroid(vec: np.ndarray, centroids: Dict[str, np.ndarray], expected_letter: Optional[str] = None, topN: int = 5) -> List[Ranked]:
    q = normalize_unit(vec.reshape(-1))
    prior = 0.04 if expected_letter else 0.0
    scored: List[Tuple[str, float]] = []
    for letter, c in centroids.items():
        boost = prior if letter == expected_letter else 0.0
        scored.append((letter, float(dot_pixels(q, c) + boost)))
    scored.sort(key=lambda x: x[1], reverse=True)
    top = scored[:topN]
    temp = 10.0
    exps = [math.exp(s * temp) for _, s in top]
    ssum = sum(exps) or 1.0
    return [Ranked(letter=l, prob=exps[i] / ssum, raw=s) for i, (l, s) in enumerate(top)]


def predict_by_knn(vec: np.ndarray, flat_db: Tuple[List[np.ndarray], List[str]], k: int = 5, expected_letter: Optional[str] = None, topN: int = 5) -> List[Ranked]:
    q = normalize_unit(vec.reshape(-1))
    vectors, labels = flat_db
    n = len(vectors)
    if n == 0:
        return []
    sims = [(float(dot_pixels(q, v)), labels[i]) for i, v in enumerate(vectors)]
    sims.sort(key=lambda x: x[0], reverse=True)
    k = min(k, n)
    votes: Dict[str, float] = {}
    for i in range(k):
        sim, lab = sims[i]
        votes[lab] = votes.get(lab, 0.0) + sim
    if expected_letter and votes:
        votes[expected_letter] = votes.get(expected_letter, 0.0) + 0.4
    total = sum(votes.values()) or 1.0
    ranked = [Ranked(letter=l, prob=vote / total, raw=vote / k) for l, vote in votes.items()]
    ranked.sort(key=lambda r: r.prob, reverse=True)
    return ranked[:topN]


def predict_by_cnn(vec: np.ndarray, model, labels: Optional[List[str]] = None, topN: int = 5) -> List[Ranked]:
    if model is None:
        # No model: uniform predictions
        out = [Ranked(letter=L, prob=UNIFORM_P, raw=0.0) for L in HEB_LETTERS]
        out.sort(key=lambda r: r.prob, reverse=True)
        return out[:topN]
    x = vec.reshape(1, 64, 64, 1).astype(np.float32)
    logits = model.predict(x, verbose=0)
    logits = logits.reshape(-1).astype(np.float32)
    probs_map = map_model_output_to_letters(logits, labels)
    out = [Ranked(letter=L, prob=float(probs_map.get(L, 0.0)), raw=0.0) for L in HEB_LETTERS]
    out.sort(key=lambda r: r.prob, reverse=True)
    return out[:topN]


def predict_by_hybrid(vec: np.ndarray, db: Dict[str, List[np.ndarray]], augment: bool, model=None, labels: Optional[List[str]] = None, topN: int = 5, expected_letter: Optional[str] = None, gamma: float = 0.22) -> List[Ranked]:
    centroids = compute_centroids(db, augment=augment)
    q = normalize_unit(vec.reshape(-1))
    calib_counts: Dict[str, int] = {L: len(db.get(L, [])) for L in HEB_LETTERS}
    # Proto part
    proto_raw: Dict[str, float] = {}
    for L in HEB_LETTERS:
        c = centroids.get(L)
        proto_raw[L] = float(dot_pixels(q, c)) if c is not None else 0.0
    # CNN part
    if model is None:
        cnn_probs: Dict[str, float] = {L: UNIFORM_P for L in HEB_LETTERS}
    else:
        x = vec.reshape(1, 64, 64, 1).astype(np.float32)
        logits = model.predict(x, verbose=0).reshape(-1).astype(np.float32)
        cnn_probs = map_model_output_to_letters(logits, labels)
    cnnW = cnn_reliability(cnn_probs)
    # Prior
    beta = 0.04 if expected_letter else 0.0
    combined: List[Tuple[str, float]] = []
    for L in HEB_LETTERS:
        a = alpha_for(calib_counts.get(L, 0))
        prior = beta if (expected_letter == L) else 0.0
        proto = a * proto_raw.get(L, 0.0)
        p = float(cnn_probs.get(L, 0.0))
        cnn_score = cnnW * gamma * (p - UNIFORM_P)
        combined.append((L, proto + cnn_score + prior))
    combined.sort(key=lambda x: x[1], reverse=True)
    top = combined[:topN]
    temp = 10.0
    exps = [math.exp(s * temp) for _, s in top]
    ssum = sum(exps) or 1.0
    return [Ranked(letter=l, prob=exps[i] / ssum, raw=s) for i, (l, s) in enumerate(top)]


# ---------------------------------------------------------------------------
# Bench (Leave-One-Out) — mirrors the web Bench tab
# ---------------------------------------------------------------------------

@dataclass
class BenchExample:
    gt: str
    pred: Dict[str, List[Ranked]]


@dataclass
class BenchResult:
    total: int
    per_mode: Dict[str, Dict[str, int]]  # mode -> {correct, total}
    per_letter: Dict[str, Dict[str, Dict[str, int]]]  # letter -> mode -> {correct, total}
    confusions: Dict[str, Dict[str, int]]  # mode -> {'א->ב': n}
    examples: Optional[List[BenchExample]]


def leave_one_out_bench(
    db: Dict[str, List[np.ndarray]],
    modes: List[str] = ['knn', 'centroid', 'hybrid', 'cnn'],
    k: int = 6,
    augment: bool = True,
    model=None,
    labels: Optional[List[str]] = None,
    save_examples: bool = False,
) -> BenchResult:
    per_mode: Dict[str, Dict[str, int]] = {m: {'correct': 0, 'total': 0} for m in ['knn','centroid','hybrid','cnn']}
    per_letter: Dict[str, Dict[str, Dict[str, int]]] = {
        L: {m: {'correct': 0, 'total': 0} for m in ['knn','centroid','hybrid','cnn']} for L in HEB_LETTERS
    }
    confusions: Dict[str, Dict[str, int]] = {m: {} for m in ['knn','centroid','hybrid','cnn']}
    examples: Optional[List[BenchExample]] = [] if save_examples else None

    # Pre-build non-held-out structures per letter on the fly
    total = 0
    for L in HEB_LETTERS:
        arr = db.get(L, [])
        if len(arr) < 2:
            continue
        for i in range(len(arr)):
            held = arr[i]
            # Build hold-out DB: shallow copy with current sample removed for its letter
            hold: Dict[str, List[np.ndarray]] = {}
            for LL in HEB_LETTERS:
                src = db.get(LL, [])
                if not src:
                    continue
                if LL == L:
                    tmp = src[:i] + src[i+1:]
                    if tmp:
                        hold[LL] = tmp
                else:
                    hold[LL] = src[:]
            mode_preds: Dict[str, List[Ranked]] = {}
            # Prepare shared state
            centroids = compute_centroids(hold, augment=augment) if ('centroid' in modes or 'hybrid' in modes) else {}
            flat = build_flat_db(hold, augment=augment) if 'knn' in modes else ([], [])
            # CNN probs for the held sample (used by CNN + Hybrid if model provided)
            if 'cnn' in modes or 'hybrid' in modes:
                if model is not None:
                    x = held.reshape(1, 64, 64, 1).astype(np.float32)
                    logits = model.predict(x, verbose=0).reshape(-1).astype(np.float32)
                    cnn_map = map_model_output_to_letters(logits, labels)
                else:
                    cnn_map = {LL: UNIFORM_P for LL in HEB_LETTERS}
            else:
                cnn_map = {LL: UNIFORM_P for LL in HEB_LETTERS}

            for m in modes:
                if m == 'knn':
                    preds = predict_by_knn(held, flat, k=k, expected_letter=None, topN=5)
                elif m == 'centroid':
                    preds = predict_by_centroid(held, centroids, expected_letter=None, topN=5)
                elif m == 'cnn':
                    # Map dict->list then slice top 5
                    tmp = [Ranked(letter=LL, prob=float(cnn_map.get(LL, 0.0)), raw=0.0) for LL in HEB_LETTERS]
                    tmp.sort(key=lambda r: r.prob, reverse=True)
                    preds = tmp[:5]
                elif m == 'hybrid':
                    # Use the same computed centroids and cnn_map for efficiency
                    q = normalize_unit(held.reshape(-1))
                    calib_counts: Dict[str, int] = {LL: len(hold.get(LL, [])) for LL in HEB_LETTERS}
                    combined: List[Tuple[str, float]] = []
                    cnnW = cnn_reliability(cnn_map)
                    beta = 0.0  # no expected letter in bench
                    for LL in HEB_LETTERS:
                        a = alpha_for(calib_counts.get(LL, 0))
                        proto = 0.0
                        c = centroids.get(LL)
                        if c is not None:
                            proto = a * dot_pixels(q, c)
                        p = float(cnn_map.get(LL, 0.0))
                        cnn_score = cnnW * 0.22 * (p - UNIFORM_P)
                        combined.append((LL, proto + cnn_score + beta))
                    combined.sort(key=lambda x: x[1], reverse=True)
                    top = combined[:5]
                    temp = 10.0
                    exps = [math.exp(s * temp) for _, s in top]
                    ssum = sum(exps) or 1.0
                    preds = [Ranked(letter=l, prob=exps[i] / ssum, raw=s) for i, (l, s) in enumerate(top)]
                else:
                    raise ValueError(f'Unknown mode: {m}')
                mode_preds[m] = preds
                top1 = preds[0].letter if preds else None
                per_mode[m]['total'] += 1
                per_letter[L][m]['total'] += 1
                total += 1
                if top1 == L:
                    per_mode[m]['correct'] += 1
                    per_letter[L][m]['correct'] += 1
                elif top1 is not None:
                    key = f'{L}->{top1}'
                    confusions[m][key] = confusions[m].get(key, 0) + 1
            if examples is not None:
                examples.append(BenchExample(gt=L, pred=mode_preds))

    return BenchResult(total=total, per_mode=per_mode, per_letter=per_letter, confusions=confusions, examples=examples)


def print_summary(res: BenchResult) -> None:
    def pct(mode: str) -> int:
        tot = res.per_mode[mode]['total']
        cor = res.per_mode[mode]['correct']
        return int(round(100 * cor / tot)) if tot else 0
    print(f'Tested samples: {res.total}')
    print('Overall accuracy:')
    print(f'  • KNN: {pct("knn")}%')
    print(f'  • Centroid: {pct("centroid")}%')
    print(f'  • Hybrid: {pct("hybrid")}%')
    print(f'  • CNN: {pct("cnn")}%')

    def top_conf(m: str, k: int = 5) -> str:
        items = sorted(res.confusions[m].items(), key=lambda kv: kv[1], reverse=True)[:k]
        return ' | '.join([f'{k} ({v})' for k, v in items]) if items else '—'

    print(f'Top confusions (KNN): {top_conf("knn")}')
    print(f'Top confusions (CNN): {top_conf("cnn")}')
    print(f'Top confusions (Hybrid): {top_conf("hybrid")}')

