from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
from sklearn.metrics import confusion_matrix, classification_report
from torch.utils.data import DataLoader
from tqdm import tqdm

from .data import DEFAULT_LABELS_HEBREW, build_dataloaders
from .model import StrokeConvBiGRU


def topk_accuracy(logits: torch.Tensor, targets: torch.Tensor, k: int = 1) -> float:
    with torch.no_grad():
        topk = logits.topk(k, dim=1).indices
        correct = (topk == targets.view(-1, 1)).any(dim=1).float().mean().item()
    return correct


def train_one_epoch(model, loader: DataLoader, criterion, optimizer, device) -> Tuple[float, float, float]:
    model.train()
    total_loss = 0.0
    total_top1 = 0.0
    total_top3 = 0.0
    n = 0
    for x, y in tqdm(loader, desc="train", leave=False):
        x = x.to(device)
        y = y.to(device)
        optimizer.zero_grad(set_to_none=True)
        logits = model(x)
        loss = criterion(logits, y)
        loss.backward()
        optimizer.step()
        bsz = x.size(0)
        total_loss += loss.item() * bsz
        total_top1 += topk_accuracy(logits, y, k=1) * bsz
        total_top3 += topk_accuracy(logits, y, k=3) * bsz
        n += bsz
    return total_loss / n, total_top1 / n, total_top3 / n


@torch.no_grad()
def evaluate(model, loader: DataLoader, criterion, device, label_names: List[str]) -> Tuple[float, float, float, np.ndarray]:
    model.eval()
    total_loss = 0.0
    total_top1 = 0.0
    total_top3 = 0.0
    n = 0
    all_preds = []
    all_targets = []
    for x, y in tqdm(loader, desc="eval", leave=False):
        x = x.to(device)
        y = y.to(device)
        logits = model(x)
        loss = criterion(logits, y)
        bsz = x.size(0)
        total_loss += loss.item() * bsz
        total_top1 += topk_accuracy(logits, y, k=1) * bsz
        total_top3 += topk_accuracy(logits, y, k=3) * bsz
        n += bsz
        all_preds.append(logits.argmax(dim=1).cpu().numpy())
        all_targets.append(y.cpu().numpy())
    preds = np.concatenate(all_preds)
    targets = np.concatenate(all_targets)
    cm = confusion_matrix(targets, preds, labels=list(range(len(label_names))))
    return total_loss / n, total_top1 / n, total_top3 / n, cm


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--data-root", type=str, default="data", help="Root folder containing strokes/{split}/{class}/...json")
    p.add_argument("--epochs", type=int, default=40)
    p.add_argument("--batch-size", type=int, default=64)
    p.add_argument("--n-points", type=int, default=96)
    p.add_argument("--lr", type=float, default=3e-4)
    p.add_argument("--weight-decay", type=float, default=1e-4)
    p.add_argument("--device", type=str, default="cuda" if torch.cuda.is_available() else "cpu")
    p.add_argument("--labels", type=str, default="", help="Comma-separated labels to override default Hebrew set")
    p.add_argument("--save-dir", type=str, default="runs/stroke_conv_bigru")
    args = p.parse_args()

    label_names = DEFAULT_LABELS_HEBREW if not args.labels else args.labels.split(",")
    num_classes = len(label_names)

    os.makedirs(args.save_dir, exist_ok=True)

    train_loader, val_loader, test_loader = build_dataloaders(
        root=args.data_root, label_names=label_names, n_points=args.n_points, batch_size=args.batch_size
    )

    model = StrokeConvBiGRU(in_channels=9, num_classes=num_classes).to(args.device)
    criterion = nn.CrossEntropyLoss(label_smoothing=0.05)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    best_val = 0.0
    best_path = os.path.join(args.save_dir, "best.pt")

    for epoch in range(1, args.epochs + 1):
        tl, t1, t3 = train_one_epoch(model, train_loader, criterion, optimizer, args.device)
        vl, v1, v3, vcm = evaluate(model, val_loader, criterion, args.device, label_names)
        print(f"epoch {epoch:03d} | train loss {tl:.4f} top1 {t1:.3f} top3 {t3:.3f} | val loss {vl:.4f} top1 {v1:.3f} top3 {v3:.3f}")
        if v1 > best_val:
            best_val = v1
            torch.save({"model": model.state_dict(), "labels": label_names, "n_points": args.n_points}, best_path)

    print(f"Best val top1: {best_val:.3f}. Saved to {best_path}")
    # Final evaluation
    if test_loader is not None:
        tl, t1, t3, cm = evaluate(model, test_loader, criterion, args.device, label_names)
        print(f"test loss {tl:.4f} top1 {t1:.3f} top3 {t3:.3f}")
        # print simple per-class report
        # Convert cm to normalized per-class accuracy
        per_class_acc = cm.diagonal() / np.maximum(cm.sum(axis=1), 1)
        for i, name in enumerate(label_names):
            print(f"class {i:02d} {name}: acc {per_class_acc[i]:.3f}")


if __name__ == "__main__":
    main()

