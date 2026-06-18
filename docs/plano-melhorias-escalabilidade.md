# Plano de Melhorias e Escalabilidade

## Objetivo

Transformar o sistema em uma plataforma de cardapio digital simples para pequenos estabelecimentos, mas preparada para crescer sem virar um painel complexo demais.

O foco e manter tres principios:

- Cliente compra sem friccao.
- Dono da loja configura tudo sem depender de suporte tecnico.
- Arquitetura suporta mais pedidos, lojas, canais e automacoes no futuro.

## Referencias analisadas

Referencias originais:

- https://meucardapio.ai/
- https://goomer.com.br/cardapio-digital-delivery
- https://www.hubt.com.br/

Referencias adicionais:

- https://olaclick.com/cardapio-digital/
- https://boostdelivery.food/
- https://cardapioweb.com/
- https://ajuda.cardapioweb.com/gestao/mesas-e-comandas/qr-code-de-mesa
- https://goomer.com.br/blog/funcionalidades-qr-code
- https://www.gloriafood.com/
- https://squareup.com/us/en/online-ordering
- https://rezku.com/blog/online-ordering-systems-restaurants-owner-benefits/

## Aprendizados das referencias

### O que aparece como padrao de mercado

- Cardapio publico sem app e sem cadastro obrigatorio.
- Pedido por WhatsApp como canal inicial de baixo atrito.
- Painel de pedidos com alerta sonoro e historico.
- QR Code para mesa, balcao, retirada e delivery.
- Editor simples de produtos, fotos, categorias, precos e disponibilidade.
- Formas de pagamento configuraveis.
- Cupons, promocoes, combos e destaques.
- Dominio proprio ou link personalizado.
- Relatorios basicos de vendas, pedidos e produtos mais vendidos.
- Integracao com Pixel, Google Analytics e campanhas.

### O que diferencia sistemas mais maduros

- KDS, ou tela de cozinha, com pedidos separados por setor.
- Controle de fluxo da cozinha: pausar pedidos, limitar volume e agendar horarios.
- Item enviado ao setor correto: cozinha, bar, sobremesa.
- Pedido na mesa ou comanda via QR Code.
- Pagamento online com Pix/cartao e comprovacao automatica.
- Programa de fidelidade e campanhas de WhatsApp.
- Multiloja, usuarios, permissoes e papeis.
- Dados acionaveis: recorrencia, ticket medio, horarios de pico e produtos com melhor margem.

## Posicionamento recomendado

O produto deve ser "o cardapio digital direto da loja", nao um marketplace.

Mensagem central:

- Sem comissao por pedido.
- Facil como atualizar uma rede social.
- Pedido organizado no painel e no WhatsApp.
- Pronto para delivery, retirada e mesa.
- Pequeno comeca simples; quando cresce, ativa recursos mais avancados.

## Diagnostico do sistema atual

### Pontos fortes

- Node.js simples, sem Docker.
- Supabase como banco e storage.
- Cardapio publico rapido.
- Carrinho e checkout ja funcionam.
- Pedido e itens sao salvos antes do WhatsApp.
- Admin ja possui login por conta no banco.
- Cliente tem conta, enderecos e historico.
- Admin ja gerencia pedidos, clientes, loja, categorias e produtos.
- Painel de pedidos ja tem status, cores, som, pop-up e arrastar cards.

### Lacunas principais

- Ainda e single-store na pratica.
- Nao ha papeis/permissoes de usuarios.
- Cardapio ainda nao suporta adicionais, variacoes, combos e regras por canal.
- Checkout ainda nao tem agendamento, cupom, taxa por bairro/cep ou pagamento online.
- Pedido na mesa/comanda ainda nao existe.
- Relatorios ainda sao basicos ou ausentes.
- Nao existe fila/evento para notificacao em tempo real.
- Nao ha modo offline estruturado no navegador para historico, telas principais e fallback de conexao.
- Nao existe onboarding guiado para loja nova.

## Roadmap por fases

### Fase 1 - Base comercial simples

Objetivo: deixar o sistema muito bom para uma loja pequena vender hoje.

Funcionalidades:

- Onboarding inicial da loja com checklist:
  - dados da loja;
  - horario de funcionamento;
  - WhatsApp;
  - formas de pagamento;
  - taxa de entrega;
  - primeira categoria;
  - primeiro produto.
