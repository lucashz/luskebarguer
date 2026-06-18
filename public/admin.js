const state = {
  admin: null,
  store: null,
  categories: [],
  orders: [],
  customers: [],
  knownOrderIds: new Set(),
  initialOrdersLoaded: false,
  orderPollTimer: null,
  soundEnabled: localStorage.getItem('adminSoundEnabled') === 'true',
  audioContext: null,
  storeFormDirty: false
};

const els = {
  authScreen: document.querySelector('#authScreen'),
  setupCard: document.querySelector('#setupCard'),
  loginCard: document.querySelector('#loginCard'),
  adminShell: document.querySelector('#adminShell'),
  adminUser: document.querySelector('#adminUser'),
  adminTitle: document.querySelector('#adminTitle'),
  setupForm: document.querySelector('#setupForm'),
  loginForm: document.querySelector('#loginForm'),
  logoutButton: document.querySelector('#logoutButton'),
  refreshAdminButton: document.querySelector('#refreshAdminButton'),
  metricOrders: document.querySelector('#metricOrders'),
  metricOpen: document.querySelector('#metricOpen'),
  metricCustomers: document.querySelector('#metricCustomers'),
  adminOrders: document.querySelector('#adminOrders'),
  adminCustomers: document.querySelector('#adminCustomers'),
  categoryEditorList: document.querySelector('#categoryEditorList'),
  productEditorList: document.querySelector('#productEditorList'),
  refreshCategoriesButton: document.querySelector('#refreshCategoriesButton'),
  refreshProductsButton: document.querySelector('#refreshProductsButton'),
  enableSoundButton: document.querySelector('#enableSoundButton'),
  newOrderDialog: document.querySelector('#newOrderDialog'),
  newOrderTitle: document.querySelector('#newOrderTitle'),
  newOrderDetails: document.querySelector('#newOrderDetails'),
  newOrderCloseButton: document.querySelector('#newOrderCloseButton'),
  viewNewOrderButton: document.querySelector('#viewNewOrderButton'),
  categoryForm: document.querySelector('#categoryForm'),
  itemForm: document.querySelector('#itemForm'),
  itemCategory: document.querySelector('#itemCategory'),
  itemImageFile: document.querySelector('#itemImageFile'),
  storeForm: document.querySelector('#storeForm'),
  accountForm: document.querySelector('#accountForm'),
  passwordForm: document.querySelector('#passwordForm'),
  toast: document.querySelector('#toast')
};

document.querySelectorAll('[data-admin-tab]').forEach((button) => {
  button.addEventListener('click', () => activateAdminTab(button.dataset.adminTab));
});

document.querySelectorAll('[data-menu-view]').forEach((button) => {
  button.addEventListener('click', () => activateMenuView(button.dataset.menuView));
});

els.setupForm.addEventListener('submit', submitSetup);
els.loginForm.addEventListener('submit', submitLogin);
els.logoutButton.addEventListener('click', logout);
els.refreshAdminButton.addEventListener('click', () => loadSummary());
els.adminOrders.addEventListener('dragover', handleOrderBoardDragOver);
els.adminOrders.addEventListener('dragleave', handleOrderBoardDragLeave);
els.adminOrders.addEventListener('drop', handleOrderBoardDrop);
els.refreshCategoriesButton.addEventListener('click', () => loadSummary());
els.refreshProductsButton.addEventListener('click', () => loadSummary());
els.enableSoundButton.addEventListener('click', enableSoundAlerts);
els.newOrderCloseButton.addEventListener('click', () => els.newOrderDialog.close());
els.viewNewOrderButton.addEventListener('click', () => {
  activateAdminTab('orders');
  els.newOrderDialog.close();
});
els.categoryForm.addEventListener('submit', submitCategory);
els.itemForm.addEventListener('submit', submitItem);
els.storeForm.addEventListener('submit', submitStore);
els.storeForm.addEventListener('input', () => {
  state.storeFormDirty = true;
});
els.storeForm.addEventListener('change', () => {
  state.storeFormDirty = true;
});
els.accountForm.addEventListener('submit', submitAccount);
els.passwordForm.addEventListener('submit', submitPassword);

init();

async function init() {
  const setup = await request('/api/admin/setup-status');
  els.setupCard.hidden = setup.has_admin;
  els.loginCard.hidden = !setup.has_admin;

  try {
    const me = await request('/api/admin/me');
    state.admin = me.admin;
    await loadSummary();
    showPanel();
  } catch {
    showAuth();
  }
}

async function submitSetup(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(els.setupForm));
  const result = await request('/api/admin/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  state.admin = result.admin;
  await loadSummary();
  showPanel();
}

async function submitLogin(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(els.loginForm));
  const result = await request('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  state.admin = result.admin;
  await loadSummary();
  showPanel();
}

async function logout() {
  await request('/api/admin/logout', { method: 'POST' });
  state.admin = null;
  stopOrderPolling();
  showAuth();
}

async function loadSummary(options = {}) {
  const previousIds = new Set(state.knownOrderIds);
  const data = await request('/api/admin/summary');
  state.store = data.store || null;
  state.categories = data.categories || [];
  state.orders = data.orders || [];
  state.customers = data.customers || [];
  detectNewOrders(previousIds, state.orders, options);
  state.knownOrderIds = new Set(state.orders.map((order) => String(order.id)));
  state.initialOrdersLoaded = true;
  render();
}

