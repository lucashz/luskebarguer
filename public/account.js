const state = {
  customer: null,
  orders: [],
  ordersFromCache: false,
  cacheSavedAt: null,
  view: window.location.pathname === '/pedidos' ? 'orders' : 'dashboard'
};

const ACCOUNT_CACHE_KEY = 'customer_account_cache_v1';
const RECENT_ORDERS_LIMIT = 2;

const els = {
  loading: document.querySelector('#accountLoading'),
  loadingEyebrow: document.querySelector('#accountLoadingEyebrow'),
  auth: document.querySelector('#accountAuth'),
  shell: document.querySelector('#accountShell'),
  dashboard: document.querySelector('#accountDashboard'),
  edit: document.querySelector('#accountEdit'),
  addresses: document.querySelector('#accountAddresses'),
  loginForm: document.querySelector('#loginForm'),
  resetPasswordForm: document.querySelector('#resetPasswordForm'),
  showResetButton: document.querySelector('#showResetButton'),
  registerForm: document.querySelector('#registerForm'),
  profileForm: document.querySelector('#profileForm'),
  newAddressForm: document.querySelector('#newAddressForm'),
  pageEyebrow: document.querySelector('#accountPageEyebrow'),
  customerName: document.querySelector('#customerName'),
  lastOrderTitle: document.querySelector('#lastOrderTitle'),
  lastOrderText: document.querySelector('#lastOrderText'),
  repeatLastOrderButton: document.querySelector('#repeatLastOrderButton'),
  activeOrdersCount: document.querySelector('#activeOrdersCount'),
  savedAddressesCount: document.querySelector('#savedAddressesCount'),
  totalOrdersCount: document.querySelector('#totalOrdersCount'),
  accountSummary: document.querySelector('#accountSummary'),
  accountAddressList: document.querySelector('#accountAddressList'),
  accountOrdersLink: document.querySelector('#accountOrdersLink'),
  accountDashboardLink: document.querySelector('#accountDashboardLink'),
  editProfileButton: document.querySelector('#editProfileButton'),
  editProfileInlineButton: document.querySelector('#editProfileInlineButton'),
  manageAddressesButton: document.querySelector('#manageAddressesButton'),
  backToDashboardButton: document.querySelector('#backToDashboardButton'),
  backFromAddressesButton: document.querySelector('#backFromAddressesButton'),
  cancelEditButton: document.querySelector('#cancelEditButton'),
  ordersList: document.querySelector('#ordersList'),
  ordersCacheNotice: document.querySelector('#ordersCacheNotice'),
  refreshOrdersButton: document.querySelector('#refreshOrdersButton'),
  logoutButton: document.querySelector('#logoutButton'),
  toast: document.querySelector('#toast')
};

els.loginForm.addEventListener('submit', login);
els.showResetButton.addEventListener('click', () => {
  els.resetPasswordForm.hidden = !els.resetPasswordForm.hidden;
});
els.resetPasswordForm.addEventListener('submit', resetPassword);
els.registerForm.addEventListener('submit', register);
els.profileForm.addEventListener('submit', saveProfile);
els.newAddressForm.addEventListener('submit', createSavedAddress);
document.querySelectorAll('input[inputmode="tel"]').forEach((field) => {
  field.addEventListener('input', () => {
    field.value = formatPhone(field.value);
  });
});
els.refreshOrdersButton.addEventListener('click', loadOrders);
els.editProfileButton.addEventListener('click', showEdit);
els.editProfileInlineButton.addEventListener('click', showEdit);
els.manageAddressesButton.addEventListener('click', showAddresses);
els.backToDashboardButton.addEventListener('click', showDashboard);
els.backFromAddressesButton.addEventListener('click', showDashboard);
els.cancelEditButton.addEventListener('click', showDashboard);
els.repeatLastOrderButton.addEventListener('click', repeatLastOrder);
els.logoutButton.addEventListener('click', logout);

init();

