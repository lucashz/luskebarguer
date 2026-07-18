ALTER TABLE "subscription_payment_transactions"
  ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMPTZ(6);
