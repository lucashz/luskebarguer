ALTER TABLE "marketing_autopilot_settings"
  ADD COLUMN IF NOT EXISTS "days_of_week" INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6,7],
  ADD COLUMN IF NOT EXISTS "posts_per_day" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "audience" TEXT NOT NULL DEFAULT 'Donos de pequenos restaurantes, lanchonetes e delivery',
  ADD COLUMN IF NOT EXISTS "priority_niches" TEXT[] NOT NULL DEFAULT ARRAY['pizzarias','hamburguerias','marmitarias'],
  ADD COLUMN IF NOT EXISTS "communication_tone" TEXT NOT NULL DEFAULT 'simples, direto e útil',
  ADD COLUMN IF NOT EXISTS "preferred_ctas" TEXT[] NOT NULL DEFAULT ARRAY['Testar grátis','Ver como funciona'],
  ADD COLUMN IF NOT EXISTS "enabled_formats" TEXT[] NOT NULL DEFAULT ARRAY['post','carrossel','story'],
  ADD COLUMN IF NOT EXISTS "avoided_topics" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "notify_ready" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "notify_published" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "notify_failed" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "notify_disconnected" BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE "marketing_autopilot_settings" DROP CONSTRAINT IF EXISTS "marketing_autopilot_posts_per_day_check";
ALTER TABLE "marketing_autopilot_settings" ADD CONSTRAINT "marketing_autopilot_posts_per_day_check" CHECK ("posts_per_day" BETWEEN 1 AND 3);
