# TáPronto

Cardápio digital, pedidos organizados e sua loja online em minutos.

## Requisitos

- Node.js 20 ou superior.
- PostgreSQL local ou Docker.

## Configuração

1. Copie `.env.example` para `.env`.
2. Ajuste `DATABASE_URL`, se necessario.
3. Suba o banco local.
4. Rode migrations e seed.

```powershell
npm install
npm run db:local:up
npm run db:schema
npm run db:seed
npm start
```

Se você não usa Docker, crie um banco PostgreSQL manualmente e configure `DATABASE_URL`.

## Variaveis principais

```env
DATABASE_URL=postgresql://cardapio:cardapio_dev_password@localhost:5432/cardapio?schema=public
UPLOAD_DIR=uploads
BACKUP_DIR=backups
BACKUP_RETENTION_DAYS=7
HOST=127.0.0.1
PORT=3000
COOKIE_SECURE=false
```

## Admin local

O seed cria:

- E-mail: `admin@cardapio.local`
- Senha: `12345678`

Tambem da para gerar/redefinir admin:

```powershell
npm run admin:create
```

## Rotas

- Cliente: `http://127.0.0.1:3000/cardapio`
- Painel: `http://127.0.0.1:3000/painel`
- Conta do cliente: `http://127.0.0.1:3000/conta`
- Pedidos do cliente: `http://127.0.0.1:3000/pedidos`

## Banco e arquivos

- Prisma schema: `prisma/schema.prisma`
- Migrations: `prisma/migrations`
- Upload local: `uploads/`
- Backup: `npm run db:backup`

## Billing e planos

O pagamento mensal dos planos usa Abacate Pay quando as chaves estiverem configuradas.
Para validar a configuração atual:

```powershell
npm run billing:check
```

Variáveis principais:

```env
MERCADOPAGO_ACCESS_TOKEN=seu_access_token
MERCADOPAGO_WEBHOOK_SECRET=assinatura_secreta_do_webhook
APP_URL=https://seu-dominio
PUBLIC_APP_URL=https://seu-dominio
```

Sem `MERCADOPAGO_ACCESS_TOKEN` ou `PLATFORM_BILLING_API_KEY`, o checkout pago fica
indisponível de propósito para evitar ativação manual acidental de plano pago.

Rotina mensal de vencimento:

```powershell
npm run billing:sync
npm run billing:sync:apply
```

O backup grava arquivos `postgres-*.dump` no diretório `BACKUP_DIR` e atualiza
`backup-status.json` com sucesso/falha. O painel `/platform` mostra esse status
para contas superadmin. Para agendar no Linux, use o script existente:

```bash
sudo ./scripts/install-backup-timer.sh
```

Restore manual:

```bash
pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_URL" backups/postgres-ARQUIVO.dump
```

Na Central, superadmins tambem podem restaurar um backup pela aba Saude e servicos.
A restauracao exige senha, o texto `CONFIRMAR` e cria um backup preventivo antes de substituir os dados atuais.

## CI

O workflow `.github/workflows/ci.yml` roda em push/PR:

- `npm ci`
- `npm run prisma:generate`
- `npm run db:schema`
- `npm run test:syntax`
- `npm run test:local`
- `npm run test:flows`
- `npm run test:platform-health`
- `npm run test:security`

## Validacao

```powershell
npm run test:syntax
npm run test:local
npm run test:security
npm run test:flows
npm run test:platform-health
```

`npm run test:flows` sobe uma instância temporária do servidor em outra porta e valida:

- cadastro/onboarding/publicação;
- login/logout;
- criação e edição de categoria, produto e mesa;
- isolamento multitenant de mesas;
- criação de pedido e troca de status;
- ativação/webhook de billing em modo mock;
- exclusão segura da conta criada pelo teste.

`npm run test:platform-health` sobe uma instância temporária do servidor e valida:

- acesso de Admin Master ao `/plataform` e `/api/platform/health`;
- bloqueio de admin comum na API operacional;
- checklist sem vazamento de secrets;
- alerta de backup atrasado;
- metricas operacionais basicas.

Para validar visualmente no navegador:

1. Abra `http://127.0.0.1:3000/cadastro`.
2. Crie uma conta admin nova, aceite os termos e escolha um plano.
3. Entre no admin e percorra os 10 passos do onboarding.
4. Publique a loja e confirme que caiu na aba Operação.
5. Abra o cardápio público da loja, faça um pedido e confirme que ele aparece no admin sem usar F5.
6. Crie/edite categoria, produto e mesa e confirme que as listas atualizam automaticamente.
7. Teste a exclusão de conta apenas com uma conta temporária.
# Operação de pagamentos

O gateway de pedidos e do billing é a Abacate Pay. Antes de ativar pagamentos em produção:

- defina `PAYMENT_SECRETS_KEY` com uma chave aleatória forte e mantenha o mesmo valor em todos os deploys;
- configure API key e segredo do webhook pelo painel;
- cadastre o webhook em `/api/payments/webhook?provider=abacatepay` e envie o segredo em `x-webhook-secret` ou `x-abacatepay-secret`;
- aplique as migrations antes de subir a nova versão;
- monitore tentativas com `review_required`, que indicam valor divergente ou pagamento recebido após cancelamento.

API keys e segredos novos são armazenados com AES-256-GCM. Valores legados são convertidos quando as integrações forem salvas novamente. Nunca altere `PAYMENT_SECRETS_KEY` sem antes planejar a rotação das credenciais.
