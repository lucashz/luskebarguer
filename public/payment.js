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
  setStatus('Código Pix copiado.');
});
els.refresh.addEventListener('click', () => loadPayment());
els.newPix.addEventListener('click', () => regeneratePix());

loadPayment();

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
  els.title.textContent = `Pedido #${order.public_code || code}`;
  els.subtitle.textContent = `${money(order.total || 0)} - ${financialStatusLabel(order.financial_status)}`;
  els.status.innerHTML = `
    <div><span>Status</span><strong>${financialStatusLabel(order.financial_status)}</strong></div>
    <div><span>Expira em</span><strong>${payment.expires_at ? new Date(payment.expires_at).toLocaleString('pt-BR') : 'Não informado'}</strong></div>
    <div><span>Transação</span><strong>${escapeHtml(payment.transaction_id || 'Aguardando')}</strong></div>
  `;
  els.pixCode.value = payment.pix_code || '';
  const hasPix = Boolean(payment.pix_code || payment.pix_qr_url);
  const hasCheckout = Boolean(payment.checkout_url);
  els.pixCode.closest('label').hidden = !hasPix;
  els.copy.hidden = !hasPix;
  els.qr.hidden = !payment.pix_qr_url;
  if (payment.pix_qr_url) els.qr.src = payment.pix_qr_url;
  if (els.checkoutLink) {
    els.checkoutLink.hidden = !hasCheckout;
    els.checkoutLink.href = hasCheckout ? payment.checkout_url : '#';
  }
  els.newPix.hidden = order.financial_status !== 'expired' || !hasPix;
}

function setStatus(message) {
  els.subtitle.textContent = message;
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Erro na requisição.');
  return data;
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
