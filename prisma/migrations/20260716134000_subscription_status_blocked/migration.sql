DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'blocked'
      AND enumtypid = '"SubscriptionStatus"'::regtype
  ) THEN
    ALTER TYPE "SubscriptionStatus" ADD VALUE 'blocked';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'past_due'
      AND enumtypid = '"SubscriptionStatus"'::regtype
  ) THEN
    ALTER TYPE "SubscriptionStatus" ADD VALUE 'past_due';
  END IF;
END $$;
