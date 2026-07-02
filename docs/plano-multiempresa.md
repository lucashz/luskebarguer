# Plano de migracao para plataforma multiempresa

Este plano transforma o sistema atual de loja unica em uma plataforma multiempresa, preservando a Luske Burguer e todas as funcionalidades existentes. A implementacao deve ser feita por fases, com migrations reversiveis quando possivel, testes de isolamento e sem liberar duas lojas reais antes de todos os dados operacionais estarem escopados por loja.

## Status da implementacao

Implementado nesta fase:

- Estrutura base de `companies`, `stores`, planos, recursos, assinaturas, auditoria e acessos por loja.
- Backfill da loja atual para a empresa/loja padrao.
- Resolucao de loja por slug publico e por loja ativa no admin.
- Seletor de loja no painel administrativo.
- Endpoints publicos e administrativos principais escopados por `store_id`.
- Painel interno `/platform` para superadmin gerenciar empresas, lojas, status e plano.
- Aba "Meu plano" no admin com assinatura, recursos e uso resumido.
- Papeis administrativos ampliados: superadmin, administrador, garcom, atendimento, entrega e cozinha.
- Excecoes por empresa/recurso no `/platform`: liberar, bloquear ou limitar.
- Bloqueios reais por limite de plano para produtos, promocoes, mesas, usuarios administrativos e multiunidade.
- Contadores mensais em `company_usage_counters` atualizados nos principais pontos de criacao.
- Teste automatizado basico de isolamento do cardapio entre lojas.

Ainda pendente antes de vender como SaaS completo:

- Expandir limites duros para todos os recursos futuros, como pagamentos, WhatsApp automatico e impressoes.
- RLS final revisada no Supabase com claims reais por loja.
- Testes E2E cobrindo login, troca de loja, pedido, relatorio, mesa e cupom em lojas diferentes.
- Auditoria mais detalhada para todas as acoes criticas do admin.
- Fluxo comercial completo de trial, inadimplencia, reativacao e downgrade.

## Diagnostico atual

O projeto hoje funciona como uma unica loja:

- `store_settings` guarda uma unica configuracao global da loja.
- `admin_users` e `customers` sao globais.
- `menu_categories`, `menu_items`, `menu_modifier_groups` e `menu_modifiers` nao possuem loja.
- `orders`, `order_items`, `order_print_logs`, `order_whatsapp_logs` e `order_payment_events` nao possuem loja.
- `dining_tables` e `customer_tabs` nao possuem loja.
- `promotions`, `loyalty_program`, `print_settings` e `integration_settings` estao ligados ao registro unico de `store_settings`.
- Endpoints publicos como `/api/store`, `/api/menu`, `/api/orders` assumem a loja unica.
- Endpoints admin como `/api/admin/orders`, `/api/admin/menu-data`, `/api/admin/tables`, `/api/admin/store`, `/api/admin/promotions` consultam dados globais.
- Indices unicos globais como `customers_phone_unique_idx`, `admin_users_email_unique_idx`, `orders_public_code_unique_idx`, `promotions_code_unique_idx` precisarao virar unicos por empresa ou loja.

Arquivos principais afetados:

- `supabase/schema.sql`
- `server.js`
- `public/admin.js`
- `public/admin.html`
- `public/app.js`
- `public/account.js`
- `public/orders.js`
- `public/payment.js`
- `public/kitchen.js`
- `scripts/apply-schema.mjs`
- `scripts/local-audit.mjs`
- `scripts/sql-injection-tests.mjs`
- `README.md`
- documentos em `docs/`

## Principios da migracao

- Nao apagar dados existentes.
- Criar uma empresa e uma loja padrao para vincular todos os dados atuais.
- Adicionar colunas novas como nullable primeiro, preencher, depois tornar obrigatorias.
- Nunca depender apenas do frontend para bloquear modulo, plano ou loja.
- Todo endpoint deve resolver a loja ativa antes de consultar ou alterar dados.
- Todo dado operacional deve ter `store_id`.
- Todo dado comercial ou de assinatura deve ter `company_id`.
- Toda regra de plano deve passar por uma funcao central de autorizacao.
- Downgrade bloqueia novos usos, mas preserva historico.
- Suspensao bloqueia operacoes sensiveis, mas preserva dados.

## Modelo alvo

### Empresa

Tabela: `companies`

Campos principais:

- `id`
- `name`
- `document`
- `billing_email`
- `phone`
- `status`
- `created_at`
- `updated_at`

Estados:

- `active`
- `trial`
- `past_due`
- `suspended`
- `cancelled`
- `archived`

