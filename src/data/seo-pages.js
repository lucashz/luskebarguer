export const seoLandingPages = [
  page('cardapio-digital', 'Cardápio Digital para Restaurantes | TáPronto', 'Crie um cardápio digital profissional com produtos, fotos, adicionais, QR Code e pedidos online. Teste o TáPronto grátis.', 'Seu cardápio digital pronto para vender', 'Troque cardápios desatualizados e pedidos espalhados por uma experiência simples para o cliente e organizada para a equipe.', ['Atualize preços e disponibilidade em tempo real', 'Compartilhe por link, QR Code, Instagram e WhatsApp', 'Receba pedidos sem pagar comissão por venda']),
  page('cardapio-digital-qr-code', 'Cardápio Digital com QR Code | TáPronto', 'Crie um QR Code para seu cardápio digital e permita que clientes vejam produtos, adicionais e preços pelo celular.', 'Cardápio com QR Code, sem PDF desatualizado', 'O cliente aponta a câmera, abre o cardápio e encontra informações legíveis e atualizadas, sem instalar aplicativo.', ['QR Code exclusivo para cada loja', 'Cardápio responsivo para celular', 'Mudanças publicadas sem imprimir novamente']),
  page('sistema-de-pedidos-online', 'Sistema de Pedidos Online para Restaurantes | TáPronto', 'Organize pedidos de delivery, retirada, mesa e comanda em um painel online criado para restaurantes.', 'Pedidos online organizados do início ao fim', 'Centralize novos pedidos, preparo, entrega e conclusão para reduzir anotações perdidas e retrabalho na operação.', ['Painel de pedidos em tempo real', 'Status claros para cozinha e atendimento', 'Histórico, clientes, cupons e formas de pagamento']),
  page('cardapio-digital-para-delivery', 'Cardápio Digital para Delivery | TáPronto', 'Receba pedidos de delivery por um cardápio digital próprio, com bairros, taxas, pagamento e painel de acompanhamento.', 'Um delivery com canal de vendas próprio', 'Venda pelo seu link, controle áreas e taxas de entrega e mantenha o relacionamento com seus clientes.', ['Taxas de entrega por bairro', 'Pedido mínimo e horários configuráveis', 'Pix online, retirada e entrega']),
  page('pedidos-online-whatsapp', 'Pedidos Online com WhatsApp para Restaurantes | TáPronto', 'Receba notificações de novos pedidos no WhatsApp e acompanhe toda a operação pelo painel TáPronto.', 'WhatsApp como alerta, painel como controle', 'Use o WhatsApp para ser avisado rapidamente sem transformar conversas soltas no sistema de gestão dos pedidos.', ['Notificação automática disponível como adicional', 'QR Code para conexão simplificada', 'Pedido completo preservado no painel']),
  page('sistema-para-restaurantes', 'Sistema para Restaurantes com Cardápio e Pedidos | TáPronto', 'Cardápio digital, pedidos, cozinha, mesas, comandas, clientes e pagamentos em uma plataforma para restaurantes.', 'A operação do restaurante em um só lugar', 'Comece com o cardápio e evolua para pedidos, salão, equipe, fidelidade e múltiplas lojas conforme a operação crescer.', ['Delivery, retirada, mesa e comanda', 'Permissões para a equipe', 'Relatórios e visão da operação']),
  segment('cardapio-digital-para-pizzaria', 'pizzaria', 'sabores, tamanhos, bordas e adicionais', 'Organize sabores, tamanhos, bordas e observações sem depender de mensagens longas e sujeitas a erro.'),
  segment('cardapio-digital-para-hamburgueria', 'hamburgueria', 'combos, pontos da carne e adicionais', 'Apresente hambúrgueres com boas fotos, monte combos e permita escolher adicionais de forma clara.'),
  segment('cardapio-digital-para-restaurante', 'restaurante', 'salão, delivery, retirada e cozinha', 'Atenda diferentes canais em um painel e mantenha cardápio, preços e disponibilidade atualizados.'),
  segment('cardapio-digital-para-lanchonete', 'lanchonete', 'lanches, combos, bebidas e retirada', 'Agilize pedidos de balcão, retirada e entrega com produtos fáceis de localizar e personalizar.'),
  segment('cardapio-digital-para-acai', 'loja de açaí', 'tamanhos, frutas, coberturas e complementos', 'Deixe o cliente montar o açaí passo a passo, respeitando quantidades e adicionais disponíveis.'),
  segment('cardapio-digital-para-bar', 'bar', 'porções, bebidas, mesas e comandas', 'Organize pedidos no salão, mesas e comandas e atualize rapidamente itens indisponíveis.'),
];

function page(slug, title, description, heading, intro, benefits) {
  return {
    slug, title, description, heading, intro, benefits,
    steps: ['Cadastre a loja e personalize sua marca', 'Adicione produtos, categorias e formas de atendimento', 'Publique o link e compartilhe o QR Code'],
    faq: [
      ['Precisa instalar aplicativo?', 'Não. O cliente acessa pelo navegador do celular e a equipe utiliza o painel online.'],
      ['Posso alterar o cardápio depois?', 'Sim. Produtos, preços e disponibilidade podem ser atualizados sempre que necessário.'],
      ['O TáPronto cobra comissão por pedido?', 'Não há taxa percentual por pedido. A contratação segue o plano e os adicionais escolhidos.']
    ]
  };
}

function segment(slug, business, features, intro) {
  const label = business.charAt(0).toUpperCase() + business.slice(1);
  return page(
    slug,
    `Cardápio Digital para ${label} | TáPronto`,
    `Cardápio digital para ${business} com ${features}, pedidos online, QR Code e painel de gestão. Teste o TáPronto grátis.`,
    `Cardápio digital pensado para ${business}`,
    intro,
    [`Configure ${features}`, 'Receba pedidos pelo link próprio da loja', 'Acompanhe atendimento e preparo pelo painel']
  );
}
