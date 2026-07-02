# Plano das proximas fases SaaS

Este documento organiza as proximas fases do projeto multiempresa. A ideia e servir como roteiro de implementacao incremental: cada fase pode virar um prompt separado, sem reescrever funcionalidades que ja funcionam.

## Regras gerais

- Manter compatibilidade com a loja atual.
- Fazer alteracoes incrementais e testaveis.
- Reutilizar a arquitetura atual: `companies`, `stores`, `admin_user_store_access`, planos, recursos, assinaturas, auditoria e `store_id`.
- Nao quebrar delivery, retirada, mesa, comanda, cozinha, checkout, relatorios, WhatsApp, Pix, promocoes ou fidelidade.
- Toda nova rota admin deve exigir sessao administrativa.
- Toda rota operacional deve filtrar por `store_id`.
- Toda regra comercial deve filtrar por `company_id`.
- Ao final de cada fase, rodar:
  - `npm.cmd run test:syntax`
  - `npm.cmd run test:multitenant`
  - testes especificos da fase.

## Fase 1 - Seguranca e RLS final

Status: implementacao inicial concluida.

Entregue:

- Removida leitura publica direta de `store_settings`; o publico deve consumir apenas a API sanitizada.
- Adicionados indices de apoio para auditoria e tabelas operacionais por loja.
- Corrigida limpeza de fila para sempre filtrar por loja.
- Reforcado escopo de cliente/endereco por loja no cliente e no admin.
- Reforcado acesso de pedido por loja em reenvio de WhatsApp, reembolso e impressao.
- Reset de senha do cliente passou a validar pedido dentro da loja atual.

### Objetivo

Fechar o isolamento multiempresa no banco e no backend, evitando vazamento entre empresas/lojas.

### Escopo

- Revisar todas as rotas publicas e administrativas.
- Confirmar que toda consulta operacional usa `store_id`.
- Confirmar que toda consulta comercial usa `company_id`.
- Revisar tabelas com dados sensiveis:
  - `customers`
  - `customer_addresses`
  - `orders`
  - `order_items`
  - `customer_tabs`
  - `dining_tables`
  - `store_settings`
  - `admin_users`
  - `admin_user_store_access`
  - `company_subscriptions`
  - `company_feature_overrides`
  - `audit_logs`
- Criar ou revisar policies RLS no Supabase.
- Garantir que service role continue somente no servidor.
- Revisar logs para nao expor segredo, token, senha, telefone completo, endereco completo ou payload sensivel.

### Banco

- Revisar `supabase/schema.sql`.
- Criar policies por tabela.
- Adicionar indices faltantes para filtros por:
  - `store_id`
  - `company_id`
  - `customer_id`
  - `created_at`
  - `status`

### Backend

- Auditar `server.js`.
- Criar helpers de escopo quando necessario.
- Bloquear acesso cruzado entre empresas.
- Garantir que rotas platform exijam superadmin/plataforma.

### Testes

- Teste de acesso cruzado entre lojas.
- Teste de cliente tentando ver pedido de outra loja.
- Teste de admin tentando editar dado de outra empresa.
- Teste de endpoint sem sessao.
- Teste de endpoint com sessao de permissao insuficiente.

### Criterios de aceite

- Nenhuma rota admin retorna dado de outra empresa.
- Nenhuma rota publica retorna dado de outra loja.
- RLS ativo sem quebrar o backend.
- Testes de isolamento passam.

## Fase 2 - Testes E2E multiempresa

Status: implementacao inicial concluida.

Entregue:

- Criado `scripts/e2e-multitenant-flow.mjs`.
- Criado script `npm.cmd run test:e2e:multitenant`.
- O teste cria duas empresas, duas lojas, dois admins, cardapios separados, pedido publico, mudanca de status, relatorio e verificacao de isolamento.
- O teste limpa os dados temporarios ao final.

### Objetivo

Criar testes automatizados que validem o fluxo real ponta a ponta em ambiente local.

### Escopo

- Criar empresa A e loja A.
- Criar empresa B e loja B.
- Criar admin para cada empresa.
- Criar cardapio separado para cada loja.
- Cliente faz pedido na loja A.
- Admin da loja A recebe pedido.
- Admin move status.
- Cozinha visualiza pedido.
- Relatorio da loja A soma apenas pedidos da loja A.
- Loja B nao visualiza dados da loja A.

### Arquivos provaveis

- `scripts/multitenant-isolation-tests.mjs`
- Novo script: `scripts/e2e-multitenant-flow.mjs`
- `package.json`

### Testes

- Pedido completo.
- Admin por loja.
- Troca de loja no admin.
- Cozinha.
- Relatorios.
- Mesas/comandas.
- Promocoes/cupons.

### Criterios de aceite

- Script E2E roda com dados temporarios.
- Script limpa dados temporarios ao final.
- Falha se houver vazamento entre lojas.

## Fase 3 - Auditoria avancada

Status: implementacao inicial concluida.

Entregue:

