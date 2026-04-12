#!/usr/bin/env python3
"""Evaluate a trained Keras model on the by-letter dataset and produce a
confusion matrix as a PNG + printed summary."""
import argparse, json
from pathlib import Path
import numpy as np
import cv2
from tensorflow import keras

HERE = Path(__file__).parent
LETTERS = json.loads((HERE / 'letters.json').read_text(encoding='utf-8'))
N = len(LETTERS)


def load_image(f: Path, thin: bool = False) -> np.ndarray | None:
    img = cv2.imread(str(f), cv2.IMREAD_GRAYSCALE)
    if img is None:
        return None
    img = cv2.resize(img, (64, 64), interpolation=cv2.INTER_AREA)
    if thin:
        _, bw = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        skel = np.zeros_like(bw)
        element = cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))
        tmp = bw.copy()
        while True:
            opened = cv2.morphologyEx(tmp, cv2.MORPH_OPEN, element)
            temp = cv2.subtract(tmp, opened)
            eroded = cv2.erode(tmp, element)
            skel = cv2.bitwise_or(skel, temp)
            tmp = eroded.copy()
            if cv2.countNonZero(tmp) == 0:
                break
        kern = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2))
        skel = cv2.dilate(skel, kern, iterations=1)
        img = 255 - skel
    return img.astype(np.float32) / 255.0


def load_dataset(root: Path, thin: bool = False):
    X, y = [], []
    for i, L in enumerate(LETTERS):
        d = root / L
        if not d.exists():
            continue
        for f in sorted(d.rglob('*')):
            if not f.is_file() or f.suffix.lower() not in ('.png', '.jpg', '.jpeg', '.bmp'):
                continue
            img = load_image(f, thin=thin)
            if img is not None:
                X.append(img)
                y.append(i)
    return np.stack(X)[..., None], np.array(y, dtype=np.int64)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', required=True, help='Path to by-letter dataset')
    ap.add_argument('--model', required=True, help='Path to saved model dir or .h5')
    ap.add_argument('--thin', action='store_true', help='Skeletonize images before eval')
    ap.add_argument('--out', default='confusion_matrix.png', help='Output image path')
    args = ap.parse_args()

    print(f'Loading dataset from {args.data}...')
    X, y = load_dataset(Path(args.data), thin=args.thin)
    print(f'Loaded {len(X)} samples.')

    model_path = args.model
    if model_path.endswith('.h5'):
        model = keras.models.load_model(model_path, compile=False)
    else:
        model = keras.models.load_model(model_path, compile=False)

    preds = model.predict(X, batch_size=128, verbose=1)
    pred_classes = np.argmax(preds, axis=1)

    # Build confusion matrix
    cm = np.zeros((N, N), dtype=np.int32)
    for true, pred in zip(y, pred_classes):
        cm[true, pred] += 1

    # Print accuracy
    correct = np.sum(np.diag(cm))
    total = np.sum(cm)
    print(f'\nOverall accuracy: {correct}/{total} ({100*correct/total:.1f}%)')

    # Per-class accuracy
    print(f'\n{"Letter":>8} {"Correct":>8} {"Total":>8} {"Acc%":>8}')
    print('-' * 36)
    for i in range(N):
        row_total = np.sum(cm[i])
        row_correct = cm[i, i]
        acc = 100 * row_correct / row_total if row_total > 0 else 0
        print(f'{LETTERS[i]:>8} {row_correct:>8} {row_total:>8} {acc:>7.1f}%')

    # Top confusions
    print('\nTop confusions:')
    confusions = []
    for i in range(N):
        for j in range(N):
            if i != j and cm[i, j] > 0:
                confusions.append((cm[i, j], LETTERS[i], LETTERS[j]))
    confusions.sort(reverse=True)
    for count, true_l, pred_l in confusions[:20]:
        print(f'  {true_l} -> {pred_l}: {count}')

    # Render confusion matrix image
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt

        fig, ax = plt.subplots(figsize=(12, 10))
        # Normalize rows for display
        cm_norm = cm.astype(np.float64)
        row_sums = cm_norm.sum(axis=1, keepdims=True)
        row_sums[row_sums == 0] = 1
        cm_norm = cm_norm / row_sums

        im = ax.imshow(cm_norm, cmap='Blues', vmin=0, vmax=1)
        ax.set_xticks(range(N))
        ax.set_yticks(range(N))
        ax.set_xticklabels(LETTERS, fontsize=9)
        ax.set_yticklabels(LETTERS, fontsize=9)
        ax.set_xlabel('Predicted')
        ax.set_ylabel('True')
        ax.set_title(f'Confusion Matrix — {correct}/{total} ({100*correct/total:.1f}%)')
        fig.colorbar(im, ax=ax, shrink=0.8)

        # Add count text in cells
        for i in range(N):
            for j in range(N):
                if cm[i, j] > 0:
                    color = 'white' if cm_norm[i, j] > 0.5 else 'black'
                    ax.text(j, i, str(cm[i, j]), ha='center', va='center',
                            fontsize=7, color=color)

        plt.tight_layout()
        plt.savefig(args.out, dpi=150)
        print(f'\nConfusion matrix saved to {args.out}')
    except ImportError:
        print('\nmatplotlib not available — skipping image output.')


if __name__ == '__main__':
    main()
