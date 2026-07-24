CREATE TABLE IF NOT EXISTS "platform_billing_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider" text NOT NULL DEFAULT 'abacatepay',
  "api_key" text,
  "webhook_secret" text,
  "public_url" text,
  "is_active" boolean NOT NULL DEFAULT false,
  "last_test_status" text,
  "last_test_at" timestamptz,
  "last_test_message" text,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "platform_billing_settings_created_at_idx"
  ON "platform_billing_settings" ("created_at" DESC);
