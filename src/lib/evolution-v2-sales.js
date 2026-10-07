const DEFAULT_TIMEOUT_MS = 10_000;

export function evolutionV2SalesConfig(env = process.env) {
  return {
    baseUrl: String(env.SALES_EVOLUTION_V2_BASE_URL || '').trim().replace(/\/+$/, ''),
    apiKey: String(env.SALES_EVOLUTION_V2_API_KEY || '').trim(),
    instance: String(env.SALES_EVOLUTION_V2_INSTANCE || '').trim(),
    webhookSecret: String(env.SALES_EVOLUTION_V2_WEBHOOK_SECRET || '').trim(),
    timeoutMs: clamp(Number(env.SALES_EVOLUTION_V2_TIMEOUT_MS || DEFAULT_TIMEOUT_MS), 1_000, 60_000)
  };
}

export async function evolutionV2Request(path, init = {}, config = evolutionV2SalesConfig(), fetchImpl = fetch) {
  assertConfig(config);
  const url = `${config.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  let response;
  try {
    response = await fetchImpl(url, {
      ...init,
      headers: { 'content-type': 'application/json', apikey: config.apiKey, ...(init.headers || {}) },
      signal: init.signal || AbortSignal.timeout(config.timeoutMs)
    });
  } catch (error) {
    throw new Error(sanitize(`Falha ao conectar na Evolution API v2: ${error.message || 'erro de rede'}`, config));
  }
  const rawText = await response.text().catch(() => '');
  let data = {};
  try { data = rawText ? JSON.parse(rawText) : {}; } catch { data = { raw: rawText.slice(0, 300) }; }
  if (!response.ok) throw new Error(sanitize(`Evolution API v2 respondeu HTTP ${response.status}.`, config));
  return data;
}

export async function getEvolutionV2ConnectionState(config = evolutionV2SalesConfig(), fetchImpl = fetch) {
  const data = await evolutionV2Request(`/instance/connectionState/${encodeURIComponent(config.instance)}`, { method: 'GET' }, config, fetchImpl);
  const state = String(data?.instance?.state || data?.state || data?.status || '').toLowerCase();
  return { connected: ['open', 'connected'].includes(state), state: state || 'unknown' };
}

export async function sendEvolutionV2SalesText({ phone, text }, config = evolutionV2SalesConfig(), fetchImpl = fetch) {
  const number = normalizePhone(phone);
  const body = String(text || '').replace(/\s+/g, ' ').trim();
  if (!/^55\d{10,11}$/.test(number)) throw new Error('Informe um telefone brasileiro válido para o envio.');
  if (!body) throw new Error('Informe o texto da mensagem.');
  const data = await evolutionV2Request(`/message/sendText/${encodeURIComponent(config.instance)}`, {
    method: 'POST', body: JSON.stringify({ number, text: body })
  }, config, fetchImpl);
  const id = String(data?.key?.id || data?.message?.key?.id || data?.id || '').trim();
  if (!id) throw new Error('Evolution API v2 não retornou o identificador da mensagem.');
  return { id, raw: data };
}

export async function sendEvolutionV2SalesMedia({ phone, mediaUrl, mimeType, caption = '' }, config = evolutionV2SalesConfig(), fetchImpl = fetch) {
  const number = normalizePhone(phone);
  const media = String(mediaUrl || '').trim();
  const mimetype = String(mimeType || '').trim().toLowerCase();
  const normalizedCaption = String(caption || '').replace(/\s+/g, ' ').trim();
  if (!/^55\d{10,11}$/.test(number)) throw new Error('Informe um telefone brasileiro válido para o envio.');
  if (!/^https:\/\//i.test(media)) throw new Error('Informe uma URL HTTPS válida para a mídia.');
  if (!/^image\/(png|jpe?g|webp)$/i.test(mimetype)) throw new Error('Informe um tipo de imagem válido.');
  const data = await evolutionV2Request(`/message/sendMedia/${encodeURIComponent(config.instance)}`, {
    method: 'POST',
    body: JSON.stringify({ number, mediatype: 'image', mimetype, caption: normalizedCaption, media })
  }, config, fetchImpl);
  const id = String(data?.key?.id || data?.message?.key?.id || data?.id || '').trim();
  if (!id) throw new Error('Evolution API v2 não retornou o identificador da mensagem.');
  return { id, raw: data };
}

export async function setEvolutionV2SalesWebhook({ url, secret }, config = evolutionV2SalesConfig(), fetchImpl = fetch) {
  const webhookUrl = String(url || '').trim();
  if (!/^https:\/\//i.test(webhookUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)(?::\d+)?\//i.test(webhookUrl)) {
    throw new Error('O webhook comercial precisa usar uma URL HTTPS pública.');
  }
  await evolutionV2Request(`/webhook/set/${encodeURIComponent(config.instance)}`, {
    method: 'POST',
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: false,
        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
        headers: { 'x-evolution-webhook-secret': String(secret || config.webhookSecret || '') }
      }
    })
  }, config, fetchImpl);
  return { configured: true, instance: config.instance, url: webhookUrl, events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'] };
}

function assertConfig(config) {
  if (!/^https?:\/\//i.test(config?.baseUrl || '')) throw new Error('Configure a URL base da Evolution API v2.');
  if (!config?.apiKey) throw new Error('Configure a API key da Evolution API v2.');
  if (!config?.instance) throw new Error('Configure a instância comercial da Evolution API v2.');
}
function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) return digits;
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
}
function sanitize(message, config) {
  let output = String(message || '');
  for (const value of [config?.apiKey, config?.webhookSecret]) if (value) output = output.split(value).join('[redacted]');
  return output.slice(0, 500);
}
function clamp(value, min, max) { return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min)); }
