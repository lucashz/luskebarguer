ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "creation_source" TEXT,
  ADD COLUMN IF NOT EXISTS "creation_purpose" TEXT,
  ADD COLUMN IF NOT EXISTS "created_by_admin_id" UUID,
  ADD COLUMN IF NOT EXISTS "created_by_name_snapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "creation_note" TEXT,
  ADD COLUMN IF NOT EXISTS "creation_metadata" JSONB,
  ADD COLUMN IF NOT EXISTS "last_customer_login_at" TIMESTAMPTZ(6);

DO $$ BEGIN
  ALTER TABLE "companies" ADD CONSTRAINT "companies_creation_source_check"
    CHECK ("creation_source" IS NULL OR "creation_source" IN ('self_service', 'assisted', 'platform_admin', 'sales_automation', 'import', 'api'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "companies" ADD CONSTRAINT "companies_creation_purpose_check"
    CHECK ("creation_purpose" IS NULL OR "creation_purpose" IN ('customer_request', 'lead_capture', 'demo', 'migration', 'internal_test'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "companies" ADD CONSTRAINT "companies_created_by_admin_id_fkey"
    FOREIGN KEY ("created_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "companies_creation_source_idx" ON "companies"("creation_source");
CREATE INDEX IF NOT EXISTS "companies_creation_purpose_idx" ON "companies"("creation_purpose");
CREATE INDEX IF NOT EXISTS "companies_created_by_admin_id_idx" ON "companies"("created_by_admin_id");
CREATE INDEX IF NOT EXISTS "companies_last_customer_login_at_idx" ON "companies"("last_customer_login_at");
