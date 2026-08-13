-- O checkout real ja foi validado. O plano interno de R$ 1,00 nao deve mais
-- aparecer nem aceitar novas contratacoes, mas pagamentos concluidos ficam
-- preservados para auditoria e conciliacao.
UPDATE "subscription_plans"
SET
  "is_active" = false,
  "settings" = COALESCE("settings", '{}'::jsonb) || '{"internal_test":true,"hide_public":true,"billing_test":true,"retired":true}'::jsonb,
  "updated_at" = now()
WHERE "code" = 'payment_test';

UPDATE "subscription_payment_transactions"
SET
  "status" = 'expired',
  "checkout_url" = NULL,
  "expires_at" = now(),
  "metadata" = COALESCE("metadata", '{}'::jsonb) || '{"invalidated_reason":"payment_test_plan_retired"}'::jsonb,
  "updated_at" = now()
WHERE "plan_id" = (
  SELECT "id" FROM "subscription_plans" WHERE "code" = 'payment_test' LIMIT 1
)
AND "status" = 'pending';

UPDATE "company_subscriptions"
SET
  "status" = 'cancelled',
  "cancelled_at" = COALESCE("cancelled_at", now()),
  "metadata" = (COALESCE("metadata", '{}'::jsonb) - 'checkout_url') || '{"invalidated_reason":"payment_test_plan_retired"}'::jsonb,
  "updated_at" = now()
WHERE "plan_id" = (
  SELECT "id" FROM "subscription_plans" WHERE "code" = 'payment_test' LIMIT 1
)
AND "status" = 'payment_pending';
