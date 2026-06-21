const ACCOUNT_CACHE_KEY = 'customer_account_cache_v1';

const state = {
  customer: null,
  orders: [],
  ordersFromCache: false,
  cacheSavedAt: null
};

const els = {
  login: document.querySelector('#ordersLogin'),
  list: document.querySelector('#ordersList'),
  cacheNotice: document.querySelector('#ordersCacheNotice'),
  refresh: document.querySelector('#refreshOrdersButton'),
  toast: document.querySelector('#toast')
};

els.refresh.addEventListener('click', () => loadOnlineOrders({ showLoading: true }));

init();

async function init() {
  const cached = loadAccountCache();
  if (cached?.customer) {
    state.customer = cached.customer;
    state.orders = Array.isArray(cached.orders) ? cached.orders : [];
    state.ordersFromCache = state.orders.length > 0;
    state.cacheSavedAt = cached.saved_at || null;
    render();
  }

  try {
    const data = await request('/api/customer/me');
    state.customer = data.customer;
    await loadOnlineOrders({ showLoading: !state.orders.length });
  } catch {
    if (state.customer) {
      state.ordersFromCache = state.orders.length > 0;
      render();
      if (state.orders.length) toast('Pedidos carregados do cache local.');
      return;
    }
    clearAccountCache();
    renderLogin();
  }
}

async function loadOnlineOrders(options = {}) {
  if (options.showLoading) renderLoading();
  try {
    const data = await request('/api/customer/orders');
    state.orders = data.orders || [];
    state.ordersFromCache = false;
    state.cacheSavedAt = null;
    saveAccountCache();
    render();
  } catch (error) {
    const cached = loadAccountCache();
    if (cached?.customer?.id === state.customer?.id && Array.isArray(cached.orders)) {
      state.orders = cached.orders;
      state.ordersFromCache = cached.orders.length > 0;
      state.cacheSavedAt = cached.saved_at || null;
      render();
      if (state.orders.length) toast('Pedidos carregados do cache local.');
      return;
    }
    renderEmpty(error.message || 'Não foi possível carregar seus pedidos agora.');
  }
}

function render() {
  els.login.hidden = true;
  renderCacheNotice();
  if (!state.orders.length) {
    renderEmpty('Você ainda não tem pedidos por aqui.');
    return;
  }
  els.list.replaceChildren(...state.orders.map(orderCard));
}

function renderLogin() {
  els.login.hidden = false;
  els.cacheNotice.hidden = true;
  els.list.innerHTML = '';
}

function renderLoading() {
  els.login.hidden = true;
  els.list.innerHTML = `
    <article class="panel account-loading">
      <span class="loading-dot"></span>
      <div>
        <p class="eyebrow">Carregando</p>
        <h2>Buscando seus pedidos</h2>
      </div>
    </article>
  `;
}

function renderEmpty(message) {
  els.login.hidden = true;
  els.list.innerHTML = `
    <article class="orders-empty panel">
      <p class="eyebrow">Histórico</p>
      <h2>${escapeHtml(message)}</h2>
      <a class="primary-button" href="/">Abrir cardápio</a>
    </article>
  `;
}

function renderCacheNotice() {
  els.cacheNotice.hidden = !state.ordersFromCache;
  if (!state.ordersFromCache) {
    els.cacheNotice.textContent = '';
    return;
  }
  const when = state.cacheSavedAt ? new Date(state.cacheSavedAt).toLocaleString('pt-BR') : 'recentemente';
  els.cacheNotice.textContent = `Mostrando dados salvos no navegador. Última atualização: ${when}.`;
}

function orderCard(order) {
  const card = document.createElement('article');
  card.className = `orders-card status-${order.status}`;
  card.innerHTML = `
    <div class="orders-card-head">
      <div>
        <strong>#${escapeHtml(order.public_code)}</strong>
        <p>${new Date(order.created_at).toLocaleString('pt-BR')}</p>
      </div>
      <span class="order-history-status">${statusLabel(order.status)}</span>
    </div>
    <div class="orders-card-total">
      <strong>${money(order.total)}</strong>
      <span>${(order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)} item(ns)</span>
    </div>
    <details class="account-order-details">
      <summary>Ver itens do pedido</summary>
      <div class="account-order-items">${(order.items || []).map(orderItemHtml).join('')}</div>
    </details>
    <div class="row-actions">
      <button class="ghost-button compact" type="button" data-repeat-order>Refazer pedido</button>
    </div>
  `;
  card.querySelector('[data-repeat-order]').addEventListener('click', () => repeatOrder(order));
  return card;
}

function orderItemHtml(item) {
  const modifiers = item.item_snapshot?.modifiers || [];
  return `
    <div>
      <strong>${Number(item.quantity || 0)}x ${escapeHtml(item.item_snapshot?.name || 'Item')}</strong>
      <span>${money(item.total)}</span>
      ${modifiers.length ? `<p>${modifiers.map(modifierText).map(escapeHtml).join(', ')}</p>` : ''}
      ${item.notes ? `<p>Obs: ${escapeHtml(item.notes)}</p>` : ''}
    </div>
  `;
}

function repeatOrder(order) {
  const cart = (order.items || [])
    .filter((item) => item.menu_item_id && item.item_snapshot?.name)
    .map((item) => ({
      id: item.menu_item_id,
      name: item.item_snapshot.name,
      price: Number(item.unit_price || item.item_snapshot.price || 0),
      quantity: Number(item.quantity || 1),
      modifier_ids: (item.item_snapshot.modifiers || []).map((modifier) => modifier.id).filter(Boolean),
      modifiers: item.item_snapshot.modifiers || [],
      notes: item.notes || '',
      key: [
        item.menu_item_id,
        (item.item_snapshot.modifiers || []).map((modifier) => modifier.id).sort().join(','),
        item.notes || ''
      ].join('|')
    }));

  if (!cart.length) {
    toast('Não foi possível refazer este pedido.');
    return;
  }

  localStorage.setItem('cart', JSON.stringify(cart));
  toast('Pedido colocado na sacola.');
  setTimeout(() => {
    window.location.href = '/';
  }, 500);
}

function loadAccountCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ACCOUNT_CACHE_KEY) || 'null');
    if (!parsed || !parsed.customer) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveAccountCache() {
  if (!state.customer?.id) return;
  localStorage.setItem(ACCOUNT_CACHE_KEY, JSON.stringify({
    customer: state.customer,
    orders: state.orders,
    saved_at: new Date().toISOString()
  }));
}

function clearAccountCache() {
  localStorage.removeItem(ACCOUNT_CACHE_KEY);
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : '';
    throw new Error(detail || data.error || 'Falha na requisição.');
  }
  return data;
}

function modifierText(modifier) {
  return `${modifier.group_name ? `${modifier.group_name}: ` : ''}${modifier.name}`;
}

function statusLabel(status) {
  return ({
    new: 'Recebido',
    accepted: 'Aceito',
    preparing: 'Preparando',
    ready: 'Pronto',
    out_for_delivery: 'Saiu para entrega',
    completed: 'Concluído',
    cancelled: 'Cancelado'
  })[status] || status;
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('visible');
  setTimeout(() => els.toast.classList.remove('visible'), 2400);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[char]);
}
