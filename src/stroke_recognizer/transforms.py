from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import Callable, List, Optional, Sequence, Tuple

import numpy as np


def remove_duplicate_points(points: np.ndarray, eps: float = 1e-6) -> np.ndarray:
    # points: (M, D) with at least x,y
    if len(points) == 0:
        return points
    keep = [0]
    for i in range(1, len(points)):
        if np.linalg.norm(points[i, :2] - points[keep[-1], :2]) > eps:
            keep.append(i)
    return points[keep]


def median_filter(points: np.ndarray, k: int = 3) -> np.ndarray:
    if k <= 1 or len(points) == 0:
        return points
    pad = k // 2
    padded = np.pad(points[:, :2], ((pad, pad), (0, 0)), mode="edge")
    out_xy = np.empty_like(points[:, :2])
    for i in range(len(points)):
        out_xy[i] = np.median(padded[i : i + k], axis=0)
    out = points.copy()
    out[:, :2] = out_xy
    return out


def normalize_center_scale(points: np.ndarray) -> Tuple[np.ndarray, float, np.ndarray]:
    # Translate to centroid and scale to unit max(side)
    if len(points) == 0:
        return points, 1.0, np.zeros(2)
    xy = points[:, :2]
    centroid = xy.mean(axis=0)
    xy = xy - centroid
    min_xy = xy.min(axis=0)
    max_xy = xy.max(axis=0)
    wh = np.maximum(max_xy - min_xy, 1e-8)
    scale = float(np.max(wh))
    xy = xy / scale
    out = points.copy()
    out[:, :2] = xy
    return out, scale, centroid


def _arc_length(xy: np.ndarray) -> np.ndarray:
    if len(xy) == 0:
        return np.array([0.0])
    diffs = np.diff(xy, axis=0)
    seg = np.linalg.norm(diffs, axis=1)
    s = np.concatenate([[0.0], np.cumsum(seg)])
    if s[-1] <= 0:
        s[-1] = 1.0
    return s


def resample_polyline(xy: np.ndarray, n: int) -> np.ndarray:
    if len(xy) == 0:
        return np.zeros((n, 2), dtype=np.float32)
    s = _arc_length(xy)
    total = s[-1]
    if total == 0:
        return np.repeat(xy[:1], n, axis=0)
    tgt = np.linspace(0, total, n)
    # interpolate
    x = np.interp(tgt, s, xy[:, 0])
    y = np.interp(tgt, s, xy[:, 1])
    return np.stack([x, y], axis=1)


def resample_strokes(points: np.ndarray, n: int) -> Tuple[np.ndarray, np.ndarray]:
    """
    Resample per stroke_id and concatenate. Returns (xy_resampled, pen_up_mask).
    points columns: [x, y, t (optional), stroke_id (optional)]
    """
    if len(points) == 0:
        return np.zeros((n, 2), dtype=np.float32), np.ones((n,), dtype=np.float32)
    # Infer stroke_id if missing: treat as single stroke
    if points.shape[1] < 4:
        stroke_ids = np.zeros((len(points),), dtype=int)
    else:
        stroke_ids = points[:, 3].astype(int)
    xy = points[:, :2]
    # group by stroke
    unique_ids = np.unique(stroke_ids)
    segments = [xy[stroke_ids == sid] for sid in unique_ids]
    # Target points per segment proportional to length
    lengths = [(_arc_length(seg)[-1] if len(seg) > 1 else 1.0) for seg in segments]
    total_len = sum(lengths)
    if total_len <= 0:
        total_len = float(len(segments))
        lengths = [1.0 for _ in segments]
    alloc = [max(2, int(round(n * (L / total_len)))) for L in lengths]
    # adjust to sum n
    diff = n - sum(alloc)
    for i in range(abs(diff)):
        alloc[i % len(alloc)] += 1 if diff > 0 else -1
        if alloc[i % len(alloc)] < 2:
            alloc[i % len(alloc)] = 2
    pieces = []
    pen_up = []
    for si, seg in enumerate(segments):
        m = alloc[si]
        rs = resample_polyline(seg, m)
        pieces.append(rs)
        pu = np.zeros((m,), dtype=np.float32)
        # mark pen_up at the last point of each segment except final
        if si < len(segments) - 1:
            pu[-1] = 1.0
        pen_up.append(pu)
    xy_out = np.concatenate(pieces, axis=0)[:n]
    pu_out = np.concatenate(pen_up, axis=0)[:n]
    # If concatenation was short or long, pad/trim
    if len(xy_out) < n:
        pad = np.repeat(xy_out[-1:], n - len(xy_out), axis=0)
        xy_out = np.concatenate([xy_out, pad], axis=0)
        pu_out = np.concatenate([pu_out, np.zeros((n - len(pu_out),), dtype=np.float32)], axis=0)
    return xy_out.astype(np.float32), pu_out.astype(np.float32)