function render() {
  els.adminUser.textContent = state.admin ? `${state.admin.name} - ${state.admin.email}` : 'Painel';
  renderOrderMetrics();
  renderOrders();
  renderCustomers();
  renderMenu();
  renderCategoryOptions();
  fillStoreForm();
  fillAccountForm();
  renderSoundButton();
}

function renderOrderMetrics() {
  els.metricOrders.textContent = todaysOrders().length;
  els.metricOpen.textContent = state.orders.filter((order) => !['completed', 'cancelled'].includes(order.status)).length;
  els.metricCustomers.textContent = state.customers.length;
}

function renderOrders() {
  const groups = ['new', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'];
  els.adminOrders.replaceChildren(...groups.map((status) => {
    const column = document.createElement('section');
    column.className = `order-column status-${status}`;
    column.dataset.orderStatus = status;
    const orders = state.orders.filter((order) => order.status === status);
    column.innerHTML = `<h3><span>${statusLabel(status)}</span><strong>${orders.length}</strong></h3>`;
    column.append(...orders.map(orderCard));
    return column;
  }));
}

function orderCard(order) {
  const card = document.createElement('article');
  card.className = `order-card status-${order.status}`;
  card.draggable = true;
  card.dataset.orderId = order.id;
  card.dataset.orderStatus = order.status;
  const customer = order.customer_snapshot || {};
  const fulfillment = order.fulfillment_method === 'pickup' ? 'Retirada' : 'Entrega';
  const payment = order.payment_method ? escapeHtml(order.payment_method) : 'Pagamento nao informado';
  const itemCount = (order.items || []).reduce((total, item) => total + Number(item.quantity || 0), 0);
  card.innerHTML = `
    <div class="order-card-top">
      <div>
        <strong>#${escapeHtml(order.public_code)}</strong>
        <p>${escapeHtml(customer.name || 'Cliente')}</p>
      </div>
      <span class="order-status-badge">${statusLabel(order.status)}</span>
    </div>
    <p class="order-card-line">${orderItemsSummary(order)}</p>
    <div class="order-compact-row">
      <strong>${money(order.total)}</strong>
      <span>${itemCount || 0} ${itemCount === 1 ? 'item' : 'itens'}</span>
    </div>
    <details class="order-details">
      <summary>Ver detalhes</summary>
      <div class="order-details-body">
        <dl>
          <div><dt>Horario</dt><dd>${new Date(order.created_at).toLocaleString('pt-BR')}</dd></div>
          <div><dt>Telefone</dt><dd>${escapeHtml(customer.phone || 'Sem telefone')}</dd></div>
          <div><dt>Tipo</dt><dd>${fulfillment}</dd></div>
          <div><dt>Pagamento</dt><dd>${payment}</dd></div>
        </dl>
        ${orderAddressHtml(order)}
        ${order.notes ? `<p class="order-note"><strong>Obs.</strong> ${escapeHtml(order.notes)}</p>` : ''}
        <div class="mini-items expanded">${(order.items || []).map(orderItemHtml).join('')}</div>
        <button class="ghost-button compact print-order-button" type="button" data-print-order="${escapeAttribute(order.id)}">Imprimir etiqueta</button>
      </div>
    </details>
  `;
  card.querySelector('.order-details')?.addEventListener('mousedown', (event) => event.stopPropagation());
  card.querySelector('.order-details')?.addEventListener('touchstart', (event) => event.stopPropagation(), { passive: true });
  card.querySelector('[data-print-order]')?.addEventListener('click', () => printOrderLabel(order));
  card.addEventListener('dragstart', (event) => {
    if (event.target.closest('.order-details') || event.target.closest('button') || event.target.closest('select')) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', order.id);
    event.dataTransfer.setData('application/json', JSON.stringify({ id: order.id, status: order.status }));
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    document.querySelectorAll('.order-column.drag-over').forEach((column) => column.classList.remove('drag-over'));
  });
  const select = document.createElement('select');
  ['new', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'].forEach((status) => {
    const option = document.createElement('option');
    option.value = status;
    option.textContent = statusLabel(status);
    option.selected = order.status === status;
    select.append(option);
  });
  select.addEventListener('change', async () => {
    await updateOrderStatus(order.id, select.value);
  });
  card.append(select);
  return card;
}

function orderItemsSummary(order) {
  const items = order.items || [];
  if (items.length === 0) return 'Sem itens registrados';
  const visible = items.slice(0, 2).map((item) => `${item.quantity}x ${escapeHtml(item.item_snapshot?.name || 'Item')}`);
  const remaining = items.length - visible.length;
  return `${visible.join(', ')}${remaining > 0 ? ` +${remaining}` : ''}`;
}

function orderItemHtml(item) {
  const name = escapeHtml(item.item_snapshot?.name || 'Item');
  const notes = item.notes ? `<small>Obs: ${escapeHtml(item.notes)}</small>` : '';
  return `
    <span>
      <strong>${Number(item.quantity || 0)}x ${name}</strong>
      <small>${money(item.total)}</small>
      ${notes}
    </span>
  `;
}

