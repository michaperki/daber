from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Callable, Dict, List, Optional, Tuple

import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader

from .transforms import (
    derive_features,
    median_filter,
    normalize_center_scale,
    remove_duplicate_points,
    resample_strokes,
    StrokeAugment,
)


DEFAULT_LABELS_HEBREW = [
    "א","ב","ג","ד","ה","ו","ז","ח","ט","י",
    "כ","ך","ל","מ","ם","נ","ן","ס","ע","פ",
    "ף","צ","ץ","ק","ר","ש","ת"
]


def _load_json_points(path: str) -> np.ndarray:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    # Accept either {points: [[x,y,t,stroke_id], ...]} or a flat list
    if isinstance(data, dict) and "points" in data:
        pts = np.array(data["points"], dtype=np.float32)
    elif isinstance(data, list):
        pts = np.array(data, dtype=np.float32)
    else:
        raise ValueError(f"Unsupported JSON format in {path}")
    # Ensure shape (N,4?)
    if pts.ndim != 2 or pts.shape[1] < 2:
        raise ValueError(f"Points array malformed in {path}: shape={pts.shape}")
    return pts


@dataclass
class StrokePreprocessConfig:
    n_points: int = 96
    apply_median: bool = True
    median_k: int = 3
    augment: bool = True
    jitter: float = 0.01
    time_warp: float = 0.1
    shear: float = 0.05
    scale_jitter: float = 0.05
    reverse_prob: float = 0.1


class StrokeDataset(Dataset):
    def __init__(
        self,
        root: str,
        split: str,
        label_names: Optional[List[str]] = None,
        config: Optional[StrokePreprocessConfig] = None,
    ) -> None:
        super().__init__()
        self.root = root
        self.split = split
        self.label_names = label_names or DEFAULT_LABELS_HEBREW
        self.config = config or StrokePreprocessConfig()
        # Discover files as data/strokes/{split}/{class}/*.json
        base = os.path.join(root, "strokes", split)
        if not os.path.isdir(base):
            raise FileNotFoundError(
                f"Expected directory {base}. Create data in data/strokes/{{split}}/{{class}}/*.json"
            )
        self.samples: List[Tuple[str, int]] = []
        # Classes can be folder names matching label or index
        class_dirs = sorted([d for d in os.listdir(base) if os.path.isdir(os.path.join(base, d))])
        # Mapping from folder to label index
        name_to_index: Dict[str, int] = {n: i for i, n in enumerate(self.label_names)}
        for cdir in class_dirs:
            cpath = os.path.join(base, cdir)
            if cdir in name_to_index:
                y = name_to_index[cdir]
            else:
                # numeric fallback
                try:
                    y = int(cdir)
                except Exception as e:
                    raise ValueError(f"Unrecognized class dir {cdir}. Use label char or index.")
            for fname in os.listdir(cpath):
                if fname.endswith(".json"):
                    self.samples.append((os.path.join(cpath, fname), y))
        if len(self.samples) == 0:
            raise FileNotFoundError(f"No JSON stroke files found under {base}")
        self.augment = None
        if self.config.augment and split == "train":
            self.augment = StrokeAugment(
                point_jitter=self.config.jitter,
                time_warp_strength=self.config.time_warp,
                shear=self.config.shear,
                scale_jitter=self.config.scale_jitter,
                reverse_prob=self.config.reverse_prob,
            )

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int):
        path, y = self.samples[idx]
        pts = _load_json_points(path)
        pts = remove_duplicate_points(pts)
        if self.config.apply_median:
            pts = median_filter(pts, self.config.median_k)
        pts, _, _ = normalize_center_scale(pts)
        xy, pen_up = resample_strokes(pts, self.config.n_points)
        if self.augment is not None:
            xy = self.augment(xy)
        feats = derive_features(xy, pen_up)
        x = torch.from_numpy(feats)  # (N, C)
        return x, torch.tensor(y, dtype=torch.long)


def build_dataloaders(
    root: str,
    label_names: Optional[List[str]] = None,
    n_points: int = 96,
    batch_size: int = 64,
    num_workers: int = 0,
):
    cfg_train = StrokePreprocessConfig(n_points=n_points, augment=True)
    cfg_eval = StrokePreprocessConfig(n_points=n_points, augment=False)

    train = StrokeDataset(root, split="train", label_names=label_names, config=cfg_train)
    # If there is no explicit val split, create one from train
    val_base = os.path.join(root, "strokes", "val")
    if os.path.isdir(val_base):
        val = StrokeDataset(root, split="val", label_names=label_names, config=cfg_eval)
    else:
        # split 90/10
        n = len(train)
        idx = np.random.permutation(n)
        n_val = max(1, int(0.1 * n))
        val_idx = idx[:n_val]
        train_idx = idx[n_val:]
        full_samples = list(train.samples)
        train.samples = [full_samples[i] for i in train_idx]
        val = StrokeDataset(root, split="train", label_names=label_names, config=cfg_eval)
        val.samples = [full_samples[i] for i in val_idx]  # type: ignore

    test = None
    test_base = os.path.join(root, "strokes", "test")
    if os.path.isdir(test_base):
        test = StrokeDataset(root, split="test", label_names=label_names, config=cfg_eval)

    def _dl(ds: Dataset, shuffle: bool):
        return DataLoader(ds, batch_size=batch_size, shuffle=shuffle, num_workers=num_workers, drop_last=False)

    return _dl(train, True), _dl(val, False), _dl(test, False) if test is not None else None
