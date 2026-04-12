from __future__ import annotations

import argparse
import json
import os
from typing import List

import numpy as np
import torch

from .data import DEFAULT_LABELS_HEBREW
from .model import StrokeConvBiGRU
from .transforms import (
    remove_duplicate_points,
    median_filter,
    normalize_center_scale,
    resample_strokes,
    derive_features,
)


def load_points(path: str) -> np.ndarray:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    pts = data["points"] if isinstance(data, dict) else data
    return np.array(pts, dtype=np.float32)


def predict_file(model_path: str, json_path: str, n_points: int = 96, labels: List[str] | None = None, topk: int = 5):
    ckpt = torch.load(model_path, map_location="cpu")
    label_names = labels or ckpt.get("labels", DEFAULT_LABELS_HEBREW)
    n_points = ckpt.get("n_points", n_points)
    num_classes = len(label_names)

    model = StrokeConvBiGRU(in_channels=9, num_classes=num_classes)
    state = ckpt["model"] if isinstance(ckpt, dict) and "model" in ckpt else ckpt
    model.load_state_dict(state)
    model.eval()

    pts = load_points(json_path)
    pts = remove_duplicate_points(pts)
    pts = median_filter(pts, 3)
    pts, _, _ = normalize_center_scale(pts)
    xy, pen_up = resample_strokes(pts, n_points)
    feats = derive_features(xy, pen_up)
    x = torch.from_numpy(feats).unsqueeze(0)  # (1, T, C)

    with torch.no_grad():
        logits = model(x)
        probs = torch.softmax(logits, dim=-1).squeeze(0)
        vals, idxs = probs.topk(min(topk, num_classes))
        out = [(label_names[i], float(v)) for v, i in zip(vals.tolist(), idxs.tolist())]
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--model", required=True, help="Path to best.pt checkpoint")
    p.add_argument("--json", required=True, help="Path to a stroke JSON file")
    p.add_argument("--topk", type=int, default=5)
    p.add_argument("--n-points", type=int, default=96)
    args = p.parse_args()

    preds = predict_file(args.model, args.json, n_points=args.n_points, topk=args.topk)
    print("Top predictions:")
    for l, p in preds:
        print(f"  {l}: {p:.3f}")


if __name__ == "__main__":
    main()

