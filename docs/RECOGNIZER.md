# Recognizer

The MVP uses a **pure nearest-neighbor recognizer** over your calibration samples. No neural network, no training, no model files. Everything runs in-browser on a single CPU core.

This is a direct port of the algorithm in `reference/hebrewhandwritingweb/app.js` and `reference/hebrew_drills/handwriting/engine.ts`, consolidated and re-homed.

## Why KNN (for MVP)

- **No model file to ship.** The frontend bundle stays tiny.
- **Personalization from day one.** Every sample you draw is an example. The recognizer's "knowledge" is literally your handwriting.
- **Zero training.** Add a sample → it's in the recognizer on the next prediction. No gradient descent, no backprop, no cold-start.
- **Transparent.** When the recognizer gets something wrong, you can literally look at the nearest neighbors to see why.
- **Good enough.** At 5–10 samples per letter, cosine KNN over 64×64 grayscale is already useful. It's what the current `HebrewHandwritingWeb` app runs on.

The explicit deferred item is a real CNN (see `FEATURES.md` § L8). We'll only train one once there's enough sample data to justify it and KNN is visibly limiting.

## Pipeline

```
 HTMLCanvasElement (variable size, pen strokes in black on white)
          │
          ▼
 1. Find ink bounding box     (iterate pixels, threshold = ink > 10)
          │
          ▼
 2. Pad bbox by 15%
          │
          ▼
 3. Center into a square canvas
          │
          ▼
 4. Downscale to 64×64
          │
          ▼
 5. Convert to grayscale features
          │  For each pixel: ink_intensity = (255 - avg_rgb) / 255  // in [0, 1]
          ▼
 6. Unit-normalize (L2)        (for cosine similarity)
          │
          ▼
 Float32Array(4096)
          │
          ▼
 7. Score against all stored samples (KNN) or centroids (centroid mode)
          │
          ▼
 Top-K ranked predictions with softmaxed probabilities
```

### Feature extraction in detail

The source canvas is typically ~280–420 CSS pixels square (scaled by device pixel ratio for sharpness). We work in **physical** pixels for accurate bounding-box detection:

```
PW = canvas.width   // physical
PH = canvas.height
img = ctx.getImageData(0, 0, PW, PH).data
```

For each pixel, treat `ink = 255 - avg(r, g, b)`. If `ink > 10`, it's part of a stroke. Walking the whole image gives us `(minX, minY, maxX, maxY)`.

Pad by 15% of the bbox dimensions (clamped to canvas), then compute a square `side = max(bw, bh)`. Draw the cropped region centered into a `side × side` intermediate canvas (white background), then draw that into a 64×64 offscreen canvas with `imageSmoothingEnabled = true`.

Read the 64×64 buffer back, convert to a Float32Array of length 4096 where each entry is `(255 - gray) / 255`. Append 3 geometry features computed on the pre-scale bounding box to preserve aspect information lost by scale-to-fill:

- `widthNorm = width / max(width, height)`
- `heightNorm = height / max(width, height)`
- `aspect = atan(height / width) / (π/2)`

Concatenate `[4096 pixels, widthNorm, heightNorm, aspect]` and unit-normalize the full vector. This fixes the yud/vav/nun-sofit confusion caused by normalization erasing size differences.

### Why unit-normalize?

Cosine similarity of unit vectors is just a dot product. Two unit vectors `a` and `b` have cosine = `a · b ∈ [-1, 1]`. For non-negative ink features, it's in `[0, 1]` in practice. This lets us treat the dot product as a similarity score directly, with no division or norm computation per comparison.

### Quantization for storage

The feature vector is a Float32Array (16 KB per sample). We store it as a Uint8Array (4 KB per sample) by scaling to `[0, 255]`:

```
u8[i] = round(f32[i] * 255)
```

On load, we reverse and re-normalize:

```
f32[i] = u8[i] / 255
// then re-normalize to unit length
```

The quantization introduces tiny error, which is why we re-normalize after loading. In practice you cannot see the difference in accuracy.

## Augmentation

Real handwriting varies in where on the canvas you start. A letter drawn 2px to the left of where you drew the calibration sample looks very different to a cosine-similarity recognizer, even though it's the same letter.

**Cheap fix**: at recognizer-build time, for each stored sample, generate 4 shifted copies:
- `(dx, dy) ∈ { (+1, 0), (-1, 0), (0, +1), (0, -1) }`
- Shift the 64×64 grid by 1 pixel in each direction
- Re-normalize each shifted variant
- Include all variants in the KNN database

Net effect: **~5× the effective sample count** for ~5× the recognition cost. Togglable via the Augment checkbox in the Recognize tab.

