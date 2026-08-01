ALTER TABLE platform_whatsapp_settings
  ALTER COLUMN provider SET DEFAULT 'evolution_go';

UPDATE platform_whatsapp_settings
SET provider = 'evolution_go'
WHERE provider = 'evolution';

ALTER TABLE platform_whatsapp_provider_accounts
  ALTER COLUMN provider SET DEFAULT 'evolution_go';

UPDATE platform_whatsapp_provider_accounts
SET provider = 'evolution_go'
WHERE provider = 'evolution';

ALTER TABLE store_whatsapp_integrations
  ALTER COLUMN provider SET DEFAULT 'evolution_go';

WITH duplicated_integrations AS (
  SELECT old.id AS old_id, current.id AS current_id
  FROM store_whatsapp_integrations old
  JOIN store_whatsapp_integrations current
    ON current.store_id = old.store_id
   AND current.provider = 'evolution_go'
  WHERE old.provider = 'evolution'
)
UPDATE store_whatsapp_integrations current
SET
  company_id = COALESCE(current.company_id, old.company_id),
  instance_id = COALESCE(current.instance_id, old.instance_id),
  instance_token = COALESCE(current.instance_token, old.instance_token),
  status = CASE WHEN current.status = 'disconnected' THEN old.status ELSE current.status END,
  phone_number = COALESCE(current.phone_number, old.phone_number),
  qr_code_base64 = COALESCE(current.qr_code_base64, old.qr_code_base64),
  last_qr_at = COALESCE(current.last_qr_at, old.last_qr_at),
  connected_at = COALESCE(current.connected_at, old.connected_at),
  disconnected_at = COALESCE(current.disconnected_at, old.disconnected_at),
  last_error = COALESCE(current.last_error, old.last_error),
  monthly_message_count = GREATEST(current.monthly_message_count, old.monthly_message_count),
  next_billing_at = COALESCE(current.next_billing_at, old.next_billing_at),
  billing_status = CASE WHEN current.billing_status = 'pending' THEN old.billing_status ELSE current.billing_status END,
  updated_at = NOW()
FROM store_whatsapp_integrations old
JOIN duplicated_integrations duplicated
  ON duplicated.old_id = old.id
WHERE current.id = duplicated.current_id;

DELETE FROM store_whatsapp_integrations old
USING store_whatsapp_integrations current
WHERE old.store_id = current.store_id
  AND old.provider = 'evolution'
  AND current.provider = 'evolution_go';

UPDATE store_whatsapp_integrations
SET provider = 'evolution_go'
WHERE provider = 'evolution';

ALTER TABLE whatsapp_instance_events
  ALTER COLUMN provider SET DEFAULT 'evolution_go';

UPDATE whatsapp_instance_events
SET provider = 'evolution_go'
WHERE provider = 'evolution';

ALTER TABLE whatsapp_message_logs
  ALTER COLUMN provider SET DEFAULT 'evolution_go';

UPDATE whatsapp_message_logs
SET provider = 'evolution_go'
WHERE provider = 'evolution';

UPDATE plan_addons
SET settings = COALESCE(settings, '{}'::jsonb) || '{"provider":"evolution_go"}'::jsonb
WHERE code = 'whatsapp_automatic'
  AND COALESCE(settings->>'provider', '') = 'evolution';
