-- Ajusta o plano interno de teste de pagamento para R$ 1,00.

UPDATE "subscription_plans"
SET
  "monthly_price" = 1.00,
  "description" = 'Plano interno de R$ 1,00 para testar checkout, webhook e ativacao automatica.',
  "settings" = COALESCE("settings", '{}'::jsonb) || '{"internal_test": true, "hide_public": true, "billing_test": true}'::jsonb,
  "updated_at" = now()
WHERE "code" = 'payment_test';
