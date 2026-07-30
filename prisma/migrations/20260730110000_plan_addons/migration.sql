CREATE TABLE IF NOT EXISTS plan_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  feature_code text,
  monthly_price_cents integer NOT NULL DEFAULT 0,
  provider_cost_cents integer NOT NULL DEFAULT 0,
  available_plan_codes text[] NOT NULL DEFAULT '{}',
  included_plan_codes text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS store_subscription_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES company_subscriptions(id) ON DELETE SET NULL,
  addon_id uuid NOT NULL REFERENCES plan_addons(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'payment_pending',
  provider text,
  external_transaction_id text,
  checkout_url text,
  current_period_starts_at timestamptz,
  current_period_ends_at timestamptz,
  next_renewal_at timestamptz,
  activated_at timestamptz,
  cancelled_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS store_subscription_addons_company_status_idx
  ON store_subscription_addons(company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS store_subscription_addons_store_status_idx
  ON store_subscription_addons(store_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS store_subscription_addons_active_unique
  ON store_subscription_addons(store_id, addon_id)
  WHERE status IN ('active', 'payment_pending', 'grace_period', 'past_due');

CREATE TABLE IF NOT EXISTS addon_billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  subscription_addon_id uuid REFERENCES store_subscription_addons(id) ON DELETE SET NULL,
  addon_id uuid REFERENCES plan_addons(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  amount_cents integer NOT NULL DEFAULT 0,
  provider text,
  external_event_id text,
  external_transaction_id text,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS addon_billing_events_company_created_idx
  ON addon_billing_events(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS addon_billing_events_store_created_idx
  ON addon_billing_events(store_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS addon_billing_events_provider_event_unique
  ON addon_billing_events(provider, external_event_id)
  WHERE provider IS NOT NULL AND external_event_id IS NOT NULL;

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
  'whatsapp_automatic',
  'WhatsApp Automático',
  'Envio automático de pedidos e mensagens operacionais por WhatsApp conectado via QR Code.',
  'automatic_whatsapp',
  4990,
  2990,
  ARRAY['professional'],
  ARRAY['premium'],
  10,
  '{"provider":"evolution","commercial_label":"WhatsApp automático como adicional"}'::jsonb
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
