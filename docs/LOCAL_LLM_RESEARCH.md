# Local LLM Research — Hebrew Sentence Generation (Daber)

Scope: Feasibility of replacing OpenAI in the generation pipeline with a local model for Hebrew sentence generation (given lemmas and constraints). Focused on Dicta‑LM 3.0, Gemma 3, and Tiny Aya.

Updated: 2026‑03‑31

---

## Summary

- Primary candidate: Dicta‑LM 3.0 (Hebrew‑focused). 1.7B, 12B, and 24B variants exist with multiple quantizations, including official GGUF for llama.cpp. Best bet for Hebrew quality among open models.
- Fallbacks: Gemma 3 (1B/4B/12B/27B multilingual; broad tooling support); Tiny Aya (~3.3B multilingual; gated license; smallest footprint).
- Serving: For CPU‑friendly/offline, use GGUF via llama.cpp or Ollama. For GPU and highest throughput, use vLLM with FP8/AWQ/W4A16.
- Quality: No published Hebrew generation benchmarks focused on morphology across these models. Dicta claims Hebrew SOTA in technical report, but generative agreement accuracy (gender/number/definiteness/את) needs hands‑on testing. Plan included below.

---

## Candidate Models

### Dicta‑LM 3.0 (Hebrew‑focused)

- Model pages (selection):
  - 1.7B Instruct: https://huggingface.co/dicta-il/DictaLM-3.0-1.7B-Instruct (Apache‑2.0)
  - 1.7B Thinking: https://huggingface.co/dicta-il/DictaLM-3.0-1.7B-Thinking
  - 12B (Nemotron) Instruct: https://huggingface.co/dicta-il/DictaLM-3.0-Nemotron-12B-Instruct (NVIDIA OML license)
  - 24B Thinking (flagship reasoning): https://huggingface.co/dicta-il/DictaLM-3.0-24B-Thinking (Apache‑2.0)
  - Collection index: https://huggingface.co/collections/dicta-il/dictalm-30-collection
  - Technical report: https://www.dicta.org.il/publications/DictaLM_3_0___Techincal_Report.pdf

- Quantization and local‑serve variants observed on HF:
  - GGUF (llama.cpp):
    - dict a‑il/DictaLM‑3.0‑1.7B‑Thinking‑GGUF
    - dict a‑il/DictaLM‑3.0‑24B‑Thinking‑GGUF
    - dict a‑il/DictaLM‑3.0‑Nemotron‑12B‑Instruct‑GGUF
  - Weight‑only / GPU‑oriented: W4A16, FP8 across sizes (e.g., 1.7B‑Instruct‑W4A16, 1.7B‑Instruct‑FP8; 24B‑Base/Thinking‑W4A16/FP8; 12B Nemotron FP8/W4A16)
  - Community GGUF packs also exist for 24B and 1.7B (third‑party maintainers)

- Hebrew notes (from model cards/report):
  - Trained substantially on Hebrew and English; cards claim “SOTA for Hebrew by weight class.”
  - Concrete Hebrew generation quality (agreement, binyanim, construct state) is not benchmarked publicly; example generations in cards are fluent Hebrew, but not systematically evaluated for morphology.

- Hardware and expected performance (estimates; confirm with local bench):
  - 1.7B GGUF Q4_K: ~1–2 GB model; CPU 15–40 tok/s on recent 8–16‑core laptop; fine for background; borderline for on‑demand.
  - 12B GGUF Q4_K: ~6–8 GB model; CPU 1–5 tok/s (slow); GPU recommended (≥12–16 GB VRAM for Q4/AWQ). Throughput 10–30 tok/s on mid‑range GPUs.
  - 24B GGUF Q4_K or W4A16: typically ≥20 GB VRAM effective once KV/cache included; target single high‑VRAM GPU (24–48 GB) or multi‑GPU. 5–15 tok/s expected. Not laptop‑friendly.
  - FP8/W4A16 variants are for GPU inference frameworks (vLLM/TensorRT‑LLM); not CPU‑friendly.

Feasibility take: Dicta‑LM 3.0 12B (Nemotron) is the pragmatic sweet spot for quality vs cost if a 16–24 GB GPU is available. 1.7B is a CPU‑friendly option but likely weak on agreement. 24B is overkill for our latency/footprint.

### Gemma 3 (Google; multilingual)

- Model pages (instruction‑tuned):
  - 1B: https://huggingface.co/google/gemma-3-1b-it
  - 4B: https://huggingface.co/google/gemma-3-4b-it
  - 12B: https://huggingface.co/google/gemma-3-12b-it
  - 27B: https://huggingface.co/google/gemma-3-27b-it

