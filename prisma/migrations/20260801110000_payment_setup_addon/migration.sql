INSERT INTO plan_addons (
  code,
  name,
  description,
  feature_code,
  monthly_price_cents,
  provider_cost_cents,
  available_plan_codes,
  included_plan_codes,
  sort_order,
  settings
) VALUES (
  'payment_setup_assisted',
  'Configuração Assistida do Pix Online',
  'Ajuda da equipe TáPronto para configurar Abacate Pay, API key, webhook e teste de pagamento online da loja.',
  null,
  7990,
  0,
  ARRAY['essential', 'professional'],
  ARRAY['premium'],
  20,
  '{"billing_type":"one_time","commercial_label":"Configuração assistida do Pix online","provider":"abacatepay","support_category":"Pagamento online","service_type":"assisted_setup","support_subject":"Configurar pagamento online com Abacate Pay"}'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  feature_code = EXCLUDED.feature_code,
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  provider_cost_cents = EXCLUDED.provider_cost_cents,
  available_plan_codes = EXCLUDED.available_plan_codes,
  included_plan_codes = EXCLUDED.included_plan_codes,
  sort_order = EXCLUDED.sort_order,
  settings = plan_addons.settings || EXCLUDED.settings,
  is_active = true,
  updated_at = now();
