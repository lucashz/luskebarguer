import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export const SOCIAL_CONTENT_STATUSES = ['idea', 'draft', 'production', 'review', 'changes_requested', 'approved', 'scheduled', 'publishing', 'processing', 'published', 'simulated', 'failed', 'cancelled'];
export const SOCIAL_TRANSITIONS = Object.freeze({
  idea: ['draft', 'cancelled'], draft: ['production', 'review', 'cancelled'], production: ['review', 'draft', 'cancelled'],
  review: ['changes_requested', 'approved', 'cancelled'], changes_requested: ['production', 'review', 'cancelled'],
  approved: ['scheduled', 'review', 'cancelled'], scheduled: ['publishing', 'review', 'cancelled'],
  publishing: ['processing', 'published', 'failed'], processing: ['published', 'failed'], failed: ['scheduled', 'review', 'cancelled'],
  published: [], simulated: ['review', 'scheduled'], cancelled: ['draft']
});

export function socialConfig(env = process.env) {
  const publicBase = String(env.PUBLIC_APP_URL || env.APP_URL || '').replace(/\/+$/, '');
  return {
    appId: String(env.META_APP_ID || ''), appSecret: String(env.META_APP_SECRET || ''),
    redirectUri: String(env.META_REDIRECT_URI || `${publicBase}/api/platform/social/oauth/callback`),
    graphVersion: String(env.META_GRAPH_API_VERSION || 'v23.0'),
    encryptionKey: String(env.SOCIAL_TOKEN_ENCRYPTION_KEY || ''),
    enabled: parseBoolean(env.INSTAGRAM_PUBLISHING_ENABLED, false), simulation: parseBoolean(env.INSTAGRAM_SIMULATION_MODE, true),
    workerIntervalSeconds: clampInt(env.INSTAGRAM_WORKER_INTERVAL_SECONDS, 15, 3600, 60),
    metricsIntervalHours: clampInt(env.INSTAGRAM_METRICS_SYNC_INTERVAL_HOURS, 1, 168, 6),
    tokenAlertDays: clampInt(env.INSTAGRAM_TOKEN_ALERT_DAYS, 1, 30, 7), maxRetries: clampInt(env.INSTAGRAM_MAX_RETRIES, 1, 12, 5),
    publicBase, allowedMediaHosts: new Set([new URL(publicBase || 'https://taprontomenu.com.br').hostname, ...String(env.SOCIAL_MEDIA_ALLOWED_HOSTS || '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean)])
  };
}

export function socialConfigStatus(config = socialConfig()) {
  return {
    simulation: config.simulation, enabled: config.enabled,
    encryptionReady: config.encryptionKey.length >= 32,
    oauthReady: Boolean(config.appId && config.appSecret && config.redirectUri && config.encryptionKey.length >= 32),
    liveReady: Boolean(config.enabled && !config.simulation && config.appId && config.appSecret && config.encryptionKey.length >= 32)
  };
}

export function encryptSocialSecret(value, config = socialConfig()) {
  const plain = String(value || '');
  if (!plain || plain.startsWith('social:v1:')) return plain;
  if (config.encryptionKey.length < 32) throw new Error('SOCIAL_TOKEN_ENCRYPTION_KEY deve ter ao menos 32 caracteres.');
  const key = createHash('sha256').update(config.encryptionKey).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `social:v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptSocialSecret(value, config = socialConfig()) {
  const stored = String(value || '');
  if (!stored.startsWith('social:v1:')) return stored;
  if (config.encryptionKey.length < 32) throw new Error('SOCIAL_TOKEN_ENCRYPTION_KEY ausente ou inválida.');
  const [, , iv, tag, encrypted] = stored.split(':');
  const decipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(config.encryptionKey).digest(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
}

export function createOAuthState() { const state = randomBytes(32).toString('base64url'); return { state, hash: hashText(state) }; }
export function verifyOAuthState(state, expectedHash) {
  const actual = Buffer.from(hashText(String(state || '')), 'hex');
  const expected = Buffer.from(String(expectedHash || ''), 'hex');
  return actual.length === expected.length && actual.length > 0 && timingSafeEqual(actual, expected);
}

export function verifyMetaSignedRequest(signedRequest, appSecret) {
  const value = String(signedRequest || '').trim();
  const secret = String(appSecret || '');
  const [encodedSignature, encodedPayload, extra] = value.split('.');
  if (!encodedSignature || !encodedPayload || extra !== undefined || !secret) throw new Error('Solicitação de exclusão inválida.');
  const received = Buffer.from(encodedSignature, 'base64url');
  const expected = createHmac('sha256', secret).update(encodedPayload).digest();
  if (!received.length || received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error('Assinatura da Meta inválida.');
  let payload;
  try { payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')); } catch { throw new Error('Payload de exclusão inválido.'); }
  if (String(payload.algorithm || '').toUpperCase() !== 'HMAC-SHA256' || !String(payload.user_id || '').trim()) throw new Error('Payload de exclusão incompleto.');
  return payload;
}

export function instagramAuthorizationUrl(state, config = socialConfig()) {
  const query = new URLSearchParams({ client_id: config.appId, redirect_uri: config.redirectUri, response_type: 'code', scope: 'instagram_business_basic,instagram_business_content_publish', state });
  return `https://www.instagram.com/oauth/authorize?${query}`;
}

export function assertTransition(from, to) {
  if (!(SOCIAL_TRANSITIONS[from] || []).includes(to)) throw Object.assign(new Error(`Transição inválida: ${from} → ${to}.`), { status: 422 });
}

export function contentApprovalHash(content, assets = []) {
  const normalized = { caption: content.caption || '', cta: content.cta || '', utm_url: content.utm_url || '', format: content.format || '', scheduled_at: content.scheduled_at || null, assets: assets.map((a) => ({ id: a.id, checksum: a.checksum_sha256, order: a.sort_order })) };
  return hashText(JSON.stringify(normalized));
}
export function assetsApprovalHash(assets = []) { return hashText(JSON.stringify(assets.map((a) => `${a.id}:${a.checksum_sha256}:${a.sort_order}`))); }
export function publicationIdempotencyKey(content, account) { return hashText(`${content.id}:${content.content_version}:${content.approved_version_hash}:${account.id}`); }

export function validateContentForApproval(content, assets, account, now = new Date()) {
  const errors = [];
  if (!String(content.caption || '').trim()) errors.push('Legenda obrigatória.');
  if (!['image', 'post', 'carousel', 'reel', 'story'].includes(String(content.format || '').toLowerCase())) errors.push('Formato não suportado pelo Instagram.');
  if (!assets.length) errors.push('Adicione ao menos um asset real.');
  if (String(content.format).toLowerCase() === 'carousel' && (assets.length < 2 || assets.length > 10)) errors.push('Carrossel deve ter de 2 a 10 itens.');
  if (String(content.format).toLowerCase() !== 'carousel' && assets.filter((a) => a.role === 'media').length !== 1) errors.push('Este formato precisa de um asset principal.');
  if (assets.some((a) => a.processing_status !== 'ready')) errors.push('Todos os assets devem estar validados.');
  if (!String(content.cta || '').trim()) errors.push('CTA obrigatório.');
  try { const url = new URL(content.utm_url || ''); if (!/^https:$/.test(url.protocol)) throw new Error(); } catch { errors.push('Link UTM HTTPS obrigatório.'); }
  if (!account || account.status !== 'connected') errors.push('Conecte uma conta social saudável.');
  if (account?.token_expires_at && new Date(account.token_expires_at) <= now && account.mode === 'live') errors.push('Token da conta expirado.');
  return errors;
}

export function assertSafeMediaUrl(rawUrl, config = socialConfig()) {
  const url = new URL(String(rawUrl || ''), config.publicBase || 'https://taprontomenu.com.br');
  if (url.protocol !== 'https:') throw new Error('A mídia precisa estar disponível por HTTPS.');
  if (!config.allowedMediaHosts.has(url.hostname.toLowerCase())) throw new Error('Host de mídia não autorizado.');
  if (!url.pathname.startsWith('/uploads/social/')) throw new Error('A mídia precisa pertencer à biblioteca social.');
  return url.toString();
}

export async function exchangeInstagramCode(code, config = socialConfig()) {
  if (!config.appId || !config.appSecret) throw new Error('Credenciais Meta ausentes.');
  const form = new URLSearchParams({ client_id: config.appId, client_secret: config.appSecret, grant_type: 'authorization_code', redirect_uri: config.redirectUri, code: String(code || '') });
  const shortResponse = await fetch('https://api.instagram.com/oauth/access_token', { method: 'POST', body: form });
  const short = await metaJson(shortResponse, 'oauth_token');
  const longUrl = new URL(`https://graph.instagram.com/access_token`);
  longUrl.search = new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: config.appSecret, access_token: short.access_token });
  const long = await metaJson(await fetch(longUrl), 'oauth_long_token');
  const token = long.access_token || short.access_token;
  const profile = await metaRequest(`/${short.user_id || 'me'}?fields=id,username,name,profile_picture_url,account_type`, token, {}, config);
  return { token, refreshToken: '', expiresIn: Number(long.expires_in || 0), profile, scopes: ['instagram_business_basic', 'instagram_business_content_publish'] };
}

export async function metaRequest(path, token, options = {}, config = socialConfig()) {
  const url = new URL(`https://graph.instagram.com/${config.graphVersion}${path}`);
  const method = options.method || 'GET';
  const init = { method, headers: { Authorization: `Bearer ${token}` } };
  if (options.body) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(options.body); }
  const started = Date.now();
  const response = await fetch(url, init);
  const data = await metaJson(response, path);
  return { ...data, _meta: { status: response.status, durationMs: Date.now() - started, endpoint: url.pathname } };
}

