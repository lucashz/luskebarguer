-- Global time-range indexes used by Platform analytics and operational dashboards.
CREATE INDEX IF NOT EXISTS "orders_created_at_idx"
  ON "orders"("created_at" DESC);

CREATE INDEX IF NOT EXISTS "subscription_events_created_at_idx"
  ON "subscription_events"("created_at" DESC);

CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx"
  ON "audit_logs"("created_at" DESC);
