# Analise Comparativa com Anota AI

Auditoria realizada sobre o repositorio local `cardapio-supabase`, usando o codigo como fonte principal e a pagina publica de referencia `https://anota.ai/home/planos/` como lista funcional comparativa para os planos Start e Gestao Avancada.

Observacao: esta auditoria nao alterou funcionalidades, banco, dependencias ou migrations. A unica alteracao prevista foi a criacao deste documento.

## 1. Resumo executivo

O projeto esta mais proximo de um sistema operacional equivalente ao nucleo do Plano Start do que do Plano Gestao Avancada. Ele ja possui cardapio digital, carrinho, pedidos, area administrativa, clientes, permissoes, mesas, comandas, status de pedido, impressoes via navegador, cupons/promocoes, fidelidade simples, pagamentos online em andamento e integracao WhatsApp para notificacoes de status.

Ainda faltam recursos estruturais para competir com uma plataforma completa: atendimento automatizado com IA, interpretacao de audio, recuperacao de carrinho, agendamento, entregadores, frente de caixa real, caixa/sangria/suprimento, estoque, ficha tecnica, compras, financeiro completo, nota fiscal, marketing/pixel e auditoria operacional ampla.

### Cobertura estimada

Formula usada:

`cobertura = (implementado * 1 + parcial * 0.5 + apenas_interface * 0.25) / total_de_funcionalidades * 100`

| Grupo | Total | Implementado | Parcial | Apenas interface | Ausente/planejado/nao confirmado | Pontos | Cobertura |
|---|---:|---:|---:|---:|---:|---:|---:|
| Plano Start | 18 | 6 | 7 | 0 | 5 | 9.5 | 52.8% |
| Gestao Avancada | 23 | 4 | 6 | 0 | 13 | 7.0 | 30.4% |
| Total combinado | 41 | 10 | 13 | 0 | 18 | 16.5 | 40.2% |

Percentuais sobre o total combinado:

- Funcionalidades totalmente implementadas: 24.4%.
- Funcionalidades parciais: 31.7%.
- Funcionalidades ausentes: 43.9%.

## 2. Arquitetura encontrada

### Tecnologias utilizadas

- Backend: Node.js puro com `node:http`, sem Express.
- Frontend: HTML, CSS e JavaScript vanilla.
- Banco: Supabase/PostgreSQL via REST API.
- Storage: Supabase Storage bucket `menu-images`.
- Autenticacao: sessoes persistidas em tabela propria `app_sessions`, cookies `admin_session` e `customer_session`.
- Senhas: PBKDF2 via `crypto.pbkdf2Sync`.
- Dependencias npm: apenas `pg`, usado por scripts auxiliares.
- Hospedagem prevista: processo Node com `npm start` ou `npm run dev`; nao ha Docker.

### Estrutura de diretorios

- `server.js`: backend HTTP, API, sanitizacao, integracoes, relatorios, pagamentos, WhatsApp, rotas administrativas e publicas.
- `public/app.html`, `public/app.js`: cardapio publico, carrinho, checkout.
- `public/admin.html`, `public/admin.js`: painel administrativo.
- `public/account.html`, `public/account.js`: conta do cliente.
- `public/orders.html`, `public/orders.js`: pedidos do cliente.
- `public/kitchen.html`, `public/kitchen.js`: modo cozinha/KDS.
- `public/payment.html`, `public/payment.js`: tela de pagamento online.
- `public/styles.css`: estilos globais.
- `supabase/schema.sql`: schema, indices, RLS e dados seed.
- `scripts/apply-schema.mjs`, `backup-supabase.mjs`, `create-admin.mjs`, `local-audit.mjs`: operacao e apoio.
- `docs/`: planos e documentacao de evolucao.

### Framework frontend

Nao ha framework. O projeto usa DOM direto, dialogs nativos, `localStorage`, polling e chamadas `fetch` para `/api/*`.

### Tecnologia backend

`server.js` implementa roteamento manual por `url.pathname`, leitura de JSON, cookies, rate limit basico, upload, proxy seguro para Supabase e integracoes externas.

### Banco de dados

PostgreSQL/Supabase. Principais tabelas confirmadas em `supabase/schema.sql`:

- `store_settings`
- `menu_categories`
- `menu_items`
- `menu_modifier_groups`
- `menu_modifiers`
- `admin_users`
- `customers`
- `customer_addresses`
- `orders`
- `order_items`
- `order_print_logs`
- `order_whatsapp_logs`
- `order_payment_events`
- `dining_tables`
- `customer_tabs`
- `promotions`
- `app_sessions`

### Servico de autenticacao

