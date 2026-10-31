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

export async function getEvolutionV2WebhookState({ expectedUrl = '' } = {}, config = evolutionV2SalesConfig(), fetchImpl = fetch) {
  const data = await evolutionV2Request(`/webhook/find/${encodeURIComponent(config.instance)}`, { method: 'GET' }, config, fetchImpl);
  const webhook = data?.webhook || data || {};
  const url = String(webhook.url || webhook.webhookUrl || '').trim().replace(/\/+$/, '');
  const expected = String(expectedUrl || '').trim().replace(/\/+$/, '');
  const events = Array.isArray(webhook.events) ? webhook.events.map((event) => String(event).toUpperCase()) : [];
  const healthy = webhook.enabled === true
    && Boolean(url)
    && (!expected || url === expected)
    && events.includes('MESSAGES_UPSERT')
    && events.includes('CONNECTION_UPDATE');
  return { healthy, enabled: webhook.enabled === true, url, events };
}

export async function probeEvolutionV2WebhookReceiver({ url } = {}, config = evolutionV2SalesConfig(), fetchImpl = fetch) {
  const webhookUrl = String(url || '').trim();
  if (!/^https:\/\//i.test(webhookUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)(?::\d+)?\//i.test(webhookUrl)) {
    throw new Error('O probe do webhook exige uma URL HTTPS pública.');
  }
  if (!config.webhookSecret) throw new Error('Configure o segredo do webhook comercial.');
  const checkedAt = new Date().toISOString();
  let response;
  try {
    response = await fetchImpl(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-evolution-webhook-secret': config.webhookSecret },
      body: JSON.stringify({ event: 'OUTREACH_HEALTH_CHECK', instance: config.instance, data: { probe: true, checkedAt } }),
      signal: AbortSignal.timeout(config.timeoutMs)
    });
  } catch (error) {
    throw new Error(sanitize(`Falha ao acessar o receptor do webhook: ${error.message || 'erro de rede'}`, config));
  }
  if (!response?.ok) throw new Error(`Receptor do webhook respondeu HTTP ${response?.status || 0}.`);
  return { healthy: true, checkedAt };
}

export async function sendEvolutionV2SalesText({ phone, text }, config = evolutionV2SalesConfig(), fetchImpl = fetch) {
  const number = normalizePhone(phone);
  const body = String(text || '').replace(/[^\S\r\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!/^55\d{10,11}$/.test(number)) throw new Error('Informe um telefone brasileiro válido para o envio.');
  if (!body) throw new Error('Informe o texto da mensagem.');
  if (body === '[object Object]' || body.includes('[object Object]')) throw new Error('Falha de integridade: envio de [object Object] bloqueado.');
  const data = await evolutionV2Request(`/message/sendText/${encodeURIComponent(config.instance)}`, {
    method: 'POST', body: JSON.stringify({ number, text: body })
  }, config, fetchImpl);
  const id = String(data?.key?.id || data?.message?.key?.id || data?.id || '').trim();
  if (!id) throw new Error('Evolution API v2 não retornou o identificador da mensagem.');
  return { id, raw: data };
}

export async function sendEvolutionV2SalesMedia({ phone, mediaUrl, mediaBase64, mimeType, caption = '' }, config = evolutionV2SalesConfig(), fetchImpl = fetch) {
  const number = normalizePhone(phone);
  const url = String(mediaUrl || '').trim();
  const base64 = String(mediaBase64 || '').trim();
  const mimetype = String(mimeType || '').trim().toLowerCase();
  const normalizedCaption = String(caption || '').replace(/\s+/g, ' ').trim();
  if (!/^55\d{10,11}$/.test(number)) throw new Error('Informe um telefone brasileiro válido para o envio.');
  if (Boolean(url) === Boolean(base64)) throw new Error('Informe uma única origem para a mídia: URL ou base64.');
  if (url && !/^https:\/\//i.test(url)) throw new Error('Informe uma URL HTTPS válida para a mídia.');
  if (base64 && !isValidBase64(base64)) throw new Error('Informe uma mídia base64 válida.');
  if (!/^image\/(png|jpe?g|webp)$/i.test(mimetype)) throw new Error('Informe um tipo de imagem válido.');
  const data = await evolutionV2Request(`/message/sendMedia/${encodeURIComponent(config.instance)}`, {
    method: 'POST',
    body: JSON.stringify({ number, mediatype: 'image', mimetype, caption: normalizedCaption, media: url || base64 })
  }, config, fetchImpl);
  const id = String(data?.key?.id || data?.message?.key?.id || data?.id || '').trim();
  if (!id) throw new Error('Evolution API v2 não retornou o identificador da mensagem.');
  return { id, raw: data };
}

export async function checkEvolutionV2WhatsappNumber({ phone }, config = evolutionV2SalesConfig(), fetchImpl = fetch) {
  const number = normalizePhone(phone);
  if (!/^55\d{10,11}$/.test(number)) {
    return { exists: false, jid: null, number };
  }
  try {
    const data = await evolutionV2Request(`/chat/whatsappNumbers/${encodeURIComponent(config.instance)}`, {
      method: 'POST',
      body: JSON.stringify({ numbers: [number] })
    }, config, fetchImpl);
    const row = Array.isArray(data) ? data[0] : (data?.numbers?.[0] || data);
    const exists = Boolean(row?.exists ?? row?.isBusiness ?? row?.jid);
    const jid = row?.jid ? String(row.jid) : (exists ? `${number}@s.whatsapp.net` : null);
    return { exists, jid, number, name: row?.name || null };
  } catch (error) {
    return { exists: false, jid: null, number, error: error.message };
  }
}

export async function sendEvolutionV2Presence({ phone, presence = 'composing', delayMs = 4000 }, config = evolutionV2SalesConfig(), fetchImpl = fetch) {
  const number = normalizePhone(phone);
  if (!/^55\d{10,11}$/.test(number)) return { ok: false };
  const safeDelay = Math.max(1000, Math.min(15000, Number(delayMs) || 4000));
  try {
    await evolutionV2Request(`/chat/sendPresence/${encodeURIComponent(config.instance)}`, {
      method: 'POST',
      body: JSON.stringify({ number, presence: presence || 'composing', delay: safeDelay })
    }, config, fetchImpl);
  } catch {
    // Falhas no endpoint de presença não devem interromper o fluxo da mensagem
  }
  // Aguarda o delay localmente para simular o tempo de digitação natural antes do envio do texto
  await new Promise((resolve) => setTimeout(resolve, safeDelay));
  return { ok: true, presence, delayMs: safeDelay };
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
  let digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length === 12 || digits.length === 13) return digits;
  return digits;
}
function sanitize(message, config) {
  let output = String(message || '');
  for (const value of [config?.apiKey, config?.webhookSecret]) if (value) output = output.split(value).join('[redacted]');
  return output.slice(0, 500);
}
function isValidBase64(value) {
  if (value.length < 16 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  try {
    return Buffer.from(value, 'base64').toString('base64').replace(/=+$/, '') === value.replace(/=+$/, '');
  } catch {
    return false;
  }
}
function clamp(value, min, max) { return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min)); }
