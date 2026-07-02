# Auditoria para remocao do Supabase

Data: 2026-07-01

## Resumo

O projeto ainda depende do Supabase principalmente no backend. O navegador nao usa a chave diretamente; quase todas as telas chamam a API local (`/api/*`) e o `server.js` fala com o Supabase REST e Storage usando service role.

Essa arquitetura facilita a migracao: podemos trocar a camada de dados no backend por Prisma/PostgreSQL sem redesenhar todo o frontend de uma vez.

## Onde o Supabase e usado

### `server.js`

- Variaveis: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_IMAGE_BUCKET`.
- Bloqueio inicial da API caso as variaveis nao estejam configuradas.
- Funcao `supabase(method, table, query, payload, extraHeaders)`.
- Funcao `supabaseRequest(...)`, que chama `/rest/v1/:table`.
- Upload de imagens em `uploadImage(...)`, usando `/storage/v1/object/:bucket`.
- Todas as regras de negocio principais chamam `supabase(...)` diretamente.

Recursos usados:

- Select, insert, update e delete via REST.
- Filtros no estilo PostgREST (`eq.`, `is.`, `order`, `limit`, `select`).
- Cabecalho `Prefer: return=representation` e `Prefer: return=minimal`.
- Storage publico para imagens de produtos, logo, favicon e capa.

### `supabase/schema.sql`

Contem o schema operacional e comercial atual:

- Empresas e lojas.
- Dominios por loja.
- Configuracoes da loja.
- Cardapio, categorias, produtos, adicionais e variacoes.
- Administradores, convites, permissoes e sessoes.
- Clientes e enderecos.
- Pedidos, itens, pagamentos, impressao e WhatsApp.
- Mesas, comandas e relatorios.
- Planos, recursos, assinaturas, uso, onboarding e auditoria.
- Seeds iniciais.
- Indices compostos por `store_id`, `company_id`, status e datas.
- RLS, triggers e funcoes especificas de PostgreSQL/Supabase.

### `supabase/platform-schema.sql`

Schema parcial da camada SaaS/plataforma. Deve ser incorporado ao modelo Prisma ou substituido por migrations Prisma equivalentes.

### `scripts/`

- `apply-schema.mjs`: aplica `supabase/schema.sql`, com fallback para montar conexao a partir de `SUPABASE_URL` e `DATABASE_PW`.
- `apply-platform-schema.mjs`: aplica schema de plataforma.
- `backup-supabase.mjs`: gera dump com nome ligado ao Supabase.
- `create-admin.mjs`: cria admin usando SQL direto via `pg`, mas ainda monta conexao via Supabase quando `DATABASE_URL` nao existe.
- `local-audit.mjs`: usa REST do Supabase diretamente para testes locais.
- `e2e-multitenant-flow.mjs` e `multitenant-isolation-tests.mjs`: usam SQL direto, mas ainda montam conexao pelo ref do Supabase.

### Frontend publico/admin

Nao ha cliente Supabase direto no frontend. Pontos encontrados:

- Mensagem em `public/app.js` citando configuracao do Supabase quando o cardapio falha.
- Versionamento de assets com texto `multitenant-fix`, sem impacto tecnico.

### Documentacao e ambiente

- `.env.example` e `README.md` ainda documentam `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_IMAGE_BUCKET`.
- Documentos em `docs/` ainda citam schema Supabase, scripts de teste e checklist de producao.

## Tabelas e campos esperados

As principais tabelas usadas pelo frontend e pela API sao:

- `companies`, `stores`, `store_domains`, `store_settings`
- `admin_users`, `admin_user_store_access`, `admin_invitations`
- `customers`, `customer_addresses`, `app_sessions`
- `menu_categories`, `menu_items`, `menu_modifier_groups`, `menu_modifiers`
- `orders`, `order_items`, `order_print_logs`, `order_whatsapp_logs`, `order_payment_events`
- `dining_tables`, `customer_tabs`
- `promotions`
- `payment_transaction_index`
- `platform_features`, `subscription_plans`, `plan_features`, `company_subscriptions`
- `company_feature_overrides`, `company_usage_counters`, `usage_events`
- `onboarding_progress`, `subscription_events`, `audit_logs`

## Funcionalidades que dependem de autenticacao

- Login/logout/admin atual.
- Login/logout/cliente.
- Minha conta e meus pedidos.
- Gerenciamento de loja, cardapio, clientes, pedidos, mesas, comandas, planos, promocoes, integracoes e equipe.
- Plataforma/portal SaaS.

Hoje a sessao fica em `app_sessions`, com cookie de sessao. A migracao deve substituir isso por JWT `httpOnly` com refresh token ou manter uma tabela de sessoes controlada pelo Prisma.

## Funcionalidades que dependem de realtime

Nao foi encontrado uso de Supabase Realtime direto. O sistema usa polling/cache curto para pedidos/admin. Pode continuar assim durante a migracao e evoluir para SSE ou Socket.IO depois.

## Funcionalidades que dependem de Storage

- Upload de imagem de produto.
- Logo da loja.
- Favicon.
- Capa/fundo do cardapio.

O substituto recomendado e um `StorageProvider` com implementacao local inicial em `uploads/{storeId}/...`.

## Riscos da migracao

- O `server.js` concentra muitas regras e muitas chamadas `supabase(...)`; trocar tudo de uma vez aumenta risco de quebrar pedidos.
- PostgREST aceita filtros em string; Prisma exige reescrever consultas e relacionamentos.
- Operacoes criticas como criar pedido precisam virar transacoes Prisma.
- Upload local muda URLs das imagens ja salvas no banco.
- Scripts de auditoria/teste precisam ser reescritos para `DATABASE_URL`.
- O schema atual tem seeds e `alter table` misturados; Prisma precisa de migrations versionadas.
- A remocao de RLS exige que todo isolamento por `store_id/company_id` seja garantido no backend.

## Ordem recomendada

1. Criar base local: Docker Compose, `DATABASE_URL`, Prisma schema e migration inicial.
2. Criar camada de dados nova (`src/lib/prisma`, repositorios e services), sem remover a API atual.
3. Migrar autenticacao admin/cliente para cookies `httpOnly` e banco local.
4. Migrar leitura publica de loja/cardapio.
5. Migrar checkout e criacao de pedidos com transacao.
6. Migrar admin de pedidos/cozinha.
7. Migrar clientes, mesas, comandas e promocoes.
8. Migrar upload para storage local.
9. Migrar planos, billing, auditoria e portal SaaS.
10. Reescrever testes locais para banco PostgreSQL local.
11. Remover Supabase, scripts antigos, variaveis antigas e docs antigas.

## Decisao tecnica

O isolamento continua por `company_id` e `store_id`, mas agora sera responsabilidade da API local. O frontend nunca deve escolher livremente o `store_id` de operacoes administrativas; a loja autorizada deve sair da sessao do usuario.

