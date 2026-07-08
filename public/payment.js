const params = new URLSearchParams(window.location.search);
const code = params.get('pedido') || params.get('order') || params.get('code') || '';

const els = {
  title: document.querySelector('#paymentTitle'),
  subtitle: document.querySelector('#paymentSubtitle'),
  status: document.querySelector('#paymentStatusBox'),
  qr: document.querySelector('#paymentQr'),
  pixCode: document.querySelector('#paymentPixCode'),
  checkoutLink: document.querySelector('#paymentCheckoutLink'),
  copy: document.querySelector('#copyPixButton'),
  refresh: document.querySelector('#refreshPaymentButton'),
  newPix: document.querySelector('#newPixButton')
};

els.copy.addEventListener('click', async () => {
  await navigator.clipboard?.writeText(els.pixCode.value || '');
  setStatus('Codigo Pix copiado.');
});
els.refresh.addEventListener('click', () => loadPayment());
els.newPix.addEventListener('click', () => regeneratePix());

loadPayment();
loadStoreIdentity().catch(() => {});

async function loadPayment() {
  if (!code) {
    setStatus('Pedido não informado.');
    return;
  }
  try {
    const data = await request(`/api/payments/order?code=${encodeURIComponent(code)}`);
    renderPayment(data);
  } catch (error) {
    setStatus(error.message || 'Não foi possível carregar o pagamento.');
  }
}

async function loadStoreIdentity() {
  const data = await request('/api/store');
  const store = data.store || {};
  const title = String(store.page_title || store.name || 'Cardápio').trim();
  document.title = `Pagamento - ${title}`;
  applyFavicon(store.favicon_url);
}

async function regeneratePix() {
  try {
    const data = await request('/api/payments/regenerate-pix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    renderPayment(data);
    setStatus('Novo Pix gerado.');
  } catch (error) {
    setStatus(error.message || 'Não foi possível gerar um novo Pix.');
  }
}

function renderPayment(data) {
  const order = data.order || {};
  const payment = data.payment || {};
  const qrUrl = safeImageUrl(payment.pix_qr_url);
  const checkoutUrl = safeHttpUrl(payment.checkout_url);
  const hasPix = Boolean(payment.pix_code || qrUrl);
  const hasCheckout = Boolean(checkoutUrl);

  els.title.textContent = `Pedido #${order.public_code || code}`;
  els.subtitle.textContent = `${money(order.total || 0)} - ${financialStatusLabel(order.financial_status)}`;
  els.status.innerHTML = `
    <div><span>Status</span><strong>${financialStatusLabel(order.financial_status)}</strong></div>
    <div><span>Expira em</span><strong>${payment.expires_at ? new Date(payment.expires_at).toLocaleString('pt-BR') : 'Não informado'}</strong></div>
    <div><span>Transacao</span><strong>${escapeHtml(payment.transaction_id || 'Aguardando')}</strong></div>
  `;
  els.pixCode.value = payment.pix_code || '';
  els.pixCode.closest('label').hidden = !hasPix;
  els.copy.hidden = !hasPix;
  els.qr.hidden = !qrUrl;
  els.qr.src = qrUrl || '';
  if (els.checkoutLink) {
    els.checkoutLink.hidden = !hasCheckout;
    els.checkoutLink.href = checkoutUrl || '#';
  }
  els.newPix.hidden = order.financial_status !== 'expired' || !hasPix;
}

function setStatus(message) {
  els.subtitle.textContent = message;
}

async function request(url, options = {}) {
  const response = await fetch(storeApiUrl(url), options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Erro na requisicao.');
  return data;
}

function storeApiUrl(url) {
  if (!String(url || '').startsWith('/api/')) return url;
  const slug = currentStoreSlug();
  if (!slug) return url;
  const parsed = new URL(url, window.location.origin);
  if (!parsed.searchParams.has('store')) parsed.searchParams.set('store', slug);
  return `${parsed.pathname}${parsed.search}`;
}

function currentStoreSlug() {
  const firstSegment = window.location.pathname.split('/').filter(Boolean)[0] || '';
  if (!firstSegment || ['admin', 'cozinha', 'pagamento', 'conta', 'cliente', 'pedidos'].includes(firstSegment)) return '';
  return firstSegment;
}

function financialStatusLabel(status) {
  return ({
    pending: 'Pendente',
    paid: 'Pago',
    failed: 'Falhou',
    expired: 'Expirado',
    cancelled: 'Cancelado',
    refunded: 'Estornado'
  })[status] || 'Pendente';
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[char]);
}

function safeHttpUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const url = new URL(text, window.location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function safeImageUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(text)) return text;
  try {
    const url = new URL(text, window.location.origin);
    return ['http:', 'https:', 'blob:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function applyFavicon(url) {
  const safeUrl = safeImageUrl(url);
  if (!safeUrl) return;
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = safeUrl;
}
