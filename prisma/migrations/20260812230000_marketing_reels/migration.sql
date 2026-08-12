ALTER TABLE "marketing_content_items"
  ADD COLUMN IF NOT EXISTS "render_status" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "render_progress" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "render_error" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "rendered_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "duration_seconds" INTEGER,
  ADD COLUMN IF NOT EXISTS "video_template" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "cover_asset_id" UUID REFERENCES "social_media_assets"("id") ON DELETE SET NULL;

ALTER TABLE "marketing_content_items" DROP CONSTRAINT IF EXISTS "marketing_content_render_status_check";
ALTER TABLE "marketing_content_items" ADD CONSTRAINT "marketing_content_render_status_check"
  CHECK ("render_status" IN ('none','pending','preparing_assets','rendering','validating','ready','failed','cancelled'));

CREATE TABLE IF NOT EXISTS "social_reel_render_jobs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "content_id" UUID NOT NULL REFERENCES "marketing_content_items"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','claimed','rendering','ready','failed','cancelled')),
  "template" TEXT NOT NULL DEFAULT 'problem_solution',
  "duration_seconds" INTEGER NOT NULL DEFAULT 15 CHECK ("duration_seconds" BETWEEN 8 AND 45),
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "lock_expires_at" TIMESTAMPTZ(6),
  "next_attempt_at" TIMESTAMPTZ(6),
  "last_error" TEXT NOT NULL DEFAULT '',
  "output_asset_id" UUID REFERENCES "social_media_assets"("id") ON DELETE SET NULL,
  "cover_asset_id" UUID REFERENCES "social_media_assets"("id") ON DELETE SET NULL,
  "created_by" UUID REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "social_reel_render_jobs_worker_idx" ON "social_reel_render_jobs"("status","next_attempt_at","created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "social_reel_render_jobs_active_key" ON "social_reel_render_jobs"("content_id") WHERE "status" IN ('pending','claimed','rendering');
