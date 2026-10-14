CREATE TABLE IF NOT EXISTS "security_rate_limits" (
  "bucket_key" TEXT PRIMARY KEY,
  "rule_name" TEXT NOT NULL,
  "scope" TEXT NOT NULL CHECK ("scope" IN ('network', 'identity')),
  "hit_count" INTEGER NOT NULL DEFAULT 0,
  "window_ends_at" TIMESTAMPTZ NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "security_rate_limits_expiry_idx"
  ON "security_rate_limits"("window_ends_at");