async function metaJson(response, operation) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const error = new Error(data.error?.message || `Meta respondeu ${response.status}.`);
    error.status = response.status; error.providerCode = String(data.error?.code || ''); error.operation = operation; error.transient = response.status >= 500 || response.status === 429 || data.error?.is_transient === true || ['9004', '9007'].includes(String(data.error?.code || ''));
    throw error;
  }
  return data;
}

export async function processClaimedPublication(client, publication, env = process.env) {
  const config = socialConfig(env);
  const context = await loadPublicationContext(client, publication.id);
  if (!context) return;
  const { content, account, assets } = context;
  if (account.publishing_paused || account.status !== 'connected') return failOrRetry(client, publication, new Error('Conta desconectada ou pausada.'), config, false);
  if (content.approved_version_hash !== publication.approved_hash || !['scheduled', 'publishing', 'processing'].includes(content.status)) return failOrRetry(client, publication, new Error('Versão aprovada mudou; publicação bloqueada.'), config, false);
  if (config.simulation || publication.mode === 'simulation' || account.mode === 'simulation') return simulatePublication(client, publication, content);
  if (!config.enabled) return failOrRetry(client, publication, new Error('Publicação real desabilitada no ambiente.'), config, false);
  const token = decryptSocialSecret(account.access_token_encrypted, config);
  try {
    if (!publication.container_id) {
      const container = await createMetaContainer(content, assets, account, token, config);
      await logAttempt(client, publication, 'create_container', container._meta, 'success');
      await client.query(`update social_publications set status='container_created',container_id=$2,updated_at=now(),lock_expires_at=null where id=$1`, [publication.id, container.id]);
      await client.query(`update marketing_content_items set status='processing',updated_at=now() where id=$1`, [content.id]);
      return;
    }
    const status = await metaRequest(`/${publication.container_id}?fields=status_code,status`, token, {}, config);
    await logAttempt(client, publication, 'container_status', status._meta, 'success', { status_code: status.status_code });
    if (!['FINISHED', 'PUBLISHED'].includes(status.status_code)) {
      if (['ERROR', 'EXPIRED'].includes(status.status_code)) throw Object.assign(new Error(status.status || 'Container inválido.'), { transient: false });
      await client.query(`update social_publications set status='processing',next_attempt_at=now()+interval '30 seconds',lock_expires_at=null,updated_at=now() where id=$1`, [publication.id]); return;
    }
    const published = await metaRequest(`/${account.provider_account_id}/media_publish`, token, { method: 'POST', body: { creation_id: publication.container_id } }, config);
    const media = await metaRequest(`/${published.id}?fields=id,permalink,timestamp,media_type`, token, {}, config).catch(() => ({ id: published.id, permalink: '' }));
    await logAttempt(client, publication, 'media_publish', published._meta, 'success');
    await client.query(`update social_publications set status='published',provider_media_id=$2,permalink=$3,published_at=now(),lock_expires_at=null,updated_at=now() where id=$1`, [publication.id, published.id, media.permalink || '']);
    await client.query(`update marketing_content_items set status='published',published_at=now(),published_url=$2,publication_error='',updated_at=now() where id=$1`, [content.id, media.permalink || '']);
  } catch (error) { await failOrRetry(client, publication, error, config, error.transient !== false); }
}

