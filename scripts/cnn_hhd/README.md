CNN training on HHD (Hebrew Handwriting Dataset)

Overview
- Trains a small CNN on 64×64 grayscale inputs for 27 Hebrew classes (including finals).
- Exports a TFJS model you can drop into `apps/web/public/models/` and use via Hybrid mode.

Quickstart
1) Install deps in a fresh Python env (Python 3.10+):
   pip install -r requirements.txt

2) Prepare dataset:
   - Option A (recommended): arrange images as `data/hhd_by_letter/<glyph>/*.png` where `<glyph>` is one of:
     א ב ג ד ה ו ז ח ט י ך כ ל ם מ ן נ ס ע ף פ ץ צ ק ר ש ת
     Images should be grayscale or RGB; the loader will convert to grayscale.
   - Option B (numeric-labeled dataset, like HHD):
     - If your dataset is in `data/hhd_dataset/TRAIN/0..26` and `TEST/0..26`, create a class→letter mapping:
       `scripts/cnn_hhd/hhd_mapping.json` (see Unicode order example below).
     - Convert to by-letter folders:
       `python prepare_hhd_numeric.py --root data/hhd_dataset --out data/hhd_by_letter --mapping scripts/cnn_hhd/hhd_mapping.json`
     - Sanity-check counts per letter.

Unicode-order mapping example (0..26):
{
  "0":"א","1":"ב","2":"ג","3":"ד","4":"ה","5":"ו","6":"ז","7":"ח","8":"ט","9":"י",
  "10":"ך","11":"כ","12":"ל","13":"ם","14":"מ","15":"ן","16":"נ","17":"ס","18":"ע","19":"ף",
  "20":"פ","21":"ץ","22":"צ","23":"ק","24":"ר","25":"ש","26":"ת"
}

3) Train:
   python train.py --data data/hhd_by_letter --epochs 20 --batch 128 --out runs/hhd_cnn

4) Convert to TFJS (two options):
   - Using tensorflowjs_converter CLI:
     tensorflowjs_converter --input_format=keras --output_format=tfjs_layers_model \
       runs/hhd_cnn/model.h5 apps/web/public/models/hebrew_letter_model_tuned
   - Or via the Python helper:
     python train.py --export_tfjs apps/web/public/models/hebrew_letter_model_tuned

5) Load in the app (optional snippet in page):
   <script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs"></script>
   <script>
     (async () => { window.daberCnnModel = await tf.loadLayersModel('/models/hebrew_letter_model_tuned/model.json'); })();
   </script>

Notes
- Class order is fixed by `letters.json` and matches the frontend `LETTERS` array.
- Inputs are 64×64, white background (1.0), ink dark (0.0). The trainer handles normalization.
- If HHD structure differs, you may need to hand-map labels. The prep script writes any ambiguous files to `data/_unlabeled`.
