# Migracao local com PostgreSQL e Prisma

Este documento registra a primeira etapa para remover a dependencia do Supabase.

## Estado atual

- O sistema em producao local ainda usa o backend antigo em `server.js`.
- O novo banco local ja tem `docker-compose.yml`, `prisma/schema.prisma`, migration inicial e seed.
- O Supabase ainda nao foi removido do runtime. A troca deve ser feita por modulo para evitar quebrar pedidos, checkout e admin.

## Subir banco local

Requisitos:

- Docker instalado.
- Node.js 20 ou superior.

Comandos:

```bash
npm run db:local:up
npm run prisma:migrate
npm run db:seed
npm run prisma:generate
```

Se quiser resetar apenas o banco local:

```bash
npm run db:reset:local
```

## Variaveis principais

```env
DATABASE_URL=postgresql://cardapio:cardapio_dev_password@localhost:5432/cardapio?schema=public
POSTGRES_DB=cardapio
POSTGRES_USER=cardapio
POSTGRES_PASSWORD=cardapio_dev_password
POSTGRES_PORT=5432
JWT_ACCESS_SECRET=troque-este-access-secret-em-producao
JWT_REFRESH_SECRET=troque-este-refresh-secret-em-producao
COOKIE_SECRET=troque-este-cookie-secret-em-producao
UPLOAD_DIR=uploads
```

## Credenciais locais de demonstracao

Criadas pelo seed:

- Email: `admin@cardapio.local`
- Senha: `12345678`

Pode trocar usando:

```env
ADMIN_SEED_EMAIL=
ADMIN_SEED_PASSWORD=
```

## Proxima ordem de implementacao

1. Criar cliente HTTP/backend novo para autenticacao admin e cliente.
2. Migrar leitura publica de loja e cardapio para Prisma.
3. Migrar checkout e criacao de pedido com transacao Prisma.
4. Migrar pedidos/admin/cozinha.
5. Migrar upload de imagens para `LocalStorageProvider`.
6. Migrar clientes, mesas, comandas, promocoes e planos.
7. Reescrever testes para banco local.
8. Remover variaveis, scripts e referencias ao Supabase.

## Validacoes feitas nesta etapa

```bash
npx prisma validate
npm run prisma:generate
npm run test:syntax
npm audit --audit-level=moderate
```

## Pendencia local

Nesta maquina, `docker` nao foi encontrado no PATH. Por isso a migration nao foi aplicada em banco real nesta etapa.