Autenticacao propria:

- Admin: `/api/admin/login`, `/api/admin/logout`, `/api/admin/me`.
- Cliente: `/api/customer/login`, `/api/customer/register`, `/api/customer/me`.
- Sessoes: tabela `app_sessions`.
- Roles admin: `admin`, `waiter`, `kitchen`, alem de compatibilidade com `owner` e `manager`.

### Storage de imagens

`POST /api/admin/uploads` envia imagem para Supabase Storage. Ha validacao de tipo real do arquivo, tipos permitidos JPG, PNG e WebP, limite de 5 MB.

### Atualizacao em tempo real

Nao ha WebSocket, SSE ou Supabase Realtime. A atualizacao ocorre por polling:

- Admin pedidos: `refreshOrdersOnly` em intervalo.
- Cozinha: `setInterval` a cada 5s em `public/kitchen.js`.
- Cache curto no backend para dados quase estaticos.

### Integracoes externas

- WhatsEvolution/Evolution API para mensagens WhatsApp.
- Abacate Pay/Pix em fluxo parcial.
- Webhooks de pagamento em `/api/payments/webhook`.
- QR Code por API externa `api.qrserver.com` para mesas.
- Google Fonts.

### Estrutura de migrations

Ha um unico arquivo `supabase/schema.sql` com `create table if not exists`, `alter table add column if not exists`, indices, triggers, RLS e seeds. Nao existe historico incremental versionado de migrations por data.

### Modelo de permissoes

Funcoes em `server.js`:

- `adminPermissions`
- `requireAdminPermission`
- `adminCan`

Perfis:

- `admin`: acesso amplo.
- `waiter`: pedidos, mesas, conta.
- `kitchen`: pedidos, conta.

### Forma de hospedagem identificada

Aplicacao Node escutando `HOST` e `PORT`. Arquivos estaticos servidos pelo proprio servidor. README orienta rodar `npm start`.

### Fluxo atual de criacao de pedido

1. Cliente carrega `/api/bootstrap`.
2. Monta carrinho em `public/app.js`.
3. Escolhe entrega/retirada/balcao/mesa/comanda.
4. Checkout valida telefone, endereco quando delivery, pagamento e itens.
5. `POST /api/orders` chama `createOrder`.
6. Backend carrega itens, modificadores, loja, cliente, endereco, cupom e mesa/comanda quando aplicavel.
7. Insere `orders` e `order_items`.
8. Gera mensagem de WhatsApp e, se for Pix online, chama provedor.
9. Envia notificacao WhatsApp de status `new` se configurado.

### Fluxo atual de atendimento de pedido

1. Admin carrega `/api/admin/orders`.
2. Painel mostra colunas por status.
3. Usuario altera status por select ou drag and drop.
4. `PATCH /api/admin/orders/{id}/status` atualiza status.
5. Backend dispara WhatsApp em background.
6. Impressao pode ser manual ou auto cozinha conforme configuracao.

### Fluxo atual de fechamento ou pagamento

- Pagamento presencial: pedido fica com `financial_status` pendente, sem conciliacao obrigatoria.
- Pix online: existe criacao de pagamento, tela `/pagamento`, regeneracao e webhook.
- Comanda: `customer_tabs` abre/fecha e calcula total por pedidos vinculados; nao ha sessao de caixa real.
- Relatorios: diaria/faixa, origem, pagamento, status, top produtos, ticket medio e fechamento simples.

## 3. Matriz comparativa

### Plano Start

