# Plano: Historico de Itens Offline

## Contexto

O projeto atual e um cardapio digital em Node.js, HTML, CSS e JavaScript, usando Supabase como banco online.

Hoje existem dois comportamentos offline/parciais:

- O cardapio publico tem cache local em `public/app.js`, usando `BOOTSTRAP_CACHE_KEY`.
- A sacola do cliente persiste em `localStorage`, usando a chave `cart`.

O historico de pedidos do cliente ainda depende totalmente do online:

- A tela `/conta` chama `GET /api/customer/orders`.
- O backend busca `orders`.
- Depois usa `attachOrderItems` para anexar os registros de `order_items`.
- A interface renderiza `order.items` em `public/account.js`.

Se o app estiver offline, a tela de conta nao consegue apresentar o historico de pedidos nem os itens dos pedidos.

## Objetivo

Permitir que a area do cliente mostre o historico dos pedidos e os itens de cada pedido mesmo quando estiver offline, usando um cache local seguro por cliente.

## Estado Atual Online

### Backend

Arquivo: `server.js`

Rota:

```txt
GET /api/customer/orders
```

Fluxo:

1. `requireCustomer` valida a sessao do cliente.
2. `listCustomerOrders(customer.id)` busca os pedidos do cliente.
3. `attachOrderItems(orders)` busca `order_items`.
4. Cada pedido retorna com `items`.

Dados importantes ja disponiveis:

- `orders.public_code`
- `orders.status`
- `orders.total`
- `orders.created_at`
- `order_items.menu_item_id`
- `order_items.item_snapshot`
- `order_items.quantity`
- `order_items.unit_price`
- `order_items.total`
- `order_items.notes`

### Frontend

Arquivo: `public/account.js`

Fluxo:

1. `loadOrders()` chama `/api/customer/orders`.
2. `state.orders` recebe os pedidos.
3. `renderOrders()` monta os cards.
4. Os itens aparecem em chips simples dentro de `.mini-items`.

## Estado Atual Offline

Arquivo: `public/app.js`

Ja existe cache do cardapio:

```js
const BOOTSTRAP_CACHE_KEY = 'cardapio_bootstrap_cache_v1';
```

Funcoes relacionadas:

- `renderCachedBootstrap`
- `loadCachedBootstrap`
- `saveCachedBootstrap`

Ja existe persistencia de sacola:

- `loadCart`
- `persistCart`

Ainda nao existe cache offline para:

- pedidos do cliente;
- itens dos pedidos;
- metadata de ultima sincronizacao.

## Estrategia Recomendada

Implementar cache local por cliente usando `localStorage` inicialmente.

Chave sugerida:

```txt
customer_orders_cache_{customerId}
```

Formato sugerido:

```json
{
  "customer_id": "uuid-do-cliente",
  "saved_at": "2026-06-18T12:00:00.000Z",
  "orders": []
}
```

Essa estrutura evita misturar historico de clientes diferentes no mesmo navegador.

## Plano de Implementacao

### 1. Criar helpers de cache em `public/account.js`

Funcoes sugeridas:

```js
function customerOrdersCacheKey(customerId) {}
function loadCachedCustomerOrders(customerId) {}
function saveCachedCustomerOrders(customerId, orders) {}
function clearCachedCustomerOrders(customerId) {}
```

Regras:

- So ler/escrever se existir `state.customer.id`.
- Tratar erro de parse do `localStorage`.
- Salvar `saved_at` junto dos pedidos.

### 2. Alterar `loadOrders()` para fallback offline

Fluxo novo:

1. Tentar buscar `/api/customer/orders`.
2. Se sucesso:
   - atualizar `state.orders`;
   - salvar cache local;
   - renderizar como online.
3. Se erro:
   - tentar carregar cache local;
   - se existir cache:
     - atualizar `state.orders`;
     - renderizar historico;
     - mostrar aviso de historico offline.
   - se nao existir cache:
     - mostrar estado vazio/offline.

### 3. Adicionar indicador visual de cache/offline

Na tela `/conta`, adicionar um aviso discreto acima de "Pedidos recentes".

Exemplos de texto:

