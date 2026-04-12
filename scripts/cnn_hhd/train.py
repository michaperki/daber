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

def load_dataset(root: Path):
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
      img = cv2.imread(str(f), cv2.IMREAD_GRAYSCALE)
      if img is None:
        continue
      img = cv2.resize(img, (64, 64), interpolation=cv2.INTER_AREA)
      # normalize: white=1.0, ink=0.0 (match frontend CNN input convention)
      x = (img.astype(np.float32) / 255.0)
      X.append(x)
      y.append(i)
  X = np.stack(X, axis=0)
  y = np.array(y, dtype=np.int64)
  # Add channel dim
  X = X[..., None]
  return X, y

def build_model():
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
  outputs = layers.Dense(N_CLASSES, activation='softmax')(x)
  model = keras.Model(inputs, outputs)
  model.compile(optimizer=keras.optimizers.Adam(1e-3), loss='sparse_categorical_crossentropy', metrics=['accuracy'])
  return model

def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--data', required=True, help='Path to by-letter dataset')
  ap.add_argument('--epochs', type=int, default=20)
  ap.add_argument('--batch', type=int, default=128)
  ap.add_argument('--out', type=str, default='runs/hhd_cnn')
  ap.add_argument('--export_tfjs', type=str, default=None, help='If set, also export TFJS model to this dir')
  args = ap.parse_args()

  X, y = load_dataset(Path(args.data))
  X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.15, random_state=42, stratify=y)

  model = build_model()
  cb = [
    keras.callbacks.ReduceLROnPlateau(monitor='val_accuracy', factor=0.5, patience=3, min_lr=1e-5),
    keras.callbacks.EarlyStopping(monitor='val_accuracy', patience=6, restore_best_weights=True)
  ]
  model.fit(X_train, y_train, validation_data=(X_val, y_val), epochs=args.epochs, batch_size=args.batch, callbacks=cb)

  out_dir = Path(args.out)
  out_dir.mkdir(parents=True, exist_ok=True)
  # Save Keras H5
  model.save(out_dir / 'model.h5', include_optimizer=False)
  # Save class order
  (out_dir / 'letters.json').write_text(json.dumps(LETTERS, ensure_ascii=False), encoding='utf-8')

  if args.export_tfjs:
    try:
      import tensorflowjs as tfjs
      tfjs.converters.save_keras_model(model, args.export_tfjs)
    except Exception as e:
      print('TFJS export failed, ensure tensorflowjs is installed:', e)

if __name__ == '__main__':
  main()