- Painel "Comece aqui" no admin quando a loja estiver incompleta.
- Editor de loja separado em abas simples:
  - Perfil;
  - Atendimento;
  - Entrega e retirada;
  - Pagamentos;
  - Aparencia.
- Preview do cardapio dentro do admin.
- Horario de funcionamento por dia da semana.
- Loja aberta/fechada com mensagem personalizada.
- Pausar pedidos temporariamente sem desligar o cardapio.
- Pedido minimo por entrega.
- Taxa de entrega fixa e retirada gratis.
- Confirmacao visual melhor antes de enviar pedido.
- Historico offline de pedidos do cliente com itens.

Banco sugerido:

- `store_hours`
- `store_delivery_rules`
- `store_onboarding_steps`

Prioridade: alta.

### Fase 2 - Cardapio competitivo

Objetivo: aproximar a experiencia de iFood/cardapios maduros.

Funcionalidades:

- Adicionais e variacoes:
  - grupos obrigatorios;
  - grupos opcionais;
  - minimo e maximo de escolhas;
  - preco adicional;
  - disponibilidade por adicional.
- Produto com tamanhos:
  - pequeno, medio, grande;
  - meio a meio para pizza;
  - preco por tamanho.
- Combos:
  - produto principal;
  - acompanhamento;
  - bebida;
  - desconto automatico.
- Upsell inteligente:
  - "adicione batata";
  - "leve uma bebida";
  - "complete seu combo".
- Destaques configuraveis:
  - mais vendidos;
  - promocao;
  - lancamentos;
  - recomendados.
- Imagens multiplas por produto.
- Produto disponivel por canal:
  - delivery;
  - retirada;
  - mesa.
- Produto disponivel por horario:
  - almoco;
  - jantar;
  - fim de semana.

Banco sugerido:

- `menu_item_variants`
- `menu_modifier_groups`
- `menu_modifiers`
- `menu_combos`
- `menu_combo_items`
- `menu_item_channels`
- `menu_item_schedules`

Prioridade: alta.

### Fase 3 - Operacao de pedidos

Objetivo: organizar a cozinha sem exigir ferramentas caras.

Funcionalidades:

- Painel kanban de pedidos com atualizacao em tempo real.
- KDS simples:
  - tela cozinha;
  - tela bar;
  - tela entrega;
  - tela retirada.
- Setor por item/categoria:
  - hamburguer para cozinha;
  - bebida para bar;
  - sobremesa para finalizacao.
- Tempo estimado por pedido.
- Tempo medio por status.
- Alerta de pedido atrasado.
- Impressao de pedido:
  - via navegador;
  - layout de cozinha;
  - layout de entrega.
- Mensagens automaticas ao cliente:
  - pedido recebido;
  - em preparo;
  - saiu para entrega;
  - pronto para retirada.
- Cancelamento com motivo.
- Historico completo de alteracao de status.

Banco sugerido:

- `order_status_events`
- `production_sectors`
- `category_sector_rules`
- `order_notifications`

Prioridade: alta.

### Fase 4 - Delivery e checkout profissional

Objetivo: reduzir erro, proteger margem e melhorar conversao.

Funcionalidades:

- Taxa por bairro, CEP ou zona.
- Tempo estimado por bairro/zona.
- Valor minimo por zona.
- Retirada no balcao com horario estimado.
- Agendamento de pedido:
  - para hoje;
  - para outro dia;
  - intervalo de horario.
- Controle de capacidade:
  - maximo de pedidos por janela;
  - pausar delivery mantendo retirada ativa.
- Cupom:
  - valor fixo;
  - percentual;
  - primeira compra;
  - cliente recorrente;
  - validade e limite de uso.
- Pagamento online:
  - Pix copia e cola;
  - Pix com confirmacao manual inicialmente;
  - gateway depois.
- Comprovante Pix anexado ou informado no pedido.
- Troco para dinheiro.
- Taxa de embalagem ou servico opcional.

Banco sugerido:

- `delivery_zones`
- `delivery_neighborhoods`
- `coupons`
- `coupon_redemptions`
- `payment_transactions`
- `order_capacity_slots`

Prioridade: media-alta.

### Fase 5 - Cliente, fidelidade e marketing