| Plano | Funcionalidade | Status no projeto | Evidencia no codigo | O que ja funciona | O que falta | Prioridade | Complexidade |
|---|---|---|---|---|---|---|---|
| Start | Robo com IA para WhatsApp, Facebook e Instagram | Nao implementado | `sendOrderStatusWhatsapp`, `order_whatsapp_logs`, `integration_settings.whatsapp` | Notificacoes de status por WhatsApp | IA conversacional, canais Facebook/Instagram, NLP, handoff humano | Alta | Alta |
| Start | Interpretacao de audios recebidos pelo WhatsApp | Nao implementado | Nao ha rotas de audio/webhook de mensagem recebida | Nada confirmado | Webhook inbound, download de audio, transcricao, interpretacao | Media | Alta |
| Start | Cardapio digital | Implementado | `/api/bootstrap`, `getMenu`, `public/app.js`, `menu_categories`, `menu_items` | Cardapio publico, busca, categorias, destaques, favoritos, imagens | Melhorar SEO/performance e testes E2E | Alta | Baixa |
| Start | Pedidos em balcao e PDV | Parcial | `fulfillment_method in ('counter')`, checkout, `orders` | Pedido de balcao existe como origem | PDV completo, operador de caixa, gaveta, venda rapida | Alta | Media |
| Start | QR Code para mesas | Implementado | `dining_tables`, `resolveDiningTable`, `tableQrUrl`, `printTableQr` | Cadastro de mesas, QR, impressao e pedido via mesa | Melhorias de UX e historico por mesa | Alta | Media |
| Start | Aplicativo/interface para garcom | Parcial | Role `waiter`, aba Mesas, `public/admin.js` | Garcom pode usar admin com permissao limitada | Tela dedicada de garcom, UX mobile especifica, mesas favoritas | Media | Media |
| Start | Comanda digital | Implementado | `customer_tabs`, `openCustomerTab`, `addItemToCustomerTab`, `closeCustomerTab` | Abrir, transferir, adicionar itens, fechar comanda | Divisao de conta e pagamentos parciais | Alta | Media |
| Start | Pagamento online | Parcial | `createPixPayment`, `payment.html`, `order_payment_events`, Abacate Pay | Fluxo Pix online e webhook parcialmente prontos | Validar payload oficial em producao, conciliacao robusta | Alta | Alta |
| Start | Sistema de cupons | Implementado | `promotions`, `previewCoupon`, admin promocoes | Cupom fixo, percentual, frete gratis, limites e audiencia | Melhor UX, campanhas automatizadas | Media | Media |
| Start | Cashback | Parcial | `loyalty_program`, `customerLoyaltyProgress` | Fidelidade por pontos/pedidos | Cashback financeiro real, saldo, expiracao, extrato | Media | Media |
| Start | Recuperacao de vendas/carrinhos abandonados | Nao implementado | Carrinho em `localStorage`, sem backend de abandono | Carrinho persiste localmente | Captura de carrinho, consentimento, automacao WhatsApp | Media | Alta |
| Start | Agendamento de pedidos | Nao implementado | Nao ha campos de agendamento em `orders` | Nada confirmado | Campos, regras de horario, fila futura | Media | Media |
| Start | Cadastro e gestao de entregadores | Nao implementado | Nao ha tabela `drivers`/entregadores | Nada confirmado | Cadastro, atribuicao, status, taxas | Media | Media |
| Start | Frente de caixa | Parcial | Relatorios, formas de pagamento, pedidos balcao | Operacao basica por pedidos | Caixa aberto/fechado, sangria, suprimento, venda avulsa | Alta | Alta |
| Start | Gestao centralizada dos pedidos | Implementado | `/api/admin/orders`, `renderOrders`, drag/drop | Kanban de pedidos, status, filtros por origem | Realtime real e auditoria por usuario | Alta | Media |
| Start | Atendimento em dispositivos moveis | Parcial | CSS responsivo, telas cliente/admin | Cliente mobile e admin utilizavel | Testes formais mobile, modo garcom/cozinha refinado | Alta | Media |
| Start | Controle de permissoes por usuario | Implementado | `admin_users.role`, `adminPermissions`, `/api/admin/users` | Admin, garcom e cozinha | Permissoes granulares por acao | Alta | Media |
| Start | Impressao de pedidos e comandas | Parcial | `orderThermalDocument`, `printOrder`, `order_print_logs` | Via cozinha/cliente, 58/80mm, logs | Impressao silenciosa ESC/POS, fechamento de comanda impresso completo | Alta | Media |

### Plano Gestao Avancada