### Loja

Tabela: `stores`

Campos principais:

- `id`
- `company_id`
- `name`
- `slug`
- `description`
- `page_title`
- `favicon_url`
- `logo_url`
- `cover_url`
- `address`
- `phone`
- `whatsapp_number`
- `is_open`
- `accepts_delivery`
- `accepts_pickup`
- `delivery_fee`
- `delivery_neighborhood_fees`
- `minimum_order`
- `payment_methods`
- `business_hours`
- `theme_settings`
- `print_settings`
- `integration_settings`
- `onboarding_completed`
- `created_at`
- `updated_at`

Regra:

- `slug` deve ser unico globalmente.
- Futuramente pode haver `custom_domains`.

### Usuarios administrativos

Manter `admin_users`, mas adicionar relacionamento com empresa e lojas.

Tabela nova: `admin_user_store_access`

Campos:

- `id`
- `admin_user_id`
- `company_id`
- `store_id`
- `role`
- `permissions`
- `is_active`
- `created_at`
- `updated_at`

Regras:

- O usuario pode acessar uma ou mais lojas.
- A sessao admin precisa guardar ou resolver a loja ativa.
- O papel do usuario e diferente das funcionalidades do plano.

### Planos e funcionalidades

Tabelas novas:

- `platform_features`
- `subscription_plans`
- `plan_features`
- `company_subscriptions`
- `company_feature_overrides`
- `company_usage_counters`
- `subscription_events`
- `audit_logs`

Funcao central:

- `canUseFeature(admin, storeId, featureCode, action, usageDelta = 0)`

Essa funcao deve validar:

1. Empresa ativa.
2. Assinatura valida.
3. Plano libera funcionalidade.
4. Excecao especifica da empresa.
5. Permissao do usuario.
6. Loja pertence a empresa.
7. Limite disponivel.
8. Integracao necessaria configurada.
9. Recurso ativo na loja.

## Fase 1 - Fundacao segura de banco

Objetivo: preparar o banco sem alterar comportamento visivel.

1. Criar tabelas:
   - `companies`
   - `stores`
   - `admin_user_store_access`
   - `platform_features`
   - `subscription_plans`
   - `plan_features`
   - `company_subscriptions`
   - `company_feature_overrides`
   - `company_usage_counters`
   - `subscription_events`
   - `audit_logs`

2. Criar empresa e loja padrao:
   - Empresa: `Luske Alimentacao`
   - Loja: `LSK BURGUER`
   - Slug: `luske-burguer`

3. Adicionar `store_id` nas tabelas operacionais:
   - `store_settings`
   - `menu_categories`
   - `menu_items`
   - `orders`
   - `dining_tables`
   - `customer_tabs`
   - `promotions`
   - `order_print_logs`
   - `order_whatsapp_logs`
   - `order_payment_events`

4. Adicionar `company_id` ou `store_id` conforme necessidade:
   - `admin_users`
   - `customers`
   - `customer_addresses`
   - `app_sessions`

5. Preencher todos os registros atuais com a loja padrao.

6. Alterar indices unicos:
   - `customers(phone)` vira unico por loja ou empresa.
   - `admin_users(email)` pode continuar global ou virar vinculo global com acessos por loja.
   - `orders(public_code)` deve ser unico por loja.
   - `promotions(code)` deve ser unico por loja.
   - `dining_tables(code)` deve ser unico por loja.

7. Criar indices compostos:
   - `orders(store_id, status, archived_at, created_at desc)`
   - `orders(store_id, customer_id, created_at desc)`
   - `menu_categories(store_id, is_active, sort_order, name)`
   - `menu_items(store_id, category_id, is_available, sort_order, name)`
   - `customers(store_id, phone)`
   - `promotions(store_id, code)`
   - `dining_tables(store_id, is_active, name)`

Aceite da fase:

- Sistema continua funcionando como loja unica.
- Todos os registros existentes possuem `store_id`.
- Nenhuma consulta publica ou admin ainda mistura dados quando filtrada manualmente.

## Fase 2 - Resolvedor de loja

Objetivo: toda requisicao saber qual loja esta usando.

Status: implementado parcialmente em 2026-06-30.

Entregue:

