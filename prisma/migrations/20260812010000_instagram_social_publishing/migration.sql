ALTER TABLE "marketing_content_items" DROP CONSTRAINT IF EXISTS "marketing_content_items_status_check";
ALTER TABLE "marketing_content_items"
  ADD COLUMN IF NOT EXISTS "objective" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "overlay_text" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "voiceover" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "aspect_ratio" TEXT NOT NULL DEFAULT '1:1',
  ADD COLUMN IF NOT EXISTS "alt_text" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "location_name" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  ADD COLUMN IF NOT EXISTS "assigned_to" UUID REFERENCES "admin_users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "approved_version_hash" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "approved_caption" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "approved_assets_hash" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "content_version" INTEGER NOT NULL DEFAULT 1 CHECK ("content_version" >= 1),
  ADD COLUMN IF NOT EXISTS "revision_history" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "publication_error" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "publication_attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("publication_attempts" >= 0);
ALTER TABLE "marketing_content_items" ADD CONSTRAINT "marketing_content_items_status_check" CHECK ("status" IN ('idea','draft','production','review','changes_requested','approved','scheduled','publishing','processing','published','simulated','failed','cancelled'));

CREATE TABLE IF NOT EXISTS "social_accounts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider" TEXT NOT NULL DEFAULT 'instagram' CHECK ("provider" IN ('instagram')),
  "mode" TEXT NOT NULL DEFAULT 'simulation' CHECK ("mode" IN ('simulation','live')),
  "provider_account_id" TEXT NOT NULL,
  "username" TEXT NOT NULL DEFAULT '',
  "display_name" TEXT NOT NULL DEFAULT '',
  "profile_picture_url" TEXT NOT NULL DEFAULT '',
  "account_type" TEXT NOT NULL DEFAULT 'BUSINESS',
  "access_token_encrypted" TEXT NOT NULL DEFAULT '',
  "refresh_token_encrypted" TEXT NOT NULL DEFAULT '',
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "token_expires_at" TIMESTAMPTZ(6),
  "status" TEXT NOT NULL DEFAULT 'connected' CHECK ("status" IN ('connected','attention','expired','disconnected','error')),
  "publishing_paused" BOOLEAN NOT NULL DEFAULT FALSE,
  "last_tested_at" TIMESTAMPTZ(6),
  "last_sync_at" TIMESTAMPTZ(6),
  "last_error" TEXT NOT NULL DEFAULT '',
  "connected_by" UUID REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("provider", "provider_account_id")
);

ALTER TABLE "marketing_content_items" ADD COLUMN IF NOT EXISTS "social_account_id" UUID REFERENCES "social_accounts"("id") ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS "social_oauth_states" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "state_hash" TEXT NOT NULL UNIQUE,
  "provider" TEXT NOT NULL DEFAULT 'instagram',
  "admin_id" UUID NOT NULL REFERENCES "admin_users"("id") ON DELETE CASCADE,
  "redirect_uri" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "used_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "social_media_assets" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider" TEXT NOT NULL DEFAULT 'instagram',
  "kind" TEXT NOT NULL CHECK ("kind" IN ('image','video')),
  "file_name" TEXT NOT NULL,
  "storage_path" TEXT NOT NULL UNIQUE,
  "public_url" TEXT NOT NULL,
  "content_type" TEXT NOT NULL,
  "size_bytes" BIGINT NOT NULL CHECK ("size_bytes" > 0),
  "width" INTEGER,
  "height" INTEGER,
  "duration_seconds" NUMERIC(10,3),
  "aspect_ratio" TEXT NOT NULL DEFAULT '',
  "checksum_sha256" TEXT NOT NULL,
  "thumbnail_url" TEXT NOT NULL DEFAULT '',
  "processing_status" TEXT NOT NULL DEFAULT 'ready' CHECK ("processing_status" IN ('uploaded','processing','ready','invalid','deleted')),
  "validation_details" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_by" UUID REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "social_media_assets_checksum_key" ON "social_media_assets"("checksum_sha256") WHERE "processing_status" <> 'deleted';

