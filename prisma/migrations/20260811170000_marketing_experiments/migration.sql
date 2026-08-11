CREATE TABLE IF NOT EXISTS "marketing_experiments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "hypothesis" TEXT NOT NULL,
  "surface" TEXT NOT NULL DEFAULT 'home',
  "audience" TEXT NOT NULL DEFAULT '',
  "variant_a" TEXT NOT NULL DEFAULT '',
  "variant_b" TEXT NOT NULL DEFAULT '',
  "primary_kpi" TEXT NOT NULL,
  "baseline_value" NUMERIC(12,4),
  "target_value" NUMERIC(12,4),
  "guardrails" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft','running','paused','completed','cancelled')),
  "starts_at" TIMESTAMPTZ(6),
  "ends_at" TIMESTAMPTZ(6),
  "result_summary" TEXT NOT NULL DEFAULT '',
  "decision" TEXT NOT NULL DEFAULT '' CHECK ("decision" IN ('','keep','iterate','stop')),
  "created_by" UUID REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "updated_by" UUID REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "marketing_experiments_status_created_idx" ON "marketing_experiments"("status", "created_at" DESC);
