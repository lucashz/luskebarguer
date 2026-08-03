CREATE TABLE IF NOT EXISTS access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  page_type text NOT NULL DEFAULT 'page',
  path text NOT NULL DEFAULT '/',
  referrer_host text,
  device_type text,
  visitor_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS access_events_created_at_idx
  ON access_events(created_at DESC);

CREATE INDEX IF NOT EXISTS access_events_store_created_at_idx
  ON access_events(store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS access_events_company_created_at_idx
  ON access_events(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS access_events_page_created_at_idx
  ON access_events(page_type, created_at DESC);
