CREATE TABLE IF NOT EXISTS "sales_leads" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_name" TEXT NOT NULL,
  "contact_name" TEXT,
  "phone" TEXT,
  "normalized_phone" TEXT UNIQUE,
  "city" TEXT,
  "state" TEXT DEFAULT 'RS',
  "segment" TEXT,
  "instagram" TEXT,
  "source" TEXT DEFAULT 'manual',
  "current_platform" TEXT,
  "apparent_activity" TEXT,
  "score" INTEGER NOT NULL DEFAULT 0 CHECK ("score" BETWEEN 0 AND 100),
  "stage" TEXT NOT NULL DEFAULT 'discovered' CHECK ("stage" IN ('discovered','qualified','awaiting_first_message_approval','first_message_sent','awaiting_reply','engaged','needs_discovery','demo_requested','price_requested','competitor_identified','followup_scheduled','human_handoff','not_interested','opted_out','won','lost','paused')),
  "automation_status" TEXT NOT NULL DEFAULT 'active' CHECK ("automation_status" IN ('active','paused','stopped')),
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "followup_count" INTEGER NOT NULL DEFAULT 0 CHECK ("followup_count" BETWEEN 0 AND 2),
  "last_contact_at" TIMESTAMPTZ,
  "next_followup_at" TIMESTAMPTZ,
  "opted_out_at" TIMESTAMPTZ,
  "stop_reason" TEXT,
  "assigned_user_id" UUID,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "sales_conversations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "lead_id" UUID NOT NULL REFERENCES "sales_leads"("id") ON DELETE CASCADE,
  "whatsapp_integration_id" UUID REFERENCES "store_whatsapp_integrations"("id") ON DELETE SET NULL,
  "openai_conversation_id" TEXT,
  "summary" TEXT DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN ('active','closed','paused')),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "sales_messages" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "lead_id" UUID NOT NULL REFERENCES "sales_leads"("id") ON DELETE CASCADE,
  "conversation_id" UUID REFERENCES "sales_conversations"("id") ON DELETE CASCADE,
  "whatsapp_message_log_id" UUID REFERENCES "whatsapp_message_logs"("id") ON DELETE SET NULL,
  "provider_message_id" TEXT UNIQUE,
  "direction" TEXT NOT NULL CHECK ("direction" IN ('inbound','outbound')),
  "body" TEXT NOT NULL,
  "intent" TEXT,
  "confidence" NUMERIC(4,3) CHECK ("confidence" BETWEEN 0 AND 1),
  "status" TEXT NOT NULL DEFAULT 'draft' CHECK ("status" IN ('received','queued','draft','approved','sending','sent','failed','suppressed','cancelled')),
  "requires_approval" BOOLEAN NOT NULL DEFAULT true,
  "approved_at" TIMESTAMPTZ,
  "sent_at" TIMESTAMPTZ,
  "received_at" TIMESTAMPTZ,
  "error_message" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "sales_automation_events" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "lead_id" UUID REFERENCES "sales_leads"("id") ON DELETE CASCADE,
  "event_type" TEXT NOT NULL,
  "previous_stage" TEXT,
  "next_stage" TEXT,
  "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "sales_automation_jobs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "lead_id" UUID REFERENCES "sales_leads"("id") ON DELETE CASCADE,
  "message_id" UUID REFERENCES "sales_messages"("id") ON DELETE CASCADE,
  "job_type" TEXT NOT NULL CHECK ("job_type" IN ('classify_inbound','send_message','followup')),
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','claimed','completed','retry','failed','cancelled')),
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 3,
  "idempotency_key" TEXT NOT NULL UNIQUE,
  "run_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "lock_expires_at" TIMESTAMPTZ,
  "last_error" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "sales_suppressions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "normalized_phone" TEXT NOT NULL UNIQUE,
  "reason" TEXT,
  "source" TEXT DEFAULT 'lead_opt_out',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "sales_automation_settings" (
  "id" TEXT PRIMARY KEY DEFAULT 'global',
  "paused" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO "sales_automation_settings" ("id", "paused") VALUES ('global', false) ON CONFLICT ("id") DO NOTHING;

CREATE INDEX IF NOT EXISTS "sales_leads_stage_status_idx" ON "sales_leads"("stage","automation_status","updated_at");
CREATE INDEX IF NOT EXISTS "sales_leads_followup_idx" ON "sales_leads"("next_followup_at","automation_status");
CREATE INDEX IF NOT EXISTS "sales_conversations_lead_idx" ON "sales_conversations"("lead_id","status","updated_at");
CREATE INDEX IF NOT EXISTS "sales_messages_lead_idx" ON "sales_messages"("lead_id","created_at");
CREATE INDEX IF NOT EXISTS "sales_messages_review_idx" ON "sales_messages"("status","requires_approval","created_at");
CREATE INDEX IF NOT EXISTS "sales_events_lead_idx" ON "sales_automation_events"("lead_id","created_at");
CREATE INDEX IF NOT EXISTS "sales_events_type_idx" ON "sales_automation_events"("event_type","created_at");
CREATE INDEX IF NOT EXISTS "sales_jobs_worker_idx" ON "sales_automation_jobs"("status","run_at","lock_expires_at");
CREATE INDEX IF NOT EXISTS "sales_jobs_lead_idx" ON "sales_automation_jobs"("lead_id","created_at");

CREATE UNIQUE INDEX IF NOT EXISTS "sales_one_active_conversation_per_lead" ON "sales_conversations"("lead_id") WHERE "status" = 'active';
