CREATE TABLE IF NOT EXISTS admin_tour_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  tour_key text NOT NULL,
  current_step text NOT NULL DEFAULT 'operation',
  completed_at timestamptz,
  skipped_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_tour_progress_admin_store_key_unique UNIQUE (admin_user_id, store_id, tour_key)
);

CREATE INDEX IF NOT EXISTS admin_tour_progress_store_tour_idx
  ON admin_tour_progress (store_id, tour_key);

CREATE INDEX IF NOT EXISTS admin_tour_progress_admin_tour_idx
  ON admin_tour_progress (admin_user_id, tour_key);
