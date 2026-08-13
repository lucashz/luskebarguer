-- Checkouts antigos não podem ser reutilizados depois da troca de gateway.
UPDATE "subscription_payment_transactions"
SET "status" = 'expired',
    "checkout_url" = NULL,
    "expires_at" = now(),
    "metadata" = COALESCE("metadata", '{}'::jsonb) || '{"invalidated_reason":"gateway_migrated_to_mercadopago"}'::jsonb,
    "updated_at" = now()
WHERE "provider" = 'abacatepay'
  AND "status" = 'pending';

UPDATE "company_subscriptions"
SET "status" = 'cancelled',
    "cancelled_at" = COALESCE("cancelled_at", now()),
    "metadata" = (COALESCE("metadata", '{}'::jsonb) - 'checkout_url') || '{"invalidated_reason":"gateway_migrated_to_mercadopago"}'::jsonb
WHERE "billing_provider" = 'abacatepay'
  AND "status" = 'payment_pending';

UPDATE "store_subscription_addons"
SET "status" = 'cancelled',
    "checkout_url" = NULL,
    "metadata" = COALESCE("metadata", '{}'::jsonb) || '{"invalidated_reason":"gateway_migrated_to_mercadopago"}'::jsonb,
    "updated_at" = now()
WHERE "provider" = 'abacatepay'
  AND "status" = 'payment_pending';