This is a direct port of `augmentFeature()` in `reference/hebrewhandwritingweb/app.js:348`.

## Scoring modes

### Centroid mode

For each letter `L` with samples `S_L`, compute the mean:

```
centroid_L = normalize(mean(augmentations(s) for s in S_L))
```

At prediction time, score the query vector `q` against every centroid:

```
score_L = q · centroid_L
```

Return top-K letters by score. Apply softmax with temperature `10` to get probabilities:

```
probs = softmax(scores * 10)
```

**Pros**: O(27) comparisons per prediction. Fast.
**Cons**: averaging loses information. If you draw a letter two distinct ways, the centroid is halfway between them and matches neither.

### KNN mode (default)

Build a flat list of all sample vectors + augmentations, tagged with their letter labels. At prediction time:

```
for each stored vector v:
  score = q · v
top_k = sort(scores)[:k]          // default k = 5
sum_by_letter = {}
for (v, score) in top_k:
  sum_by_letter[label(v)] += score
ranked = sort(sum_by_letter.items(), desc)
```

Return top letters by summed similarity. Apply softmax * temperature.

**Pros**: robust to multimodal handwriting (e.g., you sometimes draw a letter two ways).
**Cons**: O(N) comparisons per prediction, where N = samples * augmentations * 27 letters ≈ 675 at 5 samples/letter with augmentation. Still negligible on desktop; may be worth moving to a Web Worker on mobile.

## Acceptance logic

Practice and Vocab tabs use the same acceptance rule:

```
top = predictTop(vec, k=10)          // generous top to compute margin
top1 = top[0]
top2 = top[1] ?? { prob: 0 }
margin = top1.prob - top2.prob
accepted = top1.letter === expected && margin >= threshold
```

Where `threshold` is user-tunable (default `0.10`). The margin rule is a cheap confidence check: if the recognizer is torn between two letters, we reject even if the top one happens to be correct. This prevents false-positives from boosting the accepted sample into the calibration set (which would poison future recognition).

## Final-form handling

Hebrew has 5 letters with final forms at word ends:

| Base | Final |
|---|---|
| כ | ך |
| מ | ם |
| נ | ן |
| פ | ף |
| צ | ץ |

The recognizer treats all 27 as distinct classes — there's no automatic base↔final conversion in the features. But the matcher layer needs to know that writing ך at the end of a word is the correct answer when the expected letter is כ (and vice versa mid-word).

Helper functions (ported from `reference/hebrew_drills/handwriting/engine.ts`):

```ts
toBase(letter)               // ך → כ, non-finals unchanged
toFinalIfWordEnd(letter, atEnd)
lettersEquivalent(a, b)      // toBase(a) === toBase(b)
```

In Vocab mode, when the expected letter is at the end of the word, accept either the base or the final form (then normalize to whichever matches the stored form). This matches the current `HebrewHandwritingWeb` behavior, although I should double-check it while porting — the current app may only accept exact glyph matches.

## Auto-calibration from accepted letters

Every time the Practice or Vocab tab accepts a draw:

```
calibration.samples[acceptedLetter].push(floatToU8(vec))
saveCalibration(calibration)
```

This silently grows the calibration set every time you use the app correctly. Over a few sessions, your per-letter sample counts go from 1 (first-run minimum) to 20+ without you ever touching the Calibrate tab again.

## Things that are NOT in the recognizer

- **Stroke order or direction.** We only look at the final rendered bitmap. Drawing ר upside-down-wrong will still be accepted if it rasterizes to the same shape.
- **Pressure or stroke speed.** Not captured.
- **Pen lifts within a letter.** We capture them for undo, but the recognizer only sees the union.
- **Temporal features.** No RNNs, no stroke sequences.
- **Word-level segmentation.** Letter-by-letter only. Whole-word mode is deferred.
- **Cross-letter priors.** We don't bias the recognizer toward the next expected letter in a vocab word. (Could be added as a cheap `expectedLetter` prior in the scorer; see `reference/hebrew_drills/handwriting/scoring.ts` for how the Next.js app did this.)

## Performance notes

For reference, on a laptop:
- Feature extraction: <5 ms
- KNN prediction with ~700 samples: ~2 ms
- Total from pen-up to prediction: ~10 ms (most of which is a React/Preact re-render)

On mobile (iOS Safari, recent iPhone):
- Feature extraction: ~15 ms
- KNN: ~10 ms
- Total: ~40 ms

If KNN starts getting slow on mobile (say, 1000+ samples), the first optimization is a Web Worker. See `FEATURES.md` § L6.