| Plano | Funcionalidade | Status no projeto | Evidencia no codigo | O que ja funciona | O que falta | Prioridade | Complexidade |
|---|---|---|---|---|---|---|---|
| Gestao Avancada | Display de pedidos para cozinha/KDS | Parcial | `public/kitchen.html`, `public/kitchen.js`, `/api/admin/orders` | Tela de cozinha com polling | Layout final, filtros, sons, tempos/SLA, dispositivos | Alta | Media |
| Gestao Avancada | Integracao com plataformas de anuncios | Nao implementado | Nao ha rotas/SDKs de ads | Nada confirmado | Meta/Google Ads, eventos server-side | Baixa | Alta |
| Gestao Avancada | Facebook Pixel e conversao | Nao implementado | Nao ha Pixel/analytics | Nada confirmado | Pixel, CAPI, consentimento LGPD | Media | Media |
| Gestao Avancada | Gestor de estoque | Nao implementado | Nao ha tabelas de estoque | Nada confirmado | Produtos de estoque, saldo, unidades | Alta | Alta |
| Gestao Avancada | Entrada e saida de estoque | Nao implementado | Nao ha `stock_movements` | Nada confirmado | Movimentacoes, ajustes, motivo, usuario | Alta | Alta |
| Gestao Avancada | Ficha tecnica de produtos | Nao implementado | Nao ha ingredientes/fichas | Nada confirmado | Ingredientes por produto e rendimento | Alta | Alta |
| Gestao Avancada | Baixa automatica por venda | Nao implementado | Nao ha vinculo item-ingrediente | Nada confirmado | Integrar venda com estoque | Alta | Alta |
| Gestao Avancada | Alertas de estoque minimo | Nao implementado | Nao ha campo estoque minimo | Nada confirmado | Alertas e dashboards | Media | Media |
| Gestao Avancada | Nota fiscal automatizada | Nao implementado | Nao ha fiscal/NF-e/NFC-e | Nada confirmado | Provedor fiscal, certificado, tributacao | Media | Alta |
| Gestao Avancada | Configuracoes tributarias | Nao implementado | Nao ha tabelas fiscais | Nada confirmado | CFOP, NCM, CST/CSOSN, aliquotas | Media | Alta |
| Gestao Avancada | Gestao financeira | Parcial | `financial_status`, `order_payment_events`, relatorios | Status financeiro e eventos de pagamento | Plano de contas, caixa, conciliacao completa | Alta | Alta |
| Gestao Avancada | Contas a pagar e receber | Nao implementado | Nao ha tabelas AP/AR | Nada confirmado | Titulos, vencimentos, baixa | Media | Alta |
| Gestao Avancada | Fluxo de caixa | Nao implementado | Nao ha `cash_sessions` | Nada confirmado | Entradas/saidas, saldo por periodo | Alta | Alta |
| Gestao Avancada | Registro de despesas | Nao implementado | Nao ha `expenses` | Nada confirmado | Cadastro, categorias, anexos | Media | Media |
| Gestao Avancada | Registro de compras | Nao implementado | Nao ha `purchases` | Nada confirmado | Fornecedores, compras, itens, estoque | Media | Alta |
| Gestao Avancada | Relatorios financeiros | Parcial | `rangeOrderReport`, `cashClosingTotals` | Receita, status, pagamentos, origem | DRE, despesas, lucro, caixa real | Alta | Media |
| Gestao Avancada | Relatorios de vendas | Implementado | `/api/admin/reports/daily`, `/range`, `topProductTotals` | Vendas por periodo, status, pagamento, origem | Exportacao mais robusta e graficos | Alta | Media |
| Gestao Avancada | Indicadores de desempenho | Parcial | `reportTotals`, top produtos, ticket | Alguns indicadores operacionais | SLA, conversao, recorrencia, margem | Media | Media |
| Gestao Avancada | Ticket medio | Implementado | `average_ticket` em `reportTotals` | Ticket medio por periodo | Segmentacao por canal/cliente | Media | Baixa |
| Gestao Avancada | Produtos mais vendidos | Implementado | `topProductTotals` | Ranking por quantidade/total | Margem e CMV | Media | Baixa |
| Gestao Avancada | Formas de pagamento | Implementado | `store_settings.payment_methods`, admin Loja | Configurar metodos aceitos | Taxas por bandeira/provedor | Media | Baixa |
| Gestao Avancada | Fechamento de caixa | Parcial | `cash_closing` no relatorio | Resumo esperado por pedidos | Sessao de caixa, sangria, suprimento, divergencia | Alta | Alta |
| Gestao Avancada | Historico e auditoria das operacoes | Parcial | `order_whatsapp_logs`, `order_payment_events`, `order_print_logs`, `app_sessions` | Logs especificos existem | Audit log geral por usuario/acao/IP | Alta | Media |

## 4. Percentuais de cobertura

### Plano Start

Itens: 18.

- Implementado: 6.
- Parcial: 7.
- Apenas interface: 0.
- Nao implementado/planejado/nao confirmado: 5.
- Pontuacao: `(6 * 1) + (7 * 0.5) = 9.5`.
- Cobertura: `9.5 / 18 * 100 = 52.8%`.

### Plano Gestao Avancada

Itens: 23.

- Implementado: 4.
- Parcial: 6.
- Apenas interface: 0.
- Nao implementado/planejado/nao confirmado: 13.
- Pontuacao: `(4 * 1) + (6 * 0.5) = 7`.
- Cobertura: `7 / 23 * 100 = 30.4%`.

### Total combinado

Itens: 41.

- Implementado: 10.
- Parcial: 13.
- Ausente: 18.
- Pontuacao: `10 + 6.5 = 16.5`.
- Cobertura geral: `16.5 / 41 * 100 = 40.2%`.

## 5. Analise por modulo

