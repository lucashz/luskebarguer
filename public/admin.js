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
  kitchenMode: localStorage.getItem('adminKitchenMode') === 'true',
  autoPrintAccepted: localStorage.getItem('adminAutoPrintAccepted') === 'true',
  audioContext: null,
  storeFormDirty: false,
  editingCategoryId: null,
  editingProductId: null,
  selectedOptionsProductId: null,
  pendingModifierPresetOptions: [],
  openModifierGroupIds: new Set(),
  openCustomerIds: new Set(),
  modifierCreateDrafts: new Map(),
  currentReport: null
};

const ADMIN_CACHE_KEY = 'admin_profile_cache_v1';

const els = {
  authScreen: document.querySelector('#authScreen'),
  adminAuthLoading: document.querySelector('#adminAuthLoading'),
  setupCard: document.querySelector('#setupCard'),
  loginCard: document.querySelector('#loginCard'),
  adminLayout: document.querySelector('#adminLayout'),
  adminSidebar: document.querySelector('#adminSidebar'),
  adminShell: document.querySelector('#adminShell'),
  adminUser: document.querySelector('#adminUser'),
  adminTitle: document.querySelector('#adminTitle'),
  setupForm: document.querySelector('#setupForm'),
  loginForm: document.querySelector('#loginForm'),
  logoutButton: document.querySelector('#logoutButton'),
  adminHeaderLogoutButton: document.querySelector('#adminHeaderLogoutButton'),
  operationTitle: document.querySelector('#operationTitle'),
  operationText: document.querySelector('#operationText'),
  operationBadge: document.querySelector('#operationBadge'),
  operationMetricOrders: document.querySelector('#operationMetricOrders'),
  operationMetricOpen: document.querySelector('#operationMetricOpen'),
  operationMetricStatus: document.querySelector('#operationMetricStatus'),
  startOperationButton: document.querySelector('#startOperationButton'),
  stopOperationButton: document.querySelector('#stopOperationButton'),
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
  newCategoryButton: document.querySelector('#newCategoryButton'),
  clearQueueButton: document.querySelector('#clearQueueButton'),
  archiveClosedOrdersButton: document.querySelector('#archiveClosedOrdersButton'),
  reportDate: document.querySelector('#reportDate'),
  loadReportButton: document.querySelector('#loadReportButton'),
  exportReportCsvButton: document.querySelector('#exportReportCsvButton'),
  printReportButton: document.querySelector('#printReportButton'),
  reportPresetButtons: document.querySelectorAll('[data-report-preset]'),
  reportSummary: document.querySelector('#reportSummary'),
  reportOrdersTitle: document.querySelector('#reportOrdersTitle'),
  reportOrders: document.querySelector('#reportOrders'),
  enableSoundButton: document.querySelector('#enableSoundButton'),
  kitchenModeButton: document.querySelector('#kitchenModeButton'),
  autoPrintButton: document.querySelector('#autoPrintButton'),
  newOrderDialog: document.querySelector('#newOrderDialog'),
  newOrderTitle: document.querySelector('#newOrderTitle'),
  newOrderDetails: document.querySelector('#newOrderDetails'),
  newOrderCloseButton: document.querySelector('#newOrderCloseButton'),
  viewNewOrderButton: document.querySelector('#viewNewOrderButton'),
  categoryForm: document.querySelector('#categoryForm'),
  categoryDialog: document.querySelector('#categoryDialog'),
  categoryDialogEyebrow: document.querySelector('#categoryDialogEyebrow'),
  categoryDialogTitle: document.querySelector('#categoryDialogTitle'),
  saveCategoryButton: document.querySelector('#saveCategoryButton'),
  itemForm: document.querySelector('#itemForm'),
  itemCategory: document.querySelector('#itemCategory'),
  itemImageFile: document.querySelector('#itemImageFile'),
  newProductButton: document.querySelector('#newProductButton'),
  productDialog: document.querySelector('#productDialog'),
  productDialogEyebrow: document.querySelector('#productDialogEyebrow'),
  productDialogTitle: document.querySelector('#productDialogTitle'),
  productFormMainTitle: document.querySelector('#productFormMainTitle'),
  productFormMainText: document.querySelector('#productFormMainText'),
  productEditorTabs: document.querySelectorAll('[data-product-editor-tab]'),
  productEditorPanels: document.querySelectorAll('[data-product-editor-panel]'),
  saveProductButton: document.querySelector('#saveProductButton'),
  productOptionsTitle: document.querySelector('#productOptionsTitle'),
  productOptionsPanel: document.querySelector('#productOptionsPanel'),
  productOptionsCount: document.querySelector('#productOptionsCount'),
  productModifierList: document.querySelector('#productModifierList'),
  modifierProductSelect: document.querySelector('#modifierProductSelect'),
  refreshModifiersButton: document.querySelector('#refreshModifiersButton'),
  modifierGroupForm: document.querySelector('#modifierGroupForm'),
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

els.productEditorTabs?.forEach((button) => {
  button.addEventListener('click', () => setProductEditorTab(button.dataset.productEditorTab));
});

document.querySelectorAll('[data-modifier-preset]').forEach((button) => {
  button.addEventListener('click', () => applyModifierPreset(button.dataset.modifierPreset));
});

els.setupForm.addEventListener('submit', submitSetup);
els.loginForm.addEventListener('submit', submitLogin);
els.logoutButton.addEventListener('click', logout);
els.adminHeaderLogoutButton.addEventListener('click', logout);
els.startOperationButton?.addEventListener('click', startOperation);
els.stopOperationButton?.addEventListener('click', stopOperation);
els.refreshAdminButton.addEventListener('click', () => loadSummary());
els.adminOrders.addEventListener('dragover', handleOrderBoardDragOver);
els.adminOrders.addEventListener('dragleave', handleOrderBoardDragLeave);
els.adminOrders.addEventListener('drop', handleOrderBoardDrop);
els.refreshCategoriesButton.addEventListener('click', () => loadSummary());
els.refreshProductsButton.addEventListener('click', () => loadSummary());
els.refreshModifiersButton?.addEventListener('click', () => loadSummary());
els.newCategoryButton.addEventListener('click', openNewCategoryDialog);
els.clearQueueButton.addEventListener('click', clearOrderQueue);
els.archiveClosedOrdersButton?.addEventListener('click', archiveClosedOrders);
els.loadReportButton.addEventListener('click', loadDailyReport);
els.exportReportCsvButton?.addEventListener('click', exportCurrentReportCsv);
els.printReportButton?.addEventListener('click', printCurrentReport);
els.kitchenModeButton?.addEventListener('click', toggleKitchenMode);
els.autoPrintButton?.addEventListener('click', toggleAutoPrint);
els.reportPresetButtons.forEach((button) => {
  button.addEventListener('click', () => loadReportPreset(button.dataset.reportPreset));
});
els.enableSoundButton.addEventListener('click', enableSoundAlerts);
els.newOrderCloseButton.addEventListener('click', () => els.newOrderDialog.close());
els.viewNewOrderButton.addEventListener('click', () => {
  activateAdminTab('orders');
  els.newOrderDialog.close();
});
els.categoryForm.addEventListener('submit', submitCategory);
els.itemForm.addEventListener('submit', submitItem);
els.newProductButton.addEventListener('click', openNewProductDialog);
els.modifierProductSelect?.addEventListener('change', () => {
  state.selectedOptionsProductId = els.modifierProductSelect.value || null;
  renderProductOptions(findProduct(state.selectedOptionsProductId));
});
els.modifierGroupForm?.addEventListener('submit', submitModifierGroupFromDialog);
els.storeForm.addEventListener('submit', submitStore);
els.storeForm.addEventListener('input', () => {
  state.storeFormDirty = true;
});
els.storeForm.addEventListener('change', () => {
  state.storeFormDirty = true;
});
els.accountForm.addEventListener('submit', submitAccount);
els.passwordForm.addEventListener('submit', submitPassword);

renderKitchenModeButton();
renderAutoPrintButton();
init();

async function init() {
  els.reportDate.value = localDateInputValue();
  showAdminLoading();

  const cached = loadAdminCache();
  if (cached?.admin) {
    state.admin = cached.admin;
    state.store = cached.store || null;
    render();
    showPanel();
  }

  try {
    const me = await request('/api/admin/me');
    state.admin = me.admin;
    saveAdminCache();
    showPanel();
    await loadAdminData();
  } catch {
    clearAdminCache();
    const setup = await request('/api/admin/setup-status');
    els.setupCard.hidden = setup.has_admin;
    els.loginCard.hidden = !setup.has_admin;
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
  saveAdminCache();
  showPanel();
  await loadAdminData();
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
  saveAdminCache();
  showPanel();
  await loadAdminData();
}

async function logout() {
  await request('/api/admin/logout', { method: 'POST' });
  state.admin = null;
  clearAdminCache();
  stopOrderPolling();
  showAuth();
}

async function loadAdminData() {
  try {
    await loadSummary();
    await loadReportPreset('today');
  } catch (error) {
    toast(error.message || 'Não foi possível atualizar os dados do painel.');
  }
}

async function loadSummary(options = {}) {
  const previousIds = new Set(state.knownOrderIds);
  const data = await request('/api/admin/summary');
  state.store = data.store || null;
  state.categories = data.categories || [];
  state.orders = data.orders || [];
  state.customers = data.customers || [];
  saveAdminCache();
  detectNewOrders(previousIds, state.orders, options);
  state.knownOrderIds = new Set(state.orders.map((order) => String(order.id)));
  state.initialOrdersLoaded = true;
  render();
}

function render() {
  els.adminUser.textContent = state.admin ? `${state.admin.name} - ${state.admin.email}` : 'Painel';
  renderOperation();
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

function renderOperation() {
  if (!state.store) {
    els.operationTitle.textContent = 'Carregando operação';
    els.operationText.textContent = 'Buscando o status real da loja antes de liberar qualquer acao.';
    els.operationBadge.textContent = 'Carregando';
    els.operationBadge.classList.remove('closed');
    els.operationMetricOrders.textContent = '-';
    els.operationMetricOpen.textContent = '-';
    els.operationMetricStatus.textContent = '-';
    els.startOperationButton.disabled = true;
    els.stopOperationButton.disabled = true;
    return;
  }

  const isOpen = state.store?.is_open !== false;
  const openOrders = state.orders.filter((order) => !['completed', 'cancelled'].includes(order.status)).length;
  const todayOrders = todaysOrders().length;
  els.operationTitle.textContent = isOpen ? 'Loja online e recebendo pedidos' : 'Loja offline';
  els.operationText.textContent = isOpen
    ? 'Clientes podem montar a sacola e enviar pedidos pelo WhatsApp da loja.'
    : 'Clientes ainda podem ver o cardápio, mas novos pedidos estão bloqueados até iniciar a operação.';
  els.operationBadge.textContent = isOpen ? 'Aberta' : 'Fechada';
  els.operationBadge.classList.toggle('closed', !isOpen);
  els.operationMetricOrders.textContent = todayOrders;
  els.operationMetricOpen.textContent = openOrders;
  els.operationMetricStatus.textContent = isOpen ? 'Online' : 'Offline';
  els.startOperationButton.disabled = isOpen;
  els.stopOperationButton.disabled = !isOpen;
}

async function startOperation() {
  const openOrders = state.orders.filter((order) => !['completed', 'cancelled'].includes(order.status)).length;
  const confirmed = confirm(`Iniciar operação agora?\n\nA loja ficará online e a fila atual será zerada. ${openOrders} pedido(s) em aberto serão marcados como concluído e arquivados.`);
  if (!confirmed) return;
  els.startOperationButton.disabled = true;
  try {
    const result = await request('/api/admin/operation/start', { method: 'POST' });
    state.store = result.store || state.store;
    saveAdminCache();
    toast(`Operação iniciada. ${result.queue?.archived || 0} pedido(s) arquivado(s).`);
    await loadSummary({ skipNotifications: true });
    await loadReportPreset(activeReportPreset() || 'today');
  } catch (error) {
    toast(error.message || 'Não foi possível iniciar a operação.');
  } finally {
    renderOperation();
  }
}

async function stopOperation() {
  const confirmed = confirm('Parar operação agora?\n\nA loja ficará offline e não aceitará novos pedidos até você iniciar novamente.');
  if (!confirmed) return;
  els.stopOperationButton.disabled = true;
  try {
    const result = await request('/api/admin/operation/stop', { method: 'POST' });
    state.store = result.store || state.store;
    saveAdminCache();
    toast('Operação parada. Loja offline para novos pedidos.');
    await loadSummary({ skipNotifications: true });
  } catch (error) {
    toast(error.message || 'Não foi possível parar a operação.');
  } finally {
    renderOperation();
  }
}

async function clearOrderQueue() {
  const visibleOrders = state.orders;
  if (visibleOrders.length === 0) {
    toast('Não há pedidos na fila para fechar.');
    return;
  }
  const openOrders = visibleOrders.filter((order) => !['completed', 'cancelled'].includes(order.status));
  const confirmed = confirm(`Fechar a operação agora?\n\n${openOrders.length} pedido(s) em aberto serão marcados como concluído e toda a fila atual sairá do painel operacional. Os pedidos continuam nos relatórios.`);
  if (!confirmed) return;
  const result = await request('/api/admin/orders/clear-queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'close_open' })
  });
  toast(`${result.archived || 0} pedido(s) arquivado(s). ${result.closed || 0} aberto(s) foram concluídos.`);
  await loadSummary({ skipNotifications: true });
  await loadReportPreset(activeReportPreset() || 'today');
}

async function archiveClosedOrders() {
  const closedOrders = state.orders.filter((order) => ['completed', 'cancelled'].includes(order.status));
  if (closedOrders.length === 0) {
    toast('Não há pedidos finalizados para limpar.');
    return;
  }
  const confirmed = confirm(`Limpar ${closedOrders.length} pedido(s) concluído(s) ou cancelado(s) da tela? Eles continuam nos relatórios.`);
  if (!confirmed) return;
  const result = await request('/api/admin/orders/clear-queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'archive_closed' })
  });
  toast(`${result.archived || 0} pedido(s) finalizado(s) removido(s) da fila.`);
  await loadSummary({ skipNotifications: true });
  await loadReportPreset(activeReportPreset() || 'today');
}

async function loadDailyReport() {
  if (!state.admin || !els.reportDate.value) return;
  setReportPresetActive(null);
  const data = await request(`/api/admin/reports/daily?date=${encodeURIComponent(els.reportDate.value)}`);
  renderDailyReport(data.report);
}

async function loadReportPreset(preset = 'today') {
  if (!state.admin) return;
  setReportPresetActive(preset);

  if (preset === 'today') {
    els.reportDate.value = localDateInputValue();
    await loadPresetDailyReport(els.reportDate.value, preset);
    return;
  }

  if (preset === 'yesterday') {
    const date = addDays(new Date(), -1);
    els.reportDate.value = localDateInputValue(date);
    await loadPresetDailyReport(els.reportDate.value, preset);
    return;
  }

  if (preset === 'month') {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const data = await request(`/api/admin/reports/range?start=${encodeURIComponent(localDateInputValue(start))}&end=${encodeURIComponent(localDateInputValue(today))}`);
    renderDailyReport(data.report);
    return;
  }

  const days = Number.parseInt(preset, 10);
  if ([7, 15, 30].includes(days)) {
    const data = await request(`/api/admin/reports/range?days=${days}`);
    renderDailyReport(data.report);
  }
}

async function loadPresetDailyReport(date, preset) {
  const data = await request(`/api/admin/reports/daily?date=${encodeURIComponent(date)}`);
  setReportPresetActive(preset);
  renderDailyReport(data.report);
}

function setReportPresetActive(preset) {
  els.reportPresetButtons.forEach((button) => {
    button.classList.toggle('active', Boolean(preset) && button.dataset.reportPreset === preset);
  });
}

function activeReportPreset() {
  return [...els.reportPresetButtons].find((button) => button.classList.contains('active'))?.dataset.reportPreset || null;
}

function renderDailyReport(report) {
  if (!report) {
    state.currentReport = null;
    els.reportSummary.innerHTML = '<p class="muted">Selecione uma data para ver o relatório.</p>';
    els.reportOrders.innerHTML = '';
    return;
  }

  state.currentReport = report;
  const totals = report.totals || {};
  const comparison = report.comparison || {};
  const closing = report.cash_closing || {};
  const period = report.period || { label: report.date ? `Dia ${formatDateLabel(report.date)}` : 'Período selecionado' };
  els.reportOrdersTitle.textContent = `Pedidos - ${period.label}`;
  els.reportSummary.innerHTML = `
    <article><span>${escapeHtml(period.label)}</span><strong>${money(totals.gross_revenue || 0)}</strong><p>Faturamento sem cancelados</p></article>
    <article><span>Concluído</span><strong>${money(totals.completed_revenue || 0)}</strong><p>${totals.completed_orders || 0} pedido(s)</p></article>
    <article><span>Ticket médio</span><strong>${money(totals.average_ticket || 0)}</strong><p>${totals.billable_orders || 0} pedido(s) válidos</p></article>
    <article><span>Comparativo</span><strong>${formatDeltaMoney(comparison.revenue_delta || 0)}</strong><p>${formatDeltaNumber(comparison.orders_delta || 0)} pedido(s) vs. período anterior</p></article>
    <article><span>Fechamento</span><strong>${money(closing.expected_revenue || 0)}</strong><p>${money(closing.pending_revenue || 0)} ainda pendente</p></article>
  `;

  const statusRows = (report.by_status || []).map((row) => `
    <span><strong>${statusLabel(row.key)}</strong><small>${row.count} - ${money(row.total)}</small></span>
  `).join('');
  const paymentRows = (report.by_payment || []).map((row) => `
    <span><strong>${escapeHtml(row.key)}</strong><small>${row.count} - ${money(row.total)} - ticket ${money(row.average_ticket || 0)}</small></span>
  `).join('');
  const productRows = (report.top_products || []).map((row) => `
    <span><strong>${escapeHtml(row.name)}</strong><small>${row.quantity} un. - ${money(row.total)}</small></span>
  `).join('');

  els.reportOrders.innerHTML = `
    <article class="report-breakdown">
      <div><h3>Por status</h3>${statusRows || '<p class="muted">Sem pedidos.</p>'}</div>
      <div><h3>Por pagamento</h3>${paymentRows || '<p class="muted">Sem faturamento.</p>'}</div>
      <div><h3>Mais vendidos</h3>${productRows || '<p class="muted">Sem itens vendidos.</p>'}</div>
    </article>
    ${(report.orders || []).map(reportOrderCard).join('') || '<p class="muted">Nenhum pedido nesta data.</p>'}
  `;
}

function exportCurrentReportCsv() {
  const report = state.currentReport;
  if (!report) {
    toast('Carregue um relatório antes de exportar.');
    return;
  }
  const rows = [
    ['Período', report.period?.label || 'Período'],
    ['Faturamento', money(report.totals?.gross_revenue || 0)],
    ['Concluído', money(report.totals?.completed_revenue || 0)],
    ['Ticket médio', money(report.totals?.average_ticket || 0)],
    ['Fechamento esperado', money(report.cash_closing?.expected_revenue || 0)],
    ['Fechamento concluído', money(report.cash_closing?.completed_revenue || 0)],
    ['Faturamento pendente', money(report.cash_closing?.pending_revenue || 0)],
    ['Taxas de entrega', money(report.cash_closing?.delivery_fees || 0)],
    ['Comparativo faturamento', formatDeltaMoney(report.comparison?.revenue_delta || 0)],
    ['Comparativo pedidos', formatDeltaNumber(report.comparison?.orders_delta || 0)],
    [],
    ['Por forma de pagamento'],
    ['Forma', 'Pedidos', 'Total', 'Ticket médio']
  ];
  for (const payment of report.by_payment || []) {
    rows.push([
      payment.key || '',
      payment.count || 0,
      money(payment.total),
      money(payment.average_ticket || 0)
    ]);
  }
  rows.push(
    [],
    ['Produtos mais vendidos'],
    ['Produto', 'Quantidade', 'Total']
  );
  for (const product of report.top_products || []) {
    rows.push([
      product.name || '',
      product.quantity || 0,
      money(product.total)
    ]);
  }
  rows.push(
    [],
    ['Pedido', 'Data', 'Cliente', 'Telefone', 'Status', 'Pagamento', 'Total']
  );
  for (const order of report.orders || []) {
    const customer = order.customer_snapshot || {};
    rows.push([
      order.public_code,
      new Date(order.created_at).toLocaleString('pt-BR'),
      customer.name || '',
      customer.phone || '',
      statusLabel(order.status),
      order.payment_method || '',
      money(order.total)
    ]);
  }
  const csv = rows.map((row) => row.map(csvCell).join(';')).join('\r\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const slug = (report.period?.label || 'relatório').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  link.href = url;
  link.download = `${slug || 'relatório'}-pedidos.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function printCurrentReport() {
  const report = state.currentReport;
  if (!report) {
    toast('Carregue um relatório antes de imprimir.');
    return;
  }
  window.print();
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function formatDeltaMoney(value) {
  const number = Number(value || 0);
  const prefix = number > 0 ? '+' : '';
  return `${prefix}${money(number)}`;
}

function formatDeltaNumber(value) {
  const number = Number(value || 0);
  return `${number > 0 ? '+' : ''}${number}`;
}

function reportOrderCard(order) {
  const customer = order.customer_snapshot || {};
  return `
    <article class="list-card report-order-row status-${order.status}">
      <div>
        <strong>#${escapeHtml(order.public_code)} - ${escapeHtml(customer.name || 'Cliente')}</strong>
        <p>${new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} - ${statusLabel(order.status)} - ${escapeHtml(order.payment_method || 'Pagamento não informado')}</p>
      </div>
      <strong>${money(order.total)}</strong>
    </article>
  `;
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
  const payment = order.payment_method ? escapeHtml(order.payment_method) : 'Pagamento não informado';
  const itemCount = (order.items || []).reduce((total, item) => total + Number(item.quantity || 0), 0);
  const createdAt = new Date(order.created_at);
  card.innerHTML = `
    <div class="order-card-top">
      <div>
        <strong>#${escapeHtml(order.public_code)}</strong>
        <p>${escapeHtml(customer.name || 'Cliente')} - ${createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
      </div>
      <span class="order-status-badge">${statusLabel(order.status)}</span>
    </div>
    <div class="order-compact-row">
      <strong>${money(order.total)}</strong>
      <span>${itemCount || 0} ${itemCount === 1 ? 'item' : 'itens'}</span>
    </div>
    <div class="order-compact-tags">
      <span>${fulfillment}</span>
      <span>${payment}</span>
      ${customer.phone ? `<span>${escapeHtml(customer.phone)}</span>` : ''}
    </div>
    <details class="order-details">
      <summary>Ver detalhes</summary>
      <div class="order-details-body">
        <dl>
          <div><dt>Horário</dt><dd>${createdAt.toLocaleString('pt-BR')}</dd></div>
          <div><dt>Telefone</dt><dd>${escapeHtml(customer.phone || 'Sem telefone')}</dd></div>
          <div><dt>Tipo</dt><dd>${fulfillment}</dd></div>
          <div><dt>Pagamento</dt><dd>${payment}</dd></div>
          <div><dt>Subtotal</dt><dd>${money(order.subtotal)}</dd></div>
          <div><dt>Entrega</dt><dd>${money(order.delivery_fee)}</dd></div>
        </dl>
        ${orderAddressHtml(order)}
        ${order.notes ? `<p class="order-note"><strong>Obs.</strong> ${escapeHtml(order.notes)}</p>` : ''}
        <div class="mini-items expanded">${(order.items || []).map(orderItemHtml).join('')}</div>
        <div class="row-actions order-detail-actions">
          <button class="ghost-button compact print-order-button" type="button" data-print-order="${escapeAttribute(order.id)}">${order.status === 'new' ? 'Imprimir etiqueta' : 'Reimprimir etiqueta'}</button>
          <button class="ghost-button compact print-order-button" type="button" data-print-order-copy="${escapeAttribute(order.id)}">Imprimir 2 vias</button>
          <button class="ghost-button compact" type="button" data-whatsapp-status="${escapeAttribute(order.id)}">Avisar cliente</button>
        </div>
      </div>
    </details>
  `;
  card.querySelector('.order-details')?.addEventListener('mousedown', (event) => event.stopPropagation());
  card.querySelector('.order-details')?.addEventListener('touchstart', (event) => event.stopPropagation(), { passive: true });
  card.querySelector('[data-print-order]')?.addEventListener('click', () => printOrderLabel(order));
  card.querySelector('[data-print-order-copy]')?.addEventListener('click', () => printOrderLabel(order, 2));
  card.querySelector('[data-whatsapp-status]')?.addEventListener('click', () => notifyOrderStatus(order));
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

function orderItemHtml(item) {
  const name = escapeHtml(item.item_snapshot?.name || 'Item');
  const modifiers = item.item_snapshot?.modifiers || [];
  const notes = item.notes ? `<small>Obs: ${escapeHtml(item.notes)}</small>` : '';
  return `
    <span>
      <strong>${Number(item.quantity || 0)}x ${name}</strong>
      <small>${money(item.total)}</small>
      ${modifiers.length ? `<small>${modifiers.map(modifierText).map(escapeHtml).join(', ')}</small>` : ''}
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
    <p class="order-address"><strong>Endereço</strong> ${line}${extra ? `<small>${extra}</small>` : ''}</p>
  `;
}

function modifierText(modifier) {
  const delta = Number(modifier.price_delta || 0);
  const group = modifier.group_name ? `${modifier.group_name}: ` : '';
  return `${group}${modifier.name}${delta > 0 ? ` (+ ${money(delta)})` : ''}`;
}

function printOrderLabel(order, copies = 1) {
  const popup = window.open('', '_blank', 'width=420,height=640');
  if (!popup) {
    toast('Permita pop-ups para imprimir a etiqueta.');
    return;
  }

  popup.document.write(orderLabelDocument(order, copies));
  popup.document.close();
  popup.focus();
  popup.setTimeout(() => {
    popup.print();
    popup.setTimeout(() => popup.close(), 500);
  }, 150);
}

function notifyOrderStatus(order) {
  const customer = order.customer_snapshot || {};
  const phone = digits(customer.phone || '');
  if (phone.length < 10) {
    toast('Cliente sem telefone válido para WhatsApp.');
    return;
  }
  const storeName = state.store?.name || 'loja';
  const messages = {
    new: `Recebemos seu pedido #${order.public_code} na ${storeName}. Vamos confirmar em instantes.`,
    accepted: `Seu pedido #${order.public_code} foi aceito pela ${storeName}.`,
    preparing: `Seu pedido #${order.public_code} está em preparo.`,
    ready: `Seu pedido #${order.public_code} está pronto.`,
    out_for_delivery: `Seu pedido #${order.public_code} saiu para entrega.`,
    completed: `Seu pedido #${order.public_code} foi concluído. Obrigado pela preferência!`,
    cancelled: `Seu pedido #${order.public_code} foi cancelado. Fale conosco para mais detalhes.`
  };
  const message = messages[order.status] || `Atualização do pedido #${order.public_code}: ${statusLabel(order.status)}.`;
  window.open(`https://wa.me/55${phone.replace(/^55/, '')}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
}

function orderLabelDocument(order, copies = 1) {
  const customer = order.customer_snapshot || {};
  const address = order.address_snapshot || {};
  const storeName = state.store?.name || 'Cardápio';
  const createdAt = new Date(order.created_at).toLocaleString('pt-BR');
  const addressLines = orderAddressLines(address).map((line) => `<p>${escapeHtml(line)}</p>`).join('');
  const items = (order.items || []).map((item) => {
    const name = item.item_snapshot?.name || 'Item';
    const modifiers = item.item_snapshot?.modifiers || [];
    const notes = item.notes ? `<small>Obs: ${escapeHtml(item.notes)}</small>` : '';
    return `
      <li>
        <strong>${Number(item.quantity || 0)}x ${escapeHtml(name)}</strong>
        <span>${money(item.total)}</span>
        ${modifiers.length ? `<small>${modifiers.map((modifier) => `+ ${escapeHtml(modifierText(modifier))}`).join('<br>')}</small>` : ''}
        ${notes}
      </li>
    `;
  }).join('');

  const labels = Array.from({ length: Math.max(1, Math.min(3, Number(copies) || 1)) }, (_, index) => `
    <main class="label">
      <p class="store">${escapeHtml(storeName)}${copies > 1 ? ` - Via ${index + 1}` : ''}</p>
      <h1>Pedido #${escapeHtml(order.public_code)}</h1>
      <span class="status">${escapeHtml(statusLabel(order.status))}</span>
      <section class="meta">
        <p><strong>Horário:</strong> ${escapeHtml(createdAt)}</p>
        <p><strong>Tipo:</strong> ${order.fulfillment_method === 'pickup' ? 'Retirada' : 'Entrega'}</p>
        <p><strong>Pagamento:</strong> ${escapeHtml(order.payment_method || 'Não informado')}</p>
      </section>
      <section class="box">
        <h2>Cliente</h2>
        <p><strong>${escapeHtml(customer.name || 'Cliente')}</strong></p>
        <p>${escapeHtml(customer.phone || 'Sem telefone')}</p>
      </section>
      ${addressLines ? `<section class="box"><h2>Endereço</h2>${addressLines}</section>` : ''}
      <section class="box">
        <h2>Itens</h2>
        <ul>${items}</ul>
      </section>
      ${order.notes ? `<section class="box"><h2>Obs. do pedido</h2><p>${escapeHtml(order.notes)}</p></section>` : ''}
      <section class="box totals">
        <p><span>Subtotal</span><strong>${money(order.subtotal)}</strong></p>
        <p><span>Entrega</span><strong>${money(order.delivery_fee)}</strong></p>
      </section>
      <div class="total"><span>Total</span><strong>${money(order.total)}</strong></div>
      <p class="cut">corte aqui</p>
    </main>
  `).join('');

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>Pedido #${escapeHtml(order.public_code)}</title>
    <style>
      @page { margin: 4mm; size: 80mm auto; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: #000;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 11px;
      }
      .label {
        width: 100%;
        max-width: 72mm;
        padding: 2mm;
      }
      h1, h2, p { margin: 0; }
      h1 {
        border-bottom: 2px solid #000;
        padding-bottom: 5px;
        font-family: "Courier New", monospace;
        font-size: 21px;
        letter-spacing: 0;
      }
      h2 {
        margin-top: 8px;
        font-size: 12px;
        text-transform: uppercase;
      }
      .store {
        color: #000;
        font-size: 10px;
        font-weight: 700;
        margin-bottom: 4px;
        text-transform: uppercase;
      }
      .meta, .box {
        border-bottom: 1px dashed #000;
        padding: 6px 0;
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
        border-top: 1px dashed #999;
        padding: 6px 0;
      }
      li:first-child { border-top: 0; }
      li strong {
        font-size: 13px;
      }
      li span, li small { color: #000; }
      .total {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        border-top: 2px solid #000;
        margin-top: 8px;
        padding-top: 8px;
        font-size: 18px;
        font-weight: 900;
      }
      .status {
        display: inline-block;
        border: 1px solid #000;
        border-radius: 999px;
        margin-top: 6px;
        padding: 3px 8px;
        font-size: 11px;
        font-weight: 900;
      }
      .totals p {
        display: flex;
        justify-content: space-between;
        gap: 10px;
      }
      .cut {
        border-top: 1px dashed #000;
        margin-top: 10px;
        padding-top: 6px;
        text-align: center;
        font-size: 9px;
      }
      .label + .label {
        break-before: page;
        page-break-before: always;
      }
      @media print {
        .label { max-width: none; }
      }
    </style>
  </head>
  <body>
    ${labels}
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
    address.reference ? `Referência: ${address.reference}` : ''
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
    if (state.autoPrintAccepted && status === 'accepted' && previousStatus !== 'accepted' && order) {
      printOrderLabel({ ...order, status });
    }
    await loadSummary({ skipNotifications: true });
  } catch (error) {
    if (order && previousStatus) {
      order.status = previousStatus;
      renderOrderMetrics();
      renderOrders();
    }
    toast(error.message || 'Não foi possível atualizar o pedido.');
  }
}

function renderCustomers() {
  rememberOpenCustomers();
  if (state.customers.length === 0) {
    els.adminCustomers.innerHTML = '<p class="muted">Nenhum cliente cadastrado.</p>';
    return;
  }
  els.adminCustomers.replaceChildren(...state.customers.map(customerEditor));
}

function rememberOpenCustomers() {
  if (!els.adminCustomers) return;
  els.adminCustomers.querySelectorAll('.customer-list-card').forEach((card) => {
    const customerId = card.dataset.customerId;
    const dropdown = card.querySelector('.customer-dropdown');
    if (!customerId || !dropdown) return;
    if (dropdown.hidden) {
      state.openCustomerIds.delete(customerId);
    } else {
      state.openCustomerIds.add(customerId);
    }
  });
}

function customerEditor(customer) {
  const card = document.createElement('article');
  card.className = 'customer-list-card';
  card.dataset.customerId = customer.id;
  const addresses = customer.addresses || [];
  const defaultAddress = addresses.find((address) => address.is_default) || addresses[0];
  const customerOrders = state.orders.filter((order) => order.customer_id === customer.id);
  const lastSeen = customer.last_login_at
    ? `Último acesso ${new Date(customer.last_login_at).toLocaleDateString('pt-BR')}`
    : `Cadastrado em ${new Date(customer.created_at).toLocaleDateString('pt-BR')}`;
  card.innerHTML = `
    <div class="customer-row-summary">
      <button class="customer-toggle" type="button" aria-expanded="false">
        <div>
          <strong>${escapeHtml(customer.name)}</strong>
          <p>${escapeHtml(customer.phone)} - ${escapeHtml(customer.email || 'Sem e-mail')} - ${lastSeen}</p>
          <small>${defaultAddress ? escapeHtml(formatAddress(defaultAddress)) : 'Sem endereço salvo'}</small>
        </div>
      </button>
      <div class="customer-summary-pills">
        <span class="pill">${addresses.length} endereço${addresses.length === 1 ? '' : 's'}</span>
        <span class="pill">${customerOrders.length} pedido${customerOrders.length === 1 ? '' : 's'} na fila</span>
      </div>
      <div class="row-actions">
        <button class="ghost-button compact" type="button" data-action="edit">Editar</button>
        <button class="danger-button compact" type="button" data-action="delete">Excluir</button>
      </div>
    </div>
    <div class="customer-dropdown" ${state.openCustomerIds.has(customer.id) ? '' : 'hidden'}>
      <form class="customer-main-form">
        <div class="section-actions">
          <h3>Cadastro do cliente</h3>
          <span class="pill">${customerOrders.length} pedido(s) na fila atual</span>
        </div>
      <div class="editor-grid">
        <label>Nome<input name="name" required value="${escapeAttribute(customer.name)}"></label>
        <label>Telefone<input name="phone" required inputmode="tel" value="${escapeAttribute(customer.phone)}"></label>
        <label>E-mail<input name="email" type="email" value="${escapeAttribute(customer.email || '')}"></label>
        <label>Nova senha<input name="password" type="password" minlength="8" placeholder="Opcional"></label>
        <label class="editor-wide">Observações<textarea name="notes">${escapeHtml(customer.notes || '')}</textarea></label>
      </div>
      <div class="row-actions">
        <button class="primary-button compact">Salvar cliente</button>
      </div>
      </form>
      <details class="customer-addresses" ${addresses.length ? '' : 'open'}>
        <summary>
          <span>
            <strong>Endereços do cliente</strong>
            <small>${addresses.length ? `${addresses.length} endereço${addresses.length === 1 ? '' : 's'} salvo${addresses.length === 1 ? '' : 's'}` : 'Nenhum endereço salvo'}</small>
          </span>
          <em>Gerenciar</em>
        </summary>
        <div class="customer-addresses-body">
          <div class="customer-address-list"></div>
          <form class="customer-address-form new-address-form">
            <strong>Novo endereço</strong>
            ${addressFields({ is_default: addresses.length === 0 })}
            <div class="row-actions">
              <button class="ghost-button compact">Adicionar endereço</button>
            </div>
          </form>
        </div>
      </details>
    </div>
  `;

  const dropdown = card.querySelector('.customer-dropdown');
  const toggle = card.querySelector('.customer-toggle');
  toggle.setAttribute('aria-expanded', String(!dropdown.hidden));
  const openDropdown = () => {
    dropdown.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    state.openCustomerIds.add(customer.id);
  };
  toggle.addEventListener('click', () => {
    dropdown.hidden = !dropdown.hidden;
    toggle.setAttribute('aria-expanded', String(!dropdown.hidden));
    if (dropdown.hidden) {
      state.openCustomerIds.delete(customer.id);
    } else {
      state.openCustomerIds.add(customer.id);
    }
  });
  card.querySelector('[data-action="edit"]').addEventListener('click', openDropdown);
  card.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    if (!confirm(`Excluir o cliente "${customer.name}"? Os pedidos antigos continuam no histórico.`)) return;
    await removeAdminCustomer(customer.id);
    toast('Cliente excluído.');
  });

  const mainForm = card.querySelector('.customer-main-form');
  mainForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await updateAdminCustomer(customer.id, customerPayloadFromForm(mainForm));
    toast('Cliente atualizado.');
  });

  const list = card.querySelector('.customer-address-list');
  if (addresses.length === 0) {
    list.innerHTML = '<p class="muted">Nenhum endereço salvo.</p>';
  } else {
    list.replaceChildren(...addresses.map((address) => customerAddressForm(customer.id, address)));
  }

  const newAddressForm = card.querySelector('.new-address-form');
  newAddressForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await createAdminCustomerAddress(customer.id, addressPayloadFromForm(newAddressForm));
    toast('Endereço adicionado.');
  });

  return card;
}

function customerAddressForm(customerId, address) {
  const form = document.createElement('form');
  form.className = 'customer-address-form';
  form.innerHTML = `
    <div class="editor-head">
      <strong>${escapeHtml(address.label || 'Endereço')}</strong>
      <span class="pill">${address.is_default ? 'Principal' : 'Salvo'}</span>
    </div>
    ${addressFields(address)}
    <div class="row-actions">
      <button class="primary-button compact">Salvar endereço</button>
      <button class="danger-button compact" type="button" data-action="delete">Excluir</button>
    </div>
  `;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await updateAdminCustomerAddress(customerId, address.id, addressPayloadFromForm(form));
    toast('Endereço atualizado.');
  });

  form.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    if (!confirm('Excluir este endereço?')) return;
    await deleteAdminCustomerAddress(customerId, address.id);
    toast('Endereço excluído.');
  });

  return form;
}

function addressFields(address = {}) {
  return `
    <div class="editor-grid compact-address-grid">
      <label>Apelido<input name="label" value="${escapeAttribute(address.label || 'Principal')}"></label>
      <label>Rua / Avenida<input name="street" required value="${escapeAttribute(address.street || '')}"></label>
      <label>Número<input name="number" required value="${escapeAttribute(address.number || '')}"></label>
      <label>Bairro<input name="neighborhood" required value="${escapeAttribute(address.neighborhood || '')}"></label>
      <label>Complemento<input name="complement" value="${escapeAttribute(address.complement || '')}"></label>
      <label>Cidade<input name="city" required value="${escapeAttribute(address.city || '')}"></label>
      <label class="editor-wide">Referência<input name="reference" value="${escapeAttribute(address.reference || '')}"></label>
    </div>
    <label class="check"><input name="is_default" type="checkbox" ${address.is_default ? 'checked' : ''}> Endereço principal</label>
  `;
}

function formatAddress(address = {}) {
  return [
    address.label ? `${address.label}:` : '',
    address.street,
    address.number,
    address.neighborhood,
    address.city
  ].filter(Boolean).join(' ');
}

function renderMenu() {
  renderCategoryEditors();
  renderProductEditors();
  renderModifierProductPicker();
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

  els.categoryEditorList.replaceChildren(...state.categories.map((category, index) => categoryEditor(category, index)));
}

function categoryEditor(category, index) {
  const card = document.createElement('article');
  card.className = 'category-list-card';
  card.draggable = true;
  card.dataset.categoryId = category.id;
  card.innerHTML = `
    <div class="category-row-summary">
      <div class="category-reorder" aria-label="Ordenar categoria">
        <button class="icon-button mini-icon" type="button" title="Subir categoria" aria-label="Subir categoria" data-category-move="-1" ${index === 0 ? 'disabled' : ''}>&uarr;</button>
        <button class="icon-button mini-icon" type="button" title="Descer categoria" aria-label="Descer categoria" data-category-move="1" ${index === state.categories.length - 1 ? 'disabled' : ''}>&darr;</button>
      </div>
      <button class="customer-toggle" type="button">
        <div>
          <strong>${escapeHtml(category.name)}</strong>
          <p>${escapeHtml(category.description || 'Sem descrição')}</p>
        </div>
      </button>
      <span class="pill">${category.items?.length || 0} produtos</span>
      <span class="pill ${category.is_active ? 'pill-ok' : 'pill-muted'}">${category.is_active ? 'Visível' : 'Oculta'}</span>
      <div class="row-actions">
        <button class="ghost-button compact" type="button" data-action="edit">Editar</button>
        <button class="ghost-button compact" type="button" data-action="toggle">${category.is_active ? 'Pausar' : 'Ativar'}</button>
        <button class="danger-button compact" type="button" data-action="delete">Excluir</button>
      </div>
    </div>
  `;

  card.querySelector('.customer-toggle').addEventListener('click', () => openEditCategoryDialog(category));
  card.querySelector('[data-action="edit"]').addEventListener('click', () => openEditCategoryDialog(category));
  card.querySelectorAll('[data-category-move]').forEach((button) => {
    button.addEventListener('click', async () => {
      await moveCategory(category.id, Number(button.dataset.categoryMove));
    });
  });

  card.addEventListener('dragstart', (event) => {
    if (event.target.closest('button')) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', category.id);
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    els.categoryEditorList.querySelectorAll('.category-list-card.drag-over').forEach((item) => item.classList.remove('drag-over'));
  });
  card.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (card.classList.contains('dragging')) return;
    els.categoryEditorList.querySelectorAll('.category-list-card.drag-over').forEach((item) => item.classList.remove('drag-over'));
    card.classList.add('drag-over');
  });
  card.addEventListener('dragleave', () => {
    card.classList.remove('drag-over');
  });
  card.addEventListener('drop', async (event) => {
    event.preventDefault();
    card.classList.remove('drag-over');
    const draggedId = event.dataTransfer.getData('text/plain');
    if (!draggedId || draggedId === category.id) return;
    await moveCategoryTo(draggedId, category.id);
  });

  card.querySelector('[data-action="toggle"]').addEventListener('click', async () => {
    await updateCategory(category.id, { is_active: !category.is_active });
    toast(category.is_active ? 'Categoria pausada.' : 'Categoria ativada.');
  });

  card.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    if (!confirm(`Excluir a categoria "${category.name}"? Os produtos dela também serão removidos.`)) return;
    await removeCategory(category.id);
    toast('Categoria excluída.');
  });

  return card;
}

function openNewCategoryDialog() {
  state.editingCategoryId = null;
  els.categoryDialogEyebrow.textContent = 'Nova categoria';
  els.categoryDialogTitle.textContent = 'Adicionar categoria';
  els.saveCategoryButton.textContent = 'Criar categoria';
  els.categoryForm.reset();
  els.categoryForm.dataset.categoryId = '';
  els.categoryForm.dataset.sortOrder = nextCategorySortOrder();
  els.categoryForm.elements.is_active.checked = true;
  showCategoryDialog();
  els.categoryForm.elements.name.focus();
}

function openEditCategoryDialog(category) {
  state.editingCategoryId = category.id;
  els.categoryDialogEyebrow.textContent = 'Editar categoria';
  els.categoryDialogTitle.textContent = category.name;
  els.saveCategoryButton.textContent = 'Salvar categoria';
  els.categoryForm.dataset.categoryId = category.id;
  els.categoryForm.dataset.sortOrder = Number(category.sort_order || 0);
  fillCategoryForm(category);
  showCategoryDialog();
}

function fillCategoryForm(category) {
  setValue(els.categoryForm.elements.name, category.name);
  setValue(els.categoryForm.elements.description, category.description || '');
  els.categoryForm.elements.is_active.checked = category.is_active !== false;
}

function showCategoryDialog() {
  if (!els.categoryDialog.open) els.categoryDialog.showModal();
}

function nextCategorySortOrder() {
  const maxOrder = state.categories.reduce((max, category) => Math.max(max, Number(category.sort_order || 0)), 0);
  return maxOrder + 10;
}

async function moveCategory(categoryId, direction) {
  const categories = orderedCategories();
  const from = categories.findIndex((category) => category.id === categoryId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= categories.length) return;
  const reordered = [...categories];
  const [category] = reordered.splice(from, 1);
  reordered.splice(to, 0, category);
  await saveCategoryOrder(reordered);
}

async function moveCategoryTo(draggedId, targetId) {
  const categories = orderedCategories();
  const from = categories.findIndex((category) => category.id === draggedId);
  const to = categories.findIndex((category) => category.id === targetId);
  if (from < 0 || to < 0 || from === to) return;
  const reordered = [...categories];
  const [category] = reordered.splice(from, 1);
  reordered.splice(to, 0, category);
  await saveCategoryOrder(reordered);
}

function orderedCategories() {
  return [...state.categories].sort((a, b) =>
    Number(a.sort_order || 0) - Number(b.sort_order || 0) || a.name.localeCompare(b.name)
  );
}

async function saveCategoryOrder(categories) {
  state.categories = categories.map((category, index) => ({
    ...category,
    sort_order: (index + 1) * 10
  }));
  renderCategoryEditors();
  await Promise.all(state.categories.map((category) =>
    updateCategory(category.id, { sort_order: category.sort_order }, { reload: false })
  ));
  await loadSummary({ skipNotifications: true });
  toast('Ordem das categorias atualizada.');
}

function renderProductEditors() {
  const products = orderedProducts();

  if (products.length === 0) {
    els.productEditorList.innerHTML = '<p class="muted">Nenhum produto cadastrado.</p>';
    return;
  }

  els.productEditorList.replaceChildren(...products.map((item, index) => productEditor(item, index, products)));
}

function productEditor(item, _index, products) {
  const card = document.createElement('article');
  card.className = 'product-list-card';
  card.draggable = true;
  card.dataset.productId = item.id;
  card.dataset.categoryId = item.category_id;
  const sameCategory = products.filter((product) => product.category_id === item.category_id);
  const categoryIndex = sameCategory.findIndex((product) => product.id === item.id);
  card.innerHTML = `
    <div class="product-row-summary">
      <div class="product-reorder" aria-label="Ordenar produto">
        <button class="icon-button mini-icon" type="button" title="Subir produto" aria-label="Subir produto" data-product-move="-1" ${categoryIndex === 0 ? 'disabled' : ''}>&uarr;</button>
        <button class="icon-button mini-icon" type="button" title="Descer produto" aria-label="Descer produto" data-product-move="1" ${categoryIndex === sameCategory.length - 1 ? 'disabled' : ''}>&darr;</button>
      </div>
      <button class="customer-toggle product-toggle" type="button">
        <div class="product-summary-media">
          ${item.image_url ? `<img src="${escapeAttribute(item.image_url)}" alt="">` : '<div class="thumb-fallback"></div>'}
        </div>
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <p>${escapeHtml(item.categoryName)} - ${money(item.price)}</p>
        </div>
      </button>
      <span class="pill ${item.is_available ? 'pill-ok' : 'pill-muted'}">${item.is_available ? 'Disponível' : 'Pausado'}</span>
      ${item.is_featured ? '<span class="pill">Destaque</span>' : '<span class="pill pill-muted">Normal</span>'}
      <div class="row-actions">
        <button class="ghost-button compact" type="button" data-action="edit">Editar</button>
        <button class="ghost-button compact" type="button" data-action="toggle">${item.is_available ? 'Pausar' : 'Ativar'}</button>
        <button class="danger-button compact" type="button" data-action="delete">Excluir</button>
      </div>
    </div>
  `;

  card.querySelector('.product-toggle').addEventListener('click', () => openEditProductDialog(item));
  card.querySelector('[data-action="edit"]').addEventListener('click', () => openEditProductDialog(item));
  card.querySelectorAll('[data-product-move]').forEach((button) => {
    button.addEventListener('click', async () => {
      await moveProduct(item.id, Number(button.dataset.productMove));
    });
  });

  card.addEventListener('dragstart', (event) => {
    if (event.target.closest('button')) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', item.id);
    event.dataTransfer.setData('application/category-id', item.category_id);
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    els.productEditorList.querySelectorAll('.product-list-card.drag-over').forEach((entry) => entry.classList.remove('drag-over'));
  });
  card.addEventListener('dragover', (event) => {
    const draggedCategoryId = event.dataTransfer.getData('application/category-id');
    if (draggedCategoryId && draggedCategoryId !== item.category_id) return;
    event.preventDefault();
    if (card.classList.contains('dragging')) return;
    els.productEditorList.querySelectorAll('.product-list-card.drag-over').forEach((entry) => entry.classList.remove('drag-over'));
    card.classList.add('drag-over');
  });
  card.addEventListener('dragleave', () => {
    card.classList.remove('drag-over');
  });
  card.addEventListener('drop', async (event) => {
    event.preventDefault();
    card.classList.remove('drag-over');
    const draggedId = event.dataTransfer.getData('text/plain');
    const draggedCategoryId = event.dataTransfer.getData('application/category-id');
    if (!draggedId || draggedId === item.id || draggedCategoryId !== item.category_id) return;
    await moveProductTo(draggedId, item.id);
  });

  card.querySelector('[data-action="toggle"]').addEventListener('click', async () => {
    await updateItem(item.id, { is_available: !item.is_available });
    toast(item.is_available ? 'Produto pausado.' : 'Produto ativado.');
  });

  card.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    if (!confirm(`Excluir o produto "${item.name}"?`)) return;
    await removeItem(item.id);
    toast('Produto excluído.');
  });

  return card;
}

function orderedProducts(categoryId = null) {
  return orderedCategories()
    .filter((category) => !categoryId || category.id === categoryId)
    .flatMap((category) => [...(category.items || [])]
      .sort((a, b) =>
        Number(a.sort_order || 0) - Number(b.sort_order || 0) || a.name.localeCompare(b.name)
      )
      .map((item) => ({
        ...item,
        categoryName: category.name
      })));
}

function nextProductSortOrder(categoryId = null) {
  const selectedCategoryId = categoryId || els.itemCategory?.value || state.categories[0]?.id || null;
  const products = orderedProducts(selectedCategoryId);
  return products.reduce((max, item) => Math.max(max, Number(item.sort_order || 0)), 0) + 10;
}

async function moveProduct(productId, direction) {
  const product = findProduct(productId);
  if (!product) return;
  const products = orderedProducts(product.category_id);
  const from = products.findIndex((item) => item.id === productId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= products.length) return;
  const reordered = [...products];
  const [item] = reordered.splice(from, 1);
  reordered.splice(to, 0, item);
  await saveProductOrder(product.category_id, reordered);
}

async function moveProductTo(draggedId, targetId) {
  const dragged = findProduct(draggedId);
  const target = findProduct(targetId);
  if (!dragged || !target || dragged.category_id !== target.category_id) return;
  const products = orderedProducts(target.category_id);
  const from = products.findIndex((item) => item.id === draggedId);
  const to = products.findIndex((item) => item.id === targetId);
  if (from < 0 || to < 0 || from === to) return;
  const reordered = [...products];
  const [item] = reordered.splice(from, 1);
  reordered.splice(to, 0, item);
  await saveProductOrder(target.category_id, reordered);
}

async function saveProductOrder(categoryId, products) {
  state.categories = state.categories.map((category) => {
    if (category.id !== categoryId) return category;
    return {
      ...category,
      items: products.map((item, index) => ({
        ...item,
        sort_order: (index + 1) * 10
      }))
    };
  });
  renderProductEditors();
  const updated = orderedProducts(categoryId);
  await Promise.all(updated.map((item) =>
    updateItem(item.id, { sort_order: item.sort_order }, { reload: false })
  ));
  await loadSummary({ skipNotifications: true });
  toast('Ordem dos produtos atualizada.');
}

function openNewProductDialog() {
  state.editingProductId = null;
  els.productDialogEyebrow.textContent = 'Cadastro de produto';
  els.productDialogTitle.textContent = 'Adicionar produto';
  els.productFormMainTitle.textContent = 'Cadastro do produto';
  els.productFormMainText.textContent = 'Preencha o mínimo necessário para o item aparecer corretamente no cardápio.';
  els.saveProductButton.textContent = 'Criar produto';
  els.itemForm.reset();
  els.itemForm.dataset.itemId = '';
  renderCategoryOptions();
  els.itemForm.dataset.sortOrder = nextProductSortOrder();
  els.itemForm.elements.is_available.checked = true;
  els.itemForm.elements.is_featured.checked = false;
  state.selectedOptionsProductId = null;
  setProductEditorTab('details');
  els.saveProductButton.hidden = false;
  showProductDialog();
  els.itemForm.elements.name.focus();
}

function openEditProductDialog(item) {
  state.editingProductId = item.id;
  els.productDialogEyebrow.textContent = 'Edicao de produto';
  els.productDialogTitle.textContent = item.name;
  els.productFormMainTitle.textContent = 'Editar dados do produto';
  els.productFormMainText.textContent = 'Atualize as informações que aparecem para o cliente no cardápio.';
  els.saveProductButton.textContent = 'Salvar produto';
  els.itemForm.dataset.itemId = item.id;
  els.itemForm.dataset.sortOrder = Number(item.sort_order || 0);
  renderCategoryOptions();
  fillProductForm(item);
  state.selectedOptionsProductId = item.id;
  setProductEditorTab('details');
  els.saveProductButton.hidden = false;
  showProductDialog();
}

function showProductDialog() {
  if (!els.productDialog.open) els.productDialog.showModal();
}

function fillProductForm(item) {
  setValue(els.itemForm.elements.category_id, item.category_id);
  setValue(els.itemForm.elements.name, item.name);
  setValue(els.itemForm.elements.description, item.description || '');
  setValue(els.itemForm.elements.price, Number(item.price || 0));
  setValue(els.itemForm.elements.image_url, item.image_url || '');
  setValue(els.itemForm.elements.tags, (item.tags || []).join(', '));
  els.itemForm.elements.is_featured.checked = Boolean(item.is_featured);
  els.itemForm.elements.is_available.checked = item.is_available !== false;
  els.itemImageFile.value = '';
}

function renderModifierProductPicker() {
  if (!els.modifierProductSelect) return;
  const products = orderedProducts();
  if (!products.length) {
    els.modifierProductSelect.innerHTML = '<option value="">Cadastre um produto primeiro</option>';
    state.selectedOptionsProductId = null;
    renderProductOptions(null);
    return;
  }

  const selectedId = products.some((item) => item.id === state.selectedOptionsProductId)
    ? state.selectedOptionsProductId
    : products[0].id;
  state.selectedOptionsProductId = selectedId;
  els.modifierProductSelect.replaceChildren(...products.map((item) => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = `${item.name} - ${item.categoryName}`;
    option.selected = item.id === selectedId;
    return option;
  }));
  renderProductOptions(findProduct(selectedId));
}

function renderProductOptions(item = currentOptionsProduct()) {
  if (!els.productOptionsPanel || !els.productOptionsTitle || !els.productOptionsCount || !els.productModifierList) return;
  rememberOpenModifierGroups();
  if (!item) {
    els.productOptionsPanel.hidden = false;
    els.productOptionsTitle.textContent = 'Nenhum produto selecionado';
    els.productOptionsCount.textContent = '0 pergunta(s)';
    els.productModifierList.innerHTML = '<p class="empty-options">Cadastre ou selecione um produto para configurar adicionais.</p>';
    return;
  }
  els.productOptionsPanel.hidden = false;
  els.productOptionsTitle.textContent = item.name;
  els.productOptionsCount.textContent = `${(item.modifier_groups || []).length} pergunta(s)`;
  els.productModifierList.innerHTML = `
    <section class="modifier-preview-card">
      <div>
        <p class="eyebrow">Preview do cliente</p>
        <h3>${escapeHtml(item.name)}</h3>
        <p>${escapeHtml(item.description || 'O cliente verá as perguntas abaixo ao adicionar este produto.')}</p>
      </div>
      <div class="modifier-preview-list">${modifierPreviewHtml(item)}</div>
    </section>
    ${(item.modifier_groups || []).map(modifierGroupEditor).join('')
      || '<p class="empty-options">Nenhuma pergunta cadastrada. Crie uma pergunta como "Quer adicionar algo?" e depois adicione as respostas.</p>'}
  `;
  bindProductOptionEvents(item);
}

function rememberOpenModifierGroups() {
  if (!els.productModifierList) return;
  els.productModifierList.querySelectorAll('.modifier-group-card').forEach((details) => {
    if (!details.dataset.modifierGroupId) return;
    if (details.open) {
      state.openModifierGroupIds.add(details.dataset.modifierGroupId);
    } else {
      state.openModifierGroupIds.delete(details.dataset.modifierGroupId);
    }
  });
}

function applyModifierPreset(preset) {
  if (!els.modifierGroupForm) return;
  const presets = {
    additional: {
      name: 'Quer adicionar algo?',
      min: 0,
      max: 5,
      required: false,
      options: [
        ['Extra bacon', 5],
        ['Queijo extra', 4],
        ['Cheddar', 4]
      ]
    },
    size: {
      name: 'Escolha o tamanho',
      min: 1,
      max: 1,
      required: true,
      options: [
        ['Pequeno', 0],
        ['Medio', 8],
        ['Grande', 14]
      ]
    },
    meat: {
      name: 'Escolha o ponto da carne',
      min: 1,
      max: 1,
      required: true,
      options: [
        ['Mal passado', 0],
        ['Ao ponto', 0],
        ['Bem passado', 0]
      ]
    },
    edge: {
      name: 'Escolha a borda',
      min: 0,
      max: 1,
      required: false,
      options: [
        ['Sem borda', 0],
        ['Borda de catupiry', 6],
        ['Borda de cheddar', 6]
      ]
    },
    remove: {
      name: 'Deseja remover algum ingrediente?',
      min: 0,
      max: 6,
      required: false,
      options: [
        ['Sem cebola', 0],
        ['Sem tomate', 0],
        ['Sem alface', 0],
        ['Sem molho', 0]
      ]
    }
  };
  const selected = presets[preset];
  if (!selected) return;
  state.pendingModifierPresetOptions = selected.options || [];
  els.modifierGroupForm.elements.name.value = selected.name;
  els.modifierGroupForm.elements.min_choices.value = String(selected.min);
  els.modifierGroupForm.elements.max_choices.value = String(selected.max);
  els.modifierGroupForm.elements.is_required.checked = selected.required;
  els.modifierGroupForm.elements.name.focus();
  toast(`Modelo aplicado com ${state.pendingModifierPresetOptions.length} resposta(s).`);
}

function setProductEditorTab(tab) {
  if (!els.productEditorTabs?.length || !els.productEditorPanels?.length) {
    els.saveProductButton.hidden = false;
    return;
  }
  const targetTab = tab === 'options' && !state.selectedOptionsProductId ? 'details' : tab;
  els.productEditorTabs.forEach((button) => {
    const isActive = button.dataset.productEditorTab === targetTab;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });
  els.productEditorPanels.forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.productEditorPanel === targetTab);
  });
  els.saveProductButton.hidden = targetTab === 'options';
}

function setProductOptionsEnabled(enabled) {
  if (!els.productEditorTabs?.length) return;
  els.productEditorTabs.forEach((button) => {
    if (button.dataset.productEditorTab === 'options') {
      button.disabled = !enabled;
      button.title = enabled ? '' : 'Salve o produto antes de configurar adicionais';
    }
  });
}

function bindProductOptionEvents(item) {
  els.productModifierList.querySelectorAll('.modifier-group-card').forEach((details) => {
    details.addEventListener('toggle', () => {
      if (!details.dataset.modifierGroupId) return;
      if (details.open) {
        state.openModifierGroupIds.add(details.dataset.modifierGroupId);
      } else {
        state.openModifierGroupIds.delete(details.dataset.modifierGroupId);
      }
    });
  });

  els.productModifierList.querySelectorAll('[data-modifier-group-form]').forEach((groupForm) => {
    groupForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await withSaving(groupForm, async () => {
        await updateModifierGroup(groupForm.dataset.modifierGroupForm, formToModifierGroup(groupForm));
        await refreshProductOptions(item.id);
        toast('Pergunta atualizada.');
      });
    });
  });

  els.productModifierList.querySelectorAll('[data-delete-modifier-group]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('Excluir esta pergunta e todas as respostas dela?')) return;
      await deleteModifierGroup(button.dataset.deleteModifierGroup);
      state.modifierCreateDrafts.delete(button.dataset.deleteModifierGroup);
      await refreshProductOptions(item.id);
      toast('Pergunta removida.');
    });
  });

  els.productModifierList.querySelectorAll('[data-modifier-create]').forEach((modifierForm) => {
    const groupId = modifierForm.dataset.modifierCreate;
    modifierForm.addEventListener('input', () => rememberModifierCreateDraft(modifierForm));
    modifierForm.addEventListener('change', () => rememberModifierCreateDraft(modifierForm));
    modifierForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const group = (item.modifier_groups || []).find((entry) => entry.id === groupId);
      const payload = formToModifier(modifierForm);
      if (hasDuplicateModifier(group?.modifiers || [], payload.name)) {
        toast('Essa resposta já existe nesta pergunta.');
        return;
      }
      await withSaving(modifierForm, async () => {
        await createModifier(groupId, payload);
        state.modifierCreateDrafts.delete(groupId);
        await refreshProductOptions(item.id);
        toast('Resposta salva.');
      });
    });
  });

  els.productModifierList.querySelectorAll('[data-modifier-form]').forEach((modifierForm) => {
    modifierForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await withSaving(modifierForm, async () => {
        await updateModifier(modifierForm.dataset.modifierForm, formToModifier(modifierForm));
        await refreshProductOptions(item.id);
        toast('Resposta atualizada.');
      });
    });
  });

  els.productModifierList.querySelectorAll('[data-delete-modifier]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('Excluir esta resposta?')) return;
      await deleteModifier(button.dataset.deleteModifier);
      await refreshProductOptions(item.id);
      toast('Resposta removida.');
    });
  });
}

async function submitModifierGroupFromDialog(event) {
  event.preventDefault();
  if (!els.modifierGroupForm) return;
  const item = currentOptionsProduct();
  if (!item) {
    toast('Escolha um produto antes de criar perguntas.');
    return;
  }
  const payload = formToModifierGroup(els.modifierGroupForm);
  if (hasDuplicateModifierGroup(item, payload.name)) {
    toast('Essa pergunta já existe neste produto.');
    return;
  }
  await withSaving(els.modifierGroupForm, async () => {
    const group = await createModifierGroup(item.id, payload);
    if (group?.id) state.openModifierGroupIds.add(group.id);
    if (group?.id && state.pendingModifierPresetOptions.length) {
      await createPresetModifiers(group.id, state.pendingModifierPresetOptions);
    }
    els.modifierGroupForm.reset();
    els.modifierGroupForm.elements.min_choices.value = '0';
    els.modifierGroupForm.elements.max_choices.value = '1';
    state.pendingModifierPresetOptions = [];
    await refreshProductOptions(item.id);
    toast(group?.id ? 'Pergunta criada com respostas iniciais.' : 'Pergunta criada. Agora adicione as respostas dela.');
  });
}

async function refreshProductDialog(itemId = state.editingProductId) {
  await loadSummary();
  const item = findProduct(itemId);
  if (!item) return;
  state.editingProductId = item.id;
  state.selectedOptionsProductId = item.id;
  els.productDialogTitle.textContent = item.name;
  fillProductForm(item);
  renderProductOptions(item);
  setProductOptionsEnabled(true);
}

async function refreshProductOptions(itemId = state.selectedOptionsProductId) {
  await loadSummary();
  if (itemId) state.selectedOptionsProductId = itemId;
  renderModifierProductPicker();
  renderProductOptions(findProduct(state.selectedOptionsProductId));
}

function currentOptionsProduct() {
  return findProduct(state.selectedOptionsProductId);
}

function findProduct(id) {
  return state.categories
    .flatMap((category) => (category.items || []).map((item) => ({ ...item, categoryName: category.name })))
    .find((item) => item.id === id) || null;
}

function findCategory(id) {
  return state.categories.find((category) => category.id === id) || null;
}

function modifierGroupEditor(group) {
  const choicesText = group.is_required
    ? `Obrigatória: cliente escolhe de ${Number(group.min_choices || 1)} a ${Number(group.max_choices || 1)}`
    : `Opcional: cliente pode escolher até ${Number(group.max_choices || 1)}`;
  const modifiers = group.modifiers || [];
  const shouldOpen = state.openModifierGroupIds.has(group.id) || modifiers.length === 0;
  const createDraft = modifierCreateDraft(group.id);
  return `
    <details class="modifier-group-card" data-modifier-group-id="${escapeAttribute(group.id)}" ${shouldOpen ? 'open' : ''}>
      <summary class="modifier-group-summary">
        <span>
          <strong>${escapeHtml(group.name)}</strong>
          <small>${choicesText}</small>
        </span>
        <em>${modifiers.length} resposta${modifiers.length === 1 ? '' : 's'}</em>
      </summary>
      <div class="modifier-group-body">
        <form class="modifier-rule-form" data-modifier-group-form="${escapeAttribute(group.id)}">
          <input name="sort_order" type="hidden" value="${Number(group.sort_order || 0)}">
          <label>Pergunta<input name="name" required value="${escapeAttribute(group.name)}"></label>
          <label>Mínimo<input name="min_choices" type="number" min="0" value="${Number(group.min_choices || 0)}"></label>
          <label>Máximo<input name="max_choices" type="number" min="1" value="${Number(group.max_choices || 1)}"></label>
          <label class="check inline-check"><input name="is_required" type="checkbox" ${group.is_required ? 'checked' : ''}> Obrigatória</label>
          <button class="ghost-button compact">Salvar pergunta</button>
          <button class="danger-button compact" type="button" data-delete-modifier-group="${escapeAttribute(group.id)}">Excluir</button>
        </form>
        <div class="modifier-options-head">
          <strong>Respostas do cliente</strong>
          <span>${modifiers.length} resposta${modifiers.length === 1 ? '' : 's'}</span>
        </div>
        <div class="modifier-list">${modifiers.map(modifierEditor).join('') || '<p class="empty-options">Nenhuma resposta ainda. Adicione exemplos como "Extra bacon", "Grande" ou "Sem cebola".</p>'}</div>
        <form class="modifier-option-create" data-modifier-create="${escapeAttribute(group.id)}">
          <input name="sort_order" type="hidden" value="0">
          <label>Resposta para o cliente<input name="name" required placeholder="Ex: Extra bacon" value="${escapeAttribute(createDraft.name)}"></label>
          <label>Valor extra<input name="price_delta" type="number" min="0" step="0.01" value="${escapeAttribute(createDraft.price_delta)}"></label>
          <label class="check inline-check"><input name="is_available" type="checkbox" ${createDraft.is_available ? 'checked' : ''}> Ativa</label>
          <button class="primary-button compact">Adicionar resposta</button>
        </form>
      </div>
    </details>
  `;
}

function modifierPreviewHtml(item) {
  const groups = item.modifier_groups || [];
  if (!groups.length) {
    return '<p class="empty-options">Sem perguntas ainda. Use os modelos para criar tamanho, ponto, borda ou adicionais pagos.</p>';
  }
  return groups.map((group) => {
    const required = group.is_required || Number(group.min_choices || 0) > 0;
    const options = group.modifiers || [];
    return `
      <article>
        <strong>${escapeHtml(group.name)}${required ? ' *' : ''}</strong>
        <small>${modifierRuleText(group)}</small>
        <div>
          ${options.slice(0, 5).map((modifier) => `
            <span>${escapeHtml(modifier.name)}${Number(modifier.price_delta || 0) > 0 ? ` + ${money(modifier.price_delta)}` : ''}</span>
          `).join('') || '<em>Nenhuma resposta cadastrada</em>'}
        </div>
      </article>
    `;
  }).join('');
}

function modifierRuleText(group) {
  const min = Number(group.min_choices || 0);
  const max = Number(group.max_choices || 1);
  if (group.is_required || min > 0) {
    return max === 1 ? 'Obrigatório: cliente escolhe 1 resposta.' : `Obrigatório: cliente escolhe de ${Math.max(1, min)} a ${max}.`;
  }
  return max === 1 ? 'Opcional: cliente pode escolher 1 resposta.' : `Opcional: cliente pode escolher até ${max}.`;
}

function modifierCreateDraft(groupId) {
  return state.modifierCreateDrafts.get(groupId) || {
    name: '',
    price_delta: '0',
    is_available: true
  };
}

function rememberModifierCreateDraft(form) {
  const groupId = form.dataset.modifierCreate;
  if (!groupId) return;
  const data = new FormData(form);
  state.modifierCreateDrafts.set(groupId, {
    name: String(data.get('name') || ''),
    price_delta: String(data.get('price_delta') || '0'),
    is_available: data.get('is_available') === 'on'
  });
}

function modifierEditor(modifier) {
  return `
    <form class="modifier-row" data-modifier-form="${escapeAttribute(modifier.id)}">
      <input name="sort_order" type="hidden" value="${Number(modifier.sort_order || 0)}">
      <label>Resposta<input name="name" required value="${escapeAttribute(modifier.name)}" aria-label="Nome da resposta"></label>
      <label>Valor extra<input name="price_delta" type="number" min="0" step="0.01" value="${Number(modifier.price_delta || 0)}" aria-label="Valor extra"></label>
      <label class="check inline-check"><input name="is_available" type="checkbox" ${modifier.is_available ? 'checked' : ''}> Ativo</label>
      <button class="ghost-button compact">Salvar</button>
      <button class="danger-button compact" type="button" data-delete-modifier="${escapeAttribute(modifier.id)}">Excluir</button>
    </form>
  `;
}

async function submitCategory(event) {
  event.preventDefault();
  const categoryId = els.categoryForm.dataset.categoryId;
  await withSaving(els.categoryForm, async () => {
    if (categoryId) {
      await updateCategory(categoryId, formToCategory(els.categoryForm));
      const category = findCategory(categoryId);
      if (category) {
        els.categoryDialogTitle.textContent = category.name;
        fillCategoryForm(category);
      }
      toast('Categoria atualizada.');
      return;
    }

    await request('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formToCategory(els.categoryForm))
    });
    els.categoryForm.reset();
    els.categoryForm.elements.is_active.checked = true;
    await loadSummary();
    toast('Categoria criada.');
  });
}

async function submitItem(event) {
  event.preventDefault();
  const payload = formToItem(els.itemForm);
  const file = els.itemImageFile.files[0];
  if (file) {
    const uploaded = await uploadImage(file);
    payload.image_url = uploaded.url;
  }
  const itemId = els.itemForm.dataset.itemId;
  await withSaving(els.itemForm, async () => {
    if (itemId) {
      await updateItem(itemId, payload);
      await refreshProductDialog(itemId);
      toast('Produto atualizado.');
      return;
    }

    const created = await request('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    await loadSummary();
    const item = Array.isArray(created) ? created[0] : created?.[0];
    toast('Produto criado.');
    if (item?.id) openEditProductDialog(findProduct(item.id) || item);
  });
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

async function updateCategory(id, payload, options = {}) {
  await request(`/api/categories/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (options.reload !== false) await loadSummary();
}

async function updateItem(id, payload, options = {}) {
  await request(`/api/items/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (options.reload !== false) await loadSummary();
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
  state.openCustomerIds.delete(String(id));
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

async function createModifierGroup(itemId, payload) {
  const result = await request(`/api/items/${itemId}/modifier-groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return Array.isArray(result) ? result[0] : result;
}

async function updateModifierGroup(groupId, payload) {
  await request(`/api/modifier-groups/${groupId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  await loadSummary();
}

async function deleteModifierGroup(groupId) {
  await request(`/api/modifier-groups/${groupId}`, { method: 'DELETE' });
  await loadSummary();
}

async function createModifier(groupId, payload) {
  await request(`/api/modifier-groups/${groupId}/modifiers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  await loadSummary();
}

async function createPresetModifiers(groupId, options) {
  await Promise.all(options.map(([name, price], index) =>
    request(`/api/modifier-groups/${groupId}/modifiers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        price_delta: price,
        sort_order: (index + 1) * 10,
        is_available: true
      })
    })
  ));
}

async function updateModifier(modifierId, payload) {
  await request(`/api/modifiers/${modifierId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  await loadSummary();
}

async function deleteModifier(modifierId) {
  await request(`/api/modifiers/${modifierId}`, { method: 'DELETE' });
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
  els.adminAuthLoading.hidden = true;
  els.adminSidebar.hidden = true;
  els.adminShell.hidden = true;
  els.adminLayout.classList.add('auth-only');
  stopOrderPolling();
}

function showAdminLoading() {
  els.authScreen.hidden = false;
  els.adminAuthLoading.hidden = false;
  els.setupCard.hidden = true;
  els.loginCard.hidden = true;
  els.adminSidebar.hidden = true;
  els.adminShell.hidden = true;
  els.adminLayout.classList.add('auth-only');
}

function showPanel() {
  els.authScreen.hidden = true;
  els.adminAuthLoading.hidden = true;
  els.adminSidebar.hidden = false;
  els.adminShell.hidden = false;
  els.adminLayout.classList.remove('auth-only');
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
    operation: 'Operação',
    orders: 'Pedidos',
    menu: 'Cardápio',
    reports: 'Relatórios',
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

function toggleKitchenMode() {
  state.kitchenMode = !state.kitchenMode;
  localStorage.setItem('adminKitchenMode', String(state.kitchenMode));
  renderKitchenModeButton();
}

function renderKitchenModeButton() {
  document.body.classList.toggle('kitchen-mode', state.kitchenMode);
  if (!els.kitchenModeButton) return;
  els.kitchenModeButton.textContent = state.kitchenMode ? 'Cozinha ativa' : 'Modo cozinha';
  els.kitchenModeButton.classList.toggle('sound-enabled', state.kitchenMode);
}

function toggleAutoPrint() {
  state.autoPrintAccepted = !state.autoPrintAccepted;
  localStorage.setItem('adminAutoPrintAccepted', String(state.autoPrintAccepted));
  renderAutoPrintButton();
}

function renderAutoPrintButton() {
  if (!els.autoPrintButton) return;
  els.autoPrintButton.textContent = state.autoPrintAccepted ? 'Auto impressão ativa' : 'Auto imprimir';
  els.autoPrintButton.classList.toggle('sound-enabled', state.autoPrintAccepted);
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
    sort_order: form.dataset.sortOrder || nextCategorySortOrder(),
    is_active: data.get('is_active') === 'on'
  };
}

function formToItem(form) {
  const data = new FormData(form);
  const selectedCategoryId = data.get('category_id');
  const current = form.dataset.itemId ? findProduct(form.dataset.itemId) : null;
  const sortOrder = current && current.category_id === selectedCategoryId
    ? (form.dataset.sortOrder || current.sort_order || 0)
    : nextProductSortOrder(selectedCategoryId);
  return {
    category_id: selectedCategoryId,
    name: data.get('name'),
    description: data.get('description'),
    price: data.get('price'),
    image_url: data.get('image_url'),
    tags: String(data.get('tags') || '').split(',').map((tag) => tag.trim()).filter(Boolean),
    sort_order: sortOrder,
    is_featured: data.get('is_featured') === 'on',
    is_available: data.get('is_available') === 'on'
  };
}

function formToModifierGroup(form) {
  const data = new FormData(form);
  return {
    name: data.get('name'),
    min_choices: data.get('min_choices'),
    max_choices: data.get('max_choices'),
    sort_order: data.get('sort_order') || 0,
    is_required: data.get('is_required') === 'on'
  };
}

function formToModifier(form) {
  const data = new FormData(form);
  return {
    name: data.get('name'),
    price_delta: data.get('price_delta'),
    sort_order: data.get('sort_order') || 0,
    is_available: data.get('is_available') === 'on'
  };
}

async function withSaving(form, action) {
  const externalButtons = form.id ? [...document.querySelectorAll(`button[form="${form.id}"]`)] : [];
  const buttons = [...form.querySelectorAll('button'), ...externalButtons];
  const submitButton = buttons.find((button) => button.type !== 'button') || buttons[0];
  const originalText = submitButton?.textContent;
  buttons.forEach((button) => {
    button.disabled = true;
  });
  if (submitButton) submitButton.textContent = 'Salvando...';
  try {
    await action();
  } catch (error) {
    toast(error.message || 'Não foi possível salvar.');
  } finally {
    buttons.forEach((button) => {
      button.disabled = false;
    });
    if (submitButton) submitButton.textContent = originalText;
  }
}

function hasDuplicateModifierGroup(item, name) {
  const normalized = normalizeName(name);
  return (item.modifier_groups || []).some((group) => normalizeName(group.name) === normalized);
}

function hasDuplicateModifier(modifiers, name) {
  const normalized = normalizeName(name);
  return modifiers.some((modifier) => normalizeName(modifier.name) === normalized);
}

function normalizeName(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
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

function localDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date, amount) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function formatDateLabel(value) {
  if (!value) return '';
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR');
}

function saveAdminCache() {
  try {
    localStorage.setItem(ADMIN_CACHE_KEY, JSON.stringify({
      admin: state.admin,
      store: state.store ? {
        id: state.store.id,
        name: state.store.name,
        is_open: state.store.is_open,
        updated_at: state.store.updated_at
      } : null,
      saved_at: new Date().toISOString()
    }));
  } catch {
    // Cache local e apenas conveniencia visual.
  }
}

function loadAdminCache() {
  try {
    return JSON.parse(localStorage.getItem(ADMIN_CACHE_KEY) || 'null');
  } catch {
    return null;
  }
}

function clearAdminCache() {
  localStorage.removeItem(ADMIN_CACHE_KEY);
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
    completed: 'Concluído',
    cancelled: 'Cancelado'
  })[status] || status;
}

function toast(message) {
  const openDialog = document.querySelector('dialog[open]');
  const host = openDialog || document.body;
  if (els.toast.parentElement !== host) host.appendChild(els.toast);
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



