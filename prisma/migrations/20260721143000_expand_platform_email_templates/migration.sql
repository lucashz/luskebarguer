INSERT INTO "email_templates" ("template_key", "name", "subject", "body", "variables")
VALUES
  ('onboarding_incomplete', 'Onboarding incompleto', 'Finalize a configuração da sua loja', 'Olá {{company_name}},

Sua loja {{store_name}} ainda não está totalmente configurada.

Finalize o onboarding para ajustar horários, pagamentos, entrega e cardápio inicial:
{{dashboard_url}}

Isso ajuda sua loja a ficar pronta para receber pedidos sem retrabalho.', ARRAY['store_name','company_name','dashboard_url']),
  ('store_published', 'Loja publicada', 'Seu cardápio já está publicado', 'Olá {{company_name}},

Boa notícia: o cardápio da {{store_name}} foi publicado com sucesso.

Você já pode compartilhar o link com seus clientes:
{{cardapio_url}}

Acompanhe os pedidos pelo painel:
{{dashboard_url}}', ARRAY['store_name','company_name','cardapio_url','dashboard_url']),
  ('first_order_received', 'Primeiro pedido recebido', 'Seu primeiro pedido chegou', 'Olá {{company_name}},

A loja {{store_name}} recebeu o primeiro pedido pelo cardápio digital.

Pedido: {{order_id}}
Valor: {{order_total}}

Acesse o painel para acompanhar o preparo, entrega e conclusão:
{{dashboard_url}}', ARRAY['store_name','company_name','order_id','order_total','dashboard_url']),
  ('trial_expired', 'Trial encerrado', 'Seu teste grátis terminou', 'Olá {{company_name}},

O período de teste da loja {{store_name}} terminou.

Para continuar usando o cardápio, pedidos e recursos do painel, contrate um plano mensal:
{{payment_url}}

Se precisar de ajuda para escolher o melhor plano, fale com o suporte.', ARRAY['store_name','company_name','payment_url']),
  ('payment_refused', 'Pagamento recusado', 'Não foi possível aprovar seu pagamento', 'Olá {{company_name}},

O pagamento do plano {{plan_name}} não foi aprovado.

Confira os dados de pagamento ou tente novamente pelo painel:
{{payment_url}}

Sua assinatura pode entrar em período de tolerância até a regularização.', ARRAY['company_name','plan_name','payment_url']),
  ('account_reactivated', 'Conta reativada', 'Sua conta foi reativada', 'Olá {{company_name}},

Sua conta foi reativada e a loja {{store_name}} já pode voltar a operar.

Acesse o painel para conferir o status da assinatura e continuar recebendo pedidos:
{{dashboard_url}}', ARRAY['store_name','company_name','dashboard_url']),
  ('support_ticket_closed', 'Chamado encerrado', 'Seu chamado foi encerrado', 'Olá {{customer_name}},

O chamado "{{ticket_subject}}" foi encerrado pela equipe de suporte.

Se precisar continuar o atendimento, acesse o histórico e envie uma nova mensagem:
{{support_url}}

Obrigado pelo retorno.', ARRAY['customer_name','ticket_subject','support_url']),
  ('account_created_not_published', 'Conta sem publicação', 'Sua loja ainda não foi publicada', 'Olá {{company_name}},

Percebemos que sua conta foi criada, mas o cardápio da {{store_name}} ainda não está publicado.

Publique sua loja para começar a divulgar o link e receber pedidos:
{{dashboard_url}}

Se quiser, podemos ajudar nos primeiros ajustes.', ARRAY['store_name','company_name','dashboard_url']),
  ('store_published_no_orders', 'Loja publicada sem pedidos', 'Vamos ajudar sua loja a receber pedidos', 'Olá {{company_name}},

Seu cardápio já está publicado, mas ainda não encontramos pedidos recentes na {{store_name}}.

Confira produtos, formas de pagamento, WhatsApp e compartilhe o link com seus clientes:
{{cardapio_url}}

Acesse o painel para revisar tudo:
{{dashboard_url}}', ARRAY['store_name','company_name','cardapio_url','dashboard_url']),
  ('plan_limit_warning', 'Limite do plano próximo', 'Sua loja está perto do limite do plano', 'Olá {{company_name}},

A loja {{store_name}} está perto do limite de {{limit_name}} do plano {{plan_name}}.

Uso atual: {{usage_count}}
Limite: {{limit_value}}

Para continuar crescendo sem bloqueios, avalie um upgrade:
{{payment_url}}', ARRAY['store_name','company_name','plan_name','limit_name','usage_count','limit_value','payment_url']),
  ('plan_upgrade_suggestion', 'Sugestão de upgrade', 'Existe um plano melhor para sua operação', 'Olá {{company_name}},

Pelo uso recente da loja {{store_name}}, o plano {{plan_name}} pode estar limitando sua operação.

Um plano superior pode liberar mais produtos, pedidos, mesas, relatórios e recursos avançados.

Confira as opções no painel:
{{payment_url}}', ARRAY['store_name','company_name','plan_name','payment_url']),
  ('plan_changed', 'Plano alterado', 'Seu plano foi alterado para {{plan_name}}', 'Olá {{company_name}},

O plano da loja {{store_name}} foi alterado para {{plan_name}}.

Os recursos e limites já foram atualizados no painel:
{{dashboard_url}}

Consulte o histórico de cobrança para acompanhar os detalhes.', ARRAY['store_name','company_name','plan_name','dashboard_url']),
  ('cancellation_received', 'Cancelamento recebido', 'Recebemos sua solicitação de cancelamento', 'Olá {{company_name}},

Recebemos a solicitação de cancelamento da loja {{store_name}}.

Nossa equipe vai revisar a assinatura e confirmar os próximos passos.

Se o cancelamento foi um engano ou se podemos ajudar com algum ajuste, responda este e-mail ou abra um chamado:
{{support_url}}', ARRAY['store_name','company_name','support_url']),
  ('satisfaction_survey', 'Pesquisa de satisfação', 'Como foi sua experiência com o suporte?', 'Olá {{customer_name}},

Queremos saber como foi sua experiência com o atendimento.

Se puder, avalie rapidamente o suporte recebido:
{{rating_url}}

Sua opinião ajuda a melhorar o sistema e o atendimento.', ARRAY['customer_name','rating_url']),
  ('backup_failed', 'Backup falhou', 'Alerta: falha no backup da plataforma', 'Alerta operacional do TáPronto.

A rotina de backup falhou ou está atrasada.

Resumo: {{error_summary}}
Período: {{period}}

Acesse o Platform para verificar Saúde e Serviços:
{{platform_url}}', ARRAY['error_summary','period','platform_url']),
  ('webhook_failed', 'Webhook falhou', 'Alerta: webhook com falha', 'Alerta operacional do TáPronto.

Um webhook apresentou falha de processamento.

Provedor: {{provider}}
Evento: {{event_id}}
Resumo: {{error_summary}}

Verifique logs, assinatura do webhook e eventos financeiros no Platform:
{{platform_url}}', ARRAY['provider','event_id','error_summary','platform_url']),
  ('smtp_failed', 'SMTP com erro', 'Alerta: envio de e-mail com falha', 'Alerta operacional do TáPronto.

O SMTP apresentou falha no envio ou teste de entrega.

Resumo: {{error_summary}}

Acesse Comunicação no Platform para revisar host, porta, TLS, usuário e senha de app:
{{platform_url}}', ARRAY['error_summary','platform_url']),
  ('critical_support_ticket', 'Chamado crítico aberto', 'Chamado crítico aberto no suporte', 'Um chamado crítico foi aberto no Platform.

Cliente: {{company_name}}
Loja: {{store_name}}
Assunto: {{ticket_subject}}

Acesse a central de atendimentos para responder com prioridade:
{{support_url}}', ARRAY['company_name','store_name','ticket_subject','support_url']),
  ('delinquent_support_ticket', 'Inadimplente abriu chamado', 'Cliente inadimplente abriu chamado', 'Um cliente com pendência financeira abriu chamado.

Cliente: {{company_name}}
Loja: {{store_name}}
Plano: {{plan_name}}
Assunto: {{ticket_subject}}

Verifique cobrança, assinatura e atendimento:
{{support_url}}', ARRAY['company_name','store_name','plan_name','ticket_subject','support_url'])
ON CONFLICT ("template_key") DO NOTHING;

UPDATE "email_templates"
SET "variables" = ARRAY[
  'store_name',
  'company_name',
  'customer_name',
  'plan_name',
  'due_date',
  'dashboard_url',
  'payment_url',
  'support_url',
  'cardapio_url',
  'platform_url',
  'order_id',
  'order_total',
  'ticket_subject',
  'rating_url',
  'limit_name',
  'usage_count',
  'limit_value',
  'period',
  'provider',
  'event_id',
  'error_summary'
]
WHERE "template_key" IN (
  'welcome',
  'password_recovery',
  'trial_ending',
  'payment_pending',
  'payment_approved',
  'account_suspended'
);