CREATE TABLE IF NOT EXISTS "social_content_assets" (
  "content_id" UUID NOT NULL REFERENCES "marketing_content_items"("id") ON DELETE CASCADE,
  "asset_id" UUID NOT NULL REFERENCES "social_media_assets"("id") ON DELETE RESTRICT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "role" TEXT NOT NULL DEFAULT 'media' CHECK ("role" IN ('media','cover','thumbnail')),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("content_id", "asset_id")
);
CREATE INDEX IF NOT EXISTS "social_content_assets_order_idx" ON "social_content_assets"("content_id", "sort_order");

CREATE TABLE IF NOT EXISTS "social_publications" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "content_id" UUID NOT NULL REFERENCES "marketing_content_items"("id") ON DELETE CASCADE,
  "account_id" UUID NOT NULL REFERENCES "social_accounts"("id") ON DELETE CASCADE,
  "content_version" INTEGER NOT NULL,
  "idempotency_key" TEXT NOT NULL UNIQUE,
  "approved_hash" TEXT NOT NULL,
  "mode" TEXT NOT NULL CHECK ("mode" IN ('simulation','live')),
  "status" TEXT NOT NULL DEFAULT 'queued' CHECK ("status" IN ('queued','claimed','container_created','processing','published','simulated','retry','failed','cancelled')),
  "scheduled_at" TIMESTAMPTZ(6) NOT NULL,
  "claimed_at" TIMESTAMPTZ(6),
  "lock_expires_at" TIMESTAMPTZ(6),
  "next_attempt_at" TIMESTAMPTZ(6),
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "container_id" TEXT NOT NULL DEFAULT '',
  "provider_media_id" TEXT NOT NULL DEFAULT '',
  "permalink" TEXT NOT NULL DEFAULT '',
  "last_error_code" TEXT NOT NULL DEFAULT '',
  "last_error" TEXT NOT NULL DEFAULT '',
  "published_at" TIMESTAMPTZ(6),
  "created_by" UUID REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "social_publications_worker_idx" ON "social_publications"("status", "scheduled_at", "next_attempt_at");

CREATE TABLE IF NOT EXISTS "social_publication_attempts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "publication_id" UUID NOT NULL REFERENCES "social_publications"("id") ON DELETE CASCADE,
  "attempt_number" INTEGER NOT NULL,
  "operation" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL DEFAULT '',
  "http_status" INTEGER,
  "provider_code" TEXT NOT NULL DEFAULT '',
  "duration_ms" INTEGER,
  "result" TEXT NOT NULL CHECK ("result" IN ('started','success','retry','failed','blocked')),
  "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "social_metric_snapshots" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "publication_id" UUID NOT NULL REFERENCES "social_publications"("id") ON DELETE CASCADE,
  "source" TEXT NOT NULL CHECK ("source" IN ('meta','tapronto','manual','simulation')),
  "metrics" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "captured_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "social_metric_snapshots_publication_idx" ON "social_metric_snapshots"("publication_id", "captured_at" DESC);

CREATE TABLE IF NOT EXISTS "social_alerts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "dedupe_key" TEXT NOT NULL,
  "severity" TEXT NOT NULL CHECK ("severity" IN ('info','attention','critical')),
  "kind" TEXT NOT NULL,
  "account_id" UUID REFERENCES "social_accounts"("id") ON DELETE CASCADE,
  "publication_id" UUID REFERENCES "social_publications"("id") ON DELETE CASCADE,
  "message" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open' CHECK ("status" IN ('open','acknowledged','resolved')),
  "last_notified_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "social_alerts_open_dedupe_key" ON "social_alerts"("dedupe_key") WHERE "status" = 'open';

CREATE TABLE IF NOT EXISTS "social_worker_state" (
  "worker_key" TEXT PRIMARY KEY,
  "status" TEXT NOT NULL DEFAULT 'idle',
  "last_started_at" TIMESTAMPTZ(6),
  "last_finished_at" TIMESTAMPTZ(6),
  "next_run_at" TIMESTAMPTZ(6),
  "processed_count" INTEGER NOT NULL DEFAULT 0,
  "failed_count" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT NOT NULL DEFAULT '',
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
