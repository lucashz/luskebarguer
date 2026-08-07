const params = new URLSearchParams(window.location.search);
const code = params.get('pedido') || params.get('order') || params.get('code') || '';
const paymentToken = params.get('token') || '';

const els = {
  title: document.querySelector('#paymentTitle'),
  subtitle: document.querySelector('#paymentSubtitle'),
  status: document.querySelector('#paymentStatusBox'),
  qr: document.querySelector('#paymentQr'),
  pixCode: document.querySelector('#paymentPixCode'),
  pixFallback: document.querySelector('#paymentPixFallback'),
  providerBox: document.querySelector('#paymentProviderBox'),
  checkoutLink: document.querySelector('#paymentCheckoutLink'),
  ordersLink: document.querySelector('#paymentOrdersLink'),
  copy: document.querySelector('#copyPixButton'),
  newPix: document.querySelector('#newPixButton')
};

let pollTimer = null;
let pollAttempt = 0;
const PAYMENT_POLL_DELAYS_MS = [2500, 4000, 6500, 10000, 15000];

els.copy?.addEventListener('click', async () => {
  await navigator.clipboard?.writeText(els.pixCode.value || '');
  setStatus('Código Pix copiado.');
});
els.newPix?.addEventListener('click', () => regeneratePix());

document.body.classList.toggle('payment-popup-mode', Boolean(window.opener));
configurePaymentLinks();
loadPayment();
loadStoreIdentity().catch(() => {});

async function loadPayment(options = {}) {
  if (!code) {
    setStatus('Pedido não informado.');
    return;
  }
  try {
    const data = await request(`/api/payments/order?code=${encodeURIComponent(code)}&token=${encodeURIComponent(paymentToken)}`);
    renderPayment(data);
    startPollingIfNeeded(data);
    notifyOpenerIfPaid(data);
    if (options.manual && data.order?.financial_status !== 'paid') {
      setStatus('Pagamento ainda não confirmado. A confirmação é atualizada automaticamente.');
    }
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
      body: JSON.stringify({ code, token: paymentToken })
    });
    renderPayment(data);
    setStatus('Novo pagamento gerado. Abra o checkout seguro para continuar.');
  } catch (error) {
    setStatus(error.message || 'Não foi possível gerar um novo Pix.');
  }
}

function renderPayment(data) {
  const order = data.order || {};
  const payment = data.payment || {};
  const qrUrl = safeImageUrl(payment.pix_qr_url);
  const checkoutUrl = safeHttpUrl(payment.checkout_url);
  const hasCheckout = Boolean(checkoutUrl);
  const isHostedCheckout = payment.provider === 'abacatepay' && hasCheckout;
  const pixCode = String(payment.pix_code || '');
  const hasRealPix = Boolean(
    (pixCode && !pixCode.startsWith('PIXONLINE|'))
    || (qrUrl && !qrUrl.includes('api.qrserver.com'))
  );
  const status = order.financial_status || payment.status || 'pending';

  els.title.textContent = status === 'paid'
    ? `Pedido #${order.public_code || code} confirmado`
    : `Pedido #${order.public_code || code}`;
  els.subtitle.textContent = paymentSubtitle(status, order);
  els.status.innerHTML = `
    <div class="payment-status-${escapeAttribute(status)}"><span>Status</span><strong>${financialStatusLabel(status)}</strong></div>
    <div><span>Valor</span><strong>${money(order.total || 0)}</strong></div>
    <div><span>Expira Em</span><strong>${payment.expires_at ? new Date(payment.expires_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Não informado'}</strong></div>
  `;

  if (els.providerBox) {
    els.providerBox.hidden = !hasCheckout || status === 'paid';
  }
  if (els.checkoutLink) {
    els.checkoutLink.href = checkoutUrl || '#';
  }

  els.pixCode.value = hasRealPix ? pixCode : '';
  if (els.pixFallback) {
    els.pixFallback.hidden = !hasRealPix || status === 'paid' || isHostedCheckout;
    if (hasCheckout && hasRealPix && !els.pixFallback.open) {
      els.pixFallback.removeAttribute('open');
    }
  }
  if (els.copy) els.copy.hidden = !hasRealPix;
  if (els.qr) {
    els.qr.hidden = !hasRealPix;
    els.qr.src = hasRealPix ? qrUrl : '';
  }
  if (els.newPix) els.newPix.hidden = status !== 'expired' || !hasRealPix;
}

function paymentSubtitle(status, order) {
  if (status === 'paid') return 'Pagamento confirmado. Seu pedido foi enviado para a loja.';
  if (status === 'expired') return 'Este pagamento expirou. Gere um novo Pix ou refaça o pedido.';
  if (status === 'failed' || status === 'cancelled') return 'O pagamento não foi concluído. O pedido ainda não foi enviado para a loja.';
  return `${money(order.total || 0)} aguardando confirmação. Mantenha esta janela aberta; o pedido será enviado automaticamente após a aprovação.`;
}

function startPollingIfNeeded(data) {
  const status = data.order?.financial_status || data.payment?.status || 'pending';
  if (status === 'paid' || ['expired', 'failed', 'cancelled'].includes(status)) {
    stopPolling();
    return;
  }
  if (pollTimer) return;
  const delay = PAYMENT_POLL_DELAYS_MS[Math.min(pollAttempt, PAYMENT_POLL_DELAYS_MS.length - 1)];
  pollTimer = window.setTimeout(async () => {
    pollTimer = null;
    pollAttempt += 1;
    await loadPayment();
  }, delay);
}

function stopPolling() {
  if (pollTimer) {
    window.clearTimeout(pollTimer);
    pollTimer = null;
  }
  pollAttempt = 0;
}

function notifyOpenerIfPaid(data) {
  const status = data.order?.financial_status || data.payment?.status || 'pending';
  if (status !== 'paid' || !window.opener) return;
  try {
    window.opener.postMessage({
      type: 'tapronto:payment-status',
      code: data.order.public_code || code,
      status: 'paid',
      order: data.order,
      payment: data.payment
    }, window.location.origin);
    window.setTimeout(() => window.close(), 900);
  } catch (_) {
    // Se o navegador bloquear a comunicação, mantém a tela de sucesso aberta.
  }
}

function configurePaymentLinks() {
  if (els.ordersLink) els.ordersLink.href = storePageUrl('pedidos');
}

function storePageUrl(page = '') {
  const slug = currentStoreSlug();
  const normalizedPage = String(page || '').replace(/^\/+/, '');
  if (!slug) return `/${normalizedPage}`;
  return `/${slug}/${normalizedPage}`;
}

function setStatus(message) {
  els.subtitle.textContent = message;
}

async function request(url, options = {}) {
  const response = await fetch(storeApiUrl(url), options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Erro na requisição.');
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
  if (!firstSegment || ['admin', 'painel', 'central', 'ajuda', 'cozinha', 'pagamento', 'conta', 'cliente', 'pedidos'].includes(firstSegment)) return '';
  return firstSegment;
}

function financialStatusLabel(status) {
  return ({
    pending: 'Aguardando Pagamento',
    paid: 'Pago',
    failed: 'Falhou',
    expired: 'Expirado',
    cancelled: 'Cancelado',
    refunded: 'Estornado'
  })[status] || 'Aguardando Pagamento';
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

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
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
