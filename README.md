# Cardapio Digital Supabase Node

Aplicacao de cardapio digital com front end, back end em Node.js puro e Supabase como banco de dados. Nao usa Docker nem dependencias de npm.

## Configuracao

1. Crie um projeto no Supabase.
2. No SQL Editor, rode o arquivo `supabase/schema.sql`.
3. Copie `.env.example` para `.env`.
4. Preencha:

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
STORE_WHATSAPP_NUMBER=5511999999999
SUPABASE_IMAGE_BUCKET=menu-images
HOST=127.0.0.1
PORT=3000
```

`SUPABASE_SERVICE_ROLE_KEY` deve ficar apenas no servidor. O navegador fala com `/api/*`, nunca direto com a chave secreta.

## Rodar localmente

```powershell
npm start
```

Abra `http://127.0.0.1:3000`.

O admin fica em `http://127.0.0.1:3000/admin`. No primeiro acesso, crie a primeira conta administrativa. Depois disso, o acesso usa e-mail e senha gravados no banco, sem token.

A area do cliente fica em `http://127.0.0.1:3000/conta`.

## Sessao do cliente

Clientes e admins usam sessao persistida em banco na tabela `app_sessions`. A sessao dura 180 dias e e renovada automaticamente quando estiver perto de expirar. Isso evita pedir login toda hora, inclusive apos restart/deploy, mas ainda permite revogar pelo logout.

## Admin padrao

Para gerar ou redefinir um admin padrao no deploy:

```powershell
npm run admin:create
```

Por padrao o script usa:

- Nome: `Administrador`
- E-mail: `admin@cardapio.local`
- Senha: gerada automaticamente e exibida uma unica vez no terminal

Tambem da para controlar por variaveis de ambiente:

```env
ADMIN_SEED_NAME=Administrador
ADMIN_SEED_EMAIL=admin@cardapio.local
ADMIN_SEED_PASSWORD=uma-senha-forte
```

Depois do primeiro login, troque a senha em `/admin > Conta`.

## Fluxos

- Cliente ve o cardapio sem cadastro.
- Cliente monta carrinho e fecha pedido informando nome, telefone, entrega/retirada, endereco, pagamento e observacoes.
- Servidor cria o pedido no Supabase antes de abrir o WhatsApp.
- Cliente cria conta, edita cadastro/endereco e consulta pedidos atuais e antigos.
- Admin gerencia loja, pedidos, clientes, categorias, produtos e imagens.

## Rotas

- `GET /api/bootstrap`: dados da loja e cardapio publico.
- `GET /api/menu`: lista categorias e itens ativos.
- `GET /api/store`: dados da loja.
- `POST /api/orders`: cria pedido e retorna link do WhatsApp.
- `POST /api/customer/register`: cria conta de cliente.
- `POST /api/customer/login`: login do cliente.
- `GET /api/customer/me`: dados da conta do cliente.
- `PUT /api/customer/me`: atualiza dados da conta do cliente.
- `GET /api/customer/orders`: lista pedidos do cliente logado.
- `GET /api/admin/setup-status`: informa se ja existe admin.
- `POST /api/admin/setup`: cria a primeira conta admin.
- `POST /api/admin/login`: login do admin.
- `GET /api/admin/me`: dados do admin logado.
- `PUT /api/admin/me`: atualiza nome/e-mail do admin.
- `POST /api/admin/change-password`: troca senha do admin.
- `GET /api/admin/summary`: lista loja, cardapio, pedidos e clientes.
- `GET /api/admin/orders`: lista pedidos.
- `PATCH /api/admin/orders/{id}/status`: atualiza status.
- `GET /api/admin/customers`: lista clientes.
- `PUT /api/admin/store`: atualiza dados da loja.
- `POST /api/admin/uploads`: envia imagem para Supabase Storage.
- `POST /api/categories`: cria categoria.
- `PUT /api/categories/{id}`: atualiza categoria.
- `DELETE /api/categories/{id}`: remove categoria.
- `POST /api/items`: cria item.
- `PUT /api/items/{id}`: atualiza item.
- `DELETE /api/items/{id}`: remove item.

Rotas administrativas exigem sessao de admin criada por login em `/admin`.

## Planejamento

Veja `docs/product-plan.md`.
