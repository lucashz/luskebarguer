CREATE TABLE IF NOT EXISTS "subscription_payment_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "subscription_id" UUID,
    "plan_id" UUID,
    "provider" TEXT NOT NULL,
    "external_transaction_id" TEXT,
    "external_event_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "amount_cents" INTEGER NOT NULL DEFAULT 0,
    "checkout_url" TEXT,
    "raw_payload" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "paid_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_payment_transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "subscription_payment_transactions_company_id_created_at_idx"
  ON "subscription_payment_transactions"("company_id", "created_at");

CREATE INDEX IF NOT EXISTS "subscription_payment_transactions_subscription_id_created_at_idx"
  ON "subscription_payment_transactions"("subscription_id", "created_at");

CREATE INDEX IF NOT EXISTS "subscription_payment_transactions_provider_status_created_at_idx"
  ON "subscription_payment_transactions"("provider", "status", "created_at");

CREATE UNIQUE INDEX IF NOT EXISTS "subscription_payment_transactions_provider_external_transaction_id_key"
  ON "subscription_payment_transactions"("provider", "external_transaction_id")
  WHERE "external_transaction_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "subscription_payment_transactions_provider_external_event_id_key"
  ON "subscription_payment_transactions"("provider", "external_event_id")
  WHERE "external_event_id" IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscription_payment_transactions_company_id_fkey'
  ) THEN
    ALTER TABLE "subscription_payment_transactions"
      ADD CONSTRAINT "subscription_payment_transactions_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscription_payment_transactions_subscription_id_fkey'
  ) THEN
    ALTER TABLE "subscription_payment_transactions"
      ADD CONSTRAINT "subscription_payment_transactions_subscription_id_fkey"
      FOREIGN KEY ("subscription_id") REFERENCES "company_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscription_payment_transactions_plan_id_fkey'
  ) THEN
    ALTER TABLE "subscription_payment_transactions"
      ADD CONSTRAINT "subscription_payment_transactions_plan_id_fkey"
      FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