async function createMetaContainer(content, assets, account, token, config) {
  const format = String(content.format).toLowerCase();
  const hashtags = (content.hashtags || []).map((tag) => String(tag).trim()).filter(Boolean).map((tag) => tag.startsWith('#') ? tag : `#${tag}`);
  const caption = [content.caption, hashtags.join(' ')].filter(Boolean).join('\n\n').slice(0, 2200);
  if (format === 'carousel') {
    const children = [];
    for (const asset of assets.filter((a) => a.role === 'media')) {
      const mediaUrl = assertSafeMediaUrl(asset.public_url, config);
      const body = asset.kind === 'video' ? { media_type: 'VIDEO', video_url: mediaUrl, is_carousel_item: true } : { image_url: mediaUrl, is_carousel_item: true };
      const child = await metaRequest(`/${account.provider_account_id}/media`, token, { method: 'POST', body }, config); children.push(child.id);
    }
    return metaRequest(`/${account.provider_account_id}/media`, token, { method: 'POST', body: { media_type: 'CAROUSEL', children: children.join(','), caption } }, config);
  }
  const asset = assets.find((a) => a.role === 'media') || assets[0];
  if (!asset || !['image', 'video'].includes(asset.kind) || asset.processing_status !== 'ready') throw Object.assign(new Error('A publicação precisa de uma imagem ou vídeo válido.'), { transient: false });
  const mediaUrl = assertSafeMediaUrl(asset.public_url, config);
  const body = asset.kind === 'image' ? { image_url: mediaUrl, caption } : { media_type: format === 'story' ? 'STORIES' : 'REELS', video_url: mediaUrl, caption };
  return metaRequest(`/${account.provider_account_id}/media`, token, { method: 'POST', body }, config);
}

