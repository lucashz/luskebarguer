import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const GOOGLE_SEARCH_URL = 'https://www.google.com/search';
const GOOGLE_IMAGE_HOST = /^(?:lh\d*\.googleusercontent\.com|encrypted-tbn\d*\.gstatic\.com)$/i;
const BLOCKED_PAGE = /(tr[aá]fego incomum|unusual traffic|\/sorry\/index|captcha|before you continue to google)/i;

export function createGoogleBrowserOutreachClient({
  renderSearch = renderGoogleSearchWithChrome,
  fetch: fetchImpl = globalThis.fetch,
  now = () => new Date(),
  maxQueries = 30,
  minIntervalMs = 1500,
  timeoutMs = 15000,
  chromePath
} = {}) {
  if (typeof renderSearch !== 'function') throw new Error('Renderizador da busca Google não configurado.');
  if (typeof fetchImpl !== 'function') throw new Error('Fetch não disponível para fotos do Google.');
  const candidates = new Map();
  const photoEvidence = new Map();
  let queryCount = 0;
  let lastQueryAt = 0;

  return Object.freeze({
    async searchPlaces({ query }) {
      const target = parseTargetQuery(query);
      const page = await search(query);
      const resolvedResults = await resolveResultUrls(page.results.slice(0, 15));
      return resolvedResults.slice(0, 10).map((result) => {
        const name = businessName(result.title, target.city);
        const id = `browser_${hash(`${name}|${target.city}|${target.state}|${result.url}`).slice(0, 32)}`;
        const candidate = {
          id,
          displayName: { text: name },
          formattedAddress: `${target.city}, ${target.state}, Brasil`,
          websiteUri: result.url,
          primaryType: target.segment,
          browserSource: { ...result, ...target }
        };
        candidates.set(id, candidate);
        return candidate;
      }).filter((candidate, index, all) => candidate.displayName.text.length >= 3
        && all.findIndex((other) => normalized(other.displayName.text) === normalized(candidate.displayName.text)) === index);
    },

    async getPlaceDetails({ placeId }) {
      const candidate = candidates.get(String(placeId || ''));
      if (!candidate) throw new Error('Lead da busca gratuita não encontrado no ciclo atual.');
      const { city, state, segment } = candidate.browserSource;
      const name = candidate.displayName.text;
      const page = await search(`${name} ${city} ${state} telefone whatsapp`);
      return {
        ...candidate,
        nationalPhoneNumber: page.phones[0] || '',
        recentPostAt: page.latestActivityAt,
        reviews: page.latestActivityAt ? [{ publishTime: page.latestActivityAt }] : [],
        photos: page.images.slice(0, 6).map((url) => ({ name: url, source: 'google_public_search' })),
        hasPublicMenuPhoto: false
      };
    },

    async getPhoto({ photoName }) {
      const url = safeGoogleImageUrl(photoName);
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(Math.max(1000, Number(timeoutMs) || 15000)) });
      if (!response?.ok) throw new Error(`Foto pública do Google respondeu HTTP ${response?.status || 0}.`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length) throw new Error('Foto pública do Google está vazia.');
      photoEvidence.set(hash(bytes), true);
      return { bytes, contentType: response.headers?.get?.('content-type') || 'application/octet-stream' };
    },

    async classifyFoodPhoto({ bytes }) {
      const trusted = photoEvidence.has(hash(bytes));
      return {
        isFood: trusted,
        labels: trusted ? ['google_business_product_photo'] : [],
        hasMenuText: false
      };
    },

    async searchMenu({ businessName: name, city, state }) {
      const page = await search(`${name} ${city} ${state} cardápio menu pedidos online`);
      return resolveResultUrls(page.results);
    }
  });

  async function search(query) {
    if (queryCount >= Math.max(1, Number(maxQueries) || 30)) throw new Error('Limite de consultas gratuitas do Google atingido neste ciclo.');
    const wait = Math.max(0, Number(minIntervalMs) || 0) - (Date.now() - lastQueryAt);
    if (wait > 0) await delay(wait);
    queryCount += 1;
    const html = await renderSearch(String(query || '').trim(), { chromePath, timeoutMs });
    lastQueryAt = Date.now();
    const page = parseGoogleSearchPage(html, { now: now() });
    if (page.blocked) throw new Error('A busca pública do Google bloqueou a automação; ciclo interrompido sem disparos.');
    return page;
  }

  async function resolveResultUrls(results) {
    const resolved = [];
    for (const result of results) {
      let url = result.url;
      if (isGoogleGotoUrl(url)) {
        try {
          const response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(Math.max(1000, Number(timeoutMs) || 15000)) });
          const location = response?.headers?.get?.('location');
          if (!location) continue;
          const destination = new URL(location, GOOGLE_SEARCH_URL);
          if (!['http:', 'https:'].includes(destination.protocol) || isGoogleInternalUrl(destination.toString())) continue;
          url = destination.toString();
        } catch {
          continue;
        }
      }
      resolved.push({ ...result, url });
    }
    return resolved;
  }
}

