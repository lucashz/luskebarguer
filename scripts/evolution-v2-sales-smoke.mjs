import {
  evolutionV2SalesConfig,
  getEvolutionV2ConnectionState,
  sendEvolutionV2SalesText,
  setEvolutionV2SalesWebhook
} from '../src/lib/evolution-v2-sales.js';

const secret = 'never-print-this-key';
const config = evolutionV2SalesConfig({
  SALES_EVOLUTION_V2_BASE_URL: 'http://192.0.2.10:8080',
  SALES_EVOLUTION_V2_API_KEY: secret,
  SALES_EVOLUTION_V2_INSTANCE: 'tapronto vendas',
  SALES_EVOLUTION_V2_WEBHOOK_SECRET: 'webhook-secret'
});

const calls = [];
const fetchOk = async (url, options = {}) => {
  calls.push({ url: String(url), options });
  if (String(url).includes('/connectionState/')) return response(200, { instance: { state: 'open' } });
  if (String(url).includes('/webhook/set/')) return response(200, { webhook: { enabled: true } });
  return response(200, { key: { id: 'provider-message-1' } });
};

const sent = await sendEvolutionV2SalesText({ phone: '(55) 99999-0000', text: ' Olá  ' }, config, fetchOk);
assert(sent.id === 'provider-message-1', 'ID de envio não foi extraído.');
assert(calls[0].url.endsWith('/message/sendText/tapronto%20vendas'), 'Rota de envio incorreta.');
assert(calls[0].options.headers.apikey === secret, 'API key não foi enviada no header.');
assert(JSON.parse(calls[0].options.body).number === '5555999990000', 'Telefone não foi normalizado.');
assert(JSON.parse(calls[0].options.body).text === 'Olá', 'Texto não foi normalizado.');

const state = await getEvolutionV2ConnectionState(config, fetchOk);
assert(state.connected && state.state === 'open', 'Estado conectado não foi reconhecido.');

const configuredWebhook = await setEvolutionV2SalesWebhook({ url: 'https://taprontomenu.com.br/api/integrations/evolution/webhook', secret: 'super-secret-header' }, config, fetchOk);
assert(!JSON.stringify(configuredWebhook).includes('super-secret-header'), 'Segredo do webhook apareceu no retorno do comando.');
const webhook = calls.at(-1);
assert(webhook.url.endsWith('/webhook/set/tapronto%20vendas'), 'Rota de webhook incorreta.');
const webhookBody = JSON.parse(webhook.options.body);
assert(webhookBody.webhook?.events?.includes('MESSAGES_UPSERT'), 'Evento de mensagem não foi configurado.');
assert(webhookBody.webhook?.events?.includes('CONNECTION_UPDATE'), 'Evento de conexão não foi configurado.');
assert(webhookBody.webhook?.headers?.['x-evolution-webhook-secret'] === 'super-secret-header', 'Segredo do webhook não foi configurado.');

await assertRejects(
  () => sendEvolutionV2SalesText({ phone: '123', text: 'Oi' }, config, fetchOk),
  /telefone/i,
  'Telefone inválido foi aceito.'
);
await assertRejects(
  () => sendEvolutionV2SalesText({ phone: '5555999990000', text: 'Oi' }, config, async () => response(200, { ok: true })),
  /identificador/i,
  'Resposta sem ID foi aceita.'
);
await assertRejects(
  () => getEvolutionV2ConnectionState(config, async () => response(401, { message: secret })),
  /Evolution API v2/i,
  'Erro HTTP não foi propagado.',
  secret
);

console.log('Evolution v2 sales adapter smoke: OK');

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, async text() { return JSON.stringify(body); } };
}
function assert(value, message) { if (!value) throw new Error(message); }
async function assertRejects(fn, pattern, message, forbidden = '') {
  try { await fn(); } catch (error) {
    assert(pattern.test(error.message), `${message} Mensagem: ${error.message}`);
    if (forbidden) assert(!error.message.includes(forbidden), 'Segredo apareceu no erro.');
    return;
  }
  throw new Error(message);
}