async function init() {
  applyPageMode();
  const cached = loadAccountCache();
  let hadCachedAccount = false;
  if (cached?.customer) {
    hadCachedAccount = true;
    state.customer = cached.customer;
    state.orders = Array.isArray(cached.orders) ? cached.orders : [];
    state.ordersFromCache = state.orders.length > 0;
    state.cacheSavedAt = cached.saved_at || null;
    showShell();
    renderOrders();
  }

  try {
    const data = await request('/api/customer/me');
    state.customer = data.customer;
    showShell();
    loadOrders().catch((error) => {
      if (!state.orders.length) toast(error.message || 'Não foi possível carregar seus pedidos.');
    });
    saveAccountCache();
  } catch {
    if (hadCachedAccount) {
      state.ordersFromCache = state.orders.length > 0;
      showShell();
      renderOrders();
      toast('Conta carregada do cache offline.');
      return;
    }
    clearAccountCache();
    showAuth();
  }
}

async function login(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(els.loginForm));
  const result = await request('/api/customer/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  state.customer = result.customer;
  const me = await request('/api/customer/me');
  state.customer = me.customer;
  showShell();
  await loadOrders();
  saveAccountCache();
}

async function register(event) {
  event.preventDefault();
  const form = new FormData(els.registerForm);
  const result = await request('/api/customer/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: customerFromForm(form),
      password: form.get('password'),
      address: addressFromForm(form)
    })
  });
  state.customer = result.customer;
  const me = await request('/api/customer/me');
  state.customer = me.customer;
  showShell();
  await loadOrders();
  saveAccountCache();
}

async function resetPassword(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(els.resetPasswordForm));
  await request('/api/customer/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  els.loginForm.elements.phone.value = data.phone;
  els.resetPasswordForm.reset();
  els.resetPasswordForm.hidden = true;
  toast('Senha redefinida. Entre com a nova senha.');
}

async function saveProfile(event) {
  event.preventDefault();
  const form = new FormData(els.profileForm);
  const payload = {
    customer: customerFromForm(form)
  };
  if (form.get('password')) payload.password = form.get('password');

  const data = await request('/api/customer/me', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  state.customer = data.customer;
  saveAccountCache();
  fillProfile();
  renderAddressEditor();
  renderDashboard();
  showDashboard();
  toast('Conta atualizada.');
}

async function logout() {
  await request('/api/customer/logout', { method: 'POST' });
  state.customer = null;
  state.orders = [];
  clearAccountCache();
  showAuth();
}

async function loadOrders() {
  try {
    const data = await request('/api/customer/orders');
    state.orders = data.orders || [];
    state.ordersFromCache = false;
    state.cacheSavedAt = null;
    saveAccountCache();
    renderOrders();
  } catch (error) {
    const cached = loadAccountCache();
    if (cached?.customer?.id === state.customer?.id && Array.isArray(cached.orders) && cached.orders.length) {
      state.orders = cached.orders;
      state.ordersFromCache = true;
      state.cacheSavedAt = cached.saved_at || null;
      renderOrders();
      toast('Histórico carregado do cache offline.');
      return;
    }
    if (!state.orders.length) throw error;
    state.ordersFromCache = true;
    renderOrders();
  }
}

function showAuth() {
  els.loading.hidden = true;
  els.auth.hidden = false;
  els.shell.hidden = true;
}

function showShell() {
  els.loading.hidden = true;
  els.auth.hidden = true;
  els.shell.hidden = false;
  fillProfile();
  renderDashboard();
  if (state.view === 'orders') {
    showOrders();
  } else {
    showDashboard();
  }
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

function showDashboard() {
  state.view = 'dashboard';
  els.dashboard.hidden = false;
  els.edit.hidden = true;
  els.addresses.hidden = true;
  applyPageMode();
}

function showOrders() {
  state.view = 'orders';
  els.dashboard.hidden = false;
  els.edit.hidden = true;
  els.addresses.hidden = true;
  applyPageMode();
}

function showEdit() {
  fillProfile();
  els.dashboard.hidden = true;
  els.edit.hidden = false;
  els.addresses.hidden = true;
  applyPageMode();
}

function showAddresses() {
  renderAddressEditor();
  els.dashboard.hidden = true;
  els.edit.hidden = true;
  els.addresses.hidden = false;
  applyPageMode();
}

function applyPageMode() {
  const isOrders = state.view === 'orders';
  document.title = isOrders ? 'Meus Pedidos - Cardápio' : 'Minha Conta - Cardápio';
  if (els.loadingEyebrow) els.loadingEyebrow.textContent = isOrders ? 'Meus pedidos' : 'Minha conta';
  if (els.pageEyebrow) els.pageEyebrow.textContent = isOrders ? 'Meus pedidos' : 'Minha conta';
  if (els.accountOrdersLink) els.accountOrdersLink.hidden = isOrders;
  if (els.accountDashboardLink) els.accountDashboardLink.hidden = !isOrders;
  if (els.editProfileButton) els.editProfileButton.hidden = isOrders;
  els.dashboard?.classList.toggle('orders-view', isOrders);
}

function fillProfile() {
  const customer = state.customer || {};
  els.customerName.textContent = state.view === 'orders' ? 'Meus pedidos' : (customer.name || 'Cliente');
  setValue(els.profileForm.elements.name, customer.name);
  setValue(els.profileForm.elements.phone, customer.phone);
  setValue(els.profileForm.elements.email, customer.email);
}

function renderOrders() {
  renderDashboard();
  renderOrdersCacheNotice();
  if (!state.orders.length) {
    els.ordersList.innerHTML = '<p class="muted">Nenhum pedido encontrado.</p>';
    return;
  }
  const isOrdersPage = state.view === 'orders';
  const visibleOrders = isOrdersPage ? state.orders : state.orders.slice(0, RECENT_ORDERS_LIMIT);
  const orderCards = visibleOrders.map((order) => {
    const card = document.createElement('article');
    card.className = `list-card account-order-card status-${order.status}`;
    card.innerHTML = `
      <div class="list-head">
        <strong>#${escapeHtml(order.public_code)}</strong>
        <span class="order-history-status">${statusLabel(order.status)}</span>
      </div>
      <p>${money(order.total)} - ${new Date(order.created_at).toLocaleString('pt-BR')}</p>
      <details class="account-order-details">
        <summary>Ver itens do pedido</summary>
        <div class="account-order-items">${(order.items || []).map(accountOrderItemHtml).join('')}</div>
      </details>
      <div class="row-actions">
        <button class="ghost-button compact" type="button" data-repeat-order="${escapeHtml(order.id)}">Refazer tudo</button>
      </div>
    `;
    card.querySelector('[data-repeat-order]').addEventListener('click', () => repeatOrder(order));
    card.querySelectorAll('[data-repeat-item]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = (order.items || []).find((entry) => entry.id === button.dataset.repeatItem);
        if (item) repeatOrder({ ...order, items: [item] });
      });
    });
    return card;
  });

  if (!isOrdersPage && state.orders.length > RECENT_ORDERS_LIMIT) {
    const more = document.createElement('a');
    more.className = 'ghost-button wide account-show-more-orders';
    more.href = '/pedidos';
    more.textContent = `Exibir mais ${state.orders.length - RECENT_ORDERS_LIMIT} pedido${state.orders.length - RECENT_ORDERS_LIMIT === 1 ? '' : 's'}`;
    orderCards.push(more);
  }

  els.ordersList.replaceChildren(...orderCards);
}

