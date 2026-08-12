CREATE TABLE IF NOT EXISTS "marketing_autopilot_settings" (
  "id" SMALLINT PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "generation_time" TIME NOT NULL DEFAULT '08:00',
  "publication_time" TIME NOT NULL DEFAULT '10:00',
  "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  "image_model" TEXT NOT NULL DEFAULT 'gpt-image-2',
  "image_quality" TEXT NOT NULL DEFAULT 'medium' CHECK ("image_quality" IN ('low','medium','high','auto')),
  "approval_required" BOOLEAN NOT NULL DEFAULT TRUE CHECK ("approval_required" = TRUE),
  "updated_by" UUID REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "marketing_autopilot_settings" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "marketing_autopilot_runs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_date" DATE NOT NULL,
  "variant" INTEGER NOT NULL DEFAULT 1 CHECK ("variant" BETWEEN 1 AND 20),
  "status" TEXT NOT NULL DEFAULT 'generating' CHECK ("status" IN ('generating','ready','approved','failed','discarded')),
  "provider" TEXT NOT NULL DEFAULT 'simulation' CHECK ("provider" IN ('openai','simulation')),
  "content_id" UUID REFERENCES "marketing_content_items"("id") ON DELETE SET NULL,
  "asset_id" UUID REFERENCES "social_media_assets"("id") ON DELETE SET NULL,
  "topic_key" TEXT NOT NULL DEFAULT '',
  "prompt" TEXT NOT NULL DEFAULT '',
  "error_message" TEXT NOT NULL DEFAULT '',
  "created_by" UUID REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("run_date", "variant")
);
CREATE INDEX IF NOT EXISTS "marketing_autopilot_runs_date_idx" ON "marketing_autopilot_runs"("run_date" DESC, "variant" DESC);