- `audit_logs` recebeu `severity` e `request_id`.
- Auditoria passou a gravar IP e user-agent de forma padronizada.
- Payloads de auditoria passam por sanitizacao para remover senha, token, secrets e chaves.
- Registradas acoes criticas iniciais:
  - setup admin;
  - login admin;
  - troca de loja;
  - criacao/edicao de usuario admin;
  - alteracao de configuracoes da loja;
  - fidelidade;
  - impressao;
  - integracoes;
  - iniciar/parar operacao;
  - limpeza de fila;
  - mudanca de status de pedido;
  - reenvio de WhatsApp;
  - reembolso;
  - criacao de promocao;
  - criacao de categoria;
  - criacao de produto.
- `/platform` recebeu filtros basicos de auditoria por empresa, loja, acao e periodo.

### Objetivo

Registrar de forma clara as acoes criticas feitas no sistema.

### Escopo

Registrar auditoria para:

- Login admin.
- Criacao/edicao/desativacao de usuario admin.
- Troca de loja ativa.
- Criacao/edicao/suspensao de empresa.
- Criacao/edicao/suspensao de loja.
- Troca de plano.
- Excecoes de recursos.
- Alteracao de configuracoes da loja.
- Alteracao de integracoes.
- Criacao/edicao/exclusao de produto.
- Criacao/edicao/exclusao de promocao.
- Mudanca de status de pedido.
- Reset/fechamento de fila.
- Abertura/fechamento de caixa quando existir.

### Banco

Usar `audit_logs`.

Possiveis melhorias:

- `ip_address`
- `user_agent`
- `request_id`
- `severity`

### UI

- Melhorar a tela de auditoria em `/platform`.
- Filtros:
  - empresa;
  - loja;
  - usuario;
  - acao;
  - periodo.

### Testes

- Criar acao e verificar log.
- Confirmar que log nao salva senha/token.
- Confirmar que admin comum nao acessa auditoria global.

### Criterios de aceite

- Acoes criticas aparecem na auditoria.
- Dados sensiveis nao aparecem em texto aberto.
- Auditoria filtra por empresa/loja.

## Fase 4 - Fluxo comercial SaaS

Status: implementacao inicial concluida.

Entregue:

- Estados comerciais expandidos para `trial`, `active`, `payment_pending`, `grace_period`, `past_due`, `suspended`, `cancelled` e `archived`.
- `company_subscriptions` recebeu campos para provedor externo, assinatura externa e datas de pagamento/vencimento.
- Criada checagem centralizada de status comercial por empresa e por loja.
- Criacao de pedidos passa a bloquear empresas vencidas, suspensas, canceladas ou arquivadas.
- Rotas administrativas operacionais passam a respeitar bloqueio comercial, mantendo acesso a conta/plano.
- `createOrder` continua preservando dados atuais e nao apaga dados em downgrade ou suspensao.

### Objetivo

Transformar planos em um fluxo comercial utilizavel para operacao real.

### Escopo

Estados da empresa:

- `trial`
- `active`
- `payment_pending`
- `grace_period`
- `suspended`
- `cancelled`
- `archived`

Regras:

- Trial tem data de fim.
- Trial vencido entra em pendencia ou bloqueio.
- Empresa suspensa nao recebe novos pedidos.
- Empresa cancelada preserva dados, mas bloqueia operacao.
- Downgrade nao apaga dados, mas bloqueia novos usos acima do limite.
- Upgrade libera recursos imediatamente.

### Banco

- Revisar `company_subscriptions`.
- Revisar `subscription_events`.
- Talvez adicionar:
  - `billing_provider`
  - `external_subscription_id`
  - `last_payment_at`
  - `payment_due_at`

### Backend

- Centralizar checagem comercial.
- Aplicar bloqueios em:
  - criar pedido;
  - abrir loja;
  - criar produto;
  - criar usuario;
  - criar mesa;
  - criar promocao;
  - usar integracoes pagas.

### UI

- `/platform`:
  - trocar plano;
  - suspender;
  - reativar;
  - alterar fim do trial.
- Admin:
  - aviso de trial;
  - aviso de plano vencido;
  - tela "Meu plano" com status claro.

### Testes

- Trial ativo.
- Trial vencido.
- Suspensao.
- Reativacao.
- Downgrade com uso acima do limite.
- Upgrade.

### Criterios de aceite

- Estado comercial bloqueia corretamente.
- Admin recebe mensagem clara.
- Dados existentes nao sao apagados.

## Fase 5 - Dominios personalizados

Status: implementacao inicial concluida.

Entregue:

- Criada tabela `store_domains` vinculada a `store_id`, com status, token de verificacao e data de verificacao.
- Resolucao publica de loja agora considera `Host`, `x-forwarded-host` e `x-original-host` antes de slug/loja padrao.
- Slugs continuam funcionando como antes.
- Criados endpoints administrativos para listar, cadastrar, verificar e remover dominios.
- Admin > Loja recebeu secao "Dominio personalizado" com instrucoes de DNS e status.
- Teste E2E multiempresa valida que dominio personalizado resolve a loja correta.

