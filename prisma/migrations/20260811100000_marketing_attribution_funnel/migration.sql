ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "marketing_attribution" JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS "marketing_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id" UUID,
  "store_id" UUID,
  "event_name" TEXT NOT NULL,
  "visitor_key" TEXT,
  "idempotency_key" TEXT,
  "attribution" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "properties" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "marketing_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
  CONSTRAINT "marketing_events_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "marketing_events_idempotency_key_key" ON "marketing_events"("idempotency_key");
CREATE INDEX IF NOT EXISTS "marketing_events_event_name_created_at_idx" ON "marketing_events"("event_name", "created_at");
CREATE INDEX IF NOT EXISTS "marketing_events_company_id_created_at_idx" ON "marketing_events"("company_id", "created_at");
CREATE INDEX IF NOT EXISTS "marketing_events_store_id_created_at_idx" ON "marketing_events"("store_id", "created_at");
CREATE INDEX IF NOT EXISTS "marketing_events_visitor_key_created_at_idx" ON "marketing_events"("visitor_key", "created_at");
