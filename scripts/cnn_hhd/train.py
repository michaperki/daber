#!/usr/bin/env python3
import argparse, json, os, random
from pathlib import Path
import numpy as np
import cv2
from sklearn.model_selection import train_test_split
from tensorflow import keras
from tensorflow.keras import layers

HERE = Path(__file__).parent
LETTERS = json.loads((HERE / 'letters.json').read_text(encoding='utf-8'))
N_CLASSES = len(LETTERS)

# ---------------------------------------------------------------------------
# Image augmentation helpers
# ---------------------------------------------------------------------------

def skeletonize(img: np.ndarray) -> np.ndarray:
    """Thin strokes via morphological skeletonization. Input: binary uint8 image
    where ink=255, background=0. Returns same format."""
    skel = np.zeros_like(img)
    element = cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))
    while True:
        opened = cv2.morphologyEx(img, cv2.MORPH_OPEN, element)
        temp = cv2.subtract(img, opened)
        eroded = cv2.erode(img, element)
        skel = cv2.bitwise_or(skel, temp)
        img = eroded.copy()
        if cv2.countNonZero(img) == 0:
            break
    return skel


def random_elastic(img: np.ndarray, alpha: float = 6.0, sigma: float = 3.0) -> np.ndarray:
    """Small elastic deformation to simulate natural handwriting variation."""
    h, w = img.shape[:2]
    dx = cv2.GaussianBlur((np.random.rand(h, w).astype(np.float32) * 2 - 1), (0, 0), sigma) * alpha
    dy = cv2.GaussianBlur((np.random.rand(h, w).astype(np.float32) * 2 - 1), (0, 0), sigma) * alpha
    x, y = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    return cv2.remap(img, x + dx, y + dy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)


def augment_image(img: np.ndarray) -> np.ndarray:
    """Apply random augmentation to a 64×64 float32 image (white=1, ink=0).
    Returns augmented image in same format."""
    h, w = img.shape

    # Random rotation ±15°
    angle = random.uniform(-15, 15)
    M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    img = cv2.warpAffine(img, M, (w, h), borderMode=cv2.BORDER_CONSTANT, borderValue=1.0)

    # Random scale ±15%
    scale = random.uniform(0.85, 1.15)
    M2 = cv2.getRotationMatrix2D((w / 2, h / 2), 0, scale)
    img = cv2.warpAffine(img, M2, (w, h), borderMode=cv2.BORDER_CONSTANT, borderValue=1.0)

    # Random shift ±3px
    dx, dy = random.randint(-3, 3), random.randint(-3, 3)
    M3 = np.float32([[1, 0, dx], [0, 1, dy]])
    img = cv2.warpAffine(img, M3, (w, h), borderMode=cv2.BORDER_CONSTANT, borderValue=1.0)

    # Elastic deformation (on ink mask)
    if random.random() < 0.5:
        ink = ((1.0 - img) * 255).clip(0, 255).astype(np.uint8)
        ink = random_elastic(ink, alpha=6.0, sigma=3.0)
        img = 1.0 - ink.astype(np.float32) / 255.0

    # Random erosion/dilation (stroke width variation)
    if random.random() < 0.4:
        ink = ((1.0 - img) * 255).clip(0, 255).astype(np.uint8)
        k = random.choice([2, 3])
        kern = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
        if random.random() < 0.5:
            ink = cv2.dilate(ink, kern, iterations=1)
        else:
            ink = cv2.erode(ink, kern, iterations=1)
        img = 1.0 - ink.astype(np.float32) / 255.0

    # Small additive noise
    if random.random() < 0.3:
        noise = np.random.normal(0, 0.03, img.shape).astype(np.float32)
        img = np.clip(img + noise, 0, 1)

    return img.astype(np.float32)


# ---------------------------------------------------------------------------
# Dataset loading
# ---------------------------------------------------------------------------

def load_image(f: Path, thin: bool = False) -> np.ndarray | None:
    """Load a single image as 64×64 float32, white=1, ink=0."""
    img = cv2.imread(str(f), cv2.IMREAD_GRAYSCALE)
    if img is None:
        return None
    img = cv2.resize(img, (64, 64), interpolation=cv2.INTER_AREA)
    if thin:
        # Binarize and skeletonize to simulate canvas-like thin strokes
        _, bw = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        skel = skeletonize(bw)
        # Slightly dilate the skeleton so it's not just 1px (fragile)
        kern = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2))
        skel = cv2.dilate(skel, kern, iterations=1)
        img = 255 - skel  # back to white=255, ink=0
    return img.astype(np.float32) / 255.0


