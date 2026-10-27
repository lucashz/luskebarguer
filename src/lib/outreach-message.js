import { buildTrackedMenuUrl } from './outreach-click-tracking.js';

export const OUTREACH_DEMO_URL = 'https://taprontomenu.com.br/cardapio';

export function buildOutreachMessage(lead = {}) {
  const business = clean(lead.business_name || lead.businessName || lead.name || 'estabelecimento');
  const city = clean(lead.city || 'sua cidade');
  const segment = clean(lead.segment || 'estabelecimento').toLocaleLowerCase('pt-BR');
  const article = ['restaurante', 'bar', 'estabelecimento', 'pub', 'boteco', 'quiosque'].includes(segment) ? 'o' : 'a';
  const rawMenuUrl = clean(lead.metadata?.menu_url || lead.menu_url || OUTREACH_DEMO_URL);
  const menuUrl = lead.id ? buildTrackedMenuUrl({ menuUrl: rawMenuUrl, leadId: lead.id }) : rawMenuUrl;
  return [
    `Olá, pessoal da ${business}! Aqui é o Lucas, da TáPronto.`,
    `Vi ${article} ${segment} de vocês em ${city} e montei uma demonstração prática no celular e no computador, com opções no estilo do que vocês vendem:`,
    `👉 ${menuUrl}`,
    'Abre na hora, sem o cliente precisar baixar PDF ou dar zoom. O que acharam?'
  ].join('\n\n');
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
