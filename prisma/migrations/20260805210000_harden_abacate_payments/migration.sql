CREATE TABLE IF NOT EXISTS "payment_attempts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "store_id" UUID REFERENCES "stores"("id") ON DELETE CASCADE,
  "order_id" UUID NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "provider" TEXT NOT NULL DEFAULT 'abacatepay',
  "idempotency_key" TEXT NOT NULL UNIQUE,
  "transaction_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'created',
  "amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "checkout_url" TEXT,
  "expires_at" TIMESTAMPTZ,
  "failure_code" TEXT,
  "failure_message" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "payment_attempts_provider_transaction_id_key" ON "payment_attempts"("provider", "transaction_id") WHERE "transaction_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "payment_attempts_order_id_created_at_idx" ON "payment_attempts"("order_id", "created_at");
CREATE INDEX IF NOT EXISTS "payment_attempts_store_id_status_created_at_idx" ON "payment_attempts"("store_id", "status", "created_at");

CREATE TABLE IF NOT EXISTS "payment_refunds" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "store_id" UUID REFERENCES "stores"("id") ON DELETE CASCADE,
  "order_id" UUID NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "provider" TEXT NOT NULL DEFAULT 'abacatepay',
  "provider_refund_id" TEXT,
  "idempotency_key" TEXT NOT NULL UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'requested',
  "amount_cents" INTEGER NOT NULL,
  "reason" TEXT,
  "failure_message" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "requested_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "completed_at" TIMESTAMPTZ,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "payment_refunds_order_id_requested_at_idx" ON "payment_refunds"("order_id", "requested_at");
CREATE INDEX IF NOT EXISTS "payment_refunds_store_id_status_requested_at_idx" ON "payment_refunds"("store_id", "status", "requested_at");
