UPDATE "plan_addons"
SET "available_plan_codes" = ARRAY['trial', 'essential', 'professional']::text[],
    "included_plan_codes" = ARRAY['premium']::text[],
    "updated_at" = now()
WHERE "code" = 'whatsapp_automatic';

UPDATE "subscription_plans"
SET "settings" = COALESCE("settings", '{}'::jsonb) ||
  CASE
    WHEN "code" = 'premium' THEN '{"whatsapp_automatic_included": true, "whatsapp_automatic_addon": false}'::jsonb
    WHEN "code" IN ('trial', 'essential', 'professional') THEN '{"whatsapp_automatic_included": false, "whatsapp_automatic_addon": true}'::jsonb
    ELSE '{}'::jsonb
  END,
  "updated_at" = now()
WHERE "code" IN ('trial', 'essential', 'professional', 'premium');