export function parseGoogleSearchPage(html, { now = new Date() } = {}) {
  const source = String(html || '');
  const visibleText = htmlText(source
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' '));
  const blocked = BLOCKED_PAGE.test(`${source.slice(0, 200000)} ${visibleText.slice(0, 10000)}`);
  const matches = [...source.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>[\s\S]*?<h3\b[^>]*>([\s\S]*?)<\/h3>[\s\S]*?<\/a>/gi)];
  const results = [];
  for (const [index, match] of matches.entries()) {
    const url = absoluteResultUrl(decodeUrl(match[1]));
    const title = htmlText(match[2]);
    if (!title || !/^https?:\/\//i.test(url) || isGoogleInternalUrl(url)) continue;
    const end = matches[index + 1]?.index ?? Math.min(source.length, (match.index || 0) + match[0].length + 4000);
    const snippet = htmlText(source.slice((match.index || 0) + match[0].length, end)).slice(0, 1400);
    results.push({ url, title, snippet });
  }
  return {
    blocked,
    visibleText,
    results: dedupeResults(results),
    phones: extractPhones(visibleText),
    latestActivityAt: latestActivity(visibleText, validDate(now)).toISOStringOrNull,
    images: extractGoogleImages(source)
  };
}

export async function renderGoogleSearchWithChrome(query, { chromePath, timeoutMs = 15000 } = {}) {
  const executable = chromePath || findChrome();
  if (!executable) throw new Error('Chromium não encontrado para a busca gratuita do Google.');
  const profile = await mkdtemp(join(tmpdir(), 'tapronto-google-'));
  const url = new URL(GOOGLE_SEARCH_URL);
  url.searchParams.set('q', String(query || '').trim());
  url.searchParams.set('hl', 'pt-BR');
  url.searchParams.set('gl', 'br');
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(executable, createGoogleChromeArguments({
        profile,
        url: url.toString(),
        virtualTimeBudgetMs: Math.min(8000, Math.max(3000, Number(timeoutMs) - 5000))
      }), {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        env: { ...process.env, HOME: profile, XDG_CONFIG_HOME: profile, XDG_CACHE_HOME: profile }
      });
      let output = '';
      let errors = '';
      const timer = setTimeout(() => child.kill('SIGKILL'), Math.max(5000, Number(timeoutMs) || 15000));
      child.stdout.on('data', (chunk) => {
        output += chunk.toString();
        if (output.length > 5_000_000) child.kill('SIGKILL');
      });
      child.stderr.on('data', (chunk) => { errors = `${errors}${chunk}`.slice(-2000); });
      child.on('error', (error) => { clearTimeout(timer); reject(error); });
      child.on('exit', (code, signal) => {
        clearTimeout(timer);
        if (code === 0 && output) resolve(output);
        else reject(new Error(`Chromium não concluiu a busca Google (${signal || code}): ${errors.slice(-400)}`));
      });
    });
  } finally {
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

export function createGoogleChromeArguments({ profile, url, virtualTimeBudgetMs = 8000 }) {
  return [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--disable-crash-reporter', '--disable-breakpad',
    '--disable-background-networking', '--no-first-run', '--no-default-browser-check',
    '--lang=pt-BR', `--user-data-dir=${profile}`,
    '--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
    `--virtual-time-budget=${Math.max(1000, Number(virtualTimeBudgetMs) || 8000)}`,
    '--dump-dom', url
  ];
}

function parseTargetQuery(query) {
  const value = clean(query);
  const match = value.match(/^(.+?)\s+em\s+(.+?)\s+([A-Z]{2})$/i);
  if (!match) throw new Error('Consulta de descoberta inválida para a busca gratuita.');
  return { segment: clean(match[1]), city: clean(match[2]), state: match[3].toUpperCase() };
}

function businessName(title, city) {
  let value = clean(title).replace(/\s*\(@[^)]+\)\s*/g, ' ');
  value = value.replace(new RegExp(`\\s*[|·-]\\s*${escapeRegex(city)}(?:\\s+[A-Z]{2})?.*$`, 'i'), '');
  value = value.replace(/\s*[|·]\s*(Instagram|Facebook|Tripadvisor).*$/i, '');
  return clean(value);
}

