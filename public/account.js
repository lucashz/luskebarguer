const state = {
  customer: null,
  orders: []
};

const ACCOUNT_CACHE_KEY = 'customer_account_cache_v1';

const els = {
  loading: document.querySelector('#accountLoading'),
  auth: document.querySelector('#accountAuth'),
  shell: document.querySelector('#accountShell'),
  dashboard: document.querySelector('#accountDashboard'),
  edit: document.querySelector('#accountEdit'),
  loginForm: document.querySelector('#loginForm'),
  resetPasswordForm: document.querySelector('#resetPasswordForm'),
  showResetButton: document.querySelector('#showResetButton'),
  registerForm: document.querySelector('#registerForm'),
  profileForm: document.querySelector('#profileForm'),
  customerName: document.querySelector('#customerName'),
  lastOrderTitle: document.querySelector('#lastOrderTitle'),
  lastOrderText: document.querySelector('#lastOrderText'),
  repeatLastOrderButton: document.querySelector('#repeatLastOrderButton'),
  activeOrdersCount: document.querySelector('#activeOrdersCount'),
  savedAddressesCount: document.querySelector('#savedAddressesCount'),
  totalOrdersCount: document.querySelector('#totalOrdersCount'),
  accountSummary: document.querySelector('#accountSummary'),
  editProfileButton: document.querySelector('#editProfileButton'),
  editProfileInlineButton: document.querySelector('#editProfileInlineButton'),
  backToDashboardButton: document.querySelector('#backToDashboardButton'),
  cancelEditButton: document.querySelector('#cancelEditButton'),
  ordersList: document.querySelector('#ordersList'),
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
els.refreshOrdersButton.addEventListener('click', loadOrders);
els.editProfileButton.addEventListener('click', showEdit);
els.editProfileInlineButton.addEventListener('click', showEdit);
els.backToDashboardButton.addEventListener('click', showDashboard);
els.cancelEditButton.addEventListener('click', showDashboard);
els.repeatLastOrderButton.addEventListener('click', repeatLastOrder);
els.logoutButton.addEventListener('click', logout);

init();

async function init() {
  const cached = loadAccountCache();
  if (cached?.customer) {
    state.customer = cached.customer;
    state.orders = Array.isArray(cached.orders) ? cached.orders : [];
    showShell();
    renderOrders();
  }

  try {
    const data = await request('/api/customer/me');
    state.customer = data.customer;
    showShell();
    await loadOrders();
    saveAccountCache();
  } catch {
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
    customer: customerFromForm(form),
    address: addressFromForm(form)
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
    saveAccountCache();
    renderOrders();
  } catch (error) {
    if (!state.orders.length) throw error;
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
  showDashboard();
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
  els.dashboard.hidden = false;
  els.edit.hidden = true;
}

function showEdit() {
  fillProfile();
  els.dashboard.hidden = true;
  els.edit.hidden = false;
}

function fillProfile() {
  const customer = state.customer || {};
  const address = customer.address || {};
  els.customerName.textContent = customer.name || 'Cliente';
  setValue(els.profileForm.elements.name, customer.name);
  setValue(els.profileForm.elements.phone, customer.phone);
  setValue(els.profileForm.elements.email, customer.email);
  setValue(els.profileForm.elements.street, address.street);
  setValue(els.profileForm.elements.number, address.number);
  setValue(els.profileForm.elements.neighborhood, address.neighborhood);
  setValue(els.profileForm.elements.city, address.city);
  setValue(els.profileForm.elements.complement, address.complement);
  setValue(els.profileForm.elements.reference, address.reference);
}

function renderOrders() {
  renderDashboard();
  if (!state.orders.length) {
    els.ordersList.innerHTML = '<p class="muted">Nenhum pedido encontrado.</p>';
    return;
  }
  els.ordersList.replaceChildren(...state.orders.map((order) => {
    const card = document.createElement('article');
    card.className = `list-card account-order-card status-${order.status}`;
    card.innerHTML = `
      <div class="list-head">
        <strong>#${escapeHtml(order.public_code)}</strong>
        <span class="order-history-status">${statusLabel(order.status)}</span>
      </div>
      <p>${money(order.total)} - ${new Date(order.created_at).toLocaleString('pt-BR')}</p>
      <div class="mini-items">${(order.items || []).map((item) => `<span>${item.quantity}x ${escapeHtml(item.item_snapshot?.name || '')}</span>`).join('')}</div>
      <div class="row-actions">
        <button class="ghost-button compact" type="button" data-repeat-order="${escapeHtml(order.id)}">Refazer pedido</button>
      </div>
    `;
    card.querySelector('[data-repeat-order]').addEventListener('click', () => repeatOrder(order));
    return card;
  }));
}

function renderDashboard() {
  const addresses = state.customer?.addresses || [];
  const activeOrders = state.orders.filter((order) => !['completed', 'cancelled'].includes(order.status));
  const lastOrder = state.orders[0] || null;

  els.activeOrdersCount.textContent = activeOrders.length;
  els.savedAddressesCount.textContent = addresses.length;
  els.totalOrdersCount.textContent = state.orders.length;

  if (lastOrder) {
    els.lastOrderTitle.textContent = `Pedido #${lastOrder.public_code}`;
    els.lastOrderText.textContent = `${money(lastOrder.total)} em ${new Date(lastOrder.created_at).toLocaleDateString('pt-BR')} - ${orderItemsText(lastOrder)}`;
  } else {
    els.lastOrderTitle.textContent = 'Seu ultimo pedido';
    els.lastOrderText.textContent = 'Quando voce fizer um pedido, ele aparece aqui para repetir mais rapido.';
  }

  els.repeatLastOrderButton.disabled = !lastOrder;
  renderAccountSummary(addresses, activeOrders);
}

function renderAccountSummary(addresses, activeOrders) {
  const customer = state.customer || {};
  const defaultAddress = addresses[0] || customer.address || null;
  els.accountSummary.innerHTML = `
    <div>
      <strong>${escapeHtml(customer.name || 'Cliente')}</strong>
      <p>${escapeHtml(customer.phone || 'Telefone nao informado')}</p>
      <p>${escapeHtml(customer.email || 'E-mail nao informado')}</p>
    </div>
    <div>
      <strong>Endereco principal</strong>
      <p>${defaultAddress ? escapeHtml(formatAddress(defaultAddress)) : 'Nenhum endereco salvo.'}</p>
    </div>
    <div>
      <strong>Status</strong>
      <p>${activeOrders.length ? `${activeOrders.length} pedido${activeOrders.length === 1 ? '' : 's'} em andamento.` : 'Nenhum pedido em andamento.'}</p>
    </div>
  `;
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
      quantity: Number(item.quantity || 1)
    }));

  if (!cart.length) {
    toast('Nao foi possivel refazer este pedido.');
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

function statusLabel(status) {
  return ({
    new: 'Novo',
    accepted: 'Aceito',
    preparing: 'Preparando',
    ready: 'Pronto',
    out_for_delivery: 'Saiu para entrega',
    completed: 'Concluido',
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
