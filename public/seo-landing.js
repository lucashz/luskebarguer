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
    title: document.title,
    source: 'seo-landing'
  })
}).catch(() => {});
