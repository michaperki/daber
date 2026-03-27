#!/usr/bin/env bash
set -u

# Robust Wikidata seeding runner.
# Runs in small batches forever, restarting on failure.
#
# Usage:
#   cd hebrew_drills
#   bash scripts/lexicon/run_wd_seed_forever.sh
#
# Stop with Ctrl+C.

TOKENS_FILE="${TOKENS_FILE:-scripts/out/tokens.txt}"
BATCH_LIMIT="${BATCH_LIMIT:-60}"
SLEEP_MS="${SLEEP_MS:-220}"
COOLDOWN_MS="${COOLDOWN_MS:-5000}"

mkdir -p scripts/out

while true; do
  ts="$(date +%s)"
  out="scripts/out/wd_seed_summary_${ts}.json"
  log="scripts/out/wd_seed_run_${ts}.log"

  echo "[$(date -Is)] starting batch limit=${BATCH_LIMIT} sleepMs=${SLEEP_MS}" | tee -a "$log"

  # Run one small batch; script is resumable via scripts/out/wd_seed_state.json
  npx ts-node -P scripts/tsconfig.scripts.json --transpile-only \
    scripts/lexicon/seed_wikidata_bulk.ts \
    --in "$TOKENS_FILE" \
    --limit "$BATCH_LIMIT" \
    --sleep-ms "$SLEEP_MS" \
    --out "$out" \
    >>"$log" 2>&1

  code=$?
  if [ $code -ne 0 ]; then
    echo "[$(date -Is)] batch failed (exit $code). cooling down…" | tee -a "$log"
  else
    echo "[$(date -Is)] batch ok. cooling down…" | tee -a "$log"
  fi

  python3 - <<'PY' >>"$log" 2>&1 || true
import json
try:
  st=json.load(open('scripts/out/wd_seed_state.json'))
  print('state.doneTokens', len(st.get('doneTokens',{})))
except Exception as e:
  print('state.readError', e)
PY

  # Cooldown (ms)
  python3 - <<PY
import time
ms=int("$COOLDOWN_MS")
time.sleep(ms/1000)
PY

done