function orderAddressHtml(order) {
  const address = order.address_snapshot || {};
  if (!address.street) return '';
  const line = [
    address.street,
    address.number,
    address.neighborhood,
    address.city
  ].map((part) => escapeHtml(part || '')).filter(Boolean).join(', ');
  const extra = [address.complement, address.reference]
    .map((part) => escapeHtml(part || ''))
    .filter(Boolean)
    .join(' - ');
  return `
    <p class="order-address"><strong>Endereco</strong> ${line}${extra ? `<small>${extra}</small>` : ''}</p>
  `;
}

function printOrderLabel(order) {
  const popup = window.open('', '_blank', 'width=420,height=640');
  if (!popup) {
    toast('Permita pop-ups para imprimir a etiqueta.');
    return;
  }

  popup.document.write(orderLabelDocument(order));
  popup.document.close();
  popup.focus();
  popup.setTimeout(() => {
    popup.print();
    popup.setTimeout(() => popup.close(), 500);
  }, 150);
}

function orderLabelDocument(order) {
  const customer = order.customer_snapshot || {};
  const address = order.address_snapshot || {};
  const storeName = state.store?.name || 'Cardapio';
  const createdAt = new Date(order.created_at).toLocaleString('pt-BR');
  const addressLines = orderAddressLines(address).map((line) => `<p>${escapeHtml(line)}</p>`).join('');
  const items = (order.items || []).map((item) => {
    const name = item.item_snapshot?.name || 'Item';
    const notes = item.notes ? `<small>Obs: ${escapeHtml(item.notes)}</small>` : '';
    return `
      <li>
        <strong>${Number(item.quantity || 0)}x ${escapeHtml(name)}</strong>
        <span>${money(item.total)}</span>
        ${notes}
      </li>
    `;
  }).join('');

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>Pedido #${escapeHtml(order.public_code)}</title>
    <style>
      @page { margin: 6mm; size: 80mm auto; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: #111827;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 12px;
      }
      .label {
        width: 100%;
        max-width: 76mm;
        padding: 4mm;
      }
      h1, h2, p { margin: 0; }
      h1 {
        border-bottom: 2px solid #111827;
        padding-bottom: 6px;
        font-size: 20px;
        letter-spacing: 0;
      }
      h2 {
        margin-top: 10px;
        font-size: 13px;
        text-transform: uppercase;
      }
      .store {
        color: #4b5563;
        font-size: 11px;
        font-weight: 700;
        margin-bottom: 4px;
      }
      .meta, .box {
        border-bottom: 1px dashed #9ca3af;
        padding: 8px 0;
      }
      .meta p, .box p {
        margin-top: 3px;
        line-height: 1.35;
      }
      ul {
        list-style: none;
        margin: 6px 0 0;
        padding: 0;
      }
      li {
        display: grid;
        gap: 2px;
        border-top: 1px solid #e5e7eb;
        padding: 6px 0;
      }
      li:first-child { border-top: 0; }
      li span, li small { color: #4b5563; }
      .total {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        border-top: 2px solid #111827;
        margin-top: 8px;
        padding-top: 8px;
        font-size: 16px;
        font-weight: 900;
      }
      .status {
        display: inline-block;
        border: 1px solid #111827;
        border-radius: 999px;
        margin-top: 6px;
        padding: 3px 8px;
        font-size: 11px;
        font-weight: 900;
      }
      @media print {
        .label { max-width: none; }
      }
    </style>
  </head>
  <body>
    <main class="label">
      <p class="store">${escapeHtml(storeName)}</p>
      <h1>Pedido #${escapeHtml(order.public_code)}</h1>
      <span class="status">${escapeHtml(statusLabel(order.status))}</span>
      <section class="meta">
        <p><strong>Horario:</strong> ${escapeHtml(createdAt)}</p>
        <p><strong>Tipo:</strong> ${order.fulfillment_method === 'pickup' ? 'Retirada' : 'Entrega'}</p>
        <p><strong>Pagamento:</strong> ${escapeHtml(order.payment_method || 'Nao informado')}</p>
      </section>
      <section class="box">
        <h2>Cliente</h2>
        <p><strong>${escapeHtml(customer.name || 'Cliente')}</strong></p>
        <p>${escapeHtml(customer.phone || 'Sem telefone')}</p>
      </section>
      ${addressLines ? `<section class="box"><h2>Endereco</h2>${addressLines}</section>` : ''}
      <section class="box">
        <h2>Itens</h2>
        <ul>${items}</ul>
      </section>
      ${order.notes ? `<section class="box"><h2>Obs. do pedido</h2><p>${escapeHtml(order.notes)}</p></section>` : ''}
      <div class="total"><span>Total</span><strong>${money(order.total)}</strong></div>
    </main>
  </body>
</html>`;
}

function orderAddressLines(address = {}) {
  const main = [
    address.street,
    address.number
  ].filter(Boolean).join(', ');
  return [
    main,
    address.neighborhood ? `Bairro: ${address.neighborhood}` : '',
    address.city ? `Cidade: ${address.city}` : '',
    address.complement ? `Complemento: ${address.complement}` : '',
    address.reference ? `Referencia: ${address.reference}` : ''
  ].filter(Boolean);
}

function handleOrderBoardDragOver(event) {
  event.preventDefault();
  const column = closestOrderColumnFromPoint(event.clientX, event.clientY);
  markDragColumn(column);
  event.dataTransfer.dropEffect = 'move';
}

function handleOrderBoardDragLeave(event) {
  if (!els.adminOrders.contains(event.relatedTarget)) clearDragColumns();
}

async function handleOrderBoardDrop(event) {
  event.preventDefault();
  const column = closestOrderColumnFromPoint(event.clientX, event.clientY);
  clearDragColumns();
  if (!column) return;
  const orderId = event.dataTransfer.getData('text/plain');
  const status = column.dataset.orderStatus;
  const order = state.orders.find((item) => String(item.id) === String(orderId));
  if (!order || !status || order.status === status) return;
  await updateOrderStatus(order.id, status);
  toast(`Pedido #${order.public_code} movido para ${statusLabel(status)}.`);
}

function closestOrderColumnFromPoint(x, y) {
  const columns = [...els.adminOrders.querySelectorAll('.order-column')];
  return columns.find((column) => {
    const rect = column.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }) || columns
    .map((column) => {
      const rect = column.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      return { column, distance: Math.abs(x - center) };
    })
    .sort((a, b) => a.distance - b.distance)[0]?.column || null;
}

function markDragColumn(activeColumn) {
  els.adminOrders.querySelectorAll('.order-column').forEach((column) => {
    column.classList.toggle('drag-over', column === activeColumn);
  });
}

function clearDragColumns() {
  els.adminOrders.querySelectorAll('.order-column.drag-over').forEach((column) => column.classList.remove('drag-over'));
}

async function updateOrderStatus(orderId, status) {
  const order = state.orders.find((item) => String(item.id) === String(orderId));
  const previousStatus = order?.status;

  if (order && previousStatus !== status) {
    order.status = status;
    renderOrderMetrics();
    renderOrders();
  }

  try {
    await request(`/api/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    await loadSummary({ skipNotifications: true });
  } catch (error) {
    if (order && previousStatus) {
      order.status = previousStatus;
      renderOrderMetrics();
      renderOrders();
    }
    toast(error.message || 'Nao foi possivel atualizar o pedido.');
  }
}

function renderCustomers() {
  if (state.customers.length === 0) {
    els.adminCustomers.innerHTML = '<p class="muted">Nenhum cliente cadastrado.</p>';
    return;
  }
  els.adminCustomers.replaceChildren(...state.customers.map(customerEditor));
}

function customerEditor(customer) {
  const card = document.createElement('article');
  card.className = 'customer-list-card';
  const addresses = customer.addresses || [];
  const lastSeen = customer.last_login_at
    ? `Ultimo acesso ${new Date(customer.last_login_at).toLocaleDateString('pt-BR')}`
    : `Cadastrado em ${new Date(customer.created_at).toLocaleDateString('pt-BR')}`;
  card.innerHTML = `
    <div class="customer-row-summary">
      <button class="customer-toggle" type="button" aria-expanded="false">
        <div>
          <strong>${escapeHtml(customer.name)}</strong>
          <p>${escapeHtml(customer.phone)} - ${escapeHtml(customer.email || 'Sem e-mail')} - ${lastSeen}</p>
        </div>
      </button>
      <span class="pill">${addresses.length} endereco${addresses.length === 1 ? '' : 's'}</span>
      <div class="row-actions">
        <button class="ghost-button compact" type="button" data-action="edit">Editar</button>
        <button class="danger-button compact" type="button" data-action="delete">Excluir</button>
      </div>
    </div>
    <div class="customer-dropdown" hidden>
      <form class="customer-main-form">
        <div class="section-actions">
          <h3>Cadastro do cliente</h3>
          <span class="pill">${state.orders.filter((order) => order.customer_id === customer.id).length} pedidos</span>
        </div>
      <div class="editor-grid">
        <label>Nome<input name="name" required value="${escapeAttribute(customer.name)}"></label>
        <label>Telefone<input name="phone" required inputmode="tel" value="${escapeAttribute(customer.phone)}"></label>
        <label>E-mail<input name="email" type="email" value="${escapeAttribute(customer.email || '')}"></label>
        <label>Nova senha<input name="password" type="password" minlength="8" placeholder="Opcional"></label>
        <label class="editor-wide">Observacoes<textarea name="notes">${escapeHtml(customer.notes || '')}</textarea></label>
      </div>
      <div class="row-actions">
        <button class="primary-button compact">Salvar cliente</button>
      </div>
      </form>
      <div class="customer-addresses">
        <h3>Enderecos</h3>
        <div class="customer-address-list"></div>
        <form class="customer-address-form new-address-form">
          <strong>Novo endereco</strong>
          ${addressFields({ is_default: addresses.length === 0 })}
          <div class="row-actions">
            <button class="ghost-button compact">Adicionar endereco</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const dropdown = card.querySelector('.customer-dropdown');
  const toggle = card.querySelector('.customer-toggle');
  const openDropdown = () => {
    dropdown.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
  };
  toggle.addEventListener('click', () => {
    dropdown.hidden = !dropdown.hidden;
    toggle.setAttribute('aria-expanded', String(!dropdown.hidden));
  });
  card.querySelector('[data-action="edit"]').addEventListener('click', openDropdown);
  card.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    if (!confirm(`Excluir o cliente "${customer.name}"? Os pedidos antigos continuam no historico.`)) return;
    await removeAdminCustomer(customer.id);
    toast('Cliente excluido.');
  });

  const mainForm = card.querySelector('.customer-main-form');
  mainForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await updateAdminCustomer(customer.id, customerPayloadFromForm(mainForm));
    toast('Cliente atualizado.');
  });

  const list = card.querySelector('.customer-address-list');
  if (addresses.length === 0) {
    list.innerHTML = '<p class="muted">Nenhum endereco salvo.</p>';
  } else {
    list.replaceChildren(...addresses.map((address) => customerAddressForm(customer.id, address)));
  }

  const newAddressForm = card.querySelector('.new-address-form');
  newAddressForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await createAdminCustomerAddress(customer.id, addressPayloadFromForm(newAddressForm));
    toast('Endereco adicionado.');
  });

  return card;
}