def derive_features(xy: np.ndarray, pen_up: np.ndarray) -> np.ndarray:
    # xy: (N,2); pen_up: (N,)
    N = len(xy)
    if N == 0:
        return np.zeros((0, 9), dtype=np.float32)
    # derivatives
    dxy = np.diff(xy, axis=0, prepend=xy[:1])
    speed = np.linalg.norm(dxy, axis=1, keepdims=True)
    theta = np.arctan2(dxy[:, 1], dxy[:, 0])
    sin_t = np.sin(theta)[:, None]
    cos_t = np.cos(theta)[:, None]
    # curvature via change in angle
    dtheta = np.diff(theta, prepend=theta[:1])
    curvature = (dtheta / (speed[:, 0] + 1e-6))[:, None]
    pen = pen_up[:, None]
    feats = np.concatenate([xy, dxy, speed, sin_t, cos_t, curvature, pen], axis=1)
    return feats.astype(np.float32)


def random_time_warp(xy: np.ndarray, strength: float = 0.2) -> np.ndarray:
    """Apply a weak monotonic warping to the index domain and resample."""
    N = len(xy)
    if N < 4 or strength <= 0:
        return xy
    # anchors in [0,1]
    anchors = np.linspace(0, 1, num=5)
    jitter = (np.random.rand(len(anchors)) - 0.5) * 2 * (strength / len(anchors))
    vals = np.clip(anchors + jitter, 0, 1)
    vals[0] = 0.0
    vals[-1] = 1.0
    # build warping function
    grid = np.linspace(0, 1, N)
    new_pos = np.interp(grid, anchors, np.sort(vals))
    # resample by position
    idxs = new_pos * (N - 1)
    x = np.interp(idxs, np.arange(N), xy[:, 0])
    y = np.interp(idxs, np.arange(N), xy[:, 1])
    return np.stack([x, y], axis=1).astype(np.float32)


@dataclass
class StrokeAugment:
    point_jitter: float = 0.01
    time_warp_strength: float = 0.1
    shear: float = 0.0
    scale_jitter: float = 0.05
    reverse_prob: float = 0.1

    def __call__(self, xy: np.ndarray) -> np.ndarray:
        out = xy.copy()
        # time warp
        if self.time_warp_strength > 0:
            out = random_time_warp(out, self.time_warp_strength)
        # local affine (small)
        s = 1.0 + (np.random.rand() - 0.5) * 2 * self.scale_jitter
        sh = (np.random.rand() - 0.5) * 2 * self.shear
        A = np.array([[s, sh], [0.0, s]], dtype=np.float32)
        out = (out @ A.T).astype(np.float32)
        # jitter
        if self.point_jitter > 0:
            out = out + np.random.randn(*out.shape).astype(np.float32) * self.point_jitter
        # occasional reversal
        if np.random.rand() < self.reverse_prob:
            out = out[::-1]
        return out

