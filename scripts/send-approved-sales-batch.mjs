import 'dotenv/config';
import {
  evolutionV2SalesConfig,
  getEvolutionV2ConnectionState,
  sendEvolutionV2SalesMedia,
  sendEvolutionV2SalesText
} from '../src/lib/evolution-v2-sales.js';

const leads = [
  {
    business: 'Restaurante Sabor Caseiro',
    phone: '5545999538585',
    message: 'Olá, equipe do Restaurante Sabor Caseiro! Sou o assistente virtual do TáPronto. Vi que vocês trabalham com buffet, marmitas e entregas em Nova Santa Rosa e recebem os pedidos pelo WhatsApp. Com o TáPronto, o cliente consulta o cardápio do dia, escolhe o tamanho da marmita e informa o endereço e a forma de pagamento. O pedido chega organizado, e a equipe acompanha tudo por status. Veja a demonstração: https://taprontomenu.com.br/cardapio. Posso explicar como funcionaria para vocês? Se não quiserem receber mensagens, basta avisar.'
  },
  {
    business: 'Cia das Pizzas Ijuí',
    phone: '5555991350060',
    message: 'Olá, equipe da Cia das Pizzas Ijuí! Sou o assistente virtual do TáPronto. Vi que vocês recebem pedidos de pizzas e hambúrgueres pelo WhatsApp em Ijuí. Com o TáPronto, o cliente consulta os sabores, escolhe tamanhos e adicionais e informa o endereço e a forma de pagamento. O pedido chega organizado, e a equipe acompanha tudo por status. Veja a demonstração: https://taprontomenu.com.br/cardapio. Posso explicar como funcionaria para vocês? Se não quiserem receber mensagens, basta avisar.'
  },
  {
    business: 'Leve Sabor Marmitaria',
    phone: '5514997916899',
    message: 'Olá, equipe da Leve Sabor Marmitaria! Sou o assistente virtual do TáPronto. Vi que vocês recebem pelo WhatsApp os pedidos de marmitas quentes, congeladas e combos em Avaré e Bauru. Com o TáPronto, o cliente consulta as opções disponíveis, escolhe o tamanho e a quantidade e informa o endereço e a forma de pagamento. O pedido chega organizado, e a equipe acompanha tudo por status. Veja a demonstração: https://taprontomenu.com.br/cardapio. Posso explicar como funcionaria para vocês? Se não quiserem receber mensagens, basta avisar.'
  },
  {
    business: 'Pizzaria Barriga Cheia',
    phone: '5531986853708',
    message: 'Olá, equipe da Pizzaria Barriga Cheia! Sou o assistente virtual do TáPronto. Vi que vocês recebem pedidos de pizzas, hambúrgueres e pratos pelo WhatsApp em Contagem. Com o TáPronto, o cliente consulta o cardápio, escolhe tamanhos, sabores e adicionais e informa o endereço e a forma de pagamento. O pedido chega organizado, e a equipe acompanha tudo por status. Veja a demonstração: https://taprontomenu.com.br/cardapio. Posso explicar como funcionaria para vocês? Se não quiserem receber mensagens, basta avisar.'
  },
  {
    business: 'Bolos da Didi',
    phone: '5551997946693',
    message: 'Olá, equipe da Bolos da Didi! Sou o assistente virtual do TáPronto. Vi que vocês recebem encomendas de bolos artesanais pelo WhatsApp em Viamão. Com o TáPronto, o cliente consulta os produtos, escolhe sabores e tamanhos e informa a retirada ou entrega e a forma de pagamento. O pedido chega organizado, e a equipe acompanha tudo por status. Veja a demonstração: https://taprontomenu.com.br/cardapio. Posso explicar como funcionaria para vocês? Se não quiserem receber mensagens, basta avisar.'
  },
  {
    business: 'Seu Gastão',
    phone: '5567992518148',
    message: 'Olá, equipe do Seu Gastão! Sou o assistente virtual do TáPronto. Vi que vocês recebem pedidos de pratos executivos e combinados pelo WhatsApp em Campo Grande. Com o TáPronto, o cliente consulta o cardápio, escolhe os pratos e informa o endereço e a forma de pagamento. O pedido chega organizado, e a equipe acompanha tudo por status. Veja a demonstração: https://taprontomenu.com.br/cardapio. Posso explicar como funcionaria para vocês? Se não quiserem receber mensagens, basta avisar.'
  },
  {
    business: 'Peixaria Natanael Pescados',
    phone: '5524999884240',
    message: 'Olá, equipe da Peixaria Natanael Pescados! Sou o assistente virtual do TáPronto. Vi que vocês recebem pedidos de pescados e produtos congelados pelo WhatsApp em Barra Mansa. Com o TáPronto, o cliente consulta os produtos disponíveis, escolhe os itens e informa o endereço e a forma de pagamento. O pedido chega organizado, e a equipe acompanha tudo por status. Veja a demonstração: https://taprontomenu.com.br/cardapio. Posso explicar como funcionaria para vocês? Se não quiserem receber mensagens, basta avisar.'
  },
  {
    business: 'Roppongi Sushi House',
    phone: '556799503122',
    message: 'Olá, equipe da Roppongi Sushi House! Sou o assistente virtual do TáPronto. Vi que vocês recebem pedidos de sushi e combinados pelo WhatsApp em Campo Grande. Com o TáPronto, o cliente consulta as opções, escolhe os combinados e adicionais e informa o endereço e a forma de pagamento. O pedido chega organizado, e a equipe acompanha tudo por status. Veja a demonstração: https://taprontomenu.com.br/cardapio. Posso explicar como funcionaria para vocês? Se não quiserem receber mensagens, basta avisar.'
  },
  {
    business: "Justtino's Pizzas & Esfihas",
    phone: '5517997041628',
    message: 'Olá, equipe da Justtino\'s Pizzas & Esfihas! Sou o assistente virtual do TáPronto. Vi que vocês recebem pedidos de pizzas e esfihas pelo WhatsApp em Bebedouro. Com o TáPronto, o cliente consulta os sabores, escolhe tamanhos e adicionais e informa o endereço e a forma de pagamento. O pedido chega organizado, e a equipe acompanha tudo por status. Veja a demonstração: https://taprontomenu.com.br/cardapio. Posso explicar como funcionaria para vocês? Se não quiserem receber mensagens, basta avisar.'
  },
  {
    business: 'Tetê Gourmet',
    phone: '5562998055754',
    message: 'Olá, equipe da Tetê Gourmet! Sou o assistente virtual do TáPronto. Vi que vocês recebem encomendas de marmitas saudáveis e congeladas pelo WhatsApp em Goiânia. Com o TáPronto, o cliente consulta as opções, escolhe os pratos e quantidades e informa o endereço e a forma de pagamento. O pedido chega organizado, e a equipe acompanha tudo por status. Veja a demonstração: https://taprontomenu.com.br/cardapio. Posso explicar como funcionaria para vocês? Se não quiserem receber mensagens, basta avisar.'
  },
  {
    business: 'Pizzaria Santa Adellina',
    phone: '5519999798874',
    message: 'Olá, equipe da Pizzaria Santa Adellina! Sou o assistente virtual do TáPronto. Vi que vocês recebem pedidos de pizzas, esfihas, calzones e porções pelo WhatsApp em Jaguariúna. Com o TáPronto, o cliente consulta o cardápio, escolhe sabores, tamanhos e adicionais e informa o endereço e a forma de pagamento. O pedido chega organizado, e a equipe acompanha tudo por status. Veja a demonstração: https://taprontomenu.com.br/cardapio. Posso explicar como funcionaria para vocês? Se não quiserem receber mensagens, basta avisar.'
  }
];

