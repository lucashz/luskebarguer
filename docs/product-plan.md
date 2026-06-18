# Plano do Produto

## Referencias avaliadas

- https://meucardapio.ai/
- https://goomer.com.br/cardapio-digital-delivery
- https://www.hubt.com.br/

## Direcao

O produto deve ser um cardapio publico, rapido e sem barreira para compra. O cliente navega, monta o carrinho, informa dados basicos no checkout e envia o pedido pronto para o WhatsApp da loja. Cadastro deve ser opcional e servir para conveniencia: salvar telefone, endereco e consultar historico.

## MVP

- Cardapio publico sem login.
- Busca, categorias, destaques, imagens, preco, descricao e tags.
- Carrinho persistido no navegador.
- Checkout com nome, telefone, endereco, tipo de entrega, forma de pagamento e observacoes.
- Criacao do pedido no banco antes do redirecionamento para WhatsApp.
- Link `wa.me` com mensagem formatada para a loja.
- Consulta simples de pedidos por telefone.
- Admin com token para gerenciar pedidos, clientes, loja, categorias, produtos e upload de imagens.

## Banco

Tabelas principais:

- `store_settings`: dados da loja, WhatsApp, taxa, pedido minimo e formas de pagamento.
- `menu_categories`: categorias do cardapio.
- `menu_items`: produtos, preco, imagem, tags e disponibilidade.
- `customers`: cadastro leve por telefone.
- `customer_addresses`: enderecos salvos.
- `orders`: pedido, status, snapshots, totais e mensagem do WhatsApp.
- `order_items`: itens do pedido com snapshot do produto.
- `menu_modifier_groups` e `menu_modifiers`: base para adicionais, tamanhos e escolhas obrigatorias.

## Melhorias planejadas

- Login de cliente por OTP no WhatsApp/SMS antes de exibir dados pessoais.
- Adicionais e variacoes por produto: tamanho, borda, ponto, acompanhamentos, observacoes por item.
- Cupons, combos, horarios promocionais e taxa de entrega por bairro ou raio.
- Status em tempo real no painel admin e tela de cozinha.
- Impressao automatica do pedido e alerta sonoro.
- Controle de abertura por horario, pausa de itens e estoque simples.
- Pix copia e cola, gateway de pagamento e conciliacao.
- Relatorios de vendas, ticket medio, produtos mais vendidos e clientes recorrentes.
- Campanhas de reativacao no WhatsApp com segmentacao.
- Dominios personalizados, QR Code por loja e integracoes de Analytics/Pixel.
- Multi-loja com usuarios, papeis e permissoes.
