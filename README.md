# Cardapio Digital Local

Aplicacao de cardapio digital com frontend, backend Node.js e PostgreSQL local.

## Requisitos

- Node.js 20 ou superior.
- PostgreSQL local ou Docker.

## Configuracao

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

Se voce nao usa Docker, crie um banco PostgreSQL manualmente e configure `DATABASE_URL`.

## Variaveis principais

```env
DATABASE_URL=postgresql://cardapio:cardapio_dev_password@localhost:5432/cardapio?schema=public
UPLOAD_DIR=uploads
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

## Validacao

```powershell
npm run test:syntax
npm run test:local
```

