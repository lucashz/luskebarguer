import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { getLocalPool } from './local-postgrest-adapter.js';

export function normalizedIdentity(value = '') {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9@+._-]/g, '');
}

export function opaqueBucketKey(secret, ruleName, scope, value) {
  return createHash('sha256').update(`${secret}:${ruleName}:${scope}:${value}`).digest('hex');
}

export function requestIp(req, trustedProxyHops = Number(process.env.TRUSTED_PROXY_HOPS || 0)) {
  const remote = normalizeIp(req.socket?.remoteAddress);
  const hops = Number.isSafeInteger(trustedProxyHops) && trustedProxyHops > 0 ? trustedProxyHops : 0;
  if (!hops) return remote;
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',').map((item) => normalizeIp(item));
  const chain = [...forwarded, remote];
  const candidate = chain[chain.length - 1 - hops];
  return candidate && candidate !== 'unknown' ? candidate : remote;
}

export function securityRateRule(method, pathname) {
  const key = `${String(method).toUpperCase()} ${pathname}`;
  return RULES.get(key) || null;
}

export function securityRateIdentity(rule, body = {}) {
  if (!rule) return '';
  if (rule.identity === 'email') return normalizedIdentity(body.email || body.owner?.email);
  if (rule.identity === 'phone') return normalizedIdentity(body.phone || body.customer?.phone);
  if (rule.identity === 'token') return normalizedIdentity(body.token || body.challenge_token);
  if (rule.identity === 'signup') return normalizedIdentity(body.owner?.email || body.email || body.owner?.document);
  if (rule.identity === 'order') return normalizedIdentity(body.customer?.phone || body.phone || body.store_id);
  return '';
}

export async function enforceSecurityRateLimit({ req, rule, identity = '' }) {
  if (!rule) return;
  const secret = process.env.SECURITY_RATE_LIMIT_SECRET || process.env.COOKIE_SECRET || process.env.SESSION_SECRET || 'local-security-rate-limit';
  const dimensions = [['network', requestIp(req)]];
  const cleanIdentity = normalizedIdentity(identity);
  if (cleanIdentity) dimensions.push(['identity', cleanIdentity]);

  for (const [scope, value] of dimensions) {
    const bucketKey = opaqueBucketKey(secret, rule.name, scope, value);
    const result = await getLocalPool().query(`
      INSERT INTO security_rate_limits(bucket_key, rule_name, scope, hit_count, window_ends_at)
      VALUES($1, $2, $3, 1, now() + ($4::text || ' milliseconds')::interval)
      ON CONFLICT(bucket_key) DO UPDATE SET
        hit_count = CASE WHEN security_rate_limits.window_ends_at <= now() THEN 1 ELSE security_rate_limits.hit_count + 1 END,
        window_ends_at = CASE WHEN security_rate_limits.window_ends_at <= now() THEN excluded.window_ends_at ELSE security_rate_limits.window_ends_at END,
        updated_at = now()
      RETURNING hit_count, window_ends_at
    `, [bucketKey, rule.name, scope, rule.windowMs]);
    const bucket = result.rows[0];
    if (Number(bucket.hit_count) > rule.max) {
      const retryAfter = Math.max(1, Math.ceil((new Date(bucket.window_ends_at).getTime() - Date.now()) / 1000));
      const error = new Error('Muitas tentativas. Aguarde e tente novamente.');
      error.status = 429;
      error.retryAfter = retryAfter;
      throw error;
    }
  }
}

function normalizeIp(value) {
  const candidate = String(value || '').trim().replace(/^::ffff:/, '');
  return isIP(candidate) ? candidate : 'unknown';
}

function rule(name, max, windowMs, identity) {
  return { name, max, windowMs, identity };
}

const RULES = new Map([
  ['POST /api/admin/login', rule('admin-login', 8, 120_000, 'email')],
  ['POST /api/admin/login/2fa', rule('admin-login-2fa', 8, 600_000, 'token')],
  ['POST /api/customer/login', rule('customer-login', 10, 900_000, 'phone')],
  ['POST /api/customer/reset-password', rule('customer-reset', 5, 1_800_000, 'phone')],
  ['POST /api/portal/recover-password', rule('admin-recover', 5, 1_800_000, 'email')],
  ['POST /api/portal/resend-activation', rule('activation-resend', 3, 900_000, 'email')],
  ['POST /api/portal/signup', rule('portal-signup', 5, 120_000, 'signup')],
  ['POST /api/orders', rule('order-create', 20, 600_000, 'order')]
]);
