(() => {
  const CLASSES = [
    'א','ב','ג','ד','ה','ו','ז','ח','ט','י',
    'ך','כ','ל','ם','מ','ן','נ','ס','ע','ף',
    'פ','ץ','צ','ק','ר','ש','ת'
  ];

  // First-run setup letters (now the full alphabet)
  const PILOT_LETTERS = CLASSES;
  const PILOT_WORDS = [
    { he: 'שלום',  en: 'peace / hello' },
    { he: 'שומר',  en: 'guard' },
    { he: 'שיר',   en: 'song' },
    { he: 'שירות', en: 'service' },
    { he: 'מותר',  en: 'permitted' },
    { he: 'יותר',  en: 'more' },
    { he: 'תשלום', en: 'payment' },
    { he: 'לומר',  en: 'to say' },
    { he: 'מישור', en: 'plain' },
    { he: 'רושם',  en: 'impression' },
  ];

  // If a larger vocab dataset is provided via data/vocab-data.js
  // it will populate window.VOCAB_WORDS. Fall back to the small
  // built-in list above when none is present.
  const VOCAB_WORDS = (typeof window !== 'undefined' && Array.isArray(window.VOCAB_WORDS) && window.VOCAB_WORDS.length)
    ? window.VOCAB_WORDS
    : PILOT_WORDS;

  const STORAGE_KEY = 'hebrew_calibration_v1';
  const PREFS_KEY = 'hebrew_prefs_v1';

  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); }
    catch { return {}; }
  }
  function savePrefs() { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); }
  const prefs = loadPrefs();
  if (typeof prefs.letterIdx !== 'number') prefs.letterIdx = 0;
  if (typeof prefs.mode !== 'string') prefs.mode = 'knn';
  if (typeof prefs.k !== 'number') prefs.k = 5;
  if (typeof prefs.augment !== 'boolean') prefs.augment = true;
  if (typeof prefs.samplesPerLetter !== 'number') prefs.samplesPerLetter = 5;
  if (typeof prefs.practiceThreshold !== 'number') prefs.practiceThreshold = 0.10;
  if (typeof prefs.pilotWizardDone !== 'boolean') prefs.pilotWizardDone = false;

  // ---- DOM ----
  const el = {
    tabCalibrate: document.getElementById('tab-calibrate'),
    tabRecognize: document.getElementById('tab-recognize'),
    tabPractice: document.getElementById('tab-practice'),
    tabVocab: document.getElementById('tab-vocab'),
    panelCalibrate: document.getElementById('calibrate-controls'),
    panelRecognize: document.getElementById('recognize-controls'),
    panelPractice: document.getElementById('practice-controls'),
    panelVocab: document.getElementById('vocab-controls'),
    canvasWrap: document.querySelector('.canvas-wrap'),
    practiceTarget: document.getElementById('practice-target'),
    btnPracticeSkip: document.getElementById('btn-practice-skip'),
    btnPracticeReset: document.getElementById('btn-practice-reset'),
    practiceThreshold: document.getElementById('practice-threshold'),
    practiceFeedback: document.getElementById('practice-feedback'),
    practiceStats: document.getElementById('practice-stats'),
    canvas: document.getElementById('drawCanvas'),
    btnClear: document.getElementById('btn-clear'),
    btnUndo: document.getElementById('btn-undo'),
    targetLetter: document.getElementById('target-letter'),
    btnSaveSample: document.getElementById('btn-save-sample'),
    btnNextLetter: document.getElementById('btn-next-letter'),
    samplesPerLetter: document.getElementById('samples-per-letter'),
    btnExport: document.getElementById('btn-export'),
    fileImport: document.getElementById('file-import'),
    btnReset: document.getElementById('btn-reset'),
    btnDeleteLast: document.getElementById('btn-delete-last'),
    btnClearLetter: document.getElementById('btn-clear-letter'),
    calibrationProgress: document.getElementById('calibration-progress'),
    pilotProgress: document.getElementById('pilot-progress'),
    liveToggle: document.getElementById('live-toggle'),
    btnPredictOnce: document.getElementById('btn-predict-once'),
    recMode: document.getElementById('rec-mode'),
    recK: document.getElementById('rec-k'),
    recAugment: document.getElementById('rec-augment'),
    predictions: document.getElementById('predictions'),
    predictionsMargin: document.getElementById('predictions-margin'),
    lettersGrid: document.getElementById('letters-grid'),
    prototypes: document.getElementById('prototypes'),
    // Vocab UI
    vocabEnglish: document.getElementById('vocab-english'),
    vocabOutput: document.getElementById('vocab-output'),
    vocabFeedback: document.getElementById('vocab-feedback'),
    vocabAnswer: document.getElementById('vocab-answer'),
    btnVocabIdk: document.getElementById('btn-vocab-idk'),
    btnVocabBackspace: document.getElementById('btn-vocab-backspace'),
    btnVocabSkip: document.getElementById('btn-vocab-skip'),
  };

  // ---- Canvas drawing ----
  const ctx = el.canvas.getContext('2d');
  // W and H are the LOGICAL (CSS-pixel) canvas size. The physical buffer is
  // W*dpr × H*dpr, but all drawing coords are in logical units thanks to
  // setTransform(dpr, 0, 0, dpr). Set in setupCanvas().
  let W = 0, H = 0;
  let dpr = window.devicePixelRatio || 1;

  let drawing = false;
  let paths = []; // list of paths, each path is [{x,y}...]
  let currentPath = [];
  // Timer must be declared before any call that references it (TDZ fix)
  let liveTimer = null;

  setupCanvas();
  resetCanvas();

  function setupCanvas() {
    // Size the canvas to match its wrapper's rendered width, square.
    // The wrapper is responsive via CSS (min(94vw, 420px)).
    dpr = window.devicePixelRatio || 1;
    const rect = el.canvasWrap.getBoundingClientRect();
    const side = Math.max(200, Math.round(rect.width || 280));
    W = side;
    H = side;
    el.canvas.width = Math.round(side * dpr);
    el.canvas.height = Math.round(side * dpr);
    el.canvas.style.width = side + 'px';
    el.canvas.style.height = side + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Stroke width scales with logical canvas size (keeps stroke ~3.6% of side).
  function strokeWidth() { return Math.max(6, Math.round(W / 28)); }

  function resetCanvas() {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = strokeWidth();
    ctx.restore();
    paths = [];
    currentPath = [];
    scheduleLivePredict();
  }

  function redrawAll() {
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = strokeWidth();
    for (const path of paths) {
      drawPath(path);
    }
    drawPath(currentPath);
    ctx.restore();
  }

  function drawPath(path) {
    if (!path || path.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
    ctx.stroke();
  }

  function getPos(evt) {
    const rect = el.canvas.getBoundingClientRect();
    const x = (evt.clientX - rect.left);
    const y = (evt.clientY - rect.top);
    return { x, y };
  }

  function startDraw(e) {
    drawing = true; currentPath = []; addPoint(e);
  }
  function addPoint(e) {
    if (!drawing) return;
    const p = e.touches ? getPos(e.touches[0]) : getPos(e);
    currentPath.push(p);
    redrawAll();
  }
  function endDraw() {
    if (!drawing) return;
    drawing = false;
    if (currentPath.length > 1) paths.push(currentPath);
    currentPath = [];
    redrawAll();
    scheduleLivePredict();
    schedulePracticeCheck();
    scheduleVocabCheck();
  }

  // Pointer events unify mouse/touch/pen on modern browsers. The canvas has
  // `touch-action: none` in CSS so the browser won't scroll/zoom when drawing.
  el.canvas.addEventListener('pointerdown', (e) => {
    // Capture the pointer so we keep getting move events even if the finger
    // drifts outside the canvas bounds mid-stroke.
    if (el.canvas.setPointerCapture && e.pointerId !== undefined) {
      try { el.canvas.setPointerCapture(e.pointerId); } catch {}
    }
    startDraw(e);
  });
  el.canvas.addEventListener('pointermove', addPoint);
  el.canvas.addEventListener('pointerup', endDraw);
  el.canvas.addEventListener('pointercancel', endDraw);
  // Fallback for very old browsers without PointerEvent support.
  if (!('PointerEvent' in window)) {
    el.canvas.addEventListener('touchstart', (e) => { e.preventDefault(); startDraw(e); }, { passive: false });
    el.canvas.addEventListener('touchmove', (e) => { e.preventDefault(); addPoint(e); }, { passive: false });
    el.canvas.addEventListener('touchend', (e) => { e.preventDefault(); endDraw(e); }, { passive: false });
  }

  el.btnClear.addEventListener('click', resetCanvas);
  el.btnUndo.addEventListener('click', () => { paths.pop(); redrawAll(); scheduleLivePredict(); });

  // ---- Preprocessing (crop -> pad -> 64x64 -> grayscale features [0..1]) ----
  const INPUT = 64;
  const OFF = document.createElement('canvas'); OFF.width = INPUT; OFF.height = INPUT;
  const off = OFF.getContext('2d');

  function extractFeaturesFromCanvas() {
    // Work in PHYSICAL buffer coordinates, not logical (CSS) coords.
    // getImageData and drawImage(canvas, sx, sy, ...) both operate on raw
    // pixels regardless of any ctx.setTransform, so we must use the
    // actual buffer dimensions (logical × dpr) here.
    const PW = el.canvas.width;
    const PH = el.canvas.height;
    // 1) Find ink bbox on the main canvas
    const img = ctx.getImageData(0, 0, PW, PH);
    const data = img.data;
    let minX = PW, minY = PH, maxX = -1, maxY = -1;
    for (let y = 0; y < PH; y++) {
      for (let x = 0; x < PW; x++) {
        const i = (y * PW + x) * 4;
        const r = data[i], g = data[i+1], b = data[i+2];
        const gray = (r + g + b) / 3; // 0..255
        const ink = 255 - gray; // ink stronger = higher value
        if (ink > 10) { // threshold
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < 0 || maxY < 0) {
      // Empty canvas → return zero vector
      return new Float32Array(INPUT * INPUT);
    }

    // 2) Crop with padding and fit into square
    const pad = 0.15; // 15% padding
    let bw = maxX - minX + 1, bh = maxY - minY + 1;
    let cx = minX - Math.floor(bw * pad); let cy = minY - Math.floor(bh * pad);
    let cw = Math.floor(bw * (1 + 2*pad)); let ch = Math.floor(bh * (1 + 2*pad));
    // keep within bounds
    if (cx < 0) cx = 0; if (cy < 0) cy = 0;
    if (cx + cw > PW) cw = PW - cx;
    if (cy + ch > PH) ch = PH - cy;

    const side = Math.max(cw, ch);
    // draw onto square offscreen canvas (white bg)
    const tmp = document.createElement('canvas');
    tmp.width = side; tmp.height = side; const tctx = tmp.getContext('2d');
    tctx.fillStyle = '#fff'; tctx.fillRect(0, 0, side, side);
    // center the crop in the square
    const dx = Math.floor((side - cw) / 2);
    const dy = Math.floor((side - ch) / 2);
    tctx.drawImage(el.canvas, cx, cy, cw, ch, dx, dy, cw, ch);

    // 3) Scale to 64x64 and extract grayscale features
    off.clearRect(0, 0, INPUT, INPUT);
    off.fillStyle = '#fff';
    off.fillRect(0, 0, INPUT, INPUT);
    off.drawImage(tmp, 0, 0, INPUT, INPUT);

    const img2 = off.getImageData(0, 0, INPUT, INPUT).data;
    const vec = new Float32Array(INPUT * INPUT);
    for (let i = 0; i < INPUT*INPUT; i++) {
      const r = img2[i*4], g = img2[i*4+1], b = img2[i*4+2];
      const gray = (r + g + b) / 3; // 0..255
      const ink = (255 - gray) / 255; // 0..1 emphasizing strokes
      vec[i] = ink;
    }
    // Normalize to unit length (cosine distance works better)
    let norm = 1e-6;
    for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    for (let i = 0; i < vec.length; i++) vec[i] /= norm;
    return vec;
  }

  // ---- Calibration storage ----
  // Structure: { version: 1, samples: { letter: [ Uint8Array(4096), ... ] } }
  let letterIdx = prefs.letterIdx;
  let calibration = loadCalibration();
  let prototypes = {};
  let knnDb = { vectors: [], labels: [] };
  rebuildRecognizers();

  function floatToU8(vec) {
    const out = new Uint8Array(vec.length);
    for (let i = 0; i < vec.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(vec[i] * 255)));
    return out;
  }
  function u8ToFloat(arr) {
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) out[i] = arr[i] / 255;
    // re-normalize to unit length in case
    let norm = 1e-6; for (let i = 0; i < out.length; i++) norm += out[i]*out[i]; norm = Math.sqrt(norm);
    for (let i = 0; i < out.length; i++) out[i] /= norm;
    return out;
  }

  function loadCalibration() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { version: 1, samples: {} };
      const parsed = JSON.parse(raw);
      // revive base64 -> Uint8Array
      const samples = {};
      for (const k of Object.keys(parsed.samples || {})) {
        samples[k] = (parsed.samples[k] || []).map(b64 => base64ToU8(b64));
      }
      return { version: 1, samples };
    } catch (e) {
      console.warn('Failed to load calibration', e);
      return { version: 1, samples: {} };
    }
  }

  function saveCalibration() {
    const payload = { version: 1, samples: {} };
    for (const k of Object.keys(calibration.samples)) {
      payload.samples[k] = calibration.samples[k].map(u8 => u8ToBase64(u8));
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    rebuildRecognizers();
  }

  // Data augmentation: shift the 64x64 feature grid by ±1 pixel in each axis.
  // Returns [original, ...shifted variants] when augmentation is enabled.
  function augmentFeature(vec) {
    if (!prefs.augment) return [vec];
    const out = [vec];
    const shifts = [[1,0],[-1,0],[0,1],[0,-1]];
    for (const [dx, dy] of shifts) {
      const v = new Float32Array(INPUT * INPUT);
      for (let y = 0; y < INPUT; y++) {
        for (let x = 0; x < INPUT; x++) {
          const sy = y - dy, sx = x - dx;
          if (sy >= 0 && sy < INPUT && sx >= 0 && sx < INPUT) {
            v[y * INPUT + x] = vec[sy * INPUT + sx];
          }
        }
      }
      let norm = 1e-6;
      for (let i = 0; i < v.length; i++) norm += v[i]*v[i];
      norm = Math.sqrt(norm);
      for (let i = 0; i < v.length; i++) v[i] /= norm;
      out.push(v);
    }
    return out;
  }

  function computePrototypes(cal) {
    const out = {};
    for (const letter of Object.keys(cal.samples)) {
      const list = cal.samples[letter];
      if (!list.length) continue;
      const acc = new Float32Array(INPUT*INPUT);
      let n = 0;
      for (const u8 of list) {
        const f = u8ToFloat(u8);
        const augs = augmentFeature(f);
        for (const a of augs) {
          for (let i = 0; i < acc.length; i++) acc[i] += a[i];
          n++;
        }
      }
      if (!n) continue;
      for (let i = 0; i < acc.length; i++) acc[i] /= n;
      let norm = 1e-6; for (let i = 0; i < acc.length; i++) norm += acc[i]*acc[i]; norm = Math.sqrt(norm);
      for (let i = 0; i < acc.length; i++) acc[i] /= norm;
      out[letter] = acc;
    }
    return out;
  }

  function buildKnnDb(cal) {
    const vectors = [];
    const labels = [];
    for (const letter of Object.keys(cal.samples)) {
      for (const u8 of cal.samples[letter]) {
        const f = u8ToFloat(u8);
        const augs = augmentFeature(f);
        for (const a of augs) {
          vectors.push(a);
          labels.push(letter);
        }
      }
    }
    return { vectors, labels };
  }

  function rebuildRecognizers() {
    prototypes = computePrototypes(calibration);
    knnDb = buildKnnDb(calibration);
    renderLettersGrid();
    renderPrototypes();
  }

  function renderLettersGrid() {
    el.lettersGrid.innerHTML = '';
    CLASSES.forEach((letter, idx) => {
      const div = document.createElement('div');
      div.className = 'lg-item';
      if (idx === letterIdx) div.classList.add('active');
      const count = (calibration.samples[letter] || []).length;
      div.innerHTML = `<div class="lg-letter">${letter}</div><div class="lg-count">${count} samples</div>`;
      div.addEventListener('click', () => {
        setLetterIdx(idx);
        resetCanvas();
      });
      el.lettersGrid.appendChild(div);
    });
    // update progress text
    const target = Number(el.samplesPerLetter.value || 5);
    const per = CLASSES.map(L => `${L}: ${(calibration.samples[L]||[]).length}/${target}`).join('  ');
    el.calibrationProgress.textContent = per;
  }

  function renderPrototypes() {
    el.prototypes.innerHTML = '';
    for (const letter of CLASSES) {
      if (!prototypes[letter]) continue;
      const wrap = document.createElement('div');
      wrap.className = 'proto';
      const c = document.createElement('canvas');
      c.width = 64; c.height = 64; const cctx = c.getContext('2d');
      const imgData = cctx.createImageData(64, 64);
      const vec = prototypes[letter];
      for (let i = 0; i < 64*64; i++) {
        const v = Math.max(0, Math.min(255, Math.round(vec[i] * 255)));
        // invert back to display as ink (black) on white
        const gray = 255 - v;
        imgData.data[i*4] = gray;
        imgData.data[i*4+1] = gray;
        imgData.data[i*4+2] = gray;
        imgData.data[i*4+3] = 255;
      }
      cctx.putImageData(imgData, 0, 0);
      const lbl = document.createElement('div');
      lbl.className = 'lbl';
      lbl.textContent = letter;
      wrap.appendChild(c); wrap.appendChild(lbl);
      el.prototypes.appendChild(wrap);
    }
  }

  // ---- Tabs ----
  function setTab(tab) {
    el.tabCalibrate.classList.remove('active');
    el.tabRecognize.classList.remove('active');
    el.tabPractice.classList.remove('active');
    if (el.tabVocab) el.tabVocab.classList.remove('active');
    el.panelCalibrate.classList.add('hidden');
    el.panelRecognize.classList.add('hidden');
    el.panelPractice.classList.add('hidden');
    if (el.panelVocab) el.panelVocab.classList.add('hidden');
    if (tab === 'calibrate') {
      el.tabCalibrate.classList.add('active');
      el.panelCalibrate.classList.remove('hidden');
    } else if (tab === 'recognize') {
      el.tabRecognize.classList.add('active');
      el.panelRecognize.classList.remove('hidden');
    } else if (tab === 'practice') {
      el.tabPractice.classList.add('active');
      el.panelPractice.classList.remove('hidden');
      if (!practiceState.target) nextPracticeTarget();
      updatePracticeStats();
      resetCanvas();
    } else if (tab === 'vocab') {
      if (el.tabVocab) el.tabVocab.classList.add('active');
      if (el.panelVocab) el.panelVocab.classList.remove('hidden');
      if (!vocabState.current) pickNextVocab();
      resetCanvas();
    }
  }
  el.tabCalibrate.addEventListener('click', () => setTab('calibrate'));
  el.tabRecognize.addEventListener('click', () => setTab('recognize'));
  el.tabPractice.addEventListener('click', () => setTab('practice'));
  if (el.tabVocab) el.tabVocab.addEventListener('click', () => setTab('vocab'));

  // ---- Calibration workflow ----
  function nextTargetLetter() { setLetterIdx(letterIdx + 1); }
  function setLetterIdx(i) {
    letterIdx = ((i % CLASSES.length) + CLASSES.length) % CLASSES.length;
    el.targetLetter.textContent = CLASSES[letterIdx];
    prefs.letterIdx = letterIdx;
    savePrefs();
    renderLettersGrid();
  }
  el.samplesPerLetter.value = String(prefs.samplesPerLetter);
  setLetterIdx(prefs.letterIdx);

  el.btnNextLetter.addEventListener('click', () => { nextTargetLetter(); resetCanvas(); });
  el.samplesPerLetter.addEventListener('change', () => {
    prefs.samplesPerLetter = Number(el.samplesPerLetter.value || 5);
    savePrefs();
    renderLettersGrid();
  });

  el.btnSaveSample.addEventListener('click', () => {
    const vec = extractFeaturesFromCanvas();
    // discard empty
    let sum = 0; for (let i = 0; i < vec.length; i++) sum += vec[i];
    if (sum < 1e-3) return; // nothing drawn

    const u8 = floatToU8(vec);
    const L = CLASSES[letterIdx];
    calibration.samples[L] = calibration.samples[L] || [];
    calibration.samples[L].push(u8);
    saveCalibration();

    // auto-advance if reached target per-letter
    const target = Number(el.samplesPerLetter.value || 5);
    const count = calibration.samples[L].length;
    if (count >= target) { nextTargetLetter(); }
    // If setup is in progress, jump to the next incomplete letter
    if (pilotNeedsSetup()) {
      const next = nextIncompletePilotLetter();
      if (next) setLetterIdx(CLASSES.indexOf(next));
      updatePilotProgress();
    }
    resetCanvas();
  });

  // Export/Import/Reset
  el.btnExport.addEventListener('click', () => {
    const payload = { version: 1, samples: {} };
    for (const k of Object.keys(calibration.samples)) {
      payload.samples[k] = calibration.samples[k].map(u8 => u8ToBase64(u8));
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hebrew_calibration.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  el.fileImport.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const parsed = JSON.parse(text);
      const samples = {};
      for (const k of Object.keys(parsed.samples || {})) {
        samples[k] = (parsed.samples[k] || []).map(b64 => base64ToU8(b64));
      }
      calibration = { version: 1, samples };
      saveCalibration();
      resetCanvas();
    } catch (err) {
      alert('Import failed: invalid JSON');
    }
    e.target.value = '';
  });
  el.btnReset.addEventListener('click', () => {
    if (!confirm('Clear all calibration samples?')) return;
    calibration = { version: 1, samples: {} };
    saveCalibration();
    resetCanvas();
  });

  // Delete the last saved sample for the current letter (fix a bad stroke).
  el.btnDeleteLast.addEventListener('click', () => {
    const L = CLASSES[letterIdx];
    const list = calibration.samples[L] || [];
    if (!list.length) return;
    list.pop();
    if (!list.length) delete calibration.samples[L];
    saveCalibration();
  });

  // Clear all saved samples for the current letter (useful if a wrong letter was saved).
  el.btnClearLetter.addEventListener('click', () => {
    const L = CLASSES[letterIdx];
    const count = (calibration.samples[L] || []).length;
    if (!count) return;
    const ok = confirm(`Clear all ${count} sample(s) for "${L}"?`);
    if (!ok) return;
    delete calibration.samples[L];
    saveCalibration();
    resetCanvas();
    updatePilotProgress();
  });

  // ---- Pilot setup helpers ----
  function pilotCompletedCount() {
    let n = 0;
    for (const L of PILOT_LETTERS) if ((calibration.samples[L] || []).length > 0) n++;
    return n;
  }
  function pilotNeedsSetup() {
    // Consider setup incomplete until every letter has at least one sample
    return pilotCompletedCount() < PILOT_LETTERS.length;
  }
  function nextIncompletePilotLetter() {
    for (const L of PILOT_LETTERS) {
      if (!(calibration.samples[L] || []).length) return L;
    }
    return null;
  }
  function updatePilotProgress() {
    if (!el.pilotProgress) return;
    if (!pilotNeedsSetup()) {
      el.pilotProgress.textContent = 'Setup complete for all letters.';
      return;
    }
    const n = pilotCompletedCount();
    el.pilotProgress.textContent = `Setup: ${n}/${PILOT_LETTERS.length} letters collected`;
  }

  // On load, if pilot not done, guide user to next incomplete letter
  if (pilotNeedsSetup()) {
    const next = nextIncompletePilotLetter();
    if (next) setLetterIdx(CLASSES.indexOf(next));
    updatePilotProgress();
  } else {
    updatePilotProgress();
  }

  // ---- Recognition ----
  // Centroid: cosine similarity against the averaged prototype per class.
  function predictTopCentroid(vec, topN) {
    const scores = [];
    for (const letter of CLASSES) {
      const proto = prototypes[letter];
      if (!proto) continue;
      let dot = 0;
      for (let i = 0; i < vec.length; i++) dot += vec[i] * proto[i];
      scores.push({ letter, score: dot });
    }
    scores.sort((a,b) => b.score - a.score);
    const top = scores.slice(0, topN);
    // softmax-like scaling for readability
    const temp = 10;
    const exps = top.map(s => Math.exp(s.score * temp));
    const sum = exps.reduce((a,b)=>a+b, 0) || 1;
    return top.map((s,i) => ({ letter: s.letter, prob: exps[i]/sum, raw: s.score }));
  }

  // KNN: take k most similar samples from the DB and vote weighted by similarity.
  function predictTopKnn(vec, k, topN) {
    const n = knnDb.vectors.length;
    if (n === 0) return [];
    const sims = new Array(n);
    for (let i = 0; i < n; i++) {
      const v = knnDb.vectors[i];
      let dot = 0;
      for (let j = 0; j < vec.length; j++) dot += vec[j] * v[j];
      sims[i] = { sim: dot, label: knnDb.labels[i] };
    }
    sims.sort((a, b) => b.sim - a.sim);
    const kk = Math.min(k, n);
    const votes = {};
    for (let i = 0; i < kk; i++) {
      votes[sims[i].label] = (votes[sims[i].label] || 0) + sims[i].sim;
    }
    const total = Object.values(votes).reduce((a, b) => a + b, 0) || 1;
    const scores = Object.keys(votes).map(label => ({
      letter: label,
      prob: votes[label] / total,
      raw: votes[label] / kk,
    }));
    scores.sort((a, b) => b.prob - a.prob);
    return scores.slice(0, topN);
  }

  function predictTop(vec, topN = 5) {
    if (prefs.mode === 'centroid') return predictTopCentroid(vec, topN);
    return predictTopKnn(vec, prefs.k, topN);
  }

  function renderPredictions(list) {
    el.predictions.innerHTML = '';
    if (el.predictionsMargin) {
      if (list.length >= 2) {
        const margin = (list[0].prob - list[1].prob) * 100;
        const gap = (list[0].raw - list[1].raw);
        el.predictionsMargin.textContent =
          `Top-1 margin: ${margin.toFixed(1)}%  ·  raw gap: ${gap.toFixed(3)}`;
      } else if (list.length === 1) {
        el.predictionsMargin.textContent = `Only one class in calibration.`;
      } else {
        el.predictionsMargin.textContent = '';
      }
    }
    for (const item of list) {
      const row = document.createElement('div'); row.className = 'pred-item';
      const lbl = document.createElement('div'); lbl.textContent = `${item.letter}`;
      const pct = document.createElement('div'); pct.style.minWidth = '48px'; pct.textContent = (item.prob*100).toFixed(1)+'%';
      const bar = document.createElement('div'); bar.className = 'bar';
      const span = document.createElement('span'); span.style.width = Math.round(item.prob*100)+'%';
      bar.appendChild(span);
      row.appendChild(lbl); row.appendChild(bar); row.appendChild(pct);
      el.predictions.appendChild(row);
    }
  }

  function scheduleLivePredict() {
    if (!el.liveToggle.checked) return;
    // Only predict while the recognize panel is visible.
    if (el.panelRecognize.classList.contains('hidden')) return;
    if (liveTimer) { clearTimeout(liveTimer); }
    liveTimer = setTimeout(() => { doPredictOnce(); }, 120);
  }

  function doPredictOnce() {
    const vec = extractFeaturesFromCanvas();
    const haveAny = Object.keys(prototypes).length > 0;
    if (!haveAny) {
      el.predictions.innerHTML = '<small>Calibrate first to enable recognition.</small>';
      if (el.predictionsMargin) el.predictionsMargin.textContent = '';
      return;
    }
    const top = predictTop(vec, 5);
    renderPredictions(top);
  }

  el.liveToggle.addEventListener('change', () => { if (el.liveToggle.checked) scheduleLivePredict(); });
  el.btnPredictOnce.addEventListener('click', doPredictOnce);

  // Recognizer controls
  if (el.recMode) {
    el.recMode.value = prefs.mode;
    el.recMode.addEventListener('change', () => {
      prefs.mode = el.recMode.value;
      savePrefs();
      doPredictOnce();
    });
  }
  if (el.recK) {
    el.recK.value = String(prefs.k);
    el.recK.addEventListener('change', () => {
      const v = Math.max(1, Math.min(25, Number(el.recK.value) || 5));
      prefs.k = v;
      el.recK.value = String(v);
      savePrefs();
      doPredictOnce();
    });
  }
  if (el.recAugment) {
    el.recAugment.checked = prefs.augment;
    el.recAugment.addEventListener('change', () => {
      prefs.augment = el.recAugment.checked;
      savePrefs();
      rebuildRecognizers();
      doPredictOnce();
    });
  }

  // Tab switch should flush a prediction when entering Recognize.
  el.tabRecognize.addEventListener('click', () => {
    // slight delay to let the tab become visible first
    setTimeout(doPredictOnce, 0);
  });

  // ---- Practice mode ----
  // Prompt a random calibrated letter. On stroke-end, predict. Accept if top-1
  // matches the target AND top-1 margin >= threshold. Otherwise shake and keep
  // the stroke so the user can see what they drew.
  const practiceState = { target: null, correct: 0, total: 0 };
  let practiceTimer = null;
  let practiceBusy = false; // suppress double-fires while an accept animation is running

  function calibratedLetters() {
    return CLASSES.filter(L => (calibration.samples[L] || []).length > 0);
  }

  function pickRandomTarget() {
    const pool = calibratedLetters();
    if (pool.length === 0) return null;
    let pick;
    // Avoid repeating the same letter twice in a row when possible.
    let attempts = 0;
    do {
      pick = pool[Math.floor(Math.random() * pool.length)];
      attempts++;
    } while (pool.length > 1 && pick === practiceState.target && attempts < 8);
    return pick;
  }

  function nextPracticeTarget() {
    practiceState.target = pickRandomTarget();
    el.practiceTarget.textContent = practiceState.target || '—';
    el.practiceFeedback.textContent = practiceState.target
      ? ''
      : 'Calibrate at least one letter to start practicing.';
  }

  function updatePracticeStats() {
    const pct = practiceState.total
      ? Math.round(100 * practiceState.correct / practiceState.total)
      : 0;
    el.practiceStats.textContent =
      `Correct: ${practiceState.correct} / ${practiceState.total}  (${pct}%)`;
  }

  function flashAccept() {
    const w = el.canvasWrap;
    w.classList.remove('accept');
    void w.offsetWidth; // force reflow so the animation restarts
    w.classList.add('accept');
  }
  function shakeReject() {
    const w = el.canvasWrap;
    w.classList.remove('shake');
    void w.offsetWidth;
    w.classList.add('shake');
  }

  function schedulePracticeCheck() {
    if (el.panelPractice.classList.contains('hidden')) return;
    if (practiceBusy) return;
    if (practiceTimer) clearTimeout(practiceTimer);
    practiceTimer = setTimeout(doPracticeCheck, 150);
  }

  function doPracticeCheck() {
    if (!practiceState.target) return;
    if (practiceBusy) return;
    const vec = extractFeaturesFromCanvas();
    let sum = 0; for (let i = 0; i < vec.length; i++) sum += vec[i];
    if (sum < 1e-3) return;

    // Get a generous top list so top-2 margin is meaningful.
    const top = predictTop(vec, 10);
    if (!top.length) return;
    const top1 = top[0];
    const top2 = top[1] || { prob: 0, letter: '—' };
    const margin = top1.prob - top2.prob;
    const threshold = prefs.practiceThreshold;

    practiceState.total++;
    const accepted = top1.letter === practiceState.target && margin >= threshold;

    if (accepted) {
      practiceState.correct++;
      el.practiceFeedback.textContent =
        `✓ ${top1.letter} (margin ${(margin * 100).toFixed(1)}%)`;
      flashAccept();
      practiceBusy = true;
      setTimeout(() => {
        practiceBusy = false;
        nextPracticeTarget();
        resetCanvas();
      }, 380);
    } else {
      const reason = top1.letter === practiceState.target
        ? `low margin ${(margin * 100).toFixed(1)}% < ${(threshold * 100).toFixed(0)}%`
        : `got ${top1.letter} (${(top1.prob * 100).toFixed(0)}%) vs expected ${practiceState.target}`;
      el.practiceFeedback.textContent = `✗ ${reason}`;
      shakeReject();
    }
    updatePracticeStats();
  }

  el.btnPracticeSkip.addEventListener('click', () => {
    nextPracticeTarget();
    resetCanvas();
  });
  el.btnPracticeReset.addEventListener('click', () => {
    practiceState.correct = 0;
    practiceState.total = 0;
    updatePracticeStats();
  });
  el.practiceThreshold.value = String(prefs.practiceThreshold);
  el.practiceThreshold.addEventListener('change', () => {
    const v = Math.max(0, Math.min(1, Number(el.practiceThreshold.value) || 0));
    prefs.practiceThreshold = v;
    el.practiceThreshold.value = String(v);
    savePrefs();
  });
  updatePracticeStats();

  // Re-pick target if calibration changed while away (e.g., user added samples).
  el.tabPractice.addEventListener('click', () => {
    // If the current target is no longer calibrated, pick a new one.
    if (practiceState.target && (calibration.samples[practiceState.target] || []).length === 0) {
      nextPracticeTarget();
    }
  });

  // ---- Vocab practice (letter-by-letter) ----
  const vocabState = { current: null, english: '—', he: '', pos: 0, output: '', revealed: false };
  let vocabTimer = null;
  let vocabBusy = false;

  function pickNextVocab() {
    vocabState.current = VOCAB_WORDS[Math.floor(Math.random() * VOCAB_WORDS.length)];
    vocabState.he = vocabState.current.he;
    vocabState.english = vocabState.current.en || '—';
    vocabState.pos = 0;
    vocabState.output = '';
    vocabState.revealed = false;
    if (el.vocabEnglish) el.vocabEnglish.textContent = vocabState.english;
    if (el.vocabOutput) el.vocabOutput.textContent = '';
    if (el.vocabAnswer) el.vocabAnswer.textContent = '';
    if (el.vocabFeedback) el.vocabFeedback.textContent = '';
  }

  function scheduleVocabCheck() {
    if (!el.panelVocab || el.panelVocab.classList.contains('hidden')) return;
    if (vocabBusy) return;
    if (vocabTimer) clearTimeout(vocabTimer);
    vocabTimer = setTimeout(doVocabCheck, 150);
  }

  function doVocabCheck() {
    if (!el.panelVocab || el.panelVocab.classList.contains('hidden')) return;
    if (vocabBusy) return;
    if (!vocabState.current) return;
    const expected = vocabState.he[vocabState.pos];
    if (!expected) return; // word complete
    const vec = extractFeaturesFromCanvas();
    let sum = 0; for (let i = 0; i < vec.length; i++) sum += vec[i];
    if (sum < 1e-3) return;
    const top = predictTop(vec, 10);
    if (!top.length) return;
    const top1 = top[0];
    const top2 = top[1] || { prob: 0 };
    const margin = top1.prob - top2.prob;
    const threshold = prefs.practiceThreshold;
    const ok = top1.letter === expected && margin >= threshold;
    if (ok) {
      // Accept letter
      vocabState.output += expected;
      vocabState.pos++;
      if (el.vocabOutput) el.vocabOutput.textContent = vocabState.output;
      // Auto-calibrate from correct answer
      const u8 = floatToU8(vec);
      calibration.samples[expected] = calibration.samples[expected] || [];
      calibration.samples[expected].push(u8);
      saveCalibration();
      flashAccept();
      resetCanvas();
      if (vocabState.pos >= vocabState.he.length) {
        // Word complete; brief feedback and pick a new word
        if (el.vocabFeedback) el.vocabFeedback.textContent = '✓ Correct';
        vocabBusy = true;
        setTimeout(() => { vocabBusy = false; pickNextVocab(); resetCanvas(); }, 380);
      }
    } else {
      if (el.vocabFeedback) {
        const exp = expected;
        el.vocabFeedback.textContent = `✗ expected ${exp}, got ${top1.letter} (${(top1.prob*100).toFixed(0)}%)`;
      }
      shakeReject();
    }
  }

  if (el.btnVocabIdk) el.btnVocabIdk.addEventListener('click', () => {
    if (!vocabState.current) return;
    vocabState.revealed = true;
    if (el.vocabAnswer) el.vocabAnswer.textContent = `Answer: ${vocabState.he}`;
  });
  if (el.btnVocabBackspace) el.btnVocabBackspace.addEventListener('click', () => {
    if (!vocabState.current) return;
    if (vocabState.pos > 0) {
      vocabState.pos--;
      vocabState.output = vocabState.output.slice(0, -1);
      if (el.vocabOutput) el.vocabOutput.textContent = vocabState.output;
      if (el.vocabFeedback) el.vocabFeedback.textContent = '';
      resetCanvas();
    }
  });
  if (el.btnVocabSkip) el.btnVocabSkip.addEventListener('click', () => { pickNextVocab(); resetCanvas(); });
  // ---- Keyboard shortcuts ----
  // Enter: save sample (calibrate) or predict-once (recognize)
  // Space: clear canvas
  // ArrowRight/ArrowLeft: next/prev letter in calibrate mode
  // Ctrl/Cmd+Z: undo last stroke
  window.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    const tag = active && active.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const onCalibrate = !el.panelCalibrate.classList.contains('hidden');
    const onPractice = !el.panelPractice.classList.contains('hidden');
    const onVocab = el.panelVocab && !el.panelVocab.classList.contains('hidden');
    if (e.key === 'Enter') {
      e.preventDefault();
      if (onCalibrate) el.btnSaveSample.click();
      else if (onPractice) el.btnPracticeSkip.click();
      else if (onVocab && el.btnVocabSkip) el.btnVocabSkip.click();
      else doPredictOnce();
    } else if (e.key === ' ') {
      e.preventDefault();
      resetCanvas();
    } else if (e.key === 'ArrowRight' && onCalibrate) {
      e.preventDefault();
      setLetterIdx(letterIdx + 1);
      resetCanvas();
    } else if (e.key === 'ArrowLeft' && onCalibrate) {
      e.preventDefault();
      setLetterIdx(letterIdx - 1);
      resetCanvas();
    } else if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      paths.pop();
      redrawAll();
      scheduleLivePredict();
      schedulePracticeCheck();
      scheduleVocabCheck();
    }
  });

  // ---- Utilities ----
  function u8ToBase64(u8) {
    let binary = '';
    for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]);
    return btoa(binary);
  }
  function base64ToU8(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
})();