Objetivo: criar recorrencia sem complicar a vida do dono.

Funcionalidades:

- Login por telefone e senha, mantendo alternativa simples.
- Recuperacao de senha mais segura:
  - codigo por WhatsApp no futuro;
  - enquanto nao tiver API, validar telefone + codigo de pedido recente.
- Favoritos.
- Repetir ultimo pedido.
- Enderecos multiplos com apelidos.
- Pontos de fidelidade:
  - 1 ponto por real;
  - premio por X pedidos;
  - cupom automatico apos compra.
- Campanhas manuais:
  - clientes sem comprar ha X dias;
  - clientes que compraram produto Y;
  - aniversariantes.
- Segmentos:
  - novos;
  - recorrentes;
  - inativos;
  - alto ticket.
- Exportacao CSV de clientes e pedidos.

Banco sugerido:

- `customer_favorites`
- `loyalty_programs`
- `loyalty_points`
- `marketing_segments`
- `campaigns`
- `campaign_recipients`

Prioridade: media.

### Fase 6 - Mesa, comanda e atendimento local

Objetivo: abrir uso para restaurantes, bares e lanchonetes com salao.

Funcionalidades:

- QR Code por mesa.
- Modo mesa:
  - cliente faz pedido do celular;
  - pedido entra identificado por mesa;
  - admin aceita e envia para cozinha.
- Modo comanda:
  - varios clientes na mesma mesa;
  - conta individual ou agrupada.
- Chamar garcom.
- Pedir fechamento de conta.
- Taxa de servico configuravel.
- Controle de mesas:
  - livre;
  - ocupada;
  - aguardando atendimento;
  - aguardando pagamento.
- Impressao/visualizacao da conta.

Banco sugerido:

- `tables`
- `table_sessions`
- `table_session_items`
- `service_calls`

Prioridade: media.

### Fase 7 - Relatorios e gestao

Objetivo: dar clareza para o dono sem virar ERP pesado.

Funcionalidades:

- Dashboard simples:
  - vendas hoje;
  - pedidos hoje;
  - ticket medio;
  - pedidos em aberto;
  - produto mais vendido.
- Relatorios:
  - vendas por periodo;
  - vendas por forma de pagamento;
  - vendas por canal;
  - produtos mais vendidos;
  - horarios de pico;
  - clientes recorrentes;
  - cancelamentos.
- Comparativo:
  - hoje vs ontem;
  - semana atual vs anterior;
  - mes atual vs anterior.
- Exportacao CSV.
- Metas simples de venda.

Banco sugerido:

- Inicialmente views SQL.
- Depois tabelas agregadas por dia para escala:
  - `daily_store_metrics`
  - `daily_item_metrics`

Prioridade: media.

### Fase 8 - Escala real e SaaS

Objetivo: transformar de sistema de uma loja em plataforma multiestabelecimento.

Funcionalidades:

- Multi-loja com `stores`.
- Slug por loja:
  - `/loja/luskebarguer`;
  - dominio proprio no futuro.
- Usuarios por loja:
  - dono;
  - gerente;
  - atendente;
  - cozinha;
  - entregador.
- Permissoes por papel.
- Auditoria de alteracoes.
- Planos e limites:
  - quantidade de produtos;
  - pedidos por mes;
  - recursos premium.
- Temas por loja:
  - cor primaria;
  - logo;
  - capa;
  - fonte;
  - modo claro/escuro.
- Webhooks:
  - pedido criado;
  - status alterado;
  - pagamento confirmado.
- API interna versionada.

Banco sugerido:

- `stores`
- `store_users`
- `roles`
- `permissions`
- `audit_logs`
- `plans`
- `store_subscriptions`
- `webhooks`

Prioridade: media-baixa enquanto for uma unica loja, alta se virar produto SaaS.

## Melhorias tecnicas recomendadas

### Arquitetura

- Separar backend em modulos:
  - `routes`;
  - `services`;
  - `repositories`;
  - `validators`;
  - `auth`;
  - `supabase/client`.
- Manter Node puro por enquanto, mas preparar migracao para framework leve se crescer:
  - Fastify seria boa opcao.
- Criar camada de repositorio para evitar espalhar query Supabase pelo servidor inteiro.
- Padronizar respostas de erro.
- Criar migracoes SQL versionadas em vez de um schema unico.

