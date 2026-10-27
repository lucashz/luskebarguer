/**
 * Harvey LAARC & Knowledge-Based Sales Engine for TáPronto WhatsApp Sales
 * Answers prospect questions autonomously based on comprehensive product knowledge.
 */

export const TAPRONTO_KNOWLEDGE = {
  product: 'TáPronto Menu Digital e Gestão de Pedidos WhatsApp',
  pricing: 'Planos acessíveis sem taxa sobre pedidos. Teste 100% gratuito com cardápio pré-montado.',
  commission: '0% de comissão por pedido. Todo o lucro das vendas é do estabelecimento.',
  printers: 'Compatível com impressoras térmicas (58mm e 80mm), além de tela e WhatsApp.',
  payments: 'Pix automático (chave e QR Code copia e cola), cartão e dinheiro na entrega com troco.',
  delivery: 'Taxa de entrega configurável por bairro ou distância, e opção de retirada no balcão.',
  installation: 'Não precisa baixar app. Abre direto no navegador do celular ou computador.',
  editing: 'Painel simples no celular para mudar preços, pausar itens e adicionar pratos na hora.',
  contract: 'Sem contrato de fidelidade, sem pegadinhas e sem multa de cancelamento.',
  ifood: 'Trabalha junto com o iFood. O iFood traz novos clientes; o TáPronto fideliza os do WhatsApp economizando 27% de taxa.'
};

