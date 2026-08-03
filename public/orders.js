const ACCOUNT_CACHE_KEY = 'customer_account_cache_v1';
const THEME_DEFAULTS = {
  primaryColor: '#d71920',
  secondaryColor: '#1f1f1f',
  backgroundColor: '#f5f5f4',
  buttonColor: '#d71920',
  buttonTextColor: '#ffffff',
  selectionColor: '#d71920',
  selectionTextColor: '#ffffff'
};

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
  configureStoreLinks();
  loadStoreTheme().catch(() => {});
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

async function loadStoreTheme() {
  const data = await request('/api/store');
  applyStoreIdentity(data.store);
  applyStoreTheme(data.store?.theme_settings);
}

function applyStoreTheme(theme = {}) {
  const settings = { ...THEME_DEFAULTS, ...(theme || {}) };
  const variables = {
    primaryColor: '--color-primary',
    secondaryColor: '--color-secondary',
    backgroundColor: '--color-background',
    buttonColor: '--color-button',
    buttonTextColor: '--color-button-text',
    selectionColor: '--color-selection',
    selectionTextColor: '--color-selection-text'
  };
  Object.entries(variables).forEach(([key, variable]) => {
    document.documentElement.style.setProperty(variable, validThemeColor(settings[key]) ? settings[key] : THEME_DEFAULTS[key]);
  });
}

function validThemeColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || '').trim());
}

function applyStoreIdentity(store = {}) {
  const title = String(store.page_title || store.name || 'Cardápio').trim();
  document.title = `Meus Pedidos - ${title}`;
  applyFavicon(store.favicon_url);
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
      <a class="primary-button" href="${escapeAttribute(storeHomeUrl())}">Abrir cardápio</a>
    </article>
  `;
}

function configureStoreLinks() {
  const home = storeHomeUrl();
  const account = storePageUrl('conta');
  document.querySelectorAll('[data-store-home]').forEach((link) => { link.href = home; });
  document.querySelectorAll('[data-store-account]').forEach((link) => { link.href = account; });
}

function storePageUrl(page = '') {
  const slug = currentStoreSlug();
  const normalizedPage = String(page || '').replace(/^\/+/, '');
  if (!slug) return `/${normalizedPage}`;
  return `/${slug}/${normalizedPage}`;
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
        <div class="order-info-badges">
          ${orderOriginBadge(order)}
          ${financialStatusBadge(order)}
        </div>
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

function orderOriginLabel(order) {
  const method = order.fulfillment_method || 'delivery';
  const tableName = order.table_snapshot?.name;
  const tabName = order.tab_snapshot?.name;
  if (method === 'tab') {
    return tableName
      ? `Comanda ${tabName || ''} - ${tableName}`.trim()
      : `Comanda ${tabName || ''}`.trim();
  }
  if (method === 'table') return tableName ? `Mesa ${tableName}` : 'Pedido na mesa';
  if (method === 'counter') return 'Pedido no balcão';
  if (method === 'pickup') return 'Retirada no estabelecimento';
  return 'Delivery';
}

function orderOriginBadge(order) {
  const method = order.fulfillment_method || 'delivery';
  return `<span class="origin-badge origin-${escapeAttribute(method)}">${escapeHtml(orderOriginLabel(order))}</span>`;
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
    window.location.href = storeHomeUrl();
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
  const response = await fetch(storeApiUrl(url), options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : '';
    throw new Error(detail || data.error || 'Falha na requisição.');
  }
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

function storeHomeUrl() {
  const slug = currentStoreSlug();
  return slug ? `/${slug}` : '/';
}

function modifierText(modifier) {
  const price = Number(modifier.price_delta || 0);
  return `${modifier.name || 'Adicional'}${price > 0 ? ` (+ ${money(price)})` : ''}`;
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

function financialStatusLabel(status) {
  return ({
    pending: 'Pagamento pendente',
    paid: 'Pagamento aprovado',
    failed: 'Pagamento falhou',
    expired: 'Pagamento expirado',
    cancelled: 'Pagamento cancelado',
    refunded: 'Pagamento estornado'
  })[status] || 'Pagamento pendente';
}

function financialStatusBadge(order) {
  const status = order.financial_status || 'pending';
  return `<span class="financial-status-badge financial-status-${escapeAttribute(status)}">${financialStatusLabel(status)}</span>`;
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

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}



