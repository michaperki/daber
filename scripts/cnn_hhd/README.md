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
   - Option B: Download HHD and run the prep script (best-effort):
     - Place the original or modified HHD archive at `data/hhd.zip`.
     - Run: python prepare_hhd.py --zip data/hhd.zip --out data/hhd_by_letter
       (This attempts to infer labels; verify the output directories.)

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

