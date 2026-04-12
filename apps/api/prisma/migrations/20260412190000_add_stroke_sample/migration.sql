CREATE TABLE IF NOT EXISTS "stroke_sample" (
    "id" TEXT PRIMARY KEY,
    "device_id" TEXT NOT NULL,
    "letter" TEXT NOT NULL,
    "split" TEXT,
    "strokes" JSONB NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "stroke_sample_device_id_idx" ON "stroke_sample" ("device_id");