export function classifyInboundReply(rawText = '') {
  const text = String(rawText || '').trim().toLowerCase();

  // 1. Opt-out (Cancelamento/Parar mensagens)
  if (/\b(descadastrar|remover meu n[uú]mero|n[aã]o mande|n[aã]o envie|pare de mandar|parar de mandar)\b|^(sair|pare|parar|cancelar)[!.? ]*$/i.test(text)) {
    return { category: 'opt_out', intent: 'opt_out', requiresHuman: false, stopAutomation: true };
  }

  // 2. Reflex Brush-off / Recusa direta
  if (/\b(n[aã]o (tenho|temos) interesse|n[aã]o (quero|queremos)|dispenso|sem interesse|n[aã]o preciso|obrigad[oa], mas n[aã]o)\b/i.test(text)) {
    return { category: 'brush_off', intent: 'not_interested', requiresHuman: false, stopAutomation: true };
  }

  // 3. Fidelidade / Contrato / Cancelamento de plano
  if (/\b(fidelidade|contrato|multa|per[ií]odo m[ií]nimo|preso|cancelar plano|multa se cancelar)\b/i.test(text)) {
    return { category: 'contract_loyalty', intent: 'product_question', requiresHuman: false, stopAutomation: false };
  }

  // 3. Impressora térmica / Impressão de cupom
  if (/\b(impressora|imprimir|impress[aã]o|t[eé]rmica|cupom|comanda|58mm|80mm)\b/i.test(text)) {
    return { category: 'printer_integration', intent: 'product_question', requiresHuman: false, stopAutomation: false };
  }

  // 4. Taxas / Comissões / Porcentagem por pedido
  if (/\b(comiss[aã]o|porcentagem|taxa por pedido|taxa sobre|cobra taxa|cobra comiss|cobra porcentagem)\b/i.test(text)) {
    return { category: 'commission_fees', intent: 'product_question', requiresHuman: false, stopAutomation: false };
  }

  // 5. Formas de pagamento / Pix / Cartão / Dinheiro
  if (/\b(pix|pagamento|cart[aã]o|dinheiro|troco|como paga|forma de pagamento|qr\s?code)\b/i.test(text)) {
    return { category: 'payment_pix', intent: 'product_question', requiresHuman: false, stopAutomation: false };
  }

  // 6. Taxa de entrega / Bairros / Distância / Retirada
  if (/\b(entrega|taxa de entrega|bairro|dist[aâ]ncia|motoboy|frete|retirada|balc[aã]o)\b/i.test(text)) {
    return { category: 'delivery_rules', intent: 'product_question', requiresHuman: false, stopAutomation: false };
  }

  // 7. Precisa baixar app / Instalação
  if (/\b(baixar|aplicativo|instalar|app|play store|apple store|mem[oó]ria)\b/i.test(text)) {
    return { category: 'app_download', intent: 'product_question', requiresHuman: false, stopAutomation: false };
  }

  // 8. Como alterar preços / Cadastrar produtos / Pausar
  if (/\b((mudar|alterar|trocar|ajustar)(\s+o)?\s+pre[çc]o|atualizar|cadastrar|cadastro|adicionar prato|esgotou|pausar item|mexer)\b/i.test(text)) {
    return { category: 'menu_editing', intent: 'product_question', requiresHuman: false, stopAutomation: false };
  }

  // 9. Fidelidade / Contrato / Cancelamento
  if (/\b(fidelidade|contrato|multa|per[ií]odo m[ií]nimo|preso|cancelar quando quiser)\b/i.test(text)) {
    return { category: 'contract_loyalty', intent: 'product_question', requiresHuman: false, stopAutomation: false };
  }

  // 10. Horário de funcionamento / Aberto e Fechado
  if (/\b(hor[aá]rio|aberto|fechado|abertura|fechamento|madrugada)\b/i.test(text)) {
    return { category: 'store_hours', intent: 'product_question', requiresHuman: false, stopAutomation: false };
  }

  // 11. Fotos dos pratos / Imagens
  if (/\b(foto|fotos|imagem|imagens|pratos reais|colocar foto)\b/i.test(text)) {
    return { category: 'photos_dishes', intent: 'product_question', requiresHuman: false, stopAutomation: false };
  }

  // 12. Como funciona no geral / Como o pedido chega
  if (/\b(como funciona|como [eé] que funciona|como recebe|como chega|explica|como [eé]|funciona como)\b/i.test(text)) {
    return { category: 'how_it_works', intent: 'product_question', requiresHuman: false, stopAutomation: false };
  }

  // 13. Concorrente iFood / Apps de entrega
  if (/\b(ifood|i food|delivery much|rappi|aiqfome)\b/i.test(text)) {
    return { category: 'competitor_ifood', intent: 'existing_competitor', requiresHuman: false, stopAutomation: false };
  }

  // 14. Outros sistemas / cardápio online
  if (/\b(ola\s?click|olaclick|anota\s?ai|goomer|card[aá]pio web|datacaixa|sistema|totvs)\b/i.test(text)) {
    return { category: 'competitor_other', intent: 'existing_competitor', requiresHuman: false, stopAutomation: false };
  }

  // 15. Preço / Valores / Planos
  if (/\b(pre[çc]o|valor|quanto custa|mensalidade|plano|qual o valor|quanto [eé]|qual o pre[çc]o)\b/i.test(text)) {
    return { category: 'price_question', intent: 'price_question', requiresHuman: false, stopAutomation: false };
  }

  // 16. Tempo / Correria
  if (/\b(agora n[aã]o|sem tempo|ocupad[oa]|correria|depois|mais tarde|semana que vem)\b/i.test(text)) {
    return { category: 'timing_busy', intent: 'busy', requiresHuman: false, stopAutomation: false };
  }

  // 17. Status Quo (PDF / WhatsApp picture)
  if (/\b(j[aá] tenho card[aá]pio|j[aá] uso pdf|meu pdf|mando a foto|já temos|j[aá] tenho)\b/i.test(text)) {
    return { category: 'pdf_status_quo', intent: 'objection', requiresHuman: false, stopAutomation: false };
  }

  // 18. Interesse positivo / Pedir link
  if (/\b(sim|quero|pode mandar|pode enviar|manda|tenho interesse|legal|gostei|me manda|link)\b/i.test(text)) {
    return { category: 'interested', intent: 'interested', requiresHuman: false, stopAutomation: false };
  }

  // 19. Saudação
  if (/^(oi|ol[aá]|bom dia|boa tarde|boa noite|tudo bem)[!.? ]*$/i.test(text)) {
    return { category: 'greeting', intent: 'greeting', requiresHuman: false, stopAutomation: false };
  }

  // 20. Dúvida geral / pergunta aberta -> Responder com informações do produto
  return { category: 'general_product_info', intent: 'product_question', requiresHuman: false, stopAutomation: false };
}