function renderOrdersCacheNotice() {
  if (!els.ordersCacheNotice) return;
  els.ordersCacheNotice.hidden = !state.ordersFromCache;
  if (!state.ordersFromCache) {
    els.ordersCacheNotice.textContent = '';
    return;
  }
  const when = state.cacheSavedAt
    ? new Date(state.cacheSavedAt).toLocaleString('pt-BR')
    : 'recentemente';
  els.ordersCacheNotice.textContent = `Histórico exibido do cache local. Última atualização: ${when}.`;
}

function accountOrderItemHtml(item) {
  const modifiers = item.item_snapshot?.modifiers || [];
  return `
    <div>
      <strong>${Number(item.quantity || 0)}x ${escapeHtml(item.item_snapshot?.name || 'Item')}</strong>
      <span>${money(item.total)}</span>
      ${modifiers.length ? `<p>${modifiers.map(modifierText).map(escapeHtml).join(', ')}</p>` : ''}
      ${item.notes ? `<p>Obs: ${escapeHtml(item.notes)}</p>` : ''}
      <button class="text-button compact" type="button" data-repeat-item="${escapeAttribute(item.id)}">Pedir só este item</button>
    </div>
  `;
}

function orderStatusTimeline(status) {
  const steps = ['new', 'accepted', 'preparing', 'out_for_delivery', 'completed'];
  const labels = ['Recebido', 'Aceito', 'Preparando', 'Saiu', 'Concluído'];
  const statusIndex = status === 'ready' ? 2 : steps.indexOf(status);
  const activeIndex = status === 'cancelled' ? -1 : Math.max(0, statusIndex);
  return `
    <div class="order-timeline ${status === 'cancelled' ? 'is-cancelled' : ''}">
      ${steps.map((step, index) => `<span class="${index <= activeIndex ? 'active' : ''}">${labels[index]}</span>`).join('')}
      ${status === 'cancelled' ? '<strong>Cancelado</strong>' : ''}
    </div>
  `;
}