Pendente para producao real:

- Validacao DNS automatica real por TXT/CNAME antes de ativar dominio. A versao atual prepara o fluxo e registra token, mas a verificacao ainda e operacional/manual.

### Objetivo

Permitir que uma loja use dominio proprio no cardapio publico.

### Escopo

- Criar tabela `store_domains`.
- Vincular dominio a `store_id`.
- Resolver loja por `Host`.
- Manter slug funcionando.
- Validar dominio antes de ativar.

### Banco

Tabela sugerida:

- `id`
- `store_id`
- `domain`
- `status`
- `verification_token`
- `verified_at`
- `created_at`
- `updated_at`

### Backend

- Atualizar resolucao de loja:
  - primeiro por dominio;
  - depois por slug;
  - depois loja padrao.
- Criar endpoints admin para:
  - cadastrar dominio;
  - verificar dominio;
  - remover dominio.

### UI

- Admin > Loja:
  - secao "Dominio personalizado".
  - instrucoes de DNS.
  - status de verificacao.

### Testes

- Resolver loja por dominio.
- Resolver loja por slug.
- Dominio nao verificado nao ativa.
- Dominio de uma loja nao vaza outra.

### Criterios de aceite

- Cardapio abre pelo dominio.
- Slug continua funcionando.
- Dominio duplicado nao e permitido.

## Fase 6 - Limites avancados

Status: implementacao inicial concluida.

Entregue:

- Criada tabela `usage_events` para historico detalhado de consumo.
- Registro de consumo passou a manter contadores agregados e eventos detalhados.
- Limites por plano foram expandidos para pedidos, WhatsApp manual/automatico, impressao, pagamentos online, dominios personalizados, usuarios admin e chamadas futuras de webhook.
- Criacao de pedidos valida limite mensal antes de inserir novo pedido.
- Impressao termica, WhatsApp e Pix online registram consumo.
- Dominios personalizados respeitam limite do plano.

Pendente para refinamento:

- Tela visual de barras de uso detalhadas por recurso no Admin > Meu plano.
- Contabilizacao real de webhooks externos quando os webhooks finais forem expandidos.

### Objetivo

Expandir os limites por plano para recursos que ainda nao foram totalmente medidos.

### Escopo

Medir e limitar:

- mensagens automaticas WhatsApp;
- pagamentos Pix online;
- impressoes termicas;
- lojas por empresa;
- usuarios por empresa;
- produtos por loja;
- pedidos por mes;
- mesas por loja;
- promocoes ativas;
- dominios personalizados;
- chamadas de API/webhook.

### Banco

Usar `company_usage_counters`.

Talvez adicionar:

- `usage_events` para log detalhado de consumo.

### Backend

- Criar helper unico:
  - verifica recurso;
  - verifica limite;
  - registra consumo.
- Aplicar em pontos sensiveis.

### UI

- Admin > Meu plano:
  - barra de uso por recurso.
- Platform:
  - uso por empresa;
  - reset/ajuste manual;
  - excecao temporaria.

### Testes

- Limite abaixo do uso.
- Limite atingido.
- Excecao `allow`.
- Excecao `block`.
- Excecao `limit`.

### Criterios de aceite

- Recurso bloqueia antes de gerar custo.
- Mensagem de erro e clara.
- Excecao manual funciona.

## Fase 7 - Documentacao final SaaS

Status: implementacao inicial concluida.

Entregue:

- Criado guia operacional SaaS em `docs/guia-operacao-saas.md`.
- Criado checklist de producao SaaS em `docs/checklist-producao-saas.md`.
- Este documento foi atualizado com status, entregas e pendencias por fase.

### Objetivo

Deixar o projeto pronto para operacao, deploy e manutencao.

### Documentos

- Guia de deploy.
- Guia de configuracao Supabase.
- Guia de criacao de empresa e loja.
- Guia de planos e recursos.
- Guia de permissao de usuarios.
- Guia de integracoes WhatsApp.
- Guia de integracoes Pix.
- Guia de backup.
- Checklist de seguranca.
- Checklist pre-producao.
- Runbook de incidentes.

### Criterios de aceite

- Um operador consegue criar uma empresa do zero.
- Um operador consegue suspender/reativar empresa.
- Um operador consegue investigar auditoria.
- Um operador consegue configurar loja, dominio, WhatsApp e Pix.
- O deploy tem checklist claro.

## Ordem recomendada

1. Fase 1 - Seguranca e RLS final.
2. Fase 2 - Testes E2E multiempresa.
3. Fase 3 - Auditoria avancada.
4. Fase 4 - Fluxo comercial SaaS.
5. Fase 6 - Limites avancados.
6. Fase 5 - Dominios personalizados.
7. Fase 7 - Documentacao final SaaS.

Dominios personalizados podem ser antecipados se a prioridade comercial for vender para lojas com marca propria.
