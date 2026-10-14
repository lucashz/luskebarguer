export const OUTREACH_DEMO_URL = 'https://taprontomenu.com.br/cardapio';

export function buildOutreachMessage(lead = {}) {
  const business = clean(lead.business_name || lead.businessName || lead.name || 'estabelecimento');
  const city = clean(lead.city || 'sua cidade');
  const segment = clean(lead.segment || 'estabelecimento').toLocaleLowerCase('pt-BR');
  return [
    `Olá, pessoal da ${business}! Aqui é o Lucas, da TáPronto.`,
    `Vi a ${segment} de vocês em ${city} e não encontrei um cardápio online para os clientes consultarem. Por isso, preparei uma demonstração personalizada, com algumas opções compatíveis com o que vocês vendem, para mostrar como o cardápio da loja poderia ficar.`,
    'Se tiverem interesse, nossa equipe monta o cardápio completo e vocês podem fazer um teste gratuitamente.',
    `Caso queiram verificar como funciona o cardápio na íntegra, acessem: ${OUTREACH_DEMO_URL}`,
    'Se tiverem alguma dúvida, estou à disposição.'
  ].join('\n\n');
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