export function generateLaarcResponse(category, context = {}) {
  const link = context.previewUrl || 'https://taprontomenu.com.br/cardapio';

  switch (category) {
    case 'printer_integration':
      return 'Funciona sim! Os pedidos chegam formatados prontos para imprimir em qualquer impressora térmica (58mm ou 80mm), além de ficarem organizados na tela e no seu WhatsApp. Vale dar uma olhada na prévia?';

    case 'commission_fees':
      return 'Zero comissão! Não cobramos nenhuma taxa ou porcentagem sobre as suas vendas. 100% do valor dos pedidos fica com vocês. Quer ver como ficou a demonstração?';

    case 'payment_pix':
      return `O cliente pode pagar por Pix com QR Code e chave copia e cola automática, cartão ou dinheiro na entrega. O valor do Pix vai direto pra sua conta. Conseguiu testar pelo link: ${link}?`;

    case 'delivery_rules':
      return 'Dá sim! Você configura as taxas de entrega por bairro ou distância, ou pode deixar opção de retirada no balcão. O sistema já calcula o total automático pro cliente. Vale dar uma olhada?';

    case 'app_download':
      return `Não precisa baixar nada! O cliente só clica no link pelo celular ou computador e o cardápio abre na hora, sem gastar memória do telefone e sem cadastro chato. Dá uma olhada no link pra testar: ${link}`;

    case 'menu_editing':
      return 'Super simples! Você tem um painel direto no celular pra mudar preços, pausar itens que esgotaram e criar promoções em poucos segundos. Vale ver como ficou a demonstração da sua loja?';

    case 'contract_loyalty':
      return 'Não tem fidelidade nem contrato preso! Você pode testar gratuitamente e cancelar quando quiser sem nenhuma multa. O que achou da prévia da sua loja?';

    case 'store_hours':
      return `Dá sim! Você define os dias e horários de funcionamento e o cardápio abre e fecha automaticamente. Se estiver fechado, o cliente é avisado na hora. Conseguiu abrir o link: ${link}?`;

    case 'photos_dishes':
      return 'A gente já colocou fotos e opções no estilo dos pratos que vocês vendem pra deixar a prévia pronta. Pelo painel você também pode trocar qualquer foto quando quiser. O que achou?';

    case 'how_it_works':
      return `O cliente abre o link, escolhe os pratos com opcionais, informa endereço e pagamento. O pedido chega formatado e pronto no seu WhatsApp, já calculado. Quer ver na prática como ficou: ${link}?`;

    case 'competitor_ifood':
      return 'O iFood é ótimo pra trazer cliente novo que ainda não conhece a loja. O TáPronto entra pro cliente que já pede no WhatsApp de vocês, pra economizar os 27% de taxa. Quer dar uma olhada na prévia?';

    case 'competitor_other':
      return 'Perfeito! O principal diferencial do TáPronto é abrir direto sem o cliente precisar instalar nada ou criar cadastro, facilitando o pedido rápido no WhatsApp. Vale ver como ficou a prévia da sua loja?';

    case 'price_question':
      return `A demonstração e o teste são 100% gratuitos com o cardápio já pronto, e nossos planos não cobram taxa sobre pedidos. Dá uma olhada no link pra ver como ficou: ${link}`;

    case 'pdf_status_quo':
      return 'Te entendo! A diferença é que no link o cliente abre na hora no celular e no computador, sem gastar internet baixando arquivo e sem dar zoom. Conseguiu abrir pra testar?';

    case 'timing_busy':
      return `Super compreensível a correria! Como já deixamos a demonstração montada, vou deixar o link aqui: ${link}. Quando tiver 1 minutinho você abre no celular ou no computador. Um abraço!`;

    case 'interested':
      return `Que ótimo! O cardápio demonstrativo está pronto neste link: ${link}. Funciona direto no celular e no computador, e o pedido chega pronto no seu WhatsApp. Conseguiu testar?`;

    case 'greeting':
      return `Tudo bem? Montei uma demonstração prática do cardápio de vocês no celular e no computador: ${link}. O que achou de como ficou?`;

    case 'brush_off':
      return 'Perfeito, obrigado pelo retorno! Qualquer coisa que precisarem no futuro, estamos à disposição. Sucesso com as vendas!';

    case 'opt_out':
      return 'Tudo bem! Já retiramos o seu número da nossa lista. Boas vendas!';

    case 'general_product_info':
    default:
      return `O TáPronto organiza seus pedidos direto pelo WhatsApp sem cobrar comissão por venda, e o cardápio abre na hora no celular e no computador. Dá uma olhada na demonstração pra ver como funciona: ${link}`;
  }
}
