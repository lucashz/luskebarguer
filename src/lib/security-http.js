function addOrigin(target, value) {
  const text = String(value || '').trim();
  if (!text) return;
  try { target.add(new URL(text).origin.toLowerCase()); } catch {}
}

export function allowedOrigins(env = process.env) {
  const origins = new Set();
  for (const value of String(env.ALLOWED_ORIGINS || '').split(',')) addOrigin(origins, value);
  for (const key of ['APP_URL', 'PUBLIC_APP_URL', 'PANEL_BASE_URL', 'PLATFORM_BASE_URL']) addOrigin(origins, env[key]);
  return origins;
}

export function assertAuthenticatedOrigin(req, options = {}) {
  if (!options.authenticated || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(req.method || 'GET'))) return;
  if (String(req.headers?.['sec-fetch-site'] || '').trim().toLowerCase() === 'cross-site') throw forbiddenOrigin();
  const source = String(req.headers?.origin || req.headers?.referer || '').trim();
  if (!source) return;
  let origin;
  try { origin = new URL(source).origin.toLowerCase(); } catch { throw forbiddenOrigin(); }
  if (!allowedOrigins(options.env).has(origin)) throw forbiddenOrigin();
}

export function corsHeaders(req, routePolicy = {}) {
  if (!routePolicy.enabled) return {};
  const source = String(req.headers?.origin || '').trim();
  if (!source) return {};
  let origin;
  try { origin = new URL(source).origin.toLowerCase(); } catch { return {}; }
  if (!allowedOrigins(routePolicy.env).has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
    ...(routePolicy.credentials ? { 'Access-Control-Allow-Credentials': 'true' } : {})
  };
}

export function securityHeaders(options = {}) {
  const frameAncestors = options.allowSameOriginFrame ? "frame-ancestors 'self'" : "frame-ancestors 'none'";
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': options.allowSameOriginFrame ? 'SAMEORIGIN' : 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    ...(options.production || options.https ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
    'Content-Security-Policy': [
      "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https://taprontomenu.com.br https://*.taprontomenu.com.br",
      "font-src 'self' data:", "connect-src 'self'", "frame-src 'self'", "base-uri 'self'",
      "form-action 'self'", frameAncestors, "object-src 'none'"
    ].join('; ')
  };
}

function forbiddenOrigin() {
  const error = new Error('Origem da requisição não autorizada.');
  error.status = 403;
  return error;
}