### 1. Cardapio digital

- Estado atual: implementado.
- Arquivos: `public/app.js`, `public/app.html`, `server.js:getMenu`, `supabase/schema.sql`.
- Problemas: nao ha testes E2E; cache local pode exibir dados antigos por curto periodo.
- Lacunas: SEO, landing por loja, multi-tenant.
- Dependencias: Supabase e Storage.
- Melhorias: testes de cardapio, preview admin, validacao de imagens e compressao.

### 2. Carrinho e checkout

- Estado atual: parcial/forte para MVP.
- Arquivos: `public/app.js`, `/api/orders`, `createOrder`.
- Problemas: pedido nao usa transacao SQL; falha entre `orders` e `order_items` pode deixar dado inconsistente.
- Lacunas: agendamento, recuperacao de carrinho, multiplos pagamentos.
- Melhorias: idempotency key, transacao via RPC/Postgres, testes de duplicidade.

### 3. Pedidos

- Estado atual: implementado para operacao basica.
- Arquivos: `public/admin.js`, `server.js:listOrders`, `PATCH /api/admin/orders/{id}/status`.
- Problemas: polling, nao realtime; historico de mudanca de status nao registra usuario.
- Lacunas: SLA, auditoria, motivo de cancelamento.
- Melhorias: tabela `order_status_events`.

### 4. Mesas e comandas

- Estado atual: implementado parcialmente/funcional.
- Arquivos: `dining_tables`, `customer_tabs`, `resolveDiningTable`, `openCustomerTab`.
- Problemas: comanda usa pedidos vinculados; nao existe tabela propria de itens da comanda.
- Lacunas: pagamento parcial, divisao de conta, historico completo.
- Melhorias: `customer_tab_items` ou consolidacao de eventos.

### 5. Garcom

- Estado atual: parcial.
- Arquivos: roles `waiter`, tela Mesas no admin.
- Problemas: garcom usa painel admin adaptado.
- Lacunas: interface dedicada mobile, controle de mesas por garcom.
- Melhorias: `/garcom` com fluxo simplificado.

### 6. Cozinha e KDS

- Estado atual: parcial.
- Arquivos: `public/kitchen.html`, `public/kitchen.js`.
- Problemas: polling; sem SLA visual persistente por item; sem dispositivos cadastrados.
- Lacunas: filtros por praca, som configuravel, preparo por item.
- Melhorias: KDS dedicado com tempos, fullscreen e eventos.

### 7. Balcao e PDV

- Estado atual: parcial.
- Arquivos: `fulfillment_method = counter`, checkout.
- Problemas: nao ha tela PDV de venda rapida.
- Lacunas: leitura de codigo, operador, desconto manual, pagamento local com caixa.
- Melhorias: modulo PDV separado.

### 8. Caixa

- Estado atual: parcial.
- Arquivos: relatorios e `cash_closing`.
- Problemas: fechamento e apenas calculado por pedidos.
- Lacunas: sessao de caixa, sangria, suprimento, divergencia.
- Melhorias: criar `cash_sessions` e `cash_movements`.

### 9. Entrega e entregadores

- Estado atual: nao implementado.
- Arquivos: apenas delivery no pedido.
- Lacunas: entregadores, taxa por entregador, despacho, tracking.
- Melhorias: cadastro e atribuicao de entrega.

### 10. Clientes e fidelizacao

- Estado atual: parcial/boa base.
- Arquivos: `customers`, `customer_addresses`, `loyalty_program`, `account.js`.
- Problemas: fidelidade nao gera saldo/extrato.
- Lacunas: campanhas por cliente, tags, LGPD.
- Melhorias: `loyalty_ledger`, consentimentos e segmentacao.

### 11. Cupons e cashback

- Estado atual: cupons implementados; cashback nao.
- Arquivos: `promotions`, `previewCoupon`, admin Promocoes.
- Problemas: uso por cliente depende de pedidos e pode ter bordas em pedidos anonimos.
- Lacunas: cashback real, regras combinadas.
- Melhorias: ledger de beneficios.

### 12. Pagamentos

- Estado atual: parcial.
- Arquivos: `payment.js`, `createPixPayment`, `receivePaymentWebhook`.
- Problemas: integracao Abacate Pay precisa validacao de payload oficial em producao.
- Lacunas: cartao online, estorno automatico, conciliacao avancada.
- Melhorias: adaptador unico por provedor, testes com webhook fixture.

### 13. Impressao termica