async function simulatePublication(client, publication, content) {
  const containerId = publication.container_id || `sim-container-${randomUUID()}`;
  const mediaId = `sim-media-${randomUUID()}`;
  await logAttempt(client, publication, 'simulation_publish', { endpoint: 'simulation', status: 200, durationMs: 5 }, 'success');
  await client.query(`update social_publications set status='simulated',container_id=$2,provider_media_id=$3,permalink='',published_at=now(),lock_expires_at=null,updated_at=now() where id=$1`, [publication.id, containerId, mediaId]);
  await client.query(`update marketing_content_items set status='simulated',published_at=null,published_url='',publication_error='',updated_at=now() where id=$1`, [content.id]);
  await client.query(`insert into social_metric_snapshots(publication_id,source,metrics) values($1,'simulation',$2::jsonb)`, [publication.id, JSON.stringify({ reach: 0, views: 0, simulated: true })]);
}

async function failOrRetry(client, publication, error, config, mayRetry = true) {
  const attempts = Number(publication.attempt_count || 0) + 1;
  const retry = mayRetry && attempts < config.maxRetries;
  const delayMinutes = Math.min(60, 2 ** attempts);
  await logAttempt(client, { ...publication, attempt_count: attempts }, 'publish', { endpoint: error.operation || '', status: error.status || null, durationMs: null }, retry ? 'retry' : 'failed', { code: error.providerCode || '', message: String(error.message || '').slice(0, 500) });
  await client.query(`update social_publications set status=$2,attempt_count=$3,next_attempt_at=case when $4 then now()+($5||' minutes')::interval else null end,last_error_code=$6,last_error=$7,lock_expires_at=null,updated_at=now() where id=$1`, [publication.id, retry ? 'retry' : 'failed', attempts, retry, String(delayMinutes), String(error.providerCode || ''), String(error.message || '').slice(0, 1000)]);
  if (!retry) await client.query(`update marketing_content_items set status='failed',publication_error=$2,publication_attempts=$3,updated_at=now() where id=$1`, [publication.content_id, String(error.message || '').slice(0, 1000), attempts]);
}

