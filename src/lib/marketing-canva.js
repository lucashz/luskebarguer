import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { fail, normalizeUpload } from './marketing-studio.js';

const hash = value => createHash('sha256').update(String(value)).digest('hex');
const validId = value => /^[A-Za-z0-9_-]{5,160}$/.test(String(value || ''));

export async function createCanvaClient({ pool, config, origin }) {
  const ready = Boolean(config.canvaClientId && config.canvaClientSecret && config.canvaTokenSecret?.length >= 32);
  const redirectUri = config.canvaRedirectUri || `${origin}/marketing/canva/callback`;
  const key = ready ? createHash('sha256').update(config.canvaTokenSecret).digest() : null;
  await pool.query(`CREATE TABLE IF NOT EXISTS marketing_studio_canva_connections (
    org_id text PRIMARY KEY REFERENCES marketing_studio_orgs(id), access_token text NOT NULL, refresh_token text NOT NULL,
    expires_at timestamptz NOT NULL, scopes text NOT NULL DEFAULT '', updated_at timestamptz NOT NULL DEFAULT now()
  ); CREATE TABLE IF NOT EXISTS marketing_studio_canva_oauth (
    state_hash text PRIMARY KEY, org_id text NOT NULL REFERENCES marketing_studio_orgs(id), verifier text NOT NULL,
    expires_at timestamptz NOT NULL
  );`);
  const seal = value => {
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
  };
  const open = value => {
    const bytes = Buffer.from(value, 'base64url'); const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28)); return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
  };
  async function tokenRequest(data) {
    const response = await fetch('https://api.canva.com/rest/v1/oauth/token', {
      method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${config.canvaClientId}:${config.canvaClientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(data), signal: AbortSignal.timeout(15000),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.access_token) throw fail(502, 'Não foi possível conectar a conta Canva.');
    return payload;
  }
  async function saveTokens(org, token, previousRefresh = '') {
    const refresh = token.refresh_token || previousRefresh;
    if (!refresh) throw fail(502, 'O Canva não retornou uma credencial de renovação.');
    await pool.query(`INSERT INTO marketing_studio_canva_connections(org_id,access_token,refresh_token,expires_at,scopes,updated_at)
      VALUES($1,$2,$3,now()+($4||' seconds')::interval,$5,now()) ON CONFLICT(org_id) DO UPDATE SET access_token=$2,refresh_token=$3,expires_at=now()+($4||' seconds')::interval,scopes=$5,updated_at=now()`,
      [org, seal(token.access_token), seal(refresh), String(Math.max(60, Number(token.expires_in) || 14400)), String(token.scope || '')]);
  }
  async function access(org) {
    if (!ready) throw fail(422, 'Configure a integração Canva antes de conectar uma conta.');
    const row = (await pool.query('SELECT * FROM marketing_studio_canva_connections WHERE org_id=$1', [org])).rows[0];
    if (!row) throw fail(409, 'Conecte sua conta Canva primeiro.');
    if (Date.parse(row.expires_at) > Date.now() + 60_000) return open(row.access_token);
    const previousRefresh = open(row.refresh_token);
    const token = await tokenRequest({ grant_type: 'refresh_token', refresh_token: previousRefresh });
    await saveTokens(org, token, previousRefresh); return token.access_token;
  }
  async function canva(path, token) {
    const response = await fetch(`https://api.canva.com/rest/v1${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw fail(response.status === 401 ? 409 : 502, response.status === 401 ? 'Reconecte sua conta Canva.' : 'O Canva está temporariamente indisponível.');
    return payload;
  }
  async function design(org, id) {
    if (!validId(id)) throw fail(404, 'Design do Canva não encontrado.');
    const payload = await canva(`/designs/${encodeURIComponent(id)}`, await access(org));
    return payload.design || payload;
  }
  return {
    async status(org) { const connected = ready && Boolean((await pool.query('SELECT 1 FROM marketing_studio_canva_connections WHERE org_id=$1', [org])).rowCount); return { configured: ready, connected }; },
    async connect(org) {
      if (!ready) throw fail(422, 'Configure CANVA_CLIENT_ID, CANVA_CLIENT_SECRET e CANVA_TOKEN_ENCRYPTION_KEY.');
      const verifier = randomBytes(64).toString('base64url'); const state = randomBytes(32).toString('base64url');
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      await pool.query('DELETE FROM marketing_studio_canva_oauth WHERE expires_at<now()');
      await pool.query("INSERT INTO marketing_studio_canva_oauth(state_hash,org_id,verifier,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')", [hash(state), org, seal(verifier)]);
      const url = new URL('https://www.canva.com/api/oauth/authorize');
      url.search = new URLSearchParams({ code_challenge: challenge, code_challenge_method: 'S256', scope: 'design:meta:read', response_type: 'code', client_id: config.canvaClientId, state, redirect_uri: redirectUri });
      return { url: url.href };
    },
    async callback(query) {
      const state = String(query.get('state') || ''); const code = String(query.get('code') || '');
      const row = (await pool.query('DELETE FROM marketing_studio_canva_oauth WHERE state_hash=$1 AND expires_at>now() RETURNING verifier,org_id', [hash(state)])).rows[0];
      if (!row || !code) throw fail(422, 'A conexão com o Canva expirou. Tente novamente.');
      const token = await tokenRequest({ grant_type: 'authorization_code', code, code_verifier: open(row.verifier), redirect_uri: redirectUri });
      await saveTokens(row.org_id, token); return true;
    },
    async search(org, query) {
      query = String(query || '').trim(); if (query.length < 2 || query.length > 100) throw fail(422, 'Digite entre 2 e 100 caracteres para pesquisar no Canva.');
      const params = new URLSearchParams({ query, ownership: 'any', sort_by: 'relevance_descending' });
      const payload = await canva(`/designs?${params}`, await access(org));
      return (payload.items || []).filter(item => validId(item.id) && item.thumbnail?.url).slice(0, 12).map(item => ({ id: item.id, title: String(item.title || 'Design sem título').slice(0, 120), editUrl: item.edit_url || item.url || '' }));
    },
    async thumbnail(org, id, normalize = false) {
      const item = await design(org, id); const url = new URL(item.thumbnail?.url || '');
      if (url.protocol !== 'https:' || !(url.hostname === 'canva.com' || url.hostname.endsWith('.canva.com'))) throw fail(422, 'O Canva não forneceu uma prévia válida.');
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!response.ok || !String(response.headers.get('content-type') || '').startsWith('image/') || bytes.length > 5 * 1024 * 1024) throw fail(422, 'Não foi possível importar a prévia do Canva.');
      return normalize ? normalizeUpload(bytes.toString('base64')) : bytes;
    },
  };
}