- Quantization/local variants:
  - Official QAT Q4_0 GGUF for some sizes (e.g., https://huggingface.co/google/gemma-3-12b-it-qat-q4_0-gguf)
  - Community GGUF: 1B/4B/12B/27B (e.g., unsloth and bartowski repos)
  - FP8/INT8 community conversions exist

- Hebrew notes:
  - Gemma 3 is multilingual; Hebrew is included among supported languages in community conversions, but Google has not published Hebrew‑specific generative morphology benchmarks.
  - Expect decent syntax/fluency at 12B/27B; smaller sizes likely struggle with fine agreement and lexical constraints.

- Hardware and expected performance (estimates):
  - 1B/4B GGUF Q4_K: CPU‑usable (8–25 tok/s). 4B is a solid laptop target; 1B too weak in quality.
  - 12B GGUF Q4_K: CPU slow; GPU 12–16 GB advisable; 10–25 tok/s typical.
  - 27B: high‑VRAM GPU (≥24 GB) for Q4; 5–15 tok/s.

Feasibility take: As a fallback, Gemma 3 4B (CPU or small GPU) and 12B (GPU) are viable with broad tooling. Hebrew quality is the main unknown; needs targeted eval.

### Tiny Aya (~3.3B; multilingual)

- Base/card:
  - CohereLabs/tiny‑aya‑global (restricted): https://huggingface.co/CohereLabs/tiny-aya-global (CC‑BY‑NC‑4.0; gated)
  - GGUF (gated): https://huggingface.co/CohereLabs/tiny-aya-global-GGUF (lists supported languages incl. he)
  - ONNX (public conversion): https://huggingface.co/onnx-community/tiny-aya-global-ONNX (declares Hebrew in languages)

- Notes:
  - Public cards confirm multilingual coverage including Hebrew; the primary model cards are gated, so exact parameter count is not visible there. Community and press sources cite ≈3.35B parameters — treat as “~3.3B” until verified.
  - License is non‑commercial; ensure usage fits (Daber is fine for internal/offline testing; production depends on licensing intent).

- Hardware/perf (estimates):
  - 3.3B GGUF Q4_K: CPU 10–25 tok/s; VRAM 3–5 GB if on GPU; good latency for short sentences. Quality risk (agreement drift) compared to 12B+.

Feasibility take: Attractive for footprint and speed; likely inadequate as a sole generator for strict morphology; could serve as a fast validator or he→en direction only.

---

## Hebrew Generation Quality

What we could confirm:
- Dicta‑LM 3.0 explicitly targets Hebrew and claims SOTA by weight class (cards/report). Cards show fluent Hebrew outputs.
- No model above publishes Hebrew‑specific generative agreement benchmarks (gender/number/person, binyan selection, construct state, definiteness/את usage). Community reports are anecdotal.

Expected behavior by size (based on general LLM trends and anecdotal reports):
- 1–4B: frequent agreement and selection errors; tendency to use out‑of‑set vocabulary unless strongly constrained; JSON drift unless grammar enforced.
- 10–13B: markedly better fluency and agreement; still needs validation, especially for construct and object marking.
- 20B+: best quality but heavy; diminishing returns vs 12B for our short, simple sentences.

Open questions requiring hands‑on eval:
- Agreement accuracy rates by POS and feature set (verbs by tense/person/number/gender; nouns by number/definiteness/construct; adjectives by gender/number) for each candidate.
- Vocabulary constraint adherence when given lemma lists (precision/recall on allowed tokens).
- Error profile vs native speaker judgments (unnatural word order, register mismatches, wrong prepositions).

---

## Integration Architecture

Serving options:
- Ollama (simple, local): Pull GGUF models; supports `format: json` and an OpenAI‑compatible API surface. Good for laptop/CPU; easy process supervision. Note that W4A16/FP8 variants are not for llama.cpp/Ollama.
- llama.cpp / llama‑cpp‑server: Lowest footprint; supports JSON grammar (GBNF) for strict JSON. Best for GGUF.
- vLLM (GPU): Highest throughput; supports `response_format: { type: "json_object" }` and OpenAI‑compatible endpoints; runs FP8/AWQ/W4A16.

Daber fit (no code yet — design only):
- Keep the current two‑pass shape in `Daber/lib/generation/pipeline.ts`:
  - Pass 1: constrained generation (targets + known words → items JSON).
  - Pass 2: validation/fix grammar; drop unfixable.
- Swap transport behind `getOpenAI()` via a base URL/config when implementing:
  - e.g., `OPENAI_BASE_URL=http://localhost:8000/v1` for vLLM; Ollama’s OpenAI bridge if enabled; llama‑cpp‑server has a compatible mode.
- JSON enforcement:
  - vLLM: use `response_format: json_object` (already in pipeline) — works.
  - Ollama/llama.cpp: use `format: json` or a JSON grammar to force strict shape.

Prompt design for constrained vocabulary:
- Inputs: target lemmas (cleaned, unpointed), optional target features (e.g., verb: tense/person/number/gender), known words list, and schema.
- Rules:
  - Only use words from the provided set plus function words allowed list (common particles/prepositions/pronouns).
  - Ensure target lemma is central; include exact lemma string in `target_word` field.
  - Output strict JSON with a fixed schema; no nikkud in Hebrew.
  - Provide one `he_to_en` and one `en_to_he` per target; difficulty tag present.
- Example output schema matches the existing pipeline’s `zLLMItem`.

Validation pass:
- Second prompt (local model): Batch check sentences for agreement and conjugation; return corrected Hebrew for minor errors; drop if not.
- Deterministic checks (no model):
  - Script checks (only Hebrew in `hebrew`, Latin in `english`) — already present.
  - Vocabulary whitelist: expand allowed lemmas to inflections via our Wikidata Lexeme tables; reject sentences containing tokens outside the whitelist (excluding stopwords/generic function words).
  - Target presence: require an inflected form of the target lemma to appear, or flag.
  - JSON schema validation and normalization: strip nikkud; clean punctuation.

Latency expectations (short sentences, 10–20 tokens new):
- Background (OK to be slow):
  - CPU (1.7–4B GGUF): 0.5–3 s/item → batch of ~16 items in 15–60 s.
  - GPU (12B): 0.2–1.0 s/item → batch in ~5–20 s.
- On‑demand:
  - Target <1.5 s end‑to‑end per item for a snappy UX. Achievable with 4B on small GPU or 12B on mid GPU; borderline on CPU.

---

## Risk Assessment

Likely failure modes and impact:
- Unnatural phrasing or register mismatch — Medium impact for learners; requires human review for new lesson introductions; acceptable for varied practice if kept simple.
- Agreement errors (gender/number/person), wrong binyan/tense — High impact; confuses learners; must be caught by validation or avoided via templates for hard cases.
- Construct/definiteness/את errors — High impact; teach wrong form; require validator focus and deterministic checks where possible.
- Vocabulary drift (using out‑of‑set words) — High impact for our pedagogy; mitigate with whitelist and rejection.
- Inconsistent JSON/output format — Medium impact on pipeline; enforce with JSON grammar/response_format and strict schema validation.
- “Thinking” model leakage (reasoning traces in outputs) — Low/medium; avoid “thinking” variants for strict JSON unless parser strips hidden tokens.

Mitigations:
- Keep sentences short and literal; restrict to common patterns.
- JSON grammar or `response_format` everywhere.
- Dual‑pass with drop‑on‑fail and quotas; promote only items that pass both validation layers.
- Prefer 12B‑class models for generation; reserve 3–4B for validation or he→en only.

---

## Recommendation and Next Steps

Recommended stack to trial:
- If CPU‑only: Dicta‑LM 3.0 1.7B (GGUF) or Gemma 3 4B (GGUF) via llama.cpp/Ollama for background generation; keep remote validator initially; measure error rates.
- If single GPU (≥16 GB): Dicta‑LM 3.0 Nemotron‑12B Instruct via vLLM with `response_format=json_object` for both passes. Expect best Hebrew quality among open models.

Hands‑on eval plan (1–2 days):
- Build a fixed mini test set (e.g., 50 prompts) across POS and features using our allowlisted Green/Mini Morph lexemes.
- Generate 2–3 items per target with each candidate (1.7B, 4B, 12B), temperature 0.2–0.5.
- Automatic checks: whitelist, target presence, script checks, JSON shape. Record drop/keep rates.
- Human pass (native/near‑native): tag agreement errors and unnatural phrasing; compute acceptance rate.
- Compare latency and acceptance across models; decide on “default local” and “validator” pair.

---

## Links (quick)

- Dicta‑LM 3.0:
  - 1.7B Instruct: https://huggingface.co/dicta-il/DictaLM-3.0-1.7B-Instruct
  - 1.7B Thinking GGUF: https://huggingface.co/dicta-il/DictaLM-3.0-1.7B-Thinking-GGUF
  - 12B Nemotron Instruct: https://huggingface.co/dicta-il/DictaLM-3.0-Nemotron-12B-Instruct
  - 12B Nemotron Instruct GGUF: https://huggingface.co/dicta-il/DictaLM-3.0-Nemotron-12B-Instruct-GGUF
  - 24B Thinking: https://huggingface.co/dicta-il/DictaLM-3.0-24B-Thinking
  - 24B Thinking GGUF: https://huggingface.co/dicta-il/DictaLM-3.0-24B-Thinking-GGUF

- Gemma 3:
  - 1B/4B/12B/27B IT: https://huggingface.co/google/gemma-3-1b-it | https://huggingface.co/google/gemma-3-4b-it | https://huggingface.co/google/gemma-3-12b-it | https://huggingface.co/google/gemma-3-27b-it
  - 12B QAT Q4_0 GGUF: https://huggingface.co/google/gemma-3-12b-it-qat-q4_0-gguf
  - Community GGUF (examples): https://huggingface.co/unsloth/gemma-3-12b-it-GGUF | https://huggingface.co/bartowski/google_gemma-3-4b-it-GGUF | https://huggingface.co/unsloth/gemma-3-27b-it-GGUF | https://huggingface.co/unsloth/gemma-3-1b-it-GGUF

- Tiny Aya:
  - Global (gated): https://huggingface.co/CohereLabs/tiny-aya-global
  - GGUF (gated): https://huggingface.co/CohereLabs/tiny-aya-global-GGUF
  - ONNX (public): https://huggingface.co/onnx-community/tiny-aya-global-ONNX

