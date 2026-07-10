# Cardapio Digital Local

Aplicação de cardápio digital com frontend, backend Node.js e PostgreSQL local.

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
BACKUP_RETENTION_DAYS=14
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
- Admin: `http://127.0.0.1:3000/admin`
- Conta do cliente: `http://127.0.0.1:3000/conta`
- Pedidos do cliente: `http://127.0.0.1:3000/pedidos`

## Banco e arquivos

- Prisma schema: `prisma/schema.prisma`
- Migrations: `prisma/migrations`
- Upload local: `uploads/`
- Backup: `npm run db:backup`

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
