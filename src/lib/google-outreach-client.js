import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const GOOGLE_PLACES_BASE = 'https://places.googleapis.com/v1';
const GOOGLE_VISION_URL = 'https://vision.googleapis.com/v1/images:annotate';
const SEARCH_FIELDS = 'places.id,places.displayName,places.formattedAddress,places.primaryType,places.location';
const DETAIL_FIELDS = 'id,displayName,formattedAddress,nationalPhoneNumber,websiteUri,regularOpeningHours,userRatingCount,reviews,photos,googleMapsUri,primaryType';

export function createGoogleOutreachClient({ apiKey, fetch: fetchImpl = globalThis.fetch, reserveQuota, timeoutMs = 10000 } = {}) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('GOOGLE_OUTREACH_API_KEY não configurada.');
  if (typeof fetchImpl !== 'function') throw new Error('fetch não disponível para o Google Places.');
  if (typeof reserveQuota !== 'function') throw new Error('Reserva de cota não configurada.');
  const requestTimeout = Math.max(1, Number(timeoutMs) || 10000);

  return Object.freeze({
    async searchPlaces({ query, runId }) {
      const textQuery = String(query || '').replace(/\s+/g, ' ').trim();
      if (!textQuery) throw new Error('Consulta do Google Places vazia.');
      const payload = await quotaRequest({
        sku: 'places_pro',
        runId,
        request: () => googleFetch(`${GOOGLE_PLACES_BASE}/places:searchText`, {
          method: 'POST',
          headers: googleHeaders(key, SEARCH_FIELDS, true),
          body: JSON.stringify({ textQuery, languageCode: 'pt-BR', regionCode: 'BR', maxResultCount: 20 })
        })
      });
      return Array.isArray(payload.places) ? payload.places : [];
    },

    async getPlaceDetails({ placeId, runId }) {
      const id = requiredIdentifier(placeId, 'placeId');
      return quotaRequest({
        sku: 'places_advanced',
        runId,
        request: () => googleFetch(`${GOOGLE_PLACES_BASE}/places/${encodeURIComponent(id)}`, {
          headers: googleHeaders(key, DETAIL_FIELDS)
        })
      });
    },

    async getPhoto({ photoName, maxWidthPx = 1200, runId }) {
      const name = requiredIdentifier(photoName, 'photoName');
      if (!/^places\/[^/]+\/photos\/[^/]+$/.test(name)) throw new Error('Nome de foto do Google inválido.');
      const width = Math.min(4800, Math.max(400, Math.round(Number(maxWidthPx) || 1200)));
      const encodedName = name.split('/').map(encodeURIComponent).join('/');
      return quotaRequest({
        sku: 'place_photos',
        runId,
        request: async () => {
          const response = await rawFetch(`${GOOGLE_PLACES_BASE}/${encodedName}/media?maxWidthPx=${width}&skipHttpRedirect=false`, {
            headers: { 'X-Goog-Api-Key': key }
          });
          const bytes = new Uint8Array(await response.arrayBuffer());
          return { bytes, contentType: response.headers.get('content-type') || 'application/octet-stream' };
        }
      });
    },

    async classifyFoodPhoto({ bytes, runId }) {
      const content = Buffer.from(bytes || []).toString('base64');
      if (!content) throw new Error('Imagem obrigatória para classificação.');
      const payload = await quotaRequest({
        sku: 'vision_label',
        runId,
        request: () => googleFetch(`${GOOGLE_VISION_URL}?key=${encodeURIComponent(key)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests: [{ image: { content }, features: [{ type: 'LABEL_DETECTION', maxResults: 12 }, { type: 'TEXT_DETECTION', maxResults: 4 }] }] })
        })
      });
      const labels = (payload?.responses?.[0]?.labelAnnotations || [])
        .filter((label) => Number(label.score || 0) >= 0.65)
        .map((label) => String(label.description || '').trim())
        .filter(Boolean);
      const isFood = labels.some((label) => /\b(food|dish|cuisine|meal|bread|baked goods|fast food|dessert|drink|beverage|ingredient|produce|fruit|vegetable|meat|snack)\b/i.test(label));
      const detectedText = String(payload?.responses?.[0]?.fullTextAnnotation?.text || payload?.responses?.[0]?.textAnnotations?.[0]?.description || '').slice(0, 4000);
      const hasMenuText = /\b(card[aá]pio|menu|preço|porção|lanche|marmita|bebida)\b/i.test(detectedText) && /(r\$|\d+[,.]\d{2}|preço)/i.test(detectedText);
      return { isFood, labels, hasMenuText };
    }
  });

  async function quotaRequest({ sku, runId, request }) {
    const reservation = await reserveQuota({ sku, units: 1, runId });
    try {
      const value = await request();
      await reservation?.complete?.('success');
      return value;
    } catch (error) {
      await reservation?.complete?.('failure').catch(() => {});
      throw error;
    }
  }

  async function googleFetch(url, options = {}) {
    const response = await rawFetch(url, options);
    return response.json();
  }

  async function rawFetch(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('Tempo limite da API Google Places excedido.')), requestTimeout);
    try {
      const response = await fetchImpl(url, { ...options, signal: controller.signal });
      if (!response?.ok) {
        const payload = await response?.json?.().catch(() => null);
        const detail = payload?.error?.message || response?.statusText || 'erro desconhecido';
        throw new Error(`Google Places retornou ${response?.status || 0}: ${detail}`);
      }
      return response;
    } catch (error) {
      if (controller.signal.aborted) throw new Error('Tempo limite da API Google Places excedido.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

export async function inspectBusinessWebsite(websiteUri, { fetch: fetchImpl = globalThis.fetch, lookup = dnsLookup, timeoutMs = 8000 } = {}) {
  const start = await safePublicUrl(websiteUri, lookup);
  if (!start || typeof fetchImpl !== 'function') return [];
  const response = await fetchImpl(start, { redirect: 'error', signal: AbortSignal.timeout(Math.max(1000, Number(timeoutMs) || 8000)), headers: { accept: 'text/html' } });
  if (!response?.ok) throw new Error(`Site do estabelecimento respondeu HTTP ${response?.status || 0}.`);
  const contentType = String(response.headers?.get?.('content-type') || '');
  const contentLength = Number(response.headers?.get?.('content-length') || 0);
  if (!/text\/html/i.test(contentType) || contentLength > 1_000_000) return [];
  const html = (await response.text()).slice(0, 1_000_000);
  const plain = decodeHtml(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  const results = [{ url: start.toString(), title: plain.slice(0, 240), snippet: plain.slice(0, 1000) }];
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let linked;
    try { linked = new URL(match[1], start); } catch { continue; }
    if (!['http:', 'https:'].includes(linked.protocol)) continue;
    results.push({ url: linked.toString(), title: decodeHtml(match[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(), snippet: '' });
    if (results.length >= 100) break;
  }
  return results;
}

async function safePublicUrl(value, lookup) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  if (url.port && !['80', '443'].includes(url.port)) return null;
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.local')) return null;
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) return null;
  return url;
}

function isPrivateAddress(address) {
  const value = String(address || '').toLowerCase();
  if (value.includes(':')) return value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb') || value.startsWith('::ffff:127.') || value.startsWith('::ffff:10.') || value.startsWith('::ffff:192.168.');
  const parts = value.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || parts[0] >= 224 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127);
}

function decodeHtml(value) {
  return String(value || '').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;/gi, ' ');
}

function googleHeaders(apiKey, fieldMask, json = false) {
  return {
    'X-Goog-Api-Key': apiKey,
    'X-Goog-FieldMask': fieldMask,
    ...(json ? { 'Content-Type': 'application/json' } : {})
  };
}

function requiredIdentifier(value, label) {
  const result = String(value || '').trim();
  if (!result) throw new Error(`${label} é obrigatório.`);
  return result;
}

export const GOOGLE_OUTREACH_FIELD_MASKS = Object.freeze({ search: SEARCH_FIELDS, details: DETAIL_FIELDS });
