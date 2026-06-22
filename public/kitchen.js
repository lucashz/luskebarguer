const state = {
  orders: [],
  filter: 'all',
  knownOrderIds: new Set(),
  soundEnabled: localStorage.getItem('kitchenSoundEnabled') === 'true',
  pollTimer: null
};

const waitingLimitMs = 15 * 60 * 1000;
const columns = [
  { key: 'new', title: 'Novo', statuses: ['new', 'accepted'] },
  { key: 'preparing', title: 'Preparando', statuses: ['preparing'] },
  { key: 'ready', title: 'Pronto', statuses: ['ready', 'out_for_delivery'] },
  { key: 'completed', title: 'Entregue', statuses: ['completed'] }
];

const els = {
  board: document.querySelector('#kitchenBoard'),
  status: document.querySelector('#kitchenStatus'),
  filters: document.querySelector('#kitchenFilters'),
  soundButton: document.querySelector('#kitchenSoundButton'),
  fullscreenButton: document.querySelector('#kitchenFullscreenButton'),
  refreshButton: document.querySelector('#kitchenRefreshButton'),
  toast: document.querySelector('#toast')
};

els.filters.addEventListener('click', (event) => {
  const button = event.target.closest('[data-kitchen-filter]');
  if (!button) return;
  state.filter = button.dataset.kitchenFilter;
  els.filters.querySelectorAll('button').forEach((item) => item.classList.toggle('active', item === button));
  renderKitchen();
});
els.soundButton.addEventListener('click', toggleSound);
els.fullscreenButton.addEventListener('click', toggleFullscreen);
els.refreshButton.addEventListener('click', () => loadOrders({ manual: true }));

init();

async function init() {
  renderSoundButton();
  await loadOrders();
  state.pollTimer = setInterval(() => loadOrders().catch(() => {}), 5000);
}

async function loadOrders(options = {}) {
  const data = await request('/api/admin/orders');
  const previous = state.knownOrderIds;
  state.orders = data.orders || [];
  const current = new Set(state.orders.map((order) => String(order.id)));
  const newOrders = state.orders.filter((order) => order.status === 'new' && !previous.has(String(order.id)));
  state.knownOrderIds = current;
  if (newOrders.length && state.soundEnabled && !options.manual) playKitchenSound();
  renderKitchen();
}

function renderKitchen() {
  const activeOrders = state.orders.filter((order) => !['cancelled'].includes(order.status));
  const waitingOrders = activeOrders.filter(isWaitingTooLong);
  els.status.textContent = `${activeOrders.length} pedido(s) na cozinha${waitingOrders.length ? ` - ${waitingOrders.length} aguardando mais de 15 min` : ''}`;

  const visibleColumns = columns.filter((column) => state.filter === 'all' || column.key === state.filter);
  els.board.classList.toggle('is-filtered', state.filter !== 'all');
  els.board.replaceChildren(...visibleColumns.map((column) => {
    const section = document.createElement('section');
    section.className = `kitchen-column kitchen-${column.key}`;
    const orders = activeOrders.filter((order) => column.statuses.includes(order.status));
    section.innerHTML = `<h2><span>${column.title}</span><strong>${orders.length}</strong></h2>`;
    section.append(...orders.map(kitchenCard));
    return section;
  }));
}

function kitchenCard(order) {
  const card = document.createElement('article');
  const customer = order.customer_snapshot || {};
  const createdAt = new Date(order.created_at);
  const itemCount = (order.items || []).reduce((total, item) => total + Number(item.quantity || 0), 0);
  const waitingTooLong = isWaitingTooLong(order);
  card.className = `kitchen-card status-${order.status}${waitingTooLong ? ' is-late' : ''}`;
  card.innerHTML = `
    <div class="kitchen-card-head">
      <strong>#${escapeHtml(order.public_code)}</strong>
      <span>${timeSince(createdAt)}</span>
    </div>
    <h3>${escapeHtml(customer.name || 'Cliente')}</h3>
    <p>${money(order.total)} - ${itemCount} ${itemCount === 1 ? 'item' : 'itens'}</p>
    ${waitingTooLong ? '<div class="kitchen-late-alert">Aguardando há mais de 15 min</div>' : ''}
    <div class="kitchen-items">${(order.items || []).map(kitchenItemHtml).join('')}</div>
    <div class="kitchen-card-actions">
      ${nextStatusButton(order)}
      <button class="ghost-button compact" type="button" data-print>Imprimir</button>
    </div>
  `;
  card.querySelector('[data-next-status]')?.addEventListener('click', () => updateOrderStatus(order, card.querySelector('[data-next-status]').dataset.nextStatus));
  card.querySelector('[data-print]')?.addEventListener('click', () => printOrderLabel(order));
  return card;
}

function kitchenItemHtml(item) {
  const modifiers = item.item_snapshot?.modifiers || [];
  return `
    <div>
      <strong>${Number(item.quantity || 0)}x ${escapeHtml(item.item_snapshot?.name || 'Item')}</strong>
      ${modifiers.length ? `<small>${modifiers.map(modifierText).map(escapeHtml).join(', ')}</small>` : ''}
      ${item.notes ? `<small>Obs: ${escapeHtml(item.notes)}</small>` : ''}
    </div>
  `;
}

