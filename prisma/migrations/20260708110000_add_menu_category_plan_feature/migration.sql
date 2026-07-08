-- Add category limits as a separate idempotent plan feature.

INSERT INTO "platform_features" ("code", "name", "description", "category", "sort_order", "is_active")
VALUES
  ('menu_categories', 'Categorias do cardápio', 'Seções públicas para organizar o cardápio.', 'core', 15, true)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "category" = EXCLUDED."category",
  "sort_order" = EXCLUDED."sort_order",
  "is_active" = EXCLUDED."is_active";

WITH plan_limits(plan_code, feature_code, enabled, limit_value) AS (
  VALUES
    ('trial', 'menu_categories', true, 5),
    ('essential', 'menu_categories', true, 12),
    ('professional', 'menu_categories', true, NULL),
    ('premium', 'menu_categories', true, NULL)
)
INSERT INTO "plan_features" ("plan_id", "feature_id", "is_enabled", "limit_value")
SELECT p."id", f."id", pl.enabled, pl.limit_value
FROM plan_limits pl
JOIN "subscription_plans" p ON p."code" = pl.plan_code
JOIN "platform_features" f ON f."code" = pl.feature_code
ON CONFLICT ("plan_id", "feature_id") DO UPDATE SET
  "is_enabled" = EXCLUDED."is_enabled",
  "limit_value" = EXCLUDED."limit_value";
