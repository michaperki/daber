#!/usr/bin/env bash
set -euo pipefail

# Runs ONE resumable Wikidata seeding batch and exits.
# Safe against SIGKILL because each invocation is short-lived.

TOKENS_FILE="${TOKENS_FILE:-scripts/out/tokens.txt}"
LIMIT="${LIMIT:-20}"
SLEEP_MS="${SLEEP_MS:-220}"

mkdir -p scripts/out
TS="$(date +%s)"
OUT="scripts/out/wd_seed_summary_${TS}.json"
LOG="scripts/out/wd_seed_run_${TS}.log"

echo "[$(date -Is)] one-batch start limit=${LIMIT} sleepMs=${SLEEP_MS}" | tee -a "$LOG"

npx ts-node -P scripts/tsconfig.scripts.json --transpile-only \
  scripts/lexicon/seed_wikidata_bulk.ts \
  --in "$TOKENS_FILE" \
  --limit "$LIMIT" \
  --sleep-ms "$SLEEP_MS" \
  --out "$OUT" \
  >>"$LOG" 2>&1

echo "[$(date -Is)] one-batch done" | tee -a "$LOG"

python3 - <<'PY'
import json
st=json.load(open('scripts/out/wd_seed_state.json'))
print('doneTokens', len(st.get('doneTokens',{})))
PY
