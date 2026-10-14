ALTER TYPE "AssistedRegistrationStatus" ADD VALUE IF NOT EXISTS 'interpreting_menu' AFTER 'awaiting_menu';
ALTER TYPE "AssistedRegistrationStatus" ADD VALUE IF NOT EXISTS 'ready_for_preview' AFTER 'reviewing_menu';
ALTER TYPE "AssistedRegistrationStatus" ADD VALUE IF NOT EXISTS 'preview_created' AFTER 'ready_for_preview';
ALTER TYPE "AssistedRegistrationStatus" ADD VALUE IF NOT EXISTS 'preview_reviewed' AFTER 'preview_created';

ALTER TABLE "assisted_registrations"
  ADD COLUMN IF NOT EXISTS "last_import_error_code" TEXT,
  ADD COLUMN IF NOT EXISTS "preview_created_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "preview_reviewed_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "preview_menu_version" INTEGER;

ALTER TABLE "assisted_registration_files"
  ADD COLUMN IF NOT EXISTS "purpose" TEXT NOT NULL DEFAULT 'menu_source';

DO $$ BEGIN
  ALTER TABLE "assisted_registration_files"
    ADD CONSTRAINT "assisted_registration_files_purpose_check"
    CHECK ("purpose" IN ('menu_source', 'product_photo', 'store_logo', 'store_cover'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "assisted_product_photo_links" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "registration_id" UUID NOT NULL REFERENCES "assisted_registrations"("id") ON DELETE CASCADE,
  "file_id" UUID NOT NULL UNIQUE REFERENCES "assisted_registration_files"("id") ON DELETE CASCADE,
  "draft_item_id" TEXT,
  "suggested_product_id" UUID,
  "confirmed_product_id" UUID,
  "confidence" DECIMAL(5,4),
  "status" TEXT NOT NULL DEFAULT 'pending',
  "confirmed_by" UUID REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "confirmed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "assisted_product_photo_links_status_check"
    CHECK ("status" IN ('pending', 'suggested', 'confirmed', 'rejected')),
  CONSTRAINT "assisted_product_photo_links_confidence_check"
    CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1))
);

CREATE INDEX IF NOT EXISTS "assisted_product_photo_links_registration_status_idx"
  ON "assisted_product_photo_links"("registration_id", "status");
CREATE INDEX IF NOT EXISTS "assisted_product_photo_links_draft_item_idx"
  ON "assisted_product_photo_links"("draft_item_id");