- Resolucao publica por `?store=slug`, header `x-store-slug`, referer e fallback para a loja padrao.
- Cache de `store_settings`, bootstrap e menu separado por loja.
- Rotas publicas principais usando loja resolvida: `/api/store`, `/api/menu`, `/api/bootstrap`, `/api/orders`, `/api/tables/resolve`.
- Rotas publicas com slug: `/{slug}`, `/{slug}/pedidos`, `/{slug}/conta`, `/{slug}/pagamento`.
- Front publico preservando slug nas chamadas de API e nos links internos.
- Sessao admin enriquecida com `active_store`, `store_id`, `company_id` e lojas disponiveis.
- Endpoint de troca de loja ativa no admin.
- Seletor de loja no cabecalho do admin quando o usuario possuir mais de uma loja.
- Teste automatizado `npm run test:multitenant` validando isolamento de cardapio por slug.

Ainda pendente nesta fase:

- Subdominio e dominio personalizado.
- Tela completa de cadastro visual de empresas/lojas.
- Seletor de loja com permissoes especificas por papel em cada loja.

Implementar em `server.js`:

- `resolvePublicStore(req, url)`
- `resolveAdminStore(req, res, requiredPermission)`
- `getActiveAdminContext(req)`

Fontes de resolucao publica:

1. Caminho publico: `/luske-burguer`
2. Query temporaria: `?store=luske-burguer`
3. QR de mesa: codigo da mesa resolve loja.
4. Fallback temporario: loja padrao, somente durante migracao.

Fontes de resolucao admin:

1. Sessao admin.
2. Loja ativa salva na sessao.
3. Primeira loja autorizada se houver apenas uma.
4. Se houver varias, exigir seletor de loja.

Endpoints afetados:

- `/api/bootstrap`
- `/api/store`
- `/api/menu`
- `/api/orders`
- `/api/tables/resolve`
- `/api/customer/*`
- `/api/admin/*`
- `/api/payments/*`

Aceite da fase:

- `/api/store?store=luske-burguer` retorna somente a loja correta.
- Admin recebe `active_store` e `available_stores`.
- Troca de loja ativa altera todos os dados carregados no painel.

## Fase 3 - Escopo por loja em todas as consultas

Objetivo: impedir mistura de dados.

Atualizar funcoes do backend para receber `storeId`:

- `getStoreSettings(storeId)`
- `getPublicBootstrap(storeId)`
- `getMenu(admin, storeId)`
- `createOrder(req, data, storeId)`
- `listOrders(storeId)`
- `listCustomerOrders(customerId, storeId)`
- `listCustomers(storeId)`
- `listPromotions(storeId)`
- `listAdminTablesData(storeId)`
- `dailyOrderReport(storeId, date)`
- `rangeOrderReport(storeId, filters)`
- `updateStoreSettings(storeId, data)`
- `updateIntegrationSettings(storeId, data)`
- `updatePrintSettings(storeId, data)`
- `sendOrderStatusWhatsapp(orderId, status, context)`

Regras:

- Nenhuma funcao deve chamar `getStoreSettings()` sem `storeId`, exceto fallback controlado de migracao.
- Toda alteracao admin deve validar que o recurso pertence a loja ativa.
- Todo pedido deve gravar `store_id`.
- Todo upload deve salvar caminho por loja: `stores/{storeId}/...`.

Aceite da fase:

- Criar duas lojas no banco e confirmar que menu, pedidos, mesas, cupons e relatorios nao vazam.

## Fase 4 - Frontend publico por loja

Objetivo: cliente final acessar uma loja especifica.

Rotas publicas:

- `/luske-burguer`
- `/luske-burguer/pedidos`
- `/luske-burguer/conta`
- `/luske-burguer/payment`
- `/luske-burguer?mesa=mesa-1`

Alteracoes:

- `public/app.js` deve carregar loja pelo slug.
- Carrinho persistente deve incluir `storeSlug` ou `storeId`.
- Favoritos e historico devem ser separados por loja.
- Links de QR Code de mesa devem apontar para a loja correta.
- Checkout deve enviar o `store_id` resolvido pelo servidor, nao confiar no navegador.

Aceite:

- Duas lojas com slugs diferentes exibem temas, cardapios, mesas e configuracoes diferentes.

## Fase 5 - Admin multi-loja

Objetivo: painel respeitar empresa, loja e perfil.

Alteracoes:

- Login retorna lojas autorizadas.
- Criar seletor de loja quando o usuario possuir mais de uma.
- Salvar loja ativa na sessao.
- Navegacao admin deve combinar:
  - Permissao do usuario.
  - Funcionalidade do plano.
  - Limites.
  - Estado da assinatura.
  - Configuracao da loja.

Novas telas:

- Meu plano.
- Usuarios e acessos por loja.
- Seletor de loja.

Aceite:

- Usuario com acesso a uma loja nao enxerga dados de outra.
- Proprietario com duas lojas alterna e ve dados corretos.

