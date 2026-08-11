ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "marketing_opt_in" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "marketing_unsubscribed_at" TIMESTAMPTZ(6);

CREATE TABLE IF NOT EXISTS "marketing_campaigns" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "objective" TEXT NOT NULL DEFAULT '',
  "niche" TEXT NOT NULL DEFAULT 'alimentacao',
  "status" TEXT NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft','active','paused','completed')),
  "source" TEXT NOT NULL DEFAULT 'organic',
  "medium" TEXT NOT NULL DEFAULT 'social',
  "campaign_code" TEXT NOT NULL,
  "landing_url" TEXT NOT NULL DEFAULT 'https://taprontomenu.com.br/',
  "starts_at" DATE,
  "ends_at" DATE,
  "budget_cents" INTEGER NOT NULL DEFAULT 0 CHECK ("budget_cents" >= 0),
  "created_by" UUID REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "marketing_campaigns_code_key" ON "marketing_campaigns"("campaign_code");
CREATE INDEX IF NOT EXISTS "marketing_campaigns_status_created_idx" ON "marketing_campaigns"("status", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "marketing_leads" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_name" TEXT NOT NULL,
  "contact_name" TEXT NOT NULL DEFAULT '',
  "phone" TEXT,
  "email" TEXT,
  "niche" TEXT NOT NULL DEFAULT 'alimentacao',
  "city" TEXT NOT NULL DEFAULT '',
  "state" TEXT NOT NULL DEFAULT '',
  "origin" TEXT NOT NULL DEFAULT 'manual',
  "stage" TEXT NOT NULL DEFAULT 'new' CHECK ("stage" IN ('new','contacted','qualified','trial','customer','lost')),
  "campaign_id" UUID REFERENCES "marketing_campaigns"("id") ON DELETE SET NULL,
  "consent" BOOLEAN NOT NULL DEFAULT FALSE,
  "opted_out_at" TIMESTAMPTZ(6),
  "next_contact_at" TIMESTAMPTZ(6),
  "last_contact_at" TIMESTAMPTZ(6),
  "contact_attempts" INTEGER NOT NULL DEFAULT 0,
  "loss_reason" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '',
  "created_by" UUID REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("phone" IS NOT NULL OR "email" IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS "marketing_leads_stage_contact_idx" ON "marketing_leads"("stage", "next_contact_at");
CREATE INDEX IF NOT EXISTS "marketing_leads_campaign_idx" ON "marketing_leads"("campaign_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "marketing_content_items" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'instagram',
  "format" TEXT NOT NULL DEFAULT 'reel',
  "pillar" TEXT NOT NULL DEFAULT 'produto_na_pratica',
  "funnel_stage" TEXT NOT NULL DEFAULT 'awareness',
  "niche" TEXT NOT NULL DEFAULT 'alimentacao',
  "hook" TEXT NOT NULL DEFAULT '',
  "script" TEXT NOT NULL DEFAULT '',
  "caption" TEXT NOT NULL DEFAULT '',
  "cta" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'draft' CHECK ("status" IN ('idea','draft','review','approved','scheduled','published')),
  "scheduled_at" TIMESTAMPTZ(6),
  "published_at" TIMESTAMPTZ(6),
  "published_url" TEXT NOT NULL DEFAULT '',
  "campaign_id" UUID REFERENCES "marketing_campaigns"("id") ON DELETE SET NULL,
  "performance" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_by" UUID REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "approved_by" UUID REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "marketing_content_calendar_idx" ON "marketing_content_items"("status", "scheduled_at");

CREATE TABLE IF NOT EXISTS "marketing_automation_runs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "automation_key" TEXT NOT NULL,
  "company_id" UUID REFERENCES "companies"("id") ON DELETE CASCADE,
  "lead_id" UUID REFERENCES "marketing_leads"("id") ON DELETE CASCADE,
  "idempotency_key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','sent','skipped','failed')),
  "channel" TEXT NOT NULL DEFAULT 'email',
  "recipient" TEXT NOT NULL DEFAULT '',
  "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "executed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "marketing_automation_runs_idempotency_key" ON "marketing_automation_runs"("idempotency_key");
CREATE INDEX IF NOT EXISTS "marketing_automation_runs_status_created_idx" ON "marketing_automation_runs"("status", "created_at" DESC);
