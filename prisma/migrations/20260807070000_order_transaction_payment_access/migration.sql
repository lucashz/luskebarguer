ALTER TABLE orders
  ADD COLUMN payment_access_token_hash text,
  ADD COLUMN payment_access_expires_at timestamptz;

CREATE TABLE promotion_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'reserved',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX promotion_redemptions_promotion_status_created_idx
  ON promotion_redemptions (promotion_id, status, created_at);
CREATE INDEX promotion_redemptions_promotion_customer_status_idx
  ON promotion_redemptions (promotion_id, customer_id, status);