function customerAddressForm(customerId, address) {
  const form = document.createElement('form');
  form.className = 'customer-address-form';
  form.innerHTML = `
    <div class="editor-head">
      <strong>${escapeHtml(address.label || 'Endereco')}</strong>
      <span class="pill">${address.is_default ? 'Principal' : 'Salvo'}</span>
    </div>
    ${addressFields(address)}
    <div class="row-actions">
      <button class="primary-button compact">Salvar endereco</button>
      <button class="danger-button compact" type="button" data-action="delete">Excluir</button>
    </div>
  `;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await updateAdminCustomerAddress(customerId, address.id, addressPayloadFromForm(form));
    toast('Endereco atualizado.');
  });

  form.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    if (!confirm('Excluir este endereco?')) return;
    await deleteAdminCustomerAddress(customerId, address.id);
    toast('Endereco excluido.');
  });

  return form;
}

function addressFields(address = {}) {
  return `
    <div class="editor-grid compact-address-grid">
      <label>Apelido<input name="label" value="${escapeAttribute(address.label || 'Principal')}"></label>
      <label>Rua / Avenida<input name="street" required value="${escapeAttribute(address.street || '')}"></label>
      <label>Numero<input name="number" value="${escapeAttribute(address.number || '')}"></label>
      <label>Bairro<input name="neighborhood" required value="${escapeAttribute(address.neighborhood || '')}"></label>
      <label>Complemento<input name="complement" value="${escapeAttribute(address.complement || '')}"></label>
      <label>Cidade<input name="city" required value="${escapeAttribute(address.city || '')}"></label>
      <label class="editor-wide">Referencia<input name="reference" value="${escapeAttribute(address.reference || '')}"></label>
    </div>
    <label class="check"><input name="is_default" type="checkbox" ${address.is_default ? 'checked' : ''}> Endereco principal</label>
  `;
}

