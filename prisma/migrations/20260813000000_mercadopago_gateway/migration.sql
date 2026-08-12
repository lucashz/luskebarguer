ALTER TABLE "payment_attempts" ALTER COLUMN "provider" SET DEFAULT 'mercadopago';
ALTER TABLE "payment_refunds" ALTER COLUMN "provider" SET DEFAULT 'mercadopago';
ALTER TABLE "platform_billing_settings" ALTER COLUMN "provider" SET DEFAULT 'mercadopago';

-- Credenciais da Abacate Pay não são válidas no Mercado Pago. A migração troca o
-- provedor, mas deixa a cobrança desligada até o Access Token ser informado.
UPDATE "platform_billing_settings"
SET "provider" = 'mercadopago',
    "api_key" = '',
    "webhook_secret" = '',
    "is_active" = false,
    "metadata" = COALESCE("metadata", '{}'::jsonb) || '{"migration":"mercadopago","credentials_required":true}'::jsonb,
    "updated_at" = now()
WHERE "provider" = 'abacatepay';

UPDATE "store_settings"
SET "integration_settings" = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(COALESCE("integration_settings", '{}'::jsonb), '{pix,provider}', '"mercadopago"'::jsonb, true),
      '{pix,enabled}', 'false'::jsonb, true
    ),
    '{pix,apiKey}', '""'::jsonb, true
  ),
  '{pix,webhookSecret}', '""'::jsonb, true
)
WHERE COALESCE("integration_settings"->'pix'->>'provider', '') = 'abacatepay';

UPDATE "plan_addons"
SET "description" = replace("description", 'Abacate Pay', 'Mercado Pago'),
    "settings" = replace("settings"::text, 'Abacate Pay', 'Mercado Pago')::jsonb
WHERE "description" ILIKE '%Abacate Pay%'
   OR "settings"::text ILIKE '%Abacate Pay%';

-- Pedidos, eventos, tentativas e estornos antigos mantêm o provedor original
-- para preservar a trilha financeira e permitir auditoria.