function renderDashboard() {
  const addresses = state.customer?.addresses || [];
  const activeOrders = state.orders.filter((order) => !['completed', 'cancelled'].includes(order.status));
  const lastOrder = state.orders[0] || null;

  els.activeOrdersCount.textContent = activeOrders.length;
  els.savedAddressesCount.textContent = addresses.length;
  els.totalOrdersCount.textContent = state.orders.length;
  renderLoyaltyHint(state.orders.length);

  if (lastOrder) {
    els.lastOrderTitle.textContent = `Pedido #${lastOrder.public_code}`;
    els.lastOrderText.textContent = `${money(lastOrder.total)} em ${new Date(lastOrder.created_at).toLocaleDateString('pt-BR')} - ${orderItemsText(lastOrder)}`;
  } else {
    els.lastOrderTitle.textContent = 'Seu último pedido';
    els.lastOrderText.textContent = 'Quando você fizer um pedido, ele aparece aqui para repetir mais rápido.';
  }

  els.repeatLastOrderButton.disabled = !lastOrder;
  renderAccountSummary(addresses, activeOrders);
}

function renderLoyaltyHint(totalOrders) {
  els.lastOrderText.dataset.loyalty = loyaltyText(totalOrders);
}

function loyaltyText(totalOrders) {
  const target = 5;
  if (!totalOrders) return `A cada ${target} pedidos, acompanhe sua recompensa por aqui.`;
  const remaining = target - (totalOrders % target);
  if (remaining === target) return `Você completou ${totalOrders} pedido(s). Pergunte à loja sobre sua recompensa.`;
  return `Faltam ${remaining} pedido(s) para completar ${target} pedidos.`;
}

function renderAccountSummary(addresses, activeOrders) {
  const customer = state.customer || {};
  const defaultAddress = addresses[0] || customer.address || null;
  els.accountSummary.innerHTML = `
    <div>
      <strong>${escapeHtml(customer.name || 'Cliente')}</strong>
      <p>${escapeHtml(customer.phone || 'Telefone não informado')}</p>
      <p>${escapeHtml(customer.email || 'E-mail não informado')}</p>
    </div>
    <div>
      <strong>Endereço principal</strong>
      <p>${defaultAddress ? escapeHtml(formatAddress(defaultAddress)) : 'Nenhum endereço salvo.'}</p>
    </div>
    <div>
      <strong>Status</strong>
      <p>${activeOrders.length ? `${activeOrders.length} pedido${activeOrders.length === 1 ? '' : 's'} em andamento.` : 'Nenhum pedido em andamento.'}</p>
    </div>
    <div>
      <strong>Fidelidade</strong>
      <p>${escapeHtml(loyaltyText(state.orders.length))}</p>
    </div>
  `;
}

function renderAddressEditor() {
  const addresses = state.customer?.addresses || [];
  if (!els.accountAddressList) return;
  if (!addresses.length) {
    els.accountAddressList.innerHTML = '<p class="account-empty-note">Nenhum endereço salvo ainda. Abra "Novo endereço" para cadastrar o primeiro local de entrega.</p>';
    return;
  }

  els.accountAddressList.replaceChildren(...addresses.map(accountAddressForm));
}