## Fase 6 - Planos, limites e bloqueios

Objetivo: controlar produto comercial.

Planos iniciais:

- Essencial.
- Operacao.
- Crescimento.
- Gestao Pro.

Funcionalidades iniciais:

- `digital_menu`
- `orders`
- `kitchen`
- `basic_reports`
- `store_settings`
- `manual_whatsapp`
- `tables`
- `tabs`
- `waiter`
- `counter`
- `thermal_printing`
- `customers`
- `advanced_reports`
- `automatic_whatsapp`
- `online_payment`
- `promotions`
- `loyalty`
- `cash_register`
- `stock`
- `financial`
- `fiscal`
- `multi_store`
- `api`
- `custom_domain`

Aplicar bloqueios progressivamente:

1. Menu admin.
2. Endpoints admin.
3. Endpoints publicos.
4. Criacao de dados que contam limite.
5. Relatorios e integracoes.

Aceite:

- Mesas bloqueadas no Essencial mesmo por chamada direta.
- WhatsApp automatico bloqueado no Operacao.
- Pix online bloqueado se plano ou integracao nao liberar.
- Downgrade nao apaga dados.

## Fase 7 - Painel interno da plataforma

Objetivo: operar clientes, planos e suporte.

Nova area separada do admin do restaurante:

- `/platform`

Funcionalidades:

- Listar empresas.
- Listar lojas.
- Alterar plano.
- Suspender e reativar empresa.
- Liberar teste.
- Alterar limites.
- Criar excecoes.
- Consultar consumo.
- Consultar logs.
- Entrar em modo suporte com auditoria.

Regras:

- Usuarios da plataforma nao devem ser confundidos com usuarios dos restaurantes.
- Toda acao de suporte deve gerar `audit_logs`.

## Fase 8 - Testes obrigatorios

Criar testes automatizados para:

- Duas empresas.
- Duas lojas.
- Produto com mesmo nome em lojas diferentes.
- Cliente com telefone igual em lojas diferentes.
- Pedido simultaneo em lojas diferentes.
- Usuario com uma loja.
- Usuario com varias lojas.
- Troca de loja ativa.
- Acesso direto a recurso de outra loja.
- Upgrade.
- Downgrade.
- Suspensao.
- Periodo de teste.
- Limite de usuarios.
- Limite de produtos.
- Limite de mensagens.
- Mesas bloqueadas por plano.
- WhatsApp manual no Essencial.
- WhatsApp automatico no Crescimento.
- Pagamento online bloqueado por plano.
- Preservacao de dados apos downgrade.

Scripts sugeridos:

- `scripts/multitenant-audit.mjs`
- `scripts/plan-gates-tests.mjs`
- `scripts/isolation-tests.mjs`

## Riscos principais

- Mistura de dados entre lojas se algum endpoint ficar sem `store_id`.
- Indices unicos globais bloquearem dados validos de lojas diferentes.
- Cache atual retornar dados de outra loja se a chave do cache nao incluir `store_id`.
- Sessoes antigas sem loja ativa causarem comportamento ambiguo.
- Webhooks de pagamento/WhatsApp precisarem localizar loja por transacao ou pedido.
- QR Codes de mesa antigos precisarem migrar para URLs com slug.
- Uploads antigos estao em pastas globais e devem continuar legiveis.
- RLS atual e policies publicas precisam ser revistas para evitar leitura cruzada.

## Ordem recomendada de implementacao imediata

1. Criar migration de fundacao com empresas, lojas e `store_id`.
2. Migrar a Luske atual para empresa/loja padrao.
3. Criar resolvedor de loja no backend.
4. Alterar somente `/api/store`, `/api/menu` e `/api/orders` para receber loja.
5. Alterar admin para ter loja ativa, ainda com uma loja.
6. Escopar pedidos, clientes, mesas, comandas, promocoes e relatorios.
7. Criar testes de isolamento.
8. Liberar cadastro de segunda loja somente depois dos testes passarem.
9. Implementar planos e bloqueios.
10. Criar painel interno da plataforma.

## Primeira entrega tecnica segura

A primeira entrega de codigo deve conter apenas:

- Tabelas `companies` e `stores`.
- `store_id` nas tabelas operacionais.
- Criacao automatica da empresa e loja padrao.
- Backfill dos registros existentes.
- Indices compostos com `store_id`.
- Funcoes de resolucao de loja com fallback para a loja padrao.
- Cache por loja.
- Teste automatizado garantindo que duas lojas nao misturam cardapio e pedidos.

Nao liberar cadastro publico de novas empresas antes dessa primeira entrega estar testada.