- Estado atual: parcial/funcional via navegador.
- Arquivos: `printOrder`, `orderThermalDocument`, `order_print_logs`.
- Problemas: `window.print()` depende do navegador e nao imprime silenciosamente.
- Lacunas: ESC/POS, impressoras cadastradas, fila de impressao.
- Melhorias: servico local de impressao.

### 14. Estoque

- Estado atual: nao implementado.
- Lacunas: produtos de estoque, ingredientes, saldos.
- Melhorias: iniciar por estoque simples e movimentos manuais.

### 15. Compras

- Estado atual: nao implementado.
- Lacunas: fornecedores, compras, itens, entrada automatica.

### 16. Financeiro

- Estado atual: parcial por relatorios de venda.
- Lacunas: contas, despesas, receitas, fluxo de caixa, DRE.

### 17. Nota fiscal

- Estado atual: nao implementado.
- Lacunas: tributacao, certificado, provedor fiscal.

### 18. Marketing e anuncios

- Estado atual: nao implementado.
- Lacunas: Pixel, CAPI, UTMs, campanhas.

### 19. Atendimento automatizado

- Estado atual: notificacoes WhatsApp, nao atendimento.
- Lacunas: IA, canais sociais, inbound.

### 20. Relatorios

- Estado atual: parcial/boa base.
- Arquivos: `/api/admin/reports/daily`, `/range`.
- Problemas: sem persistencia de fechamento de caixa.
- Melhorias: dashboards e exports.

### 21. Administracao e permissoes

- Estado atual: implementado parcialmente forte.
- Arquivos: `admin_users`, `adminPermissions`, `/api/admin/users`.
- Lacunas: permissoes granulares e auditoria.

### 22. Seguranca

- Estado atual: razoavel para MVP.
- Pontos positivos: service role no servidor, RLS habilitado, cookies httpOnly, rate limit basico, upload validado.
- Riscos: `.env` existe localmente; RLS publico permite leitura ampla de cardapio; backend usa service role para tudo; falta CSP.

### 23. Infraestrutura e observabilidade

- Estado atual: simples.
- Arquivos: logs `server.out.log`, `server.err.log`, scripts backup.
- Lacunas: monitoramento, tracing, metricas, health checks completos.

## 6. Problemas tecnicos encontrados

1. Arquivo `.env` existe no workspace; deve permanecer fora do Git e ser auditado antes de deploy.
2. `server.js` concentra muitas responsabilidades em um arquivo unico grande.
3. Nao ha suite automatizada funcional alem de `node --check` e script de auditoria local.
4. Criacao de pedido nao usa transacao atomica.
5. Nao ha idempotencia formal para `POST /api/orders`.
6. Polling substitui realtime.
7. Migrations estao centralizadas em um unico schema, sem versionamento incremental.
8. Alguns recursos sao parciais: pagamento online, fechamento, KDS, comandas, WhatsApp.
9. Logs de auditoria sao especificos, nao ha trilha geral de eventos administrativos.
10. Nao ha modulo de entregadores, estoque, financeiro completo ou fiscal.

## 7. Lacunas funcionais

### Essenciais para operacao

- Idempotencia de pedido.
- Transacao ou RPC para criar pedido e itens.
- Fechamento de caixa real.
- Impressao mais confiavel.
- Testes E2E do fluxo cliente-admin-cozinha.
- Auditoria de status por usuario.

### Importantes para gestao

- Estoque basico.
- Entregadores.
- Relatorios com fechamento persistido.
- Produtos por margem/CMV.
- Exportacao robusta.

### Diferenciais comerciais

- Atendimento IA WhatsApp.
- Recuperacao de carrinho.
- Campanhas automaticas.
- Cashback real.
- Painel mobile de garcom.

### Futuras ou opcionais

- Nota fiscal.
- Integracao com ads.
- Pixel/CAPI.
- Split de pagamento.
- Divisao de conta.

## 8. Modelagem recomendada

Nao gerar migrations ainda. Proposta:

