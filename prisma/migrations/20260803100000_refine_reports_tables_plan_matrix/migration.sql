-- Refina a distribuicao comercial de relatorios e mesas por plano.
-- Essencial fica com relatorio simples e limite menor de mesas.
-- Profissional libera relatorios completos; Premium libera insights avancados.

INSERT INTO "platform_features" ("code", "name", "description", "category", "sort_order", "is_active")
VALUES
  ('advanced_reports', 'Relatórios completos', 'Ranking de produtos, horários de pico, origem dos pedidos e fechamento detalhado.', 'analytics', 72, true),
  ('business_insights', 'Insights avançados', 'Leituras comerciais avançadas para crescimento, retenção e oportunidades de melhoria.', 'analytics', 74, true)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "category" = EXCLUDED."category",
  "sort_order" = EXCLUDED."sort_order",
  "is_active" = true,
  "updated_at" = now();

UPDATE "platform_features"
SET
  "name" = 'Relatórios simples',
  "description" = 'Resumo de faturamento, pedidos, ticket médio, formas de pagamento e fechamento básico.',
  "category" = 'analytics',
  "sort_order" = 70,
  "updated_at" = now()
WHERE "code" = 'basic_reports';

WITH desired(plan_code, feature_code, enabled, limit_value) AS (
  VALUES
    ('trial', 'basic_reports', false, NULL::integer),
    ('trial', 'advanced_reports', false, NULL::integer),
    ('trial', 'business_insights', false, NULL::integer),
    ('trial', 'tables', false, NULL::integer),

    ('essential', 'basic_reports', true, NULL::integer),
    ('essential', 'advanced_reports', false, NULL::integer),
    ('essential', 'business_insights', false, NULL::integer),
    ('essential', 'tables', true, 2),

    ('professional', 'basic_reports', true, NULL::integer),
    ('professional', 'advanced_reports', true, NULL::integer),
    ('professional', 'business_insights', false, NULL::integer),
    ('professional', 'tables', true, NULL::integer),

    ('premium', 'basic_reports', true, NULL::integer),
    ('premium', 'advanced_reports', true, NULL::integer),
    ('premium', 'business_insights', true, NULL::integer),
    ('premium', 'tables', true, NULL::integer)
)
INSERT INTO "plan_features" ("plan_id", "feature_id", "is_enabled", "limit_value")
SELECT p."id", f."id", desired.enabled, desired.limit_value
FROM desired
JOIN "subscription_plans" p ON p."code" = desired.plan_code
JOIN "platform_features" f ON f."code" = desired.feature_code
ON CONFLICT ("plan_id", "feature_id") DO UPDATE SET
  "is_enabled" = EXCLUDED."is_enabled",
  "limit_value" = EXCLUDED."limit_value",
  "updated_at" = now();
