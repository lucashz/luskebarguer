ALTER TABLE "stores"
  ADD COLUMN IF NOT EXISTS "seo_index_enabled" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "stores_seo_index_enabled_is_active_updated_at_idx"
  ON "stores"("seo_index_enabled", "is_active", "updated_at" DESC);