function accountAddressForm(address) {
  const details = document.createElement('details');
  details.className = `account-address-row${address.is_default ? ' is-default' : ''}`;
  details.innerHTML = `
    <summary>
      <span>
        <strong>${escapeHtml(address.label || 'Endereço salvo')}</strong>
        <small>${escapeHtml(formatAddress(address) || 'Complete os dados deste endereço.')}</small>
      </span>
      <em>${address.is_default ? 'Principal' : 'Editar'}</em>
    </summary>
    <form class="account-address-form">
      <div class="compact-address-grid">
        <input name="label" list="addressLabelSuggestions" placeholder="Apelido: Casa, Trabalho" value="${escapeAttribute(address.label || '')}">
        <input name="street" required placeholder="Rua / Avenida" value="${escapeAttribute(address.street || '')}">
        <input name="number" required placeholder="Número" value="${escapeAttribute(address.number || '')}">
        <input name="neighborhood" required placeholder="Bairro" value="${escapeAttribute(address.neighborhood || '')}">
        <input name="city" required placeholder="Cidade" value="${escapeAttribute(address.city || '')}">
        <input name="complement" placeholder="Complemento" value="${escapeAttribute(address.complement || '')}">
        <input name="reference" placeholder="Referência" value="${escapeAttribute(address.reference || '')}">
      </div>
      <div class="row-actions">
        <label class="inline-check">
          <input type="checkbox" name="is_default" ${address.is_default ? 'checked' : ''}>
          Usar como principal
        </label>
        <button class="danger-button compact" type="button" data-delete-address>Excluir</button>
        <button class="primary-button compact" type="submit">Salvar</button>
      </div>
    </form>
  `;

  const form = details.querySelector('form');
  form.addEventListener('submit', (event) => saveSavedAddress(event, address.id));
  details.querySelector('[data-delete-address]').addEventListener('click', () => removeSavedAddress(address.id));
  return details;
}

async function saveSavedAddress(event, addressId) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const data = await request(`/api/customer/addresses/${addressId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(addressPayloadFromForm(form))
  });
  state.customer = data.customer;
  saveAccountCache();
  fillProfile();
  renderDashboard();
  renderAddressEditor();
  toast('Endereço atualizado.');
}

async function createSavedAddress(event) {
  event.preventDefault();
  const data = await request('/api/customer/addresses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(addressPayloadFromForm(new FormData(els.newAddressForm)))
  });
  state.customer = data.customer;
  els.newAddressForm.reset();
  els.newAddressForm.closest('details').open = false;
  saveAccountCache();
  fillProfile();
  renderDashboard();
  renderAddressEditor();
  toast('Endereço adicionado.');
}

async function removeSavedAddress(addressId) {
  if (!confirm('Excluir este endereço salvo?')) return;
  const data = await request(`/api/customer/addresses/${addressId}`, { method: 'DELETE' });
  state.customer = data.customer;
  saveAccountCache();
  fillProfile();
  renderDashboard();
  renderAddressEditor();
  toast('Endereço excluído.');
}

function repeatLastOrder() {
  const order = state.orders[0];
  if (!order) return;
  repeatOrder(order);
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
  }, 550);
}

function orderItemsText(order) {
  return (order.items || [])
    .slice(0, 3)
    .map((item) => `${item.quantity}x ${item.item_snapshot?.name || 'Item'}`)
    .join(', ');
}

function modifierText(modifier) {
  return `${modifier.group_name ? `${modifier.group_name}: ` : ''}${modifier.name}`;
}

function formatAddress(address) {
  return [
    address.street,
    address.number,
    address.neighborhood,
    address.city
  ].filter(Boolean).join(', ');
}

function customerFromForm(form) {
  return {
    name: form.get('name'),
    phone: form.get('phone'),
    email: form.get('email')
  };
}

function addressFromForm(form) {
  return {
    street: form.get('street'),
    number: form.get('number'),
    neighborhood: form.get('neighborhood'),
    city: form.get('city'),
    complement: form.get('complement'),
    reference: form.get('reference')
  };
}

function addressPayloadFromForm(form) {
  return {
    label: form.get('label') || 'Principal',
    street: form.get('street'),
    number: form.get('number'),
    neighborhood: form.get('neighborhood'),
    city: form.get('city'),
    complement: form.get('complement'),
    reference: form.get('reference'),
    is_default: form.get('is_default') === 'on'
  };
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : '';
    throw new Error(detail || data.error || 'Falha na requisicao.');
  }
  return data;
}

function setValue(field, value) {
  if (field) field.value = value ?? '';
}

function formatPhone(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function statusLabel(status) {
  return ({
    new: 'Novo',
    accepted: 'Aceito',
    preparing: 'Preparando',
    ready: 'Pronto',
    out_for_delivery: 'Saiu para entrega',
    completed: 'Concluído',
    cancelled: 'Cancelado'
  })[status] || status;
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('visible');
  setTimeout(() => els.toast.classList.remove('visible'), 2400);
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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





