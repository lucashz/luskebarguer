ALTER TABLE store_whatsapp_integrations
  ADD COLUMN IF NOT EXISTS instance_token TEXT;
