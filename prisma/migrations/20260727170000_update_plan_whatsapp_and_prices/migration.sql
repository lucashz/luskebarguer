-- Atualiza a matriz comercial dos planos.
-- Teste gratis, Essencial e Profissional usam WhatsApp manual.
-- WhatsApp automatico fica incluso apenas no Premium; no Profissional deve ser vendido/configurado como adicional.

UPDATE "subscription_plans"
SET
  "description" = CASE "code"
    WHEN 'trial' THEN 'Teste gratis para montar sua loja antes de contratar.'
    WHEN 'essential' THEN 'Para comecar com cardapio digital, pedidos online e WhatsApp manual.'
    WHEN 'professional' THEN 'Para restaurantes que precisam de mesas, cupons, cozinha, relatorios e WhatsApp manual.'
    WHEN 'premium' THEN 'Para operacao avancada com WhatsApp automatico, fidelidade, dominio proprio e suporte prioritario.'
    ELSE "description"
  END,
  "monthly_price" = CASE "code"
    WHEN 'trial' THEN 0
    WHEN 'essential' THEN 49.90
    WHEN 'professional' THEN 89.90
    WHEN 'premium' THEN 149.90
    ELSE "monthly_price"
  END,
  "annual_price" = CASE "code"
    WHEN 'trial' THEN 0
    WHEN 'essential' THEN 499.00
    WHEN 'professional' THEN 899.00
    WHEN 'premium' THEN 1499.00
    ELSE "annual_price"
  END,
  "settings" = CASE "code"
    WHEN 'trial' THEN jsonb_set(COALESCE("settings", '{}'::jsonb), '{trial_days}', '14'::jsonb, true)
    WHEN 'professional' THEN COALESCE("settings", '{}'::jsonb) || '{"whatsapp_automatic_addon": true, "whatsapp_automatic_included": false}'::jsonb
    WHEN 'premium' THEN COALESCE("settings", '{}'::jsonb) || '{"whatsapp_automatic_included": true}'::jsonb
    ELSE COALESCE("settings", '{}'::jsonb)
  END
WHERE "code" IN ('trial', 'essential', 'professional', 'premium');

WITH desired(plan_code, feature_code, enabled, limit_value) AS (
  VALUES
    ('trial', 'digital_menu', true, 10),
    ('trial', 'menu_categories', true, 3),
    ('trial', 'orders', true, 30),
    ('trial', 'admin_users', true, 1),
    ('trial', 'manual_whatsapp', true, NULL::integer),
    ('trial', 'automatic_whatsapp', false, NULL::integer),

    ('essential', 'digital_menu', true, 25),
    ('essential', 'menu_categories', true, 5),
    ('essential', 'orders', true, 150),
    ('essential', 'admin_users', true, 1),
    ('essential', 'manual_whatsapp', true, NULL::integer),
    ('essential', 'automatic_whatsapp', false, NULL::integer),

    ('professional', 'digital_menu', true, 100),
    ('professional', 'menu_categories', true, NULL::integer),
    ('professional', 'orders', true, NULL::integer),
    ('professional', 'admin_users', true, 5),
    ('professional', 'manual_whatsapp', true, NULL::integer),
    ('professional', 'automatic_whatsapp', false, NULL::integer),

    ('premium', 'digital_menu', true, NULL::integer),
    ('premium', 'menu_categories', true, NULL::integer),
    ('premium', 'orders', true, NULL::integer),
    ('premium', 'admin_users', true, 10),
    ('premium', 'manual_whatsapp', false, NULL::integer),
    ('premium', 'automatic_whatsapp', true, NULL::integer)
)
UPDATE "plan_features" pf
SET
  "is_enabled" = desired.enabled,
  "limit_value" = desired.limit_value
FROM desired
JOIN "subscription_plans" p ON p."code" = desired.plan_code
JOIN "platform_features" f ON f."code" = desired.feature_code
WHERE pf."plan_id" = p."id"
  AND pf."feature_id" = f."id";
