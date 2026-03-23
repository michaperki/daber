# Citizen Cafe Scraper (standalone)

Exports flashcards and practice-to-go items from academy.citizencafetlv.com using your authenticated cookies.

This tool is intentionally separate from the Daber app and adds no extra dependencies. It uses Node 18+ fetch.

## Quick Start

1) Set cookies via env vars (preferred is a single header):

- `CC_COOKIE_HEADER`: full Cookie header value to send (e.g., `__Secure-next-auth.session-token=...; jwt_token=...`)

Or provide individual parts and the script will construct the header:

- `CC_SESSION_TOKEN`: value for `__Secure-next-auth.session-token`
- `CC_JWT`: value for `jwt_token`

Optional:

- `CC_BASE_URL` (default: `https://academy.citizencafetlv.com`)
- `CC_BATCH_SIZE` (default: `100`)
- `CC_OUTPUT_DIR` (default: `scraper/out`)

2) Provide ID sources and credentials:

- From CONVO.md: run with `--from-convo CONVO.md` to extract flashcard IDs, practice-to-go IDs, and the captured Cookie header (if present).
- From files: `--flashcard-ids-file path/to/flashcard_ids.json` and/or `--practice-ids-file path/to/practice_ids.json`.
  Files can be either `{\"ids\":[\"...\",\"...\"]}` or a raw JSON array `[\"...\",\"...\"]`.
 - From lesson sets: `--practice-sets-file path/to/practice_sets.json` where the file is an array like:
   `[{ "lesson_id": "rec...", "title": "Lesson 3", "quiz_ids": [{"quiz_learndash_id":"4688"}, ...] }, ...]`.
   The scraper will hydrate each set, write per-set files, and also consolidate into `practice_*.json`.

3) Run:

- `npm run scrape:cc -- --from-convo CONVO.md`
- Or: `npm run scrape:cc -- --flashcard-ids-file my_flashcard_ids.json --practice-ids-file my_practice_ids.json`
 - Or: `npm run scrape:cc -- --from-convo CONVO.md --practice-sets-file scraper/sample_practice_sets.json`

Outputs are written to `scraper/out/`:

- `flashcards_raw.json` and `flashcards_normalized.json`
- `practice_raw.json` and `practice_normalized.json`

## Notes

- This scraper assumes cookie-based auth; no login flow is implemented.
- It batches requests and retries on transient failures.
- Normalization extracts English/Hebrew text for flashcards and common text/audio fields for practice items.
- If you need true ID discovery, capture the upstream ID endpoints from DevTools and provide the ID lists via files; we can later add discoverers once endpoints are known.
 - Use `--discover` to attempt automatic ID discovery from `/my-course` (best effort). If you pass `--force-discover`, it will ignore IDs from other sources and try discovery first.
