ALTER TABLE "marketing_autopilot_settings"
  ADD COLUMN IF NOT EXISTS "image_generation_enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "image_style" TEXT NOT NULL DEFAULT 'product_device',
  ADD COLUMN IF NOT EXISTS "image_aspect_ratio" TEXT NOT NULL DEFAULT '1:1',
  ADD COLUMN IF NOT EXISTS "image_options" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "logo_enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "logo_position" TEXT NOT NULL DEFAULT 'bottom_right',
  ADD COLUMN IF NOT EXISTS "brand_intensity" TEXT NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS "max_overlay_words" INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS "monthly_image_limit" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS "topic_cooldown_days" INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS "pause_dates" DATE[] NOT NULL DEFAULT ARRAY[]::DATE[],
  ADD COLUMN IF NOT EXISTS "seasonal_dates_enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "content_mix" JSONB NOT NULL DEFAULT '{"product":35,"education":25,"pain":25,"conversion":15}'::JSONB,
  ADD COLUMN IF NOT EXISTS "reference_asset_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];

ALTER TABLE "marketing_autopilot_settings" DROP CONSTRAINT IF EXISTS "marketing_image_options_check";
ALTER TABLE "marketing_autopilot_settings" ADD CONSTRAINT "marketing_image_options_check" CHECK ("image_options" BETWEEN 1 AND 4);
ALTER TABLE "marketing_autopilot_settings" DROP CONSTRAINT IF EXISTS "marketing_monthly_image_limit_check";
ALTER TABLE "marketing_autopilot_settings" ADD CONSTRAINT "marketing_monthly_image_limit_check" CHECK ("monthly_image_limit" BETWEEN 1 AND 500);