### Tempo real

- Curto prazo:
  - polling mais eficiente com `updated_at` e `since`.
- Medio prazo:
  - Supabase Realtime para pedidos e status.
- Longo prazo:
  - fila/eventos para notificacoes, impressao e webhooks.

### Performance

- Cache publico por loja e por versao de cardapio.
- Invalidacao ao editar loja/cardapio.
- Imagens otimizadas:
  - limite de tamanho;
  - thumbnails;
  - lazy loading;
  - fallback quando imagem falhar.
- Paginar pedidos, clientes e produtos no admin.
- Indices por `store_id`, `status`, `created_at`, `customer_id`.

### Seguranca

- Remover dependencia de service role em rotas que puderem usar politicas.
- Manter service role somente no servidor.
- Rate limit em login, checkout e upload.
- Validacao rigorosa de upload.
- Cookies com `Secure` em producao.
- Logs sem dados sensiveis.
- Auditoria para alteracoes criticas:
  - preco;
  - status de pedido;
  - exclusao de cliente/produto;
  - alteracao de WhatsApp da loja.

### Operacao e deploy

- Health check `/api/health` ja existe; expandir com status do banco.
- Script de seed demo.
- Script de criacao de admin ja existe; manter.
- Variaveis de ambiente documentadas.
- Log estruturado.
- Backup/exportacao basica:
  - cardapio;
  - clientes;
  - pedidos.

## Melhorias de UX para pequeno estabelecimento

### Admin

- Dashboard inicial com "o que preciso fazer agora".
- Menos telas tecnicas, mais frases de negocio:
  - "Sua loja esta aberta";
  - "Tempo medio de preparo";
  - "Pedido minimo";
  - "Bairros atendidos".
- Formularios com exemplos:
  - WhatsApp: `55 11 99999-9999`;
  - taxa de entrega;
  - descricao curta de produto.
- Confirmacoes antes de excluir.
- Duplicar produto.
- Pausar produto por um clique.
- Importar cardapio via CSV no futuro.
- Modo "loja cheia":
  - aumentar prazo;
  - pausar delivery;
  - ocultar produtos demorados.

### Cliente

- Checkout em etapas curtas:
  - sacola;
  - entrega/retirada;
  - pagamento;
  - confirmar.
- Perguntar endereco salvo quando houver mais de um.
- Mostrar itens completos antes de confirmar.
- Mostrar tempo estimado.
- Mostrar status do pedido em uma pagina publica por codigo.
- Repetir pedido a partir do historico.
- Salvar favoritos.
- Sugestoes no carrinho.

## Priorizacao sugerida

### Fazer agora

1. Atualizar plano antigo e remover mencao a admin com token.
2. Implementar historico offline com itens.
3. Criar horario de funcionamento.
4. Criar adicionais/variacoes de produto.
5. Melhorar checkout com revisao final e agendamento simples.
6. Criar relatorio basico no admin.

### Fazer em seguida

1. Cupons.
2. Taxa por bairro.
3. Pedido por QR Code de mesa.
4. KDS simples.
5. Mensagens automaticas por status.
6. Fidelidade basica.

### Fazer quando virar SaaS

1. Multi-loja.
2. Usuarios e permissoes.
3. Planos.
4. Dominio personalizado.
5. Webhooks e integracoes.
6. Gateway de pagamento completo.

## Indicadores de sucesso

- Tempo para loja nova publicar primeiro produto: menos de 10 minutos.
- Tempo do cliente para fechar pedido: menos de 2 minutos.
- Pedido com erro operacional: reduzir ao maximo com confirmacao e modificadores claros.
- Dono consegue alterar preco/foto/disponibilidade sem suporte.
- Admin carrega pedidos em menos de 2 segundos em operacao normal.
- Sistema suporta aumentar pedidos sem refazer arquitetura.

## Decisoes de produto recomendadas

- Nao exigir cadastro para comprar.
- Conta de cliente deve ser conveniencia, nao barreira.
- WhatsApp continua como canal principal no inicio.
- Admin deve ser mobile-first o suficiente para dono usar pelo navegador do celular.
- Evitar ERP pesado; entregar funcoes de restaurante de forma guiada.
- Construir multi-loja so depois de estabilizar uma loja muito bem.
