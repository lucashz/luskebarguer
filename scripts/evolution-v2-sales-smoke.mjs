import {
  evolutionV2SalesConfig,
  getEvolutionV2ConnectionState,
  getEvolutionV2WebhookState,
  probeEvolutionV2WebhookReceiver,
  sendEvolutionV2SalesMedia,
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
  if (String(url).includes('/webhook/find/')) return response(200, { enabled: true, url: 'https://taprontomenu.com.br/api/integrations/evolution/webhook', events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'] });
  return response(200, { key: { id: 'provider-message-1' } });
};

const sent = await sendEvolutionV2SalesText({ phone: '(55) 99999-0000', text: ' Olá  ' }, config, fetchOk);
assert(sent.id === 'provider-message-1', 'ID de envio não foi extraído.');
assert(calls[0].url.endsWith('/message/sendText/tapronto%20vendas'), 'Rota de envio incorreta.');
assert(calls[0].options.headers.apikey === secret, 'API key não foi enviada no header.');
assert(JSON.parse(calls[0].options.body).number === '5555999990000', 'Telefone não foi normalizado.');
assert(JSON.parse(calls[0].options.body).text === 'Olá', 'Texto não foi normalizado.');

const mediaSent = await sendEvolutionV2SalesMedia({
  phone: '(55) 93619-1201',
  mediaUrl: 'https://taprontomenu.com.br/assets/sistema-cardapio-preview.png',
  mimeType: 'image/png',
  caption: '  Cardápio visto pelo cliente  '
}, config, fetchOk);
assert(mediaSent.id === 'provider-message-1', 'ID do envio de imagem não foi extraído.');
const mediaCall = calls.at(-1);
assert(mediaCall.url.endsWith('/message/sendMedia/tapronto%20vendas'), 'Rota de envio de imagem incorreta.');
const mediaBody = JSON.parse(mediaCall.options.body);
assert(mediaBody.number === '5555936191201', 'Telefone da imagem não foi normalizado.');
assert(mediaBody.mediatype === 'image', 'Tipo da mídia não foi enviado.');
assert(mediaBody.mimetype === 'image/png', 'MIME type da imagem não foi enviado.');
assert(mediaBody.media === 'https://taprontomenu.com.br/assets/sistema-cardapio-preview.png', 'URL da imagem não foi enviada.');
assert(mediaBody.caption === 'Cardápio visto pelo cliente', 'Legenda da imagem não foi normalizada.');

const base64MediaSent = await sendEvolutionV2SalesMedia({
  phone: '55936191201',
  mediaBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
  mimeType: 'image/png'
}, config, fetchOk);
assert(base64MediaSent.id === 'provider-message-1', 'ID do envio base64 não foi extraído.');
const base64MediaBody = JSON.parse(calls.at(-1).options.body);
assert(base64MediaBody.media === 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB', 'Base64 não foi enviado no campo media.');

await assertRejects(
  () => sendEvolutionV2SalesMedia({ phone: '55936191201', mediaBase64: 'isto não é base64', mimeType: 'image/png' }, config, fetchOk),
  /base64/i,
  'Base64 malformado foi aceito.'
);
await assertRejects(
  () => sendEvolutionV2SalesMedia({ phone: '55936191201', mediaUrl: 'https://taprontomenu.com.br/a.png', mediaBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB', mimeType: 'image/png' }, config, fetchOk),
  /uma única origem|url ou base64/i,
  'URL e base64 foram aceitos ao mesmo tempo.'
);

const state = await getEvolutionV2ConnectionState(config, fetchOk);
assert(state.connected && state.state === 'open', 'Estado conectado não foi reconhecido.');

const webhookState = await getEvolutionV2WebhookState({ expectedUrl: 'https://taprontomenu.com.br/api/integrations/evolution/webhook' }, config, fetchOk);
assert(webhookState.healthy === true, 'Webhook configurado não foi reconhecido como saudável.');
assert(!Object.hasOwn(webhookState, 'headers'), 'Cabeçalhos secretos vazaram no estado do webhook.');

const receiverProbe = await probeEvolutionV2WebhookReceiver({ url: 'https://taprontomenu.com.br/api/integrations/evolution/webhook' }, config, async (url, options) => {
  assert(String(url).endsWith('/api/integrations/evolution/webhook'), 'Probe usou URL incorreta.');
  assert(options.headers['x-evolution-webhook-secret'] === 'webhook-secret', 'Probe não autenticou no receptor.');
  assert(JSON.parse(options.body).event === 'OUTREACH_HEALTH_CHECK', 'Evento de probe incorreto.');
  return response(202, { accepted: false });
});
assert(receiverProbe.healthy === true && receiverProbe.checkedAt, 'Receptor acessível não foi reconhecido.');
await assertRejects(
  () => probeEvolutionV2WebhookReceiver({ url: 'https://taprontomenu.com.br/api/integrations/evolution/webhook' }, config, async () => response(401, {})),
  /HTTP 401/i,
  'Falha de autenticação do receptor foi aceita.'
);

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