const images = [
  ['https://taprontomenu.com.br/assets/sistema-cardapio-preview.png', 'Cardápio digital: uma experiência simples e organizada para o cliente fazer o pedido pelo celular.'],
  ['https://taprontomenu.com.br/assets/sistema-admin-pedidos-original.png', 'Painel de pedidos: acompanhe cada venda por status e mantenha a operação organizada.'],
  ['https://taprontomenu.com.br/assets/sistema-admin-produtos-original.png', 'Gestão de produtos: atualize itens, preços e disponibilidade com praticidade.']
];

const config = evolutionV2SalesConfig();
const state = await getEvolutionV2ConnectionState(config);
if (!state.connected) throw new Error(`Instância desconectada: ${state.state}`);

const requestedBusinesses = new Set(process.argv.slice(2));
if (!requestedBusinesses.size) throw new Error('Informe ao menos um estabelecimento para o envio.');
const selectedLeads = leads.filter((lead) => requestedBusinesses.has(lead.business));
if (selectedLeads.length !== requestedBusinesses.size) throw new Error('Um ou mais estabelecimentos informados não existem no lote aprovado.');

for (const lead of selectedLeads) {
  try {
    const sent = [];
    sent.push((await sendEvolutionV2SalesText({ phone: lead.phone, text: lead.message }, config)).id);
    for (const [mediaUrl, caption] of images) {
      await delay(2_000);
      sent.push((await sendEvolutionV2SalesMedia({ phone: lead.phone, mediaUrl, mimeType: 'image/png', caption }, config)).id);
    }
    console.log(JSON.stringify({ business: lead.business, status: 'sent', ids: sent }));
  } catch (error) {
    console.log(JSON.stringify({ business: lead.business, status: 'failed', error: error.message }));
  }
  await delay(8_000);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
