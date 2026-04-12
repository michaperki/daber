Place your TFJS CNN model here to enable Hybrid (CNN + KNN) mode.

Expected layout (one of):

- apps/web/public/models/hebrew_letter_model/model.json
- apps/web/public/models/hebrew_letter_model_tuned/model.json

At runtime, attach a loaded model to `window.daberCnnModel` and include TFJS
on the page (e.g., via a script tag or your own loader). Optionally provide
`window.daberCnnLabels` (array of letters in the model's output index order);
if omitted, the app assumes the built-in `LETTERS` order. The app intentionally
does not import TensorFlow.js directly so it can build and run without a model.

Example (in index.html or a custom plugin):

  <script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs"></script>
  <script>
    (async function() {
      if (window.tf) {
        try {
          window.daberCnnModel = await window.tf.loadLayersModel('/models/hebrew_letter_model_tuned/model.json');
          try {
            const labels = await fetch('/models/hebrew_letter_model_tuned/labels.json').then(r => r.json());
            if (Array.isArray(labels)) window.daberCnnLabels = labels;
          } catch {}
        } catch (e) {
          try {
            window.daberCnnModel = await window.tf.loadLayersModel('/models/hebrew_letter_model/model.json');
          } catch {}
        }
      }
    })();
  </script>

If no model is present, Hybrid mode falls back to centroid-only scoring.
