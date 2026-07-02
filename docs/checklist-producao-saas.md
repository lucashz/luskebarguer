# Checklist de producao SaaS

Use antes de liberar a plataforma para clientes reais.

## Ambiente

- [ ] `NODE_ENV=production`.
- [ ] `COOKIE_SECURE=true`.
- [ ] `ADMIN_SETUP_ENABLED=false`.
- [ ] Senhas administrativas fortes.
- [ ] Service role do Supabase apenas no servidor.
- [ ] `.env` fora do Git.
- [ ] Logs sem secrets, senhas, tokens completos, enderecos completos ou payloads sensiveis.

## Supabase

- [ ] `supabase/schema.sql` aplicado sem erro.
- [ ] RLS ativo nas tabelas sensiveis.
- [ ] Indices criados para `store_id`, `company_id`, `created_at`, `status`.
- [ ] Backup automatico habilitado.
- [ ] Restore testado pelo menos uma vez.

## Multiempresa

- [ ] Empresa A nao ve pedidos da empresa B.
- [ ] Loja A nao ve clientes da loja B.
- [ ] Admin com permissao limitada nao acessa telas bloqueadas.
- [ ] Cliente nao acessa historico de outra loja.
- [ ] Dominio personalizado resolve a loja correta.

## Comercial

- [ ] Trial ativo permite operacao.
- [ ] Trial vencido bloqueia novos pedidos.
- [ ] Empresa suspensa bloqueia operacao.
- [ ] Empresa reativada volta a operar.
- [ ] Downgrade nao apaga dados.
- [ ] Limites bloqueiam novos usos acima do plano.

## Integracoes

- [ ] WhatsApp manual testado.
- [ ] WhatsApp automatico testado por status.
- [ ] Pix online testado em homologacao.
- [ ] Webhook de pagamento validado com evento repetido.
- [ ] Falha de integracao nao quebra mudanca de status do pedido.

## Operacao da loja

- [ ] Pedido delivery completo.
- [ ] Pedido retirada completo.
- [ ] Pedido balcao completo.
- [ ] Pedido mesa por QR Code.
- [ ] Pedido comanda.
- [ ] Impressao cozinha.
- [ ] Impressao cliente.
- [ ] Relatorio por periodo.
- [ ] Fechamento de caixa.

## Testes automatizados

- [ ] `npm.cmd run test:syntax`.
- [ ] `npm.cmd run test:multitenant`.
- [ ] `npm.cmd run test:e2e:multitenant`.
- [ ] `npm.cmd run test:security`.