function renderMenu() {
  renderCategoryEditors();
  renderProductEditors();
}

async function submitAccount(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(els.accountForm));
  const result = await request('/api/admin/me', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  state.admin = result.admin;
  render();
  toast('Conta atualizada.');
}

async function submitPassword(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(els.passwordForm));
  await request('/api/admin/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  els.passwordForm.reset();
  toast('Senha atualizada.');
}

function renderCategoryEditors() {
  if (state.categories.length === 0) {
    els.categoryEditorList.innerHTML = '<p class="muted">Nenhuma categoria cadastrada.</p>';
    return;
  }

  els.categoryEditorList.replaceChildren(...state.categories.map(categoryEditor));
}

function categoryEditor(category) {
  const card = document.createElement('article');
  card.className = 'category-list-card';
  card.innerHTML = `
    <div class="category-row-summary">
      <button class="customer-toggle" type="button" aria-expanded="false">
        <div>
          <strong>${escapeHtml(category.name)}</strong>
          <p>${escapeHtml(category.description || 'Sem descricao')} - Ordem ${Number(category.sort_order || 0)}</p>
        </div>
      </button>
      <span class="pill">${category.items?.length || 0} produtos</span>
      <span class="pill ${category.is_active ? 'pill-ok' : 'pill-muted'}">${category.is_active ? 'Visivel' : 'Oculta'}</span>
      <div class="row-actions">
        <button class="ghost-button compact" type="button" data-action="edit">Editar</button>
        <button class="ghost-button compact" type="button" data-action="toggle">${category.is_active ? 'Pausar' : 'Ativar'}</button>
        <button class="danger-button compact" type="button" data-action="delete">Excluir</button>
      </div>
    </div>
    <div class="category-dropdown" hidden>
      <form class="category-editor-form">
        <div class="editor-grid">
          <label>Nome<input name="name" required value="${escapeAttribute(category.name)}"></label>
          <label>Ordem<input name="sort_order" type="number" value="${Number(category.sort_order || 0)}"></label>
          <label class="editor-wide">Descricao<input name="description" value="${escapeAttribute(category.description || '')}"></label>
        </div>
        <div class="switch-row">
          <label class="check"><input name="is_active" type="checkbox" ${category.is_active ? 'checked' : ''}> Visivel no cardapio</label>
        </div>
        <div class="row-actions">
          <button class="primary-button compact">Salvar categoria</button>
        </div>
      </form>
    </div>
  `;

  const dropdown = card.querySelector('.category-dropdown');
  const toggle = card.querySelector('.customer-toggle');
  const openDropdown = () => {
    dropdown.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
  };
  toggle.addEventListener('click', () => {
    dropdown.hidden = !dropdown.hidden;
    toggle.setAttribute('aria-expanded', String(!dropdown.hidden));
  });
  card.querySelector('[data-action="edit"]').addEventListener('click', openDropdown);

  const form = card.querySelector('.category-editor-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await updateCategory(category.id, formToCategory(form));
    toast('Categoria atualizada.');
  });

  card.querySelector('[data-action="toggle"]').addEventListener('click', async () => {
    await updateCategory(category.id, { is_active: !category.is_active });
    toast(category.is_active ? 'Categoria pausada.' : 'Categoria ativada.');
  });

  card.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    if (!confirm(`Excluir a categoria "${category.name}"? Os produtos dela tambem serao removidos.`)) return;
    await removeCategory(category.id);
    toast('Categoria excluida.');
  });

  return card;
}