- Online: nao precisa mostrar nada.
- Offline com cache: `Exibindo historico salvo em 18/06/2026 12:00`.
- Offline sem cache: `Nao foi possivel carregar seus pedidos offline.`

Arquivos:

- `public/account.html`
- `public/account.js`
- `public/styles.css`

### 4. Transformar pedido recente em card expansivel

Hoje os itens aparecem apenas como chips simples.

Melhoria:

- Cada pedido deve ter um botao/area para expandir.
- Ao expandir, mostrar os itens completos do pedido.

Campos por item:

- quantidade;
- nome do produto vindo de `item_snapshot.name`;
- preco unitario;
- total;
- observacao, quando existir.

Vantagem:

- `item_snapshot` ja esta salvo no pedido, entao funciona mesmo se o produto for editado, pausado ou excluido depois.
- Funciona offline porque os dados ficam dentro do cache do pedido.

### 5. Salvar pedido recem-criado no cache

Arquivo: `public/app.js`

Depois de `POST /api/orders`, o backend retorna:

```js
result.order
```

Esse pedido ja inclui `items`.

Se o cliente estiver logado (`state.customer`), mesclar esse pedido no cache:

1. Carregar cache atual.
2. Remover pedido duplicado pelo `id`.
3. Inserir o pedido novo no inicio.
4. Salvar novamente.

Isso garante que o pedido apareca no historico mesmo se o cliente ficar offline logo depois.

### 6. Decidir limpeza de cache no logout

Recomendacao inicial:

- Ao fazer logout, limpar apenas dados de sessao.
- Manter o cache de pedidos por cliente pode melhorar a experiencia offline.

Se a preocupacao for privacidade em computador compartilhado:

- limpar `customer_orders_cache_{customerId}` no logout.

Decisao sugerida para este projeto:

- Manter cache por enquanto, porque nao ha CPF/documentos sensiveis.
- Reavaliar quando houver dados mais sensiveis ou multiusuario no mesmo dispositivo.

### 7. Considerar IndexedDB no futuro

`localStorage` e suficiente para MVP.

Migrar para IndexedDB quando:

- historico crescer muito;
- houver sincronizacao offline real;
- houver pedidos criados offline;
- houver imagens/anexos;
- precisar consultar por indice, produto, data ou status.

Estrutura futura possivel:

- `orders`
- `order_items`
- `customer_cache_meta`

## Arquivos Provaveis de Alteracao

- `public/account.js`
  - cache offline de pedidos;
  - fallback offline;
  - cards expansíveis com itens.

- `public/account.html`
  - aviso de historico offline/cache;
  - possivel container para detalhes dos itens.

- `public/styles.css`
  - estados online/offline;
  - card expandido dos itens;
  - tabela/lista de itens.

- `public/app.js`
  - salvar pedido recem-criado no cache do cliente.

## Criterios de Aceite

- Ao abrir `/conta` online, pedidos continuam carregando normalmente.
- Apos carregar online uma vez, desligar a internet deve permitir ver os pedidos salvos.
- Os itens de cada pedido devem aparecer offline.
- O pedido recem-criado deve aparecer no historico offline depois de salvo.
- Cliente A nao deve ver cache do Cliente B.
- Se nao houver cache, exibir mensagem amigavel.
- `Refazer pedido` deve continuar funcionando usando `order.items` do cache.

## Riscos e Cuidados

- `localStorage` tem limite de espaco. Manter no maximo os ultimos 30 pedidos, como ja acontece no backend.
- Dados antigos podem ficar desatualizados. Por isso mostrar `saved_at` quando estiver offline.
- Se produto antigo nao tiver `menu_item_id`, `Refazer pedido` pode nao funcionar. Nesse caso manter a mensagem atual: `Nao foi possivel refazer este pedido.`
- Evitar salvar dados sensiveis no cache se futuramente o cadastro ganhar CPF, documentos ou dados de pagamento.

## Ordem Recomendada

1. Implementar helpers de cache em `account.js`.
2. Alterar `loadOrders()` com fallback offline.
3. Adicionar aviso visual de cache/offline.
4. Expandir cards de pedidos para mostrar itens completos.
5. Gravar pedido recem-criado no cache em `app.js`.
6. Testar online, offline com cache e offline sem cache.
