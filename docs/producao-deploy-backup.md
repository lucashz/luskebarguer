# Producao, deploy e backup

## Ambiente de producao

Use `.env.production.example` como base e mantenha a chave `SUPABASE_SERVICE_ROLE_KEY` somente no servidor.

Valores obrigatorios:

- `ADMIN_SETUP_ENABLED=false`
- `COOKIE_SECURE=true`
- `EXPOSE_ERROR_DETAIL=false`
- `PASSWORD_MIN_LENGTH=10` ou maior
- `HOST=0.0.0.0`

Para criar o primeiro admin em producao, use `npm run admin:create` com `ADMIN_SEED_PASSWORD` forte definido no ambiente. Depois, remova essa variavel.

## Deploy sugerido

1. Criar projeto Supabase de producao.
2. Aplicar `supabase/schema.sql`.
3. Criar bucket `menu-images` pelo schema ou painel.
4. Subir Node em VPS, Render, Railway, Fly.io ou outro provedor com HTTPS.
5. Configurar dominio e proxy HTTPS.
6. Validar `/api/health`.
7. Criar admin via script.
8. Rodar `npm run test:local` contra o dominio/ambiente.

## Backup

Use:

```bash
npm run db:backup
```

O script gera um arquivo em `backups/` usando `pg_dump`. Ele precisa de `DATABASE_URL` ou `SUPABASE_URL` + `DATABASE_PW`, e `pg_dump` instalado na maquina.

Rotina recomendada:

- Backup diario automatico.
- Guardar pelo menos 7 dias.
- Fazer um teste de restauracao antes de entrar em producao.
- Exportar tambem imagens importantes do bucket quando o cardapio estiver estavel.

## Checklist antes de abrir para clientes

- `npm run test:syntax`
- `npm run test:local`
- Login admin com senha forte.
- Loja abre/fecha corretamente.
- Pedido completo chega no WhatsApp.
- Etiqueta imprime em 80mm.
- Relatorio diario bate com pedidos de teste.
- `.env` real nao foi commitado.

