ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'pending_activation' BEFORE 'trial';

DO $$ BEGIN
  CREATE TYPE "AssistedRegistrationStatus" AS ENUM (
    'new',
    'in_progress',
    'awaiting_menu',
    'reviewing_menu',
    'ready_to_publish',
    'published',
    'activated',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "assisted_registrations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "status" "AssistedRegistrationStatus" NOT NULL DEFAULT 'new',
  "responsible_name" TEXT NOT NULL DEFAULT '',
  "phone" TEXT NOT NULL DEFAULT '',
  "email" TEXT NOT NULL DEFAULT '',
  "establishment_name" TEXT NOT NULL DEFAULT '',
  "document_normalized" TEXT NOT NULL,
  "answers" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "attribution" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "operator_admin_id" UUID REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "publish_key" TEXT UNIQUE,
  "company_id" UUID REFERENCES "companies"("id") ON DELETE SET NULL,
  "store_id" UUID REFERENCES "stores"("id") ON DELETE SET NULL,
  "admin_id" UUID REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "subscription_id" UUID REFERENCES "company_subscriptions"("id") ON DELETE SET NULL,
  "email_status" TEXT NOT NULL DEFAULT 'not_sent',
  "email_last_error_code" TEXT,
  "published_at" TIMESTAMPTZ,
  "activated_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "assisted_registrations_status_updated_idx" ON "assisted_registrations"("status", "updated_at");
CREATE INDEX IF NOT EXISTS "assisted_registrations_phone_idx" ON "assisted_registrations"("phone");
CREATE INDEX IF NOT EXISTS "assisted_registrations_email_idx" ON "assisted_registrations"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "assisted_registrations_document_active_key"
  ON "assisted_registrations"("document_normalized") WHERE "status" <> 'cancelled';

CREATE TABLE IF NOT EXISTS "assisted_registration_files" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "registration_id" UUID NOT NULL REFERENCES "assisted_registrations"("id") ON DELETE CASCADE,
  "original_name" TEXT NOT NULL,
  "safe_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" BIGINT NOT NULL,
  "storage_key" TEXT NOT NULL UNIQUE,
  "checksum_sha256" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'uploaded',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "assisted_registration_files_registration_idx"
  ON "assisted_registration_files"("registration_id", "status", "created_at");

CREATE TABLE IF NOT EXISTS "assisted_menu_drafts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "registration_id" UUID NOT NULL UNIQUE REFERENCES "assisted_registrations"("id") ON DELETE CASCADE,
  "schema_version" INTEGER NOT NULL DEFAULT 1,
  "content" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "validation" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "version" INTEGER NOT NULL DEFAULT 1,
  "reviewed_at" TIMESTAMPTZ,
  "reviewed_by" UUID REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "reviewed_hash" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "assisted_menu_drafts_reviewed_updated_idx"
  ON "assisted_menu_drafts"("reviewed_at", "updated_at");
