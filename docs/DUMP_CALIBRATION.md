# Dump Calibration Samples From Heroku Postgres

This extracts per-user calibration samples stored by the app (as base64-encoded 64×64 feature vectors) into local files for training and analysis.

What you get:
- Per-device calibration JSON files (exact payload as stored): `data/calibration_dump/*.json`
- Aggregated per-letter 64×64 PNGs: `data/db_by_letter/<letter>/*.png`

Note: The DB stores quantized feature vectors, not raw stroke paths. These exports are ideal for image-based models and quick analysis. For the stroke-based Conv1D+BiGRU path, we still need to add a stroke uploader/export from the client to capture raw pen paths.

## Prereqs

- DATABASE_URL environment variable set to your Heroku Postgres URL, or pass `--url`.
- Network access from your machine to the DB.

## Commands

- Install dependencies for the API workspace (Prisma client, etc.):
  - `npm -w apps/api install`
  - `npm -w apps/api run prisma:generate`

- Dump JSON and PNGs (all devices):
  - `npx -w apps/api tsx src/tools/dump_calibrations.ts --out-json data/calibration_dump --out-png data/db_by_letter`
  - Note: When running with `-w apps/api`, relative paths are resolved under the apps/api workspace. You should see outputs at `apps/api/data/calibration_dump` and `apps/api/data/db_by_letter`.

- Limit to first N devices (quick test):
  - `npx -w apps/api tsx src/tools/dump_calibrations.ts --limit 3 --out-json data/calibration_dump --out-png data/db_by_letter`

- Explicitly pass a URL (instead of env var):
  - `npx -w apps/api tsx src/tools/dump_calibrations.ts --url "postgresql://..." --out-json data/calibration_dump --out-png data/db_by_letter`

## Optional: Export PNGs From a Local Calibration JSON

If you have a single `daber_calibration.json` downloaded from the app:

- `node scripts/export_calibration_png.cjs daber_calibration.json data/by_letter_from_file`
