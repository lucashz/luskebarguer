ALTER TABLE "sales_leads"
  ADD COLUMN IF NOT EXISTS "google_place_id" TEXT,
  ADD COLUMN IF NOT EXISTS "discard_code" TEXT,
  ADD COLUMN IF NOT EXISTS "discard_details" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "last_validated_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "preview_desktop_path" TEXT,
  ADD COLUMN IF NOT EXISTS "preview_mobile_path" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "sales_leads_google_place_id_key"
  ON "sales_leads" ("google_place_id")
  WHERE "google_place_id" IS NOT NULL;

ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "acquisition_source" TEXT,
  ADD COLUMN IF NOT EXISTS "outreach_lead_id" UUID REFERENCES "sales_leads"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "companies_outreach_lead_idx"
  ON "companies" ("outreach_lead_id", "created_at")
  WHERE "outreach_lead_id" IS NOT NULL;

ALTER TABLE "sales_automation_events"
  ADD COLUMN IF NOT EXISTS "run_id" TEXT,
  ADD COLUMN IF NOT EXISTS "place_id" TEXT,
  ADD COLUMN IF NOT EXISTS "stage" TEXT,
  ADD COLUMN IF NOT EXISTS "attempt" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "result" TEXT NOT NULL DEFAULT 'success';

ALTER TABLE "sales_automation_events"
  DROP CONSTRAINT IF EXISTS "sales_automation_events_attempt_check",
  DROP CONSTRAINT IF EXISTS "sales_automation_events_result_check";

ALTER TABLE "sales_automation_events"
  ADD CONSTRAINT "sales_automation_events_attempt_check" CHECK ("attempt" >= 0),
  ADD CONSTRAINT "sales_automation_events_result_check" CHECK ("result" IN ('success','failure','skipped','blocked'));

CREATE INDEX IF NOT EXISTS "sales_events_run_idx"
  ON "sales_automation_events" ("run_id", "created_at");

CREATE TABLE IF NOT EXISTS "sales_discovery_runs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_key" TEXT NOT NULL UNIQUE,
  "scheduled_for" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','running','completed','failed','paused','dry_run')),
  "candidates_found" INTEGER NOT NULL DEFAULT 0 CHECK ("candidates_found" >= 0),
  "qualified_count" INTEGER NOT NULL DEFAULT 0 CHECK ("qualified_count" >= 0),
  "discarded_count" INTEGER NOT NULL DEFAULT 0 CHECK ("discarded_count" >= 0),
  "preview_count" INTEGER NOT NULL DEFAULT 0 CHECK ("preview_count" >= 0),
  "sent_count" INTEGER NOT NULL DEFAULT 0 CHECK ("sent_count" >= 0),
  "started_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "last_error" TEXT,
  "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sales_discovery_runs_schedule_idx"
  ON "sales_discovery_runs" ("scheduled_for", "status");

CREATE TABLE IF NOT EXISTS "sales_quota_usage" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "sku" TEXT NOT NULL,
  "usage_month" DATE NOT NULL,
  "reserved_units" INTEGER NOT NULL DEFAULT 0 CHECK ("reserved_units" >= 0),
  "consumed_units" INTEGER NOT NULL DEFAULT 0 CHECK ("consumed_units" >= 0),
  "limit_units" INTEGER NOT NULL CHECK ("limit_units" >= 0),
  "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "sales_quota_usage_sku_month_key"
  ON "sales_quota_usage" ("sku", "usage_month");

CREATE TABLE IF NOT EXISTS "sales_search_targets" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "city" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "population" INTEGER NOT NULL CHECK ("population" BETWEEN 1 AND 55000),
  "segment" TEXT NOT NULL,
  "last_searched_at" TIMESTAMPTZ,
  "search_count" INTEGER NOT NULL DEFAULT 0 CHECK ("search_count" >= 0),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "sales_search_targets_city_state_segment_key"
  ON "sales_search_targets" ("city", "state", "segment");

ALTER TABLE "sales_leads" DROP CONSTRAINT IF EXISTS "sales_leads_stage_check";
ALTER TABLE "sales_leads" ADD CONSTRAINT "sales_leads_stage_check" CHECK ("stage" IN (
  'discovered','basic_validated','activity_validated','menu_checked','photos_ready','preview_ready','scheduled',
  'qualified','awaiting_first_message_approval','first_message_sent','awaiting_reply','engaged','needs_discovery',
  'demo_requested','price_requested','competitor_identified','followup_scheduled','human_handoff','not_interested',
  'opted_out','won','lost','paused','discarded','send_failed'
));

ALTER TABLE "sales_automation_jobs" DROP CONSTRAINT IF EXISTS "sales_automation_jobs_job_type_check";
ALTER TABLE "sales_automation_jobs" ADD CONSTRAINT "sales_automation_jobs_job_type_check" CHECK ("job_type" IN (
  'classify_inbound','send_message','followup','discover_leads','qualify_lead','build_preview','send_sequence','health_check'
));