async function logAttempt(client, publication, operation, meta = {}, result, details = {}) {
  await client.query(`insert into social_publication_attempts(publication_id,attempt_number,operation,endpoint,http_status,duration_ms,result,details) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`, [publication.id, Number(publication.attempt_count || 0) + 1, operation, meta.endpoint || '', meta.status || null, meta.durationMs || null, result, JSON.stringify(details)]);
}

async function loadPublicationContext(client, id) {
  const result = await client.query(`select row_to_json(p.*) publication,row_to_json(c.*) content,row_to_json(a.*) account,coalesce(json_agg(json_build_object('id',m.id,'kind',m.kind,'public_url',m.public_url,'checksum_sha256',m.checksum_sha256,'processing_status',m.processing_status,'sort_order',ca.sort_order,'role',ca.role) order by ca.sort_order) filter(where m.id is not null),'[]') assets from social_publications p join marketing_content_items c on c.id=p.content_id join social_accounts a on a.id=p.account_id left join social_content_assets ca on ca.content_id=c.id left join social_media_assets m on m.id=ca.asset_id where p.id=$1 group by p.id,c.id,a.id`, [id]);
  return result.rows[0] || null;
}

export async function claimNextPublication(client) {
  await client.query('begin');
  try {
    const result = await client.query(`select * from social_publications where status in ('queued','retry','container_created','processing') and scheduled_at<=now() and (next_attempt_at is null or next_attempt_at<=now()) and (lock_expires_at is null or lock_expires_at<now()) order by scheduled_at for update skip locked limit 1`);
    if (!result.rows[0]) { await client.query('commit'); return null; }
    const row = result.rows[0];
    await client.query(`update social_publications set status=case when status in ('container_created','processing') then status else 'claimed' end,claimed_at=now(),lock_expires_at=now()+interval '5 minutes',updated_at=now() where id=$1`, [row.id]);
    await client.query('commit'); return row;
  } catch (error) { await client.query('rollback'); throw error; }
}

export async function syncPublicationMetrics(client, env = process.env) {
  const config = socialConfig(env);
  const result = await client.query(`select p.*,a.access_token_encrypted,a.mode account_mode from social_publications p join social_accounts a on a.id=p.account_id where p.status='published' and p.provider_media_id<>'' and (a.last_sync_at is null or a.last_sync_at<now()-($1||' hours')::interval) limit 25`, [String(config.metricsIntervalHours)]);
  for (const publication of result.rows) {
    try {
      if (config.simulation || publication.mode === 'simulation' || publication.account_mode === 'simulation') continue;
      const token = decryptSocialSecret(publication.access_token_encrypted, config);
      const response = await metaRequest(`/${publication.provider_media_id}/insights?metric=reach,views,likes,comments,shares,saved`, token, {}, config);
      const metrics = Object.fromEntries((response.data || []).map((item) => [item.name, item.values?.[0]?.value ?? item.value ?? null]));
      await client.query(`insert into social_metric_snapshots(publication_id,source,metrics) values($1,'meta',$2::jsonb)`, [publication.id, JSON.stringify(metrics)]);
      await client.query(`update social_accounts set last_sync_at=now(),last_error='',updated_at=now() where id=$1`, [publication.account_id]);
    } catch (error) { await client.query(`update social_accounts set last_error=$2,updated_at=now() where id=$1`, [publication.account_id, String(error.message || '').slice(0, 500)]); }
  }
  return result.rows.length;
}

export function hashText(value) { return createHash('sha256').update(String(value || '')).digest('hex'); }
function parseBoolean(value, fallback) { if (value == null || value === '') return fallback; return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase()); }
function clampInt(value, min, max, fallback) { const parsed = Number.parseInt(value, 10); return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback; }