function nextStatusButton(order) {
  const next = {
    new: ['preparing', 'Preparar'],
    accepted: ['preparing', 'Preparar'],
    preparing: ['ready', 'Marcar pronto'],
    ready: ['completed', 'Entregue'],
    out_for_delivery: ['completed', 'Entregue']
  }[order.status];
  if (!next) return '';
  return `<button class="primary-button compact" type="button" data-next-status="${next[0]}">${next[1]}</button>`;
}

async function updateOrderStatus(order, status) {
  const previousStatus = order.status;
  order.status = status;
  renderKitchen();
  try {
    await request(`/api/admin/orders/${order.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    toast(`Pedido #${order.public_code}: ${statusLabel(status)}.`);
    await loadOrders();
  } catch (error) {
    order.status = previousStatus;
    renderKitchen();
    toast(error.message || 'Não foi possível atualizar o pedido.');
  }
}

function isWaitingTooLong(order) {
  if (['completed', 'cancelled'].includes(order.status)) return false;
  return Date.now() - new Date(order.created_at).getTime() > waitingLimitMs;
}

function timeSince(date) {
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return 'agora';
  return `${minutes} min`;
}

function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  localStorage.setItem('kitchenSoundEnabled', String(state.soundEnabled));
  renderSoundButton();
  if (state.soundEnabled) playKitchenSound();
}

function renderSoundButton() {
  els.soundButton.textContent = state.soundEnabled ? 'Som ativado' : 'Ativar som';
  els.soundButton.classList.toggle('sound-enabled', state.soundEnabled);
}

function playKitchenSound() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const context = new AudioContext();
  [0, 140, 280].forEach((delay) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = 880;
    oscillator.connect(gain);
    gain.connect(context.destination);
    const start = context.currentTime + delay / 1000;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
    oscillator.start(start);
    oscillator.stop(start + 0.14);
  });
}

async function toggleFullscreen() {
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen?.();
    return;
  }
  await document.exitFullscreen?.();
}

function printOrderLabel(order) {
  const popup = window.open('', '_blank', 'width=360,height=640');
  if (!popup) {
    toast('Permita pop-ups para imprimir a etiqueta.');
    return;
  }
  popup.document.write(orderLabelHtml(order));
  popup.document.close();
  popup.focus();
  setTimeout(() => popup.print(), 250);
}

function orderLabelHtml(order) {
  const customer = order.customer_snapshot || {};
  const address = order.address_snapshot || null;
  return `<!doctype html>
  <html><head><meta charset="utf-8"><title>Pedido #${escapeHtml(order.public_code)}</title>
  <style>
    body{font-family:Arial,sans-serif;width:76mm;margin:0;padding:8px;color:#111}
    h1{font-size:20px;margin:0 0 6px} h2{font-size:15px;margin:8px 0 4px}
    p{margin:3px 0;font-size:12px}.item{border-top:1px dashed #999;padding:5px 0}
    .total{font-size:18px;font-weight:800;border-top:2px solid #111;padding-top:6px;margin-top:8px}
  </style></head><body>
    <h1>#${escapeHtml(order.public_code)}</h1>
    <p>${new Date(order.created_at).toLocaleString('pt-BR')}</p>
    <p><strong>${escapeHtml(customer.name || 'Cliente')}</strong></p>
    <p>${escapeHtml(customer.phone || '')}</p>
    ${address ? `<h2>Entrega</h2><p>${escapeHtml(formatAddress(address))}</p>` : ''}
    <h2>Itens</h2>
    ${(order.items || []).map((item) => `<div class="item"><strong>${Number(item.quantity || 0)}x ${escapeHtml(item.item_snapshot?.name || 'Item')}</strong>${item.notes ? `<p>Obs: ${escapeHtml(item.notes)}</p>` : ''}</div>`).join('')}
    <p>Pagamento: ${escapeHtml(order.payment_method || '-')}</p>
    <p class="total">Total: ${money(order.total)}</p>
  </body></html>`;
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Erro na requisição.');
  return data;
}

function statusLabel(status) {
  return ({
    new: 'Novo',
    accepted: 'Aceito',
    preparing: 'Preparando',
    ready: 'Pronto',
    out_for_delivery: 'Saiu',
    completed: 'Entregue',
    cancelled: 'Cancelado'
  })[status] || status;
}

function modifierText(modifier) {
  const price = Number(modifier.price_delta || 0);
  return `${modifier.group_name ? `${modifier.group_name}: ` : ''}${modifier.name}${price > 0 ? ` + ${money(price)}` : ''}`;
}

function formatAddress(address = {}) {
  return [
    address.street,
    address.number,
    address.neighborhood,
    address.city
  ].filter(Boolean).join(', ');
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[char]);
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.remove('visible'), 2600);
}
