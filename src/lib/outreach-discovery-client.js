export function outreachDiscoveryMode(env = process.env) {
  if (String(env.GOOGLE_OUTREACH_API_KEY || '').trim()) return 'api';
  if (parseBoolean(env.GOOGLE_OUTREACH_BROWSER_ENABLED, true)) return 'browser';
  throw new Error('Configure uma fonte de busca: API Google ou navegador gratuito.');
}

export function createOutreachDiscoveryClient({ env = process.env, apiFactory, browserFactory, apiOptions, browserOptions } = {}) {
  const mode = outreachDiscoveryMode(env);
  if (mode === 'api') {
    if (typeof apiFactory !== 'function') throw new Error('Cliente da API Google não configurado.');
    return apiFactory(apiOptions || {});
  }
  if (typeof browserFactory !== 'function') throw new Error('Cliente gratuito do Google não configurado.');
  return browserFactory(browserOptions || {});
}

export function outreachCandidateLimit({ mode, requested, env = process.env } = {}) {
  const target = Math.max(1, Math.floor(Number(requested) || 1));
  if (mode !== 'browser') return target;
  const configured = Math.max(1, Math.floor(Number(env.GOOGLE_OUTREACH_BROWSER_CANDIDATE_LIMIT) || 12));
  return Math.min(target, configured);
}

function parseBoolean(value, fallback) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}
