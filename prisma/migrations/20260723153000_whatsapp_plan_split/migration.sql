-- Separa WhatsApp manual e automático por plano.
-- Teste grátis e Essencial usam WhatsApp manual.
-- Profissional e Premium usam WhatsApp automático.

UPDATE "plan_features" pf
SET "is_enabled" = CASE
  WHEN p."code" IN ('trial', 'essential') THEN true
  ELSE false
END,
"limit_value" = NULL
FROM "subscription_plans" p
JOIN "platform_features" f ON f."code" = 'manual_whatsapp'
WHERE pf."plan_id" = p."id"
  AND pf."feature_id" = f."id"
  AND p."code" IN ('trial', 'essential', 'professional', 'premium');

UPDATE "plan_features" pf
SET "is_enabled" = CASE
  WHEN p."code" IN ('professional', 'premium') THEN true
  ELSE false
END,
"limit_value" = NULL
FROM "subscription_plans" p
JOIN "platform_features" f ON f."code" = 'automatic_whatsapp'
WHERE pf."plan_id" = p."id"
  AND pf."feature_id" = f."id"
  AND p."code" IN ('trial', 'essential', 'professional', 'premium');
