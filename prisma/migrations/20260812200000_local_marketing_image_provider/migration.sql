ALTER TABLE "marketing_autopilot_runs"
  DROP CONSTRAINT IF EXISTS "marketing_autopilot_runs_provider_check";

ALTER TABLE "marketing_autopilot_runs"
  ADD CONSTRAINT "marketing_autopilot_runs_provider_check"
  CHECK ("provider" IN ('openai', 'simulation', 'local'));
