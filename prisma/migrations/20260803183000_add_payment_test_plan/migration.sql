-- Plano interno para validar checkout, webhook e troca automatica de plano.
-- Fica ativo no banco, mas o backend so lista no painel para superadmin.

INSERT INTO "subscription_plans" (
  "code",
  "name",
  "description",
  "monthly_price",
  "annual_price",
  "sort_order",
  "is_active",
  "settings"
) VALUES (
  'payment_test',
  'Teste Pagamento',
  'Plano interno de R$ 0,01 para testar checkout, webhook e ativacao automatica.',
  0.01,
  0,
  99,
  true,
  '{"internal_test": true, "hide_public": true, "billing_test": true}'::jsonb
)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "monthly_price" = EXCLUDED."monthly_price",
  "annual_price" = EXCLUDED."annual_price",
  "sort_order" = EXCLUDED."sort_order",
  "is_active" = true,
  "settings" = COALESCE("subscription_plans"."settings", '{}'::jsonb) || EXCLUDED."settings",
  "updated_at" = now();

WITH desired(feature_code, enabled, limit_value) AS (
  VALUES
    ('digital_menu', true, NULL::integer),
    ('menu_categories', true, NULL::integer),
    ('orders', true, NULL::integer),
    ('admin_users', true, 10),
    ('customers', true, NULL::integer),
    ('tables', true, NULL::integer),
    ('promotions', true, NULL::integer),
    ('basic_reports', true, NULL::integer),
    ('advanced_reports', true, NULL::integer),
    ('business_insights', true, NULL::integer),
    ('store_settings', true, NULL::integer),
    ('manual_whatsapp', false, NULL::integer),
    ('automatic_whatsapp', true, NULL::integer),
    ('print_kitchen', true, NULL::integer),
    ('loyalty', true, NULL::integer),
    ('reorder', true, NULL::integer),
    ('cart_suggestions', true, NULL::integer),
    ('custom_domain', true, NULL::integer),
    ('priority_support', true, NULL::integer)
)
INSERT INTO "plan_features" ("plan_id", "feature_id", "is_enabled", "limit_value")
SELECT p."id", f."id", desired.enabled, desired.limit_value
FROM desired
JOIN "subscription_plans" p ON p."code" = 'payment_test'
JOIN "platform_features" f ON f."code" = desired.feature_code
ON CONFLICT ("plan_id", "feature_id") DO UPDATE SET
  "is_enabled" = EXCLUDED."is_enabled",
  "limit_value" = EXCLUDED."limit_value",
  "updated_at" = now();
