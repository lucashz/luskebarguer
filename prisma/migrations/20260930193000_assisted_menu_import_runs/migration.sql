CREATE TABLE IF NOT EXISTS "assisted_menu_import_runs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "registration_id" UUID NOT NULL REFERENCES "assisted_registrations"("id") ON DELETE CASCADE,
  "mode" TEXT NOT NULL DEFAULT 'replace' CHECK ("mode" IN ('replace','append')),
  "source_text" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'queued' CHECK ("status" IN ('queued','processing','completed','failed')),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "category_count" INTEGER NOT NULL DEFAULT 0,
  "product_count" INTEGER NOT NULL DEFAULT 0,
  "error_code" TEXT,
  "error_message" TEXT,
  "created_by" UUID REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "started_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "assisted_menu_import_runs_registration_created_idx" ON "assisted_menu_import_runs"("registration_id","created_at");
CREATE INDEX IF NOT EXISTS "assisted_menu_import_runs_status_updated_idx" ON "assisted_menu_import_runs"("status","updated_at");
