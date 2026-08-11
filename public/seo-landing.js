const visitorKeyName = 'tapronto_visitor_key';
let visitorKey = localStorage.getItem(visitorKeyName);
if (!visitorKey) {
  visitorKey = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(visitorKeyName, visitorKey);
}

fetch('/api/analytics/access', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  keepalive: true,
  body: JSON.stringify({
    page_type: 'page',
    path: location.pathname,
    referrer: document.referrer,
    visitor_key: visitorKey,
    attribution: marketingAttribution(),
    title: document.title,
    source: 'seo-landing'
  })
}).catch(() => {});

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href]');
  if (!link) return;
  const href = String(link.getAttribute('href') || '');
  const eventName = /cardapio$|demonstracao|demo/.test(href) ? 'demo_started' : /cadastro|criar-conta/.test(href) ? 'signup_started' : '';
  if (!eventName) return;
  fetch('/api/analytics/funnel', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
    body: JSON.stringify({ event_name: eventName, path: location.pathname, placement: link.textContent?.trim(), attribution: marketingAttribution() })
  }).catch(() => {});
});

function marketingAttribution() {
  const params = new URLSearchParams(location.search);
  return {
    utm_source: params.get('utm_source') || '', utm_medium: params.get('utm_medium') || '',
    utm_campaign: params.get('utm_campaign') || '', utm_content: params.get('utm_content') || '',
    utm_term: params.get('utm_term') || '', landing_path: location.pathname,
    referrer_host: document.referrer, visitor_key: visitorKey
  };
}
