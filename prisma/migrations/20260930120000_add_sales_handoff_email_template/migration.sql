INSERT INTO "email_templates" ("template_key", "name", "subject", "body", "variables", "is_active")
VALUES (
  'sales_handoff_required',
  'Interno: atendimento comercial necessário',
  'WhatsApp: atendimento necessário para {{business_name}}',
  'Uma conversa comercial precisa de atendimento humano.\n\nEstabelecimento: {{business_name}}\nTelefone: {{phone}}\nPergunta: {{question}}\nResumo: {{summary}}\nMotivo: {{reason}}\n\nConsulte o histórico pelo comando handoff:list.',
  ARRAY['business_name','phone','question','summary','reason'],
  true
)
ON CONFLICT ("template_key") DO NOTHING;
