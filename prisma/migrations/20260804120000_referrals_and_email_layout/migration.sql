CREATE TABLE IF NOT EXISTS referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS referral_codes_company_active_idx
  ON referral_codes(company_id)
  WHERE is_active = true AND company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS referral_codes_store_idx
  ON referral_codes(store_id, is_active);

CREATE TABLE IF NOT EXISTS referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code_id uuid REFERENCES referral_codes(id) ON DELETE SET NULL,
  code text NOT NULL,
  referrer_company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  referrer_store_id uuid REFERENCES stores(id) ON DELETE SET NULL,
  referred_company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  referred_store_id uuid REFERENCES stores(id) ON DELETE SET NULL,
  referred_email text,
  status text NOT NULL DEFAULT 'signed_up',
  signed_up_at timestamptz NOT NULL DEFAULT now(),
  first_paid_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS referrals_referred_company_once_idx
  ON referrals(referred_company_id)
  WHERE referred_company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS referrals_referrer_company_idx
  ON referrals(referrer_company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS referrals_status_idx
  ON referrals(status, created_at DESC);

CREATE TABLE IF NOT EXISTS referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid REFERENCES referrals(id) ON DELETE CASCADE,
  referrer_company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  referrer_store_id uuid REFERENCES stores(id) ON DELETE SET NULL,
  amount_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'available',
  reason text,
  applied_billing_event_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS referral_rewards_referral_once_idx
  ON referral_rewards(referral_id);

CREATE INDEX IF NOT EXISTS referral_rewards_referrer_company_idx
  ON referral_rewards(referrer_company_id, status, created_at DESC);
