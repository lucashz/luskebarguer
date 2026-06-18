# Plano: Adicionais e Variacoes por Produto

## Objetivo

Permitir que cada produto tenha escolhas claras para o cliente, sem deixar o cadastro dificil para a loja.

Casos principais:

- tamanho;
- borda;
- ponto da carne;
- acompanhamentos;
- adicionais pagos;
- escolhas obrigatorias;
- observacao por item.

## Decisao de modelagem

Usar dois conceitos separados:

1. Variantes
   - mudam o produto base;
   - geralmente definem o preco principal;
   - exemplo: pizza pequena, media, grande; hamburguer simples ou duplo.

2. Grupos de modificadores
   - adicionam escolhas ao produto;
   - podem ser obrigatorios ou opcionais;
   - podem ou nao alterar o preco;
   - exemplo: borda, ponto, acompanhamentos, adicionais.

Essa separacao evita usar "adicionais" para tudo e facilita relatorios depois.

## O que ja existe no banco

O schema atual ja possui:

- `menu_modifier_groups`
- `menu_modifiers`

Essas tabelas sao uma boa base para adicionais, borda, ponto e acompanhamentos.

Falta:

- expor esses dados na API publica;
- criar UI no admin;
- permitir escolhas no cardapio do cliente;
- salvar as escolhas no pedido;
- calcular preco final com modificadores;
- criar variantes de produto quando o preco base muda por tamanho.

## Estrutura recomendada

### Variantes

Criar tabela:

```sql
create table public.menu_item_variants (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10, 2) not null check (price >= 0),
  is_default boolean not null default false,
  is_available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Exemplos:

- Pizza Broto - R$ 39,90
- Pizza Media - R$ 59,90
- Pizza Grande - R$ 79,90

Regra:

- Se o produto nao tiver variantes, usa `menu_items.price`.
- Se tiver variantes, cliente precisa escolher uma.
- Uma variante pode ser marcada como padrao.

### Grupos de modificadores

Usar `menu_modifier_groups` com ajustes futuros:

Campos atuais importantes:

- `name`
- `min_choices`
- `max_choices`
- `is_required`
- `sort_order`

Exemplos:

- Ponto da carne
  - obrigatorio;
  - minimo 1;
  - maximo 1;
  - modificadores sem preco.

- Borda
  - opcional;
  - minimo 0;
  - maximo 1;
  - modificadores com preco.

- Acompanhamentos
  - opcional ou obrigatorio;
  - minimo 0 ou 1;
  - maximo 2.

- Adicionais
  - opcional;
  - minimo 0;
  - maximo alto, como 10.

### Modificadores

Usar `menu_modifiers`:

- `name`
- `price_delta`
- `is_available`
- `sort_order`

Exemplos:

- Bacon extra + R$ 5,00
- Cheddar + R$ 4,00
- Sem cebola + R$ 0,00
- Ao ponto + R$ 0,00

## Pedido

Atualizar `order_items.item_snapshot` para salvar tudo que o cliente escolheu.

Formato sugerido:

```json
{
  "id": "produto-id",
  "name": "Burger da Casa",
  "base_price": 29.9,
  "variant": {
    "id": "variant-id",
    "name": "Duplo",
    "price": 39.9
  },
  "modifiers": [
    {
      "group_id": "grupo-id",
      "group_name": "Ponto",
      "id": "modifier-id",
      "name": "Ao ponto",
      "price_delta": 0
    },
    {
      "group_id": "grupo-id",
      "group_name": "Adicionais",
      "id": "modifier-id",
      "name": "Bacon",
      "price_delta": 5
    }
  ]
}
```

O snapshot e essencial porque o pedido antigo precisa continuar correto mesmo se o produto for editado depois.

## Calculo de preco

Preco unitario:

```txt
preco da variante ou preco do produto
+ soma dos modificadores
= preco unitario final
```

Total do item:

```txt
preco unitario final * quantidade
```

Validacoes no servidor:

- produto existe e esta disponivel;
- variante pertence ao produto;
- variante esta disponivel;
- grupo pertence ao produto;
- modificador pertence ao grupo;
- grupo obrigatorio foi preenchido;
- minimo e maximo de escolhas foram respeitados;
- preco deve ser recalculado no servidor, nunca confiado no navegador.

## Admin

Melhor UX:

- Dentro da tela de produtos, cada produto tem um dropdown "Opcoes".
- Abas internas:
  - Dados;
  - Variantes;
  - Adicionais.
- Criar modelos rapidos:
  - Hamburguer: ponto + adicionais;
  - Pizza: tamanho + borda;
  - Acai: tamanho + acompanhamentos;
  - Marmita: tamanho + talheres/observacoes;
  - Bebida: gelo/limao.

Isso ajuda usuario leigo a cadastrar sem entender modelagem tecnica.

## Cliente

No cardapio publico:

- Clicar no produto abre modal de montagem.
- Mostrar primeiro a variante, se existir.
- Depois mostrar grupos obrigatorios.
- Depois opcionais.
- Mostrar total atualizando em tempo real.
- Observacao por item no final.
- Botao "Adicionar a sacola".

No carrinho:

- Mostrar nome do produto;
- variante;
- modificadores;
- observacao;
- quantidade;
- total.

## Ordem de implementacao

1. Criar tabela `menu_item_variants`.
2. Ajustar API publica para retornar variantes e modificadores.
3. Ajustar admin para cadastrar grupos e modificadores por produto.
4. Criar modal de montagem no cardapio publico.
5. Atualizar carrinho para salvar escolhas.
6. Atualizar `POST /api/orders` para validar e recalcular tudo.
7. Atualizar WhatsApp para imprimir escolhas embaixo de cada item.
8. Atualizar historico do cliente e painel admin para mostrar escolhas.

## Recomendacao

Implementar primeiro modificadores sem variantes para produtos simples.

Depois adicionar variantes, porque variantes exigem mudar mais a logica de preco base.

Sequencia pratica:

1. Observacao por item, que ja existe parcialmente.
2. Grupos de modificadores.
3. Modificadores com preco.
4. Variantes de tamanho.
5. Meio a meio para pizzas.

