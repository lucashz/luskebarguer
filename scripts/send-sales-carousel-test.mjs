import 'dotenv/config';
import {
  evolutionV2SalesConfig,
  getEvolutionV2ConnectionState,
  sendEvolutionV2SalesMedia,
  sendEvolutionV2SalesText
} from '../src/lib/evolution-v2-sales.js';

const phone = process.argv[2];
if (!phone) throw new Error('Informe o telefone de teste.');

const config = evolutionV2SalesConfig();
const state = await getEvolutionV2ConnectionState(config);
if (!state.connected) throw new Error(`Instância desconectada: ${state.state}`);

const introduction = 'Olá, Lucas! Sou o assistente virtual do TáPronto. Com o TáPronto, o cliente consulta o cardápio, escolhe os produtos e informa o endereço e a forma de pagamento. O pedido chega organizado, e a equipe acompanha tudo por status. Veja a demonstração: https://taprontomenu.com.br/cardapio. Posso explicar como funcionaria para você? Se não quiser receber mensagens, basta avisar.';
const introResponse = await fetch(`${config.baseUrl}/message/sendText/${encodeURIComponent(config.instance)}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8', apikey: config.apiKey },
  body: JSON.stringify({ number: normalizePhone(phone), text: introduction })
});
const introData = await introResponse.json();
if (!introResponse.ok) throw new Error(`Evolution recusou a apresentação: ${JSON.stringify(introData).slice(0, 500)}`);
console.log(JSON.stringify({ type: 'introduction', id: introData?.key?.id }));

const images = [
  ['https://taprontomenu.com.br/assets/sistema-cardapio-preview.png', 'Cardápio digital: uma experiência simples e organizada para o cliente fazer o pedido pelo celular.'],
  ['https://taprontomenu.com.br/assets/sistema-admin-pedidos-original.png', 'Painel de pedidos: acompanhe cada venda por status e mantenha a operação organizada.'],
  ['https://taprontomenu.com.br/assets/sistema-admin-produtos-original.png', 'Gestão de produtos: atualize itens, preços e disponibilidade com praticidade.']
];

for (const [mediaUrl, caption] of images) {
  await delay(1_200);
  const sent = await sendEvolutionV2SalesMedia({ phone, mediaUrl, mimeType: 'image/png', caption }, config);
  console.log(JSON.stringify({ type: 'image', id: sent.id }));
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`;
}