| Tabela | Responsabilidade | Campos principais | Relacionamentos | Restricoes/indices | Politicas |
|---|---|---|---|---|---|
| `order_status_events` | Auditoria de status | `order_id`, `from_status`, `to_status`, `admin_id`, `source`, `created_at` | `orders`, `admin_users` | idx `order_id, created_at` | Admin/garcom/cozinha leem conforme permissao |
| `cash_sessions` | Caixa aberto/fechado | `opened_by`, `closed_by`, `opening_amount`, `closing_amount`, `status`, `opened_at`, `closed_at` | `admin_users` | idx status/data | Admin |
| `cash_movements` | Sangria/suprimento/vendas | `cash_session_id`, `type`, `amount`, `payment_method`, `order_id`, `notes` | caixa, pedidos | idx caixa/data | Admin |
| `drivers` | Entregadores | `name`, `phone`, `is_active`, `vehicle`, `notes` | pedidos futuros | unique phone | Admin |
| `delivery_assignments` | Despacho | `order_id`, `driver_id`, `status`, `assigned_at`, `delivered_at` | pedidos, drivers | idx status | Admin/entregador futuro |
| `stock_items` | Insumos | `name`, `unit`, `current_qty`, `min_qty`, `cost` | movimentos | idx min | Admin |
| `stock_movements` | Entrada/saida estoque | `stock_item_id`, `type`, `quantity`, `unit_cost`, `reason`, `order_id` | estoque, pedidos | idx item/data | Admin |
| `recipe_items` | Ficha tecnica | `menu_item_id`, `stock_item_id`, `quantity` | produtos, estoque | unique produto+insumo | Admin |
| `suppliers` | Fornecedores | `name`, `document`, `phone`, `email` | compras | idx name | Admin |
| `purchases` | Compras | `supplier_id`, `total`, `status`, `purchased_at` | fornecedores | idx data/status | Admin |
| `purchase_items` | Itens da compra | `purchase_id`, `stock_item_id`, `quantity`, `unit_cost` | compras/estoque | idx compra | Admin |
| `accounts_payable` | Contas a pagar | `supplier_id`, `description`, `amount`, `due_date`, `status` | fornecedores | idx venc/status | Admin |
| `accounts_receivable` | Contas a receber | `order_id`, `amount`, `due_date`, `status` | pedidos | idx venc/status | Admin |
| `expenses` | Despesas | `category`, `description`, `amount`, `paid_at`, `payment_method` | caixa opcional | idx data | Admin |
| `fiscal_documents` | NFC-e/NF-e | `order_id`, `provider`, `status`, `xml_url`, `number`, `series` | pedidos | idx status | Admin |
| `printers` | Impressoras | `name`, `type`, `paper_width`, `is_active`, `target` | filas | idx active | Admin |
| `print_jobs` | Fila de impressao | `printer_id`, `order_id`, `status`, `payload`, `attempts` | impressoras/pedidos | idx status | Admin/cozinha |
| `kds_devices` | Dispositivos cozinha | `name`, `station`, `token`, `is_active` | pedidos | unique token | Cozinha |
| `audit_events` | Auditoria geral | `actor_type`, `actor_id`, `action`, `entity`, `entity_id`, `metadata`, `created_at` | varios | idx entidade/data | Admin |
| `message_events` | Mensagens inbound/outbound | `channel`, `direction`, `phone`, `order_id`, `status`, `payload` | pedidos/clientes | idx phone/data | Admin |
| `abandoned_carts` | Recuperacao | `customer_id`, `phone`, `cart_snapshot`, `status`, `last_seen_at` | clientes | idx status/data | Admin |
| `scheduled_orders` | Agendamentos | `order_id`, `scheduled_for`, `status` | pedidos | idx data/status | Admin |
| `loyalty_ledger` | Cashback/pontos | `customer_id`, `type`, `points`, `amount`, `order_id`, `expires_at` | clientes/pedidos | idx cliente | Cliente/admin |

## 9. Roadmap por fases

### Fase 0 - Correcoes e seguranca

1. Idempotencia de pedidos.
   - Objetivo: impedir pedidos duplicados.
   - Arquivos: `public/app.js`, `server.js`.
   - Banco: campo/tabela `idempotency_keys`.
   - Testes: duplo clique e retry.
   - Complexidade: media.
   - Aceite: mesmo token cria um unico pedido.

2. Criacao de pedido atomica.
   - Objetivo: evitar pedido sem itens.
   - Banco: RPC Postgres ou transacao via `pg`.
   - Risco: refatorar `createOrder`.
   - Complexidade: alta.
   - Aceite: falha em item reverte pedido.

3. Auditoria de status.
   - Objetivo: registrar quem moveu pedido.
   - Banco: `order_status_events`.
   - Aceite: cada mudanca aparece com usuario/data.

4. Revisar `.env` e producao.
   - Objetivo: evitar secrets versionados.
   - Arquivos: `.gitignore`, docs deploy.
   - Aceite: nenhum segredo no Git.

5. Padronizar migrations.
   - Objetivo: historico versionado.
   - Banco: pasta `supabase/migrations`.
   - Aceite: deploy reproduzivel.

### Fase 1 - MVP operacional

1. Caixa basico.
   - Banco: `cash_sessions`, `cash_movements`.
   - Endpoints: abrir/fechar caixa, sangria, suprimento.
   - Aceite: relatorio bate com fechamento.

