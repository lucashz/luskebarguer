CREATE TABLE IF NOT EXISTS platform_whatsapp_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'evolution',
  base_url text,
  api_key_encrypted text,
  is_active boolean NOT NULL DEFAULT false,
  last_test_status text,
  last_test_at timestamptz,
  last_test_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS store_whatsapp_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'evolution',
  instance_name text NOT NULL,
  instance_id text,
  status text NOT NULL DEFAULT 'disconnected',
  phone_number text,
  qr_code_base64 text,
  last_qr_at timestamptz,
  connected_at timestamptz,
  disconnected_at timestamptz,
  last_error text,
  monthly_message_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_whatsapp_integrations_store_provider_key UNIQUE (store_id, provider),
  CONSTRAINT store_whatsapp_integrations_instance_name_key UNIQUE (instance_name)
);

CREATE INDEX IF NOT EXISTS store_whatsapp_integrations_company_idx ON store_whatsapp_integrations(company_id, status, updated_at);
CREATE INDEX IF NOT EXISTS store_whatsapp_integrations_store_idx ON store_whatsapp_integrations(store_id, status);

CREATE TABLE IF NOT EXISTS whatsapp_message_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'evolution',
  instance_name text,
  destination_phone text,
  message_type text NOT NULL DEFAULT 'order_status',
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_message_logs_store_created_idx ON whatsapp_message_logs(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_message_logs_order_idx ON whatsapp_message_logs(order_id, created_at DESC);