def load_dataset(root: Path, thin: bool = False) -> tuple[np.ndarray, np.ndarray]:
    X, y = [], []
    for i, L in enumerate(LETTERS):
        d = root / L
        if not d.exists():
            continue
        for f in d.rglob('*'):
            if not f.is_file():
                continue
            if f.suffix.lower() not in ('.png', '.jpg', '.jpeg', '.bmp'):
                continue
            img = load_image(f, thin=thin)
            if img is None:
                continue
            X.append(img)
            y.append(i)
    X = np.stack(X, axis=0)
    y = np.array(y, dtype=np.int64)
    X = X[..., None]  # add channel dim
    return X, y


class AugmentSequence(keras.utils.Sequence):
    """Keras Sequence that applies online augmentation each epoch."""

    def __init__(self, X: np.ndarray, y: np.ndarray, batch_size: int, augment: bool = True):
        self.X = X
        self.y = y
        self.batch_size = batch_size
        self.augment = augment
        self.indices = np.arange(len(X))

    def __len__(self):
        return int(np.ceil(len(self.X) / self.batch_size))

    def __getitem__(self, idx):
        batch_idx = self.indices[idx * self.batch_size:(idx + 1) * self.batch_size]
        X_batch = self.X[batch_idx].copy()
        y_batch = self.y[batch_idx]
        if self.augment:
            for i in range(len(X_batch)):
                X_batch[i, :, :, 0] = augment_image(X_batch[i, :, :, 0])
        return X_batch, y_batch

    def on_epoch_end(self):
        np.random.shuffle(self.indices)


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------

def build_model() -> keras.Model:
    inputs = keras.Input(shape=(64, 64, 1))
    x = layers.Conv2D(32, 3, activation='relu')(inputs)
    x = layers.BatchNormalization()(x)
    x = layers.MaxPooling2D()(x)
    x = layers.Conv2D(64, 3, activation='relu')(x)
    x = layers.BatchNormalization()(x)
    x = layers.MaxPooling2D()(x)
    x = layers.Conv2D(128, 3, activation='relu')(x)
    x = layers.BatchNormalization()(x)
    x = layers.MaxPooling2D()(x)
    x = layers.Flatten()(x)
    x = layers.Dropout(0.3)(x)
    x = layers.Dense(256, activation='relu')(x)
    x = layers.Dropout(0.3)(x)
    # Output raw logits — softmax applied in JS inference code.
    outputs = layers.Dense(N_CLASSES)(x)
    model = keras.Model(inputs, outputs)
    model.compile(
        optimizer=keras.optimizers.Adam(1e-3),
        loss=keras.losses.SparseCategoricalCrossentropy(from_logits=True),
        metrics=['accuracy'],
    )
    return model


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', required=True, help='Path to by-letter dataset')
    ap.add_argument('--epochs', type=int, default=30)
    ap.add_argument('--batch', type=int, default=64)
    ap.add_argument('--out', type=str, default='runs/hhd_cnn')
    ap.add_argument('--thin', action='store_true',
                    help='Skeletonize training images to simulate thin canvas strokes')
    ap.add_argument('--export_tfjs', type=str, default=None,
                    help='If set, also export TFJS model to this dir')
    args = ap.parse_args()

    print(f'Loading dataset from {args.data} (thin={args.thin})...')
    X, y = load_dataset(Path(args.data), thin=args.thin)
    print(f'Loaded {len(X)} samples across {N_CLASSES} classes.')

    # Print per-class counts
    unique, counts = np.unique(y, return_counts=True)
    for idx, cnt in zip(unique, counts):
        print(f'  {LETTERS[idx]}: {cnt}')

    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.15, random_state=42, stratify=y
    )
    print(f'Train: {len(X_train)}, Val: {len(X_val)}')

    train_seq = AugmentSequence(X_train, y_train, args.batch, augment=True)
    val_seq = AugmentSequence(X_val, y_val, args.batch, augment=False)

    model = build_model()
    model.summary()

    cb = [
        keras.callbacks.ReduceLROnPlateau(
            monitor='val_accuracy', factor=0.5, patience=4, min_lr=1e-6
        ),
        keras.callbacks.EarlyStopping(
            monitor='val_accuracy', patience=8, restore_best_weights=True
        ),
    ]
    model.fit(
        train_seq,
        validation_data=val_seq,
        epochs=args.epochs,
        callbacks=cb,
    )

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    model.save(out_dir / 'model.h5', include_optimizer=False)
    (out_dir / 'letters.json').write_text(
        json.dumps(LETTERS, ensure_ascii=False), encoding='utf-8'
    )
    print(f'Saved model to {out_dir}')

    if args.export_tfjs:
        try:
            import tensorflowjs as tfjs
            tfjs.converters.save_keras_model(model, args.export_tfjs)
            print(f'TFJS model exported to {args.export_tfjs}')
        except Exception as e:
            print('TFJS export failed, ensure tensorflowjs is installed:', e)


if __name__ == '__main__':
    main()