2. Impressao operacional.
   - Banco: `printers`, `print_jobs`.
   - Dependencia: opcional servico local ESC/POS.
   - Aceite: reimprimir sem duplicar autoimpressao.

3. KDS refinado.
   - Arquivos: `kitchen.html/js`.
   - Aceite: tela cheia, filtros, tempo de espera.

4. Mesas/comandas refinadas.
   - Banco: considerar `customer_tab_items`.
   - Aceite: fechar comanda com resumo completo.

5. Testes ponta a ponta.
   - Fluxos: pedido, status, impressao, mesa, pagamento.

### Fase 2 - Equivalencia com Start

1. Garcom mobile dedicado.
2. Entregadores e despacho.
3. Recuperacao de carrinho por WhatsApp.
4. Agendamento de pedidos.
5. Cashback real.
6. Atendimento WhatsApp inbound sem IA inicialmente.

### Fase 3 - Gestao avancada

1. Estoque basico.
2. Ficha tecnica.
3. Baixa automatica por venda.
4. Compras/fornecedores.
5. Financeiro completo.
6. Nota fiscal via provedor externo.

### Fase 4 - Automacao e crescimento

1. IA para atendimento.
2. Interpretacao de audio.
3. Pixel/CAPI.
4. Campanhas e CRM.
5. Indicadores de conversao.

## 10. Recomendacao estrategica

1. O projeto esta mais proximo do Plano Start. A base operacional de cardapio, pedidos, mesas e admin existe.
2. O projeto ja supera parcialmente a lista basica em customizacao visual, cache local, tema, QR de mesa e fluxo de comanda integrado ao cardapio.
3. Cinco maiores lacunas: IA/atendimento, caixa real, estoque/ficha tecnica, financeiro/fiscal, entregadores/PDV.
4. Antes de producao: idempotencia, transacao de pedido, validacao real de Pix/webhook, fechamento de caixa, testes E2E, auditoria de status e revisao de secrets.
5. Mais valor para hamburgueria pequena: pedido mobile rapido, WhatsApp confiavel, impressao termica, mesas/comandas, cupons, relatorios simples.
6. Adiar: nota fiscal, ads, IA completa, split, estoque avancado.
7. Melhor diferencial: sistema simples, rapido, com mesa/comanda/WhatsApp/impressao, pensado para restaurante pequeno sem complexidade de ERP.
8. Faz sentido integrar servicos externos para WhatsApp, Pix, fiscal, impressao silenciosa e IA; construir internamente apenas o fluxo operacional.
9. Integracoes necessarias: WhatsEvolution/Evolution, Abacate Pay, provedor fiscal, servico ESC/POS local, Meta Pixel/CAPI, IA/transcricao.
10. Custos recorrentes: Supabase, dominio/hospedagem, WhatsApp/API, pagamentos, fiscal, SMS/WhatsApp recovery, IA, storage, backups.

Complexidade para equivalencia:

- Start: media-alta. Falta principalmente automacao, entregadores, PDV/caixa e recuperacao. A base de pedido ja existe.
- Gestao Avancada: alta. Exige estoque, financeiro, fiscal e compras, que mudam o modelo de dados.
- Superior aos dois planos: muito alta. Exige IA, analytics, omnichannel, automacoes e operacao robusta multi-dispositivo.

## 11. Lista priorizada das proximas 20 tarefas

1. Implementar idempotencia em `POST /api/orders`.
2. Tornar criacao de pedido atomica.
3. Criar `order_status_events`.
4. Criar caixa basico com abertura/fechamento.
5. Persistir fechamento de caixa por dia.
6. Refinar impressao de comanda/fechamento.
7. Validar Abacate Pay em ambiente real com fixtures.
8. Criar testes E2E do fluxo pedido-admin-cozinha.
9. Criar tela dedicada de garcom.
10. Melhorar KDS com SLA e alertas.
11. Criar cadastro de entregadores.
12. Criar despacho de entrega.
13. Criar recuperacao de carrinho.
14. Criar agendamento de pedidos.
15. Criar cashback/ledger de fidelidade.
16. Criar estoque simples.
17. Criar ficha tecnica.
18. Criar baixa automatica de estoque.
19. Criar auditoria administrativa geral.
20. Separar `server.js` em modulos por dominio.

## Resumo final

- Cobertura Start: 52.8%.
- Cobertura Gestao Avancada: 30.4%.
- Implementadas: 10 funcionalidades.
- Parciais: 13 funcionalidades.
- Ausentes: 18 funcionalidades.
- Documento: `docs/ANALISE-COMPARATIVA-ANOTAAI.md`.
