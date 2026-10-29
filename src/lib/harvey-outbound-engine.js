/**
 * HARVEY OUTBOUND ENGINE — TáPronto
 * Baseado no framework de vendas autônomas B2B (ethanplusai/harvey)
 * 
 * Regras Inegociáveis (Anti-AI & Conversão):
 * 1. NUNCA enviar link frio ou pitch de vendas sem permissão prévia (Earn the Right to Ask).
 * 2. NUNCA enviar URLs com UUIDs opacos (/c/uuid) — sempre o slug limpo e com orgulho da marca (ex: taprontomenu.com.br/smash-league-burger).
 * 3. NUNCA usar introduções robóticas corporativas ("Aqui é da equipe TáPronto", "Montamos uma demonstração automática").
 * 4. Comece pelo prospecto (nota do Google, prato real, correria do delivery), não por "nós".
 * 5. Menos de 45 palavras por mensagem, exatamente UMA pergunta de baixo atrito.
 */

export function cleanLeadName(rawName = '') {
  return String(rawName || '')
    .replace(/\s*-\s*(Hamburgueria|Lanchonete|Restaurante|Pizzaria|Marmitaria|Bar|Disk|Delivery).*/i, '')
    .replace(/\s*\|\s*.*/i, '')
    .replace(/\(.*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildCleanMenuUrl(slug) {
  const cleanSlug = String(slug || '').trim().toLowerCase().replace(/^\/+/, '');
  if (!cleanSlug) return 'https://taprontomenu.com.br';
  return `https://taprontomenu.com.br/${cleanSlug}`;
}

/**
 * PASSO 1: O Toque Humano com Gancho de Observação e Pedido de Permissão
 * Zero links. Zero fotos comerciais. Zero aspecto de vírus ou spam.
 */
export function buildHarveyStep1(lead) {
  const name = cleanLeadName(lead.business_name);
  const hour = new Date().getHours();
  const saudacao = hour >= 18 ? 'Boa noite' : (hour >= 12 ? 'Boa tarde' : 'Bom dia');
  const segment = String(lead.segment || '').toLowerCase();

  // Segmento Almoço / Marmitaria (Turno Manhã)
  if (segment === 'marmitaria' || segment === 'restaurante') {
    const templates = [
      `${saudacao}, tudo bem? Vocês atendem delivery hoje pro almoço? Tem o cardápio com os valores pra eu dar uma olhada?`,
      `Oi, ${saudacao.toLowerCase()}! Como faço pra ver as opções de marmita/almoço de hoje no ${name}? Vocês mandam por aqui?`,
      `${saudacao}! Vocês tão entregando almoço por esse número hoje? Como vejo o cardápio com os preços?`,
      `${saudacao}, tudo certo? O cardápio de almoço de vocês com os valores fica por aqui mesmo no WhatsApp ou tem link?`
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }

  // Segmento Pizzaria
  if (segment === 'pizzaria') {
    const templates = [
      `${saudacao}, tudo bem? Vocês tão atendendo delivery hoje? Como faço pra ver o cardápio de pizzas com os valores?`,
      `Oi, ${saudacao.toLowerCase()}! Vocês entregam por esse WhatsApp? Tem o cardápio atualizado das pizzas pra eu dar uma olhada?`,
      `${saudacao}! Como faço pra ver as opções e sabores de pizza do ${name}? Vocês mandam por aqui?`
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }

  // Segmento Hamburgueria / Lanchonete (Turno Noite)
  if (segment === 'hamburgueria' || segment === 'lanchonete') {
    const templates = [
      `${saudacao}, tudo bem? Vocês tão atendendo delivery hoje pelo WhatsApp? O cardápio dos lanches com os valores é por aqui mesmo ou tem link?`,
      `Oi, ${saudacao.toLowerCase()}! Como vejo o cardápio de hambúrgueres do ${name} com os preços? Vocês mandam por aqui?`,
      `${saudacao}, tudo certo? Vocês atendem delivery por esse número? Tem o cardápio com os valores pra eu dar uma olhada?`
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }

  // Padrão Geral / Outros Nichos
  const generalTemplates = [
    `${saudacao}, tudo bem? Vocês trabalham com entregas pelo WhatsApp? O cardápio com os valores fica por aqui mesmo ou vocês têm link?`,
    `${saudacao}! Como faço pra ver o cardápio atualizado do ${name} com os preços? Vocês mandam por aqui?`,
    `${saudacao}, tudo certo? Vocês atendem delivery por esse número hoje? Tem o cardápio pra eu dar uma olhada?`
  ];
  return generalTemplates[Math.floor(Math.random() * generalTemplates.length)];
}

/**
 * PASSO 2: Entrega de Valor Consentida (Apenas após o lojista responder 'Sim', 'Pode', 'Manda', etc.)
 */
export function buildHarveyStep2(lead, featuredItem = null) {
  const name = cleanLeadName(lead.business_name);
  const meta = lead.metadata || {};
  const slug = meta.menu_slug || lead.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const cleanUrl = buildCleanMenuUrl(slug, lead.id);

  const itemMention = featuredItem ? `com as opções de ${featuredItem}` : `com as fotos e adicionais`;

  const templates = [
    `Show de bola! Dá uma olhada como ficou limpo no celular:\n\n👉 ${cleanUrl}\n\nO cliente escolhe ${itemMention} e o pedido cai somado direto no Painel Gestor TáPronto com alerta sonoro e impressão automática na cozinha, sem cobrar nenhuma porcentagem sobre suas vendas.\n\nDeixei liberado pra vocês testarem essa semana sem custo. O que achou da agilidade?`,
    `Maravilha! Segue o link com a loja de vocês montada:\n\n👉 ${cleanUrl}\n\nRepara como carrega rápido no celular: o cliente não precisa dar zoom em PDF nem você precisa ficar somando taxa de entrega na mão no horário de pico.\n\nSe fizer sentido, deixo a loja ativa pra vocês rodarem de teste esses dias. Vale a pena um teste?`,
    `Perfeito! Olha como ficou a prévia do ${name}:\n\n👉 ${cleanUrl}\n\nNossa proposta é simples: o cliente que já é de vocês pede por aí com taxa zero, sem você perder 27% para aplicativos e sem o WhatsApp travar na correria.\n\nConsegue abrir aí no celular rapidinho pra ver como ficou?`
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * LAARC OBJECTION PLAYBOOK (Harvey)
 * Respostas prontas e humanizadas para qualquer retorno do lojista
 */
export const HARVEY_OBJECTIONS = {
  COST_QUESTION: (priceMonthly = 'R$ 69,90') => (
    `O teste é 100% gratuito e já deixamos o cardápio montado pra vocês avaliarem sem compromisso nenhum.\n\nSe vocês gostarem e quiserem manter depois do teste, nossos planos são fixos (a partir de ${priceMonthly}/mês), sem cobrar NENHUMA porcentagem sobre os seus pedidos.\n\nVale a pena dar uma olhadinha no link de teste pra ver se ajuda no atendimento de vocês?`
  ),
  ALREADY_USES_IFOOD: (slug) => (
    `Com certeza! O iFood é excelente como vitrine pra trazer cliente novo que nunca ouviu falar de vocês.\n\nO TáPronto entra pro cliente que já conhece o ${slug} e chama no WhatsApp: em vez de você pagar até 27% de comissão pro marketplace num cliente que já é seu, o pedido sai com taxa zero direto no seu painel.\n\nFaz sentido dar uma olhada de 1 minuto na prévia?`
  ),
  ALREADY_USES_OTHER_SYSTEM: () => (
    `Entendido! A maioria dos parceiros que usam outros sistemas nos procuram pela agilidade no celular do cliente e porque o pedido já cai direto com impressão térmica automática no balcão sem travar.\n\nSe quiser comparar sem compromisso, a loja de vocês já tá com os produtos montados. Quer dar uma olhadinha?`
  ),
  PDF_ENOUGH: () => (
    `Super compreensível! O problema do PDF é que no celular o cliente precisa ficar dando zoom, não calcula taxa de entrega e no final você ainda precisa somar tudo na calculadora na hora do rush.\n\nNo cardápio digital ele só clica nos adicionais e o pedido já chega prontinho e somado no seu painel.\n\nQuer testar por 30 segundos no celular pra ver a diferença?`
  )
};