function renderProductEditors() {
  const products = state.categories.flatMap((category) => (category.items || []).map((item) => ({
    ...item,
    categoryName: category.name
  })));

  if (products.length === 0) {
    els.productEditorList.innerHTML = '<p class="muted">Nenhum produto cadastrado.</p>';
    return;
  }

  els.productEditorList.replaceChildren(...products.map(productEditor));
}

function productEditor(item) {
  const card = document.createElement('article');
  card.className = 'product-list-card';
  card.innerHTML = `
    <div class="product-row-summary">
      <button class="customer-toggle product-toggle" type="button" aria-expanded="false">
        <div class="product-summary-media">
          ${item.image_url ? `<img src="${escapeAttribute(item.image_url)}" alt="">` : '<div class="thumb-fallback"></div>'}
        </div>
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <p>${escapeHtml(item.categoryName)} - ${money(item.price)} - Ordem ${Number(item.sort_order || 0)}</p>
        </div>
      </button>
      <span class="pill ${item.is_available ? 'pill-ok' : 'pill-muted'}">${item.is_available ? 'Disponivel' : 'Pausado'}</span>
      ${item.is_featured ? '<span class="pill">Destaque</span>' : '<span class="pill pill-muted">Normal</span>'}
      <div class="row-actions">
        <button class="ghost-button compact" type="button" data-action="edit">Editar</button>
        <button class="ghost-button compact" type="button" data-action="toggle">${item.is_available ? 'Pausar' : 'Ativar'}</button>
        <button class="danger-button compact" type="button" data-action="delete">Excluir</button>
      </div>
    </div>
    <div class="product-dropdown" hidden>
      <form class="product-editor-form">
        <div class="editor-grid">
          <label>Categoria<select name="category_id" required>${categoryOptions(item.category_id)}</select></label>
          <label>Nome<input name="name" required value="${escapeAttribute(item.name)}"></label>
          <label>Preco<input name="price" type="number" min="0" step="0.01" value="${Number(item.price || 0)}"></label>
          <label>Ordem<input name="sort_order" type="number" value="${Number(item.sort_order || 0)}"></label>
          <label class="editor-wide">Descricao<textarea name="description">${escapeHtml(item.description || '')}</textarea></label>
          <label class="editor-wide">URL da imagem<input name="image_url" value="${escapeAttribute(item.image_url || '')}"></label>
          <label class="editor-wide">Trocar imagem<input name="image_file" type="file" accept="image/*"></label>
          <label class="editor-wide">Tags<input name="tags" value="${escapeAttribute((item.tags || []).join(', '))}"></label>
        </div>
        <div class="switch-row">
          <label class="check"><input name="is_featured" type="checkbox" ${item.is_featured ? 'checked' : ''}> Destaque</label>
          <label class="check"><input name="is_available" type="checkbox" ${item.is_available ? 'checked' : ''}> Disponivel</label>
        </div>
        <div class="row-actions">
          <button class="primary-button compact">Salvar produto</button>
        </div>
      </form>
    </div>
  `;

  const dropdown = card.querySelector('.product-dropdown');
  const toggle = card.querySelector('.product-toggle');
  const openDropdown = () => {
    dropdown.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
  };
  toggle.addEventListener('click', () => {
    dropdown.hidden = !dropdown.hidden;
    toggle.setAttribute('aria-expanded', String(!dropdown.hidden));
  });
  card.querySelector('[data-action="edit"]').addEventListener('click', openDropdown);

  const form = card.querySelector('.product-editor-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = formToItem(form);
    const file = form.elements.image_file.files[0];
    if (file) {
      const uploaded = await uploadImage(file);
      payload.image_url = uploaded.url;
    }
    await updateItem(item.id, payload);
    toast('Produto atualizado.');
  });

  card.querySelector('[data-action="toggle"]').addEventListener('click', async () => {
    await updateItem(item.id, { is_available: !item.is_available });
    toast(item.is_available ? 'Produto pausado.' : 'Produto ativado.');
  });

  card.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    if (!confirm(`Excluir o produto "${item.name}"?`)) return;
    await removeItem(item.id);
    toast('Produto excluido.');
  });

  return card;
}

