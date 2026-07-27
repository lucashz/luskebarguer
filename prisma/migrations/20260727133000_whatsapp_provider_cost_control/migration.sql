CREATE TABLE IF NOT EXISTS platform_whatsapp_provider_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'evolution',
  status text NOT NULL DEFAULT 'inactive',
  balance_cents integer NOT NULL DEFAULT 0,
  instance_cost_cents integer NOT NULL DEFAULT 2990,
  low_balance_cents integer NOT NULL DEFAULT 2990,
  billing_cycle_days integer NOT NULL DEFAULT 30,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_whatsapp_provider_accounts_provider_status_idx
  ON platform_whatsapp_provider_accounts(provider, status);

ALTER TABLE store_whatsapp_integrations
  ADD COLUMN IF NOT EXISTS monthly_cost_cents integer NOT NULL DEFAULT 2990,
  ADD COLUMN IF NOT EXISTS next_billing_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'pending';

CREATE TABLE IF NOT EXISTS whatsapp_instance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES store_whatsapp_integrations(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'evolution',
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'info',
  cost_cents integer NOT NULL DEFAULT 0,
  message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_instance_events_store_created_idx
  ON whatsapp_instance_events(store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS whatsapp_instance_events_provider_event_created_idx
  ON whatsapp_instance_events(provider, event_type, created_at DESC);
