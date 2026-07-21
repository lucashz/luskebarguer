INSERT INTO "email_templates" ("template_key", "name", "subject", "body", "variables")
VALUES
  ('internal_payment_refused', 'Interno: pagamento recusado', 'Alerta interno: pagamento recusado', 'Alerta comercial do TáPronto.

Um pagamento foi recusado.

Cliente: {{company_name}}
Loja: {{store_name}}
Plano: {{plan_name}}
Resumo: {{error_summary}}

Verifique a assinatura, cobrança e eventos do provedor no Platform:
{{platform_url}}', ARRAY['company_name','store_name','plan_name','error_summary','platform_url']),
  ('internal_account_suspended', 'Interno: conta suspensa', 'Alerta interno: conta suspensa', 'Alerta comercial do TáPronto.

Uma conta foi suspensa.

Cliente: {{company_name}}
Loja: {{store_name}}
Plano: {{plan_name}}
Resumo: {{error_summary}}

Confira o motivo, cobrança e histórico do cliente no Platform:
{{platform_url}}', ARRAY['company_name','store_name','plan_name','error_summary','platform_url']),
  ('internal_trial_expiring', 'Interno: trial vencendo', 'Alerta interno: trial perto do fim', 'Alerta comercial do TáPronto.

Um trial está perto do fim.

Cliente: {{company_name}}
Loja: {{store_name}}
Plano: {{plan_name}}
Vencimento: {{due_date}}

Entre em contato para orientar a contratação:
{{platform_url}}', ARRAY['company_name','store_name','plan_name','due_date','platform_url']),
  ('internal_trial_expired', 'Interno: trial encerrado', 'Alerta interno: trial encerrado', 'Alerta comercial do TáPronto.

Um trial terminou.

Cliente: {{company_name}}
Loja: {{store_name}}
Plano: {{plan_name}}
Vencimento: {{due_date}}

Verifique se o cliente deve ser acionado, bloqueado ou convertido:
{{platform_url}}', ARRAY['company_name','store_name','plan_name','due_date','platform_url']),
  ('internal_plan_changed', 'Interno: plano alterado', 'Alerta interno: plano alterado', 'Alerta comercial do TáPronto.

Um plano foi alterado.

Cliente: {{company_name}}
Loja: {{store_name}}
Novo plano: {{plan_name}}
Resumo: {{error_summary}}

Confira assinatura, MRR e auditoria no Platform:
{{platform_url}}', ARRAY['company_name','store_name','plan_name','error_summary','platform_url'])
ON CONFLICT ("template_key") DO NOTHING;