async function submitCategory(event) {
  event.preventDefault();
  await request('/api/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formToCategory(els.categoryForm))
  });
  els.categoryForm.reset();
  els.categoryForm.elements.is_active.checked = true;
  await loadSummary();
  toast('Categoria criada.');
}

async function submitItem(event) {
  event.preventDefault();
  const payload = formToItem(els.itemForm);
  const file = els.itemImageFile.files[0];
  if (file) {
    const uploaded = await uploadImage(file);
    payload.image_url = uploaded.url;
  }
  await request('/api/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  els.itemForm.reset();
  els.itemForm.elements.is_available.checked = true;
  await loadSummary();
  toast('Produto criado.');
}

async function submitStore(event) {
  event.preventDefault();
  const payload = formToStore(els.storeForm);
  payload.whatsapp_number = digits(payload.whatsapp_number);
  if (!digits(payload.whatsapp_number) || digits(payload.whatsapp_number).length < 12) {
    toast('Informe o WhatsApp com DDI e DDD. Ex: 5511999999999');
    els.storeForm.elements.whatsapp_number.focus();
    return;
  }
  await request('/api/admin/store', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  state.storeFormDirty = false;
  await loadSummary();
  toast(`Loja atualizada. WhatsApp salvo: ${payload.whatsapp_number}`);
}

async function updateCategory(id, payload) {
  await request(`/api/categories/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  await loadSummary();
}

async function updateItem(id, payload) {
  await request(`/api/items/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  await loadSummary();
}

async function updateAdminCustomer(id, payload) {
  await request(`/api/admin/customers/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  await loadSummary();
}

async function createAdminCustomerAddress(customerId, payload) {
  await request(`/api/admin/customers/${customerId}/addresses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  await loadSummary();
}

async function updateAdminCustomerAddress(customerId, addressId, payload) {
  await request(`/api/admin/customers/${customerId}/addresses/${addressId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  await loadSummary();
}

async function deleteAdminCustomerAddress(customerId, addressId) {
  await request(`/api/admin/customers/${customerId}/addresses/${addressId}`, { method: 'DELETE' });
  await loadSummary();
}

async function removeAdminCustomer(id) {
  await request(`/api/admin/customers/${id}`, { method: 'DELETE' });
  await loadSummary();
}

async function removeCategory(id) {
  await request(`/api/categories/${id}`, { method: 'DELETE' });
  await loadSummary();
}

async function removeItem(id) {
  await request(`/api/items/${id}`, { method: 'DELETE' });
  await loadSummary();
}

async function uploadImage(file) {
  const dataBase64 = await fileToBase64(file);
  return request('/api/admin/uploads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type,
      dataBase64
    })
  });
}

function showAuth() {
  els.authScreen.hidden = false;
  els.adminShell.hidden = true;
  stopOrderPolling();
}

function showPanel() {
  els.authScreen.hidden = true;
  els.adminShell.hidden = false;
  startOrderPolling();
}

function startOrderPolling() {
  if (state.orderPollTimer) return;
  state.orderPollTimer = setInterval(() => {
    loadSummary({ silent: true }).catch(() => {});
  }, 12000);
}

function stopOrderPolling() {
  if (!state.orderPollTimer) return;
  clearInterval(state.orderPollTimer);
  state.orderPollTimer = null;
}

function activateAdminTab(tab) {
  const titles = {
    orders: 'Pedidos',
    menu: 'Cardapio',
    customers: 'Clientes',
    store: 'Loja',
    account: 'Conta'
  };
  els.adminTitle.textContent = titles[tab] || 'Painel';
  document.querySelectorAll('[data-admin-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.adminTab === tab);
  });
  document.querySelectorAll('[data-admin-section]').forEach((section) => {
    section.classList.toggle('active', section.dataset.adminSection === tab);
  });
}

function activateMenuView(view) {
  document.querySelectorAll('[data-menu-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.menuView === view);
  });
  document.querySelectorAll('[data-menu-panel]').forEach((section) => {
    section.classList.toggle('active', section.dataset.menuPanel === view);
  });
}

function renderCategoryOptions() {
  els.itemCategory.replaceChildren(...state.categories.map((category) => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    return option;
  }));
}

function categoryOptions(selectedId) {
  return state.categories.map((category) => (
    `<option value="${escapeAttribute(category.id)}" ${category.id === selectedId ? 'selected' : ''}>${escapeHtml(category.name)}</option>`
  )).join('');
}

function fillStoreForm() {
  if (!state.store) return;
  if (state.storeFormDirty) return;
  const store = state.store;
  const paymentMethods = store.payment_methods || [];
  const presetPayments = [...els.storeForm.querySelectorAll('input[name="payment_methods"]')].map((input) => input.value);
  const extraPayments = paymentMethods.filter((method) => !presetPayments.includes(method));
  setValue(els.storeForm.elements.name, store.name);
  setValue(els.storeForm.elements.slug, store.slug);
  setValue(els.storeForm.elements.description, store.description);
  setValue(els.storeForm.elements.whatsapp_number, store.whatsapp_number);
  setValue(els.storeForm.elements.address, store.address);
  setValue(els.storeForm.elements.logo_url, store.logo_url);
  setValue(els.storeForm.elements.cover_url, store.cover_url);
  setValue(els.storeForm.elements.delivery_fee, store.delivery_fee);
  setValue(els.storeForm.elements.minimum_order, store.minimum_order);
  els.storeForm.querySelectorAll('input[name="payment_methods"]').forEach((input) => {
    input.checked = paymentMethods.includes(input.value);
  });
  setValue(els.storeForm.elements.payment_methods_extra, extraPayments.join(', '));
  els.storeForm.elements.is_open.checked = store.is_open !== false;
  els.storeForm.elements.accepts_delivery.checked = store.accepts_delivery !== false;
  els.storeForm.elements.accepts_pickup.checked = store.accepts_pickup !== false;
}

function fillAccountForm() {
  if (!state.admin) return;
  setValue(els.accountForm.elements.name, state.admin.name);
  setValue(els.accountForm.elements.email, state.admin.email);
}

function detectNewOrders(previousIds, orders, options = {}) {
  if (!state.initialOrdersLoaded || options.skipNotifications) return;
  const newOrders = orders
    .filter((order) => order.status === 'new' && !previousIds.has(String(order.id)))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  newOrders.forEach(notifyNewOrder);
}

function notifyNewOrder(order) {
  const customer = order.customer_snapshot || {};
  toast(`Novo pedido #${order.public_code}`);
  playNewOrderSound().catch(() => {});
  els.newOrderTitle.textContent = `Pedido #${order.public_code}`;
  els.newOrderDetails.innerHTML = `
    <div><strong>${escapeHtml(customer.name || 'Cliente')}</strong><span>${escapeHtml(customer.phone || '')}</span></div>
    <div><strong>${money(order.total)}</strong><span>${(order.items || []).length} itens</span></div>
  `;
  if (typeof els.newOrderDialog.showModal === 'function') {
    if (!els.newOrderDialog.open) els.newOrderDialog.showModal();
  }
}

async function enableSoundAlerts() {
  state.soundEnabled = true;
  localStorage.setItem('adminSoundEnabled', 'true');
  await playNewOrderSound();
  renderSoundButton();
  toast('Alerta sonoro ativado.');
}

function renderSoundButton() {
  els.enableSoundButton.textContent = state.soundEnabled ? 'Som ativado' : 'Ativar som';
  els.enableSoundButton.classList.toggle('sound-enabled', state.soundEnabled);
}

async function playNewOrderSound() {
  if (!state.soundEnabled) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  state.audioContext ||= new AudioContext();
  await state.audioContext.resume();
  [880, 1175, 880].forEach((frequency, index) => {
    const oscillator = state.audioContext.createOscillator();
    const gain = state.audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    gain.connect(state.audioContext.destination);
    const start = state.audioContext.currentTime + index * 0.18;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.28, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.15);
    oscillator.start(start);
    oscillator.stop(start + 0.16);
  });
}

function formToCategory(form) {
  const data = new FormData(form);
  return {
    name: data.get('name'),
    description: data.get('description'),
    sort_order: data.get('sort_order'),
    is_active: data.get('is_active') === 'on'
  };
}

function formToItem(form) {
  const data = new FormData(form);
  return {
    category_id: data.get('category_id'),
    name: data.get('name'),
    description: data.get('description'),
    price: data.get('price'),
    image_url: data.get('image_url'),
    tags: String(data.get('tags') || '').split(',').map((tag) => tag.trim()).filter(Boolean),
    sort_order: data.get('sort_order'),
    is_featured: data.get('is_featured') === 'on',
    is_available: data.get('is_available') === 'on'
  };
}

function formToStore(form) {
  const data = new FormData(form);
  const paymentMethods = [
    ...data.getAll('payment_methods'),
    ...String(data.get('payment_methods_extra') || '').split(',')
  ].map((item) => item.trim()).filter(Boolean);
  return {
    name: data.get('name'),
    slug: data.get('slug'),
    description: data.get('description'),
    whatsapp_number: data.get('whatsapp_number'),
    address: data.get('address'),
    logo_url: data.get('logo_url'),
    cover_url: data.get('cover_url'),
    delivery_fee: data.get('delivery_fee'),
    minimum_order: data.get('minimum_order'),
    payment_methods: [...new Set(paymentMethods)],
    is_open: data.get('is_open') === 'on',
    accepts_delivery: data.get('accepts_delivery') === 'on',
    accepts_pickup: data.get('accepts_pickup') === 'on'
  };
}

function customerPayloadFromForm(form) {
  const data = new FormData(form);
  const payload = {
    customer: {
      name: data.get('name'),
      phone: data.get('phone'),
      email: data.get('email'),
      notes: data.get('notes')
    }
  };
  if (data.get('password')) payload.password = data.get('password');
  return payload;
}

function addressPayloadFromForm(form) {
  const data = new FormData(form);
  return {
    label: data.get('label'),
    street: data.get('street'),
    number: data.get('number'),
    neighborhood: data.get('neighborhood'),
    complement: data.get('complement'),
    city: data.get('city'),
    reference: data.get('reference'),
    is_default: data.get('is_default') === 'on'
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

function todaysOrders() {
  const today = new Date().toDateString();
  return state.orders.filter((order) => new Date(order.created_at).toDateString() === today);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function setValue(field, value) {
  if (field) field.value = value ?? '';
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
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

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}