function extractPhones(text) {
  const found = [];
  for (const match of String(text || '').matchAll(/(?:\+?55[\s.-]*)?(?:\(?\d{2}\)?[\s.-]*)?(?:9[\s.-]?\d{4}|\d{4})[\s.-]?\d{4}/g)) {
    let digits = match[0].replace(/\D/g, '');
    if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
    if (/^55\d{10,11}$/.test(digits) && !found.includes(digits)) found.push(digits);
  }
  return found;
}

function latestActivity(text, now) {
  const dates = [];
  const units = { minuto: 60000, minutos: 60000, hora: 3600000, horas: 3600000, dia: 86400000, dias: 86400000, semana: 604800000, semanas: 604800000, mês: 2592000000, meses: 2592000000, ano: 31536000000, anos: 31536000000 };
  for (const match of String(text || '').matchAll(/há\s+(\d+|um|uma)\s+(minutos?|horas?|dias?|semanas?|mês|meses|anos?)/gi)) {
    const count = /^um(a)?$/i.test(match[1]) ? 1 : Number(match[1]);
    const unit = units[match[2].toLowerCase()];
    if (Number.isFinite(count) && unit) dates.push(new Date(now.getTime() - count * unit));
  }
  dates.sort((a, b) => b - a);
  return { toISOStringOrNull: dates[0]?.toISOString() || null };
}

function extractGoogleImages(html) {
  const values = [];
  for (const match of String(html || '').matchAll(/https?:\/\/(?:lh\d*\.googleusercontent\.com|encrypted-tbn\d*\.gstatic\.com)\/[^"'<>\s]+/gi)) {
    const value = decodeUrl(match[0].replace(/\\u003d/gi, '=').replace(/\\u0026/gi, '&'));
    if (!values.includes(value)) values.push(value);
  }
  return values;
}

function safeGoogleImageUrl(value) {
  let url;
  try { url = new URL(String(value || '')); } catch { throw new Error('URL da foto pública do Google inválida.'); }
  if (url.protocol !== 'https:' || !GOOGLE_IMAGE_HOST.test(url.hostname)) throw new Error('Origem da foto pública do Google não permitida.');
  return url.toString();
}

function dedupeResults(results) {
  const seen = new Set();
  return results.filter((result) => {
    const key = `${normalized(result.title)}|${result.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isGoogleInternalUrl(value) {
  try {
    const url = new URL(value);
    if (isGoogleGotoUrl(url.toString())) return false;
    return /(^|\.)google\.(com|com\.br)$|(^|\.)googleusercontent\.com$|(^|\.)gstatic\.com$/i.test(url.hostname);
  } catch { return true; }
}

function isGoogleGotoUrl(value) {
  try { const url = new URL(value); return /^www\.google\.(com|com\.br)$/i.test(url.hostname) && url.pathname === '/goto'; } catch { return false; }
}

function absoluteResultUrl(value) {
  try { return new URL(String(value || ''), GOOGLE_SEARCH_URL).toString(); } catch { return ''; }
}

function decodeUrl(value) {
  return String(value || '').replace(/&amp;/gi, '&').replace(/&#x3d;/gi, '=').replace(/\\u003d/gi, '=').replace(/\\u0026/gi, '&');
}

function htmlText(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

function findChrome() {
  return [process.env.CHROME_PATH, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(existsSync) || '';
}

function validDate(value) { const date = value instanceof Date ? value : new Date(value); return Number.isNaN(date.getTime()) ? new Date() : date; }
function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function normalized(value) { return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function escapeRegex(value) { return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function hash(value) { return createHash('sha256').update(value instanceof Uint8Array ? value : String(value || '')).digest('hex'); }
function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
