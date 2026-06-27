const state = {
  admin: null,
  store: null,
  categories: [],
  orders: [],
  customers: [],
  promotions: [],
  adminUsers: [],
  diningTables: [],
  customerTabs: [],
  knownOrderIds: new Set(),
  initialOrdersLoaded: false,
  orderPollTimer: null,
  soundEnabled: localStorage.getItem('adminSoundEnabled') === 'true',
  kitchenMode: localStorage.getItem('adminKitchenMode') === 'true',
  autoPrintAccepted: localStorage.getItem('adminAutoPrintAccepted') === 'true',
  autoPrintedKitchenIds: new Set(JSON.parse(localStorage.getItem('adminAutoPrintedKitchenIds') || '[]')),
  orderOriginFilter: 'all',
  audioContext: null,
  storeFormDirty: false,
  editingCategoryId: null,
  editingProductId: null,
  editingPromotionId: null,
  selectedOptionsProductId: null,
  pendingModifierPresetOptions: [],
  openModifierGroupIds: new Set(),
  openCustomerIds: new Set(),
  openOrderDetailIds: new Set(),
  openTabMenuIds: new Set(),
  selectedTableId: null,
  modifierCreateDrafts: new Map(),
  currentReport: null,
  draggedOrderId: null,
  updatingOrderIds: new Set(),
  onboardingStep: 0,
  onboardingCategoryId: null,
  activeAdminTab: 'operation'
};

const ADMIN_CACHE_KEY = 'admin_profile_cache_v1';
const ONBOARDING_COMPLETED_KEY = 'admin_onboarding_completed_v1';
const THEME_DEFAULTS = {
  primaryColor: '#f97316',
  secondaryColor: '#111827',
  backgroundColor: '#fff7ed',
  buttonColor: '#f97316',
  buttonTextColor: '#ffffff',
  selectionColor: '#ffedd5',
  selectionTextColor: '#9a3412'
};
const THEME_PRESETS = {
  classic: {
    primaryColor: '#d71920',
    secondaryColor: '#18181b',
    backgroundColor: '#f5f5f4',
    buttonColor: '#d71920',
    buttonTextColor: '#ffffff',
    selectionColor: '#d71920',
    selectionTextColor: '#ffffff'
  },
  burger: {
    primaryColor: '#f97316',
    secondaryColor: '#111827',
    backgroundColor: '#fff7ed',
    buttonColor: '#ea580c',
    buttonTextColor: '#ffffff',
    selectionColor: '#ea580c',
    selectionTextColor: '#ffffff'
  },
  fresh: {
    primaryColor: '#64748b',
    secondaryColor: '#0f172a',
    backgroundColor: '#f8fafc',
    buttonColor: '#334155',
    buttonTextColor: '#ffffff',
    selectionColor: '#334155',
    selectionTextColor: '#ffffff'
  },
  premium: {
    primaryColor: '#f59e0b',
    secondaryColor: '#111827',
    backgroundColor: '#fafaf9',
    buttonColor: '#111827',
    buttonTextColor: '#fef3c7',
    selectionColor: '#92400e',
    selectionTextColor: '#ffffff'
  },
  modern: {
    primaryColor: '#2563eb',
    secondaryColor: '#172554',
    backgroundColor: '#eff6ff',
    buttonColor: '#2563eb',
    buttonTextColor: '#ffffff',
    selectionColor: '#2563eb',
    selectionTextColor: '#ffffff'
  }
};
const businessDayLabels = [
  ['monday', '18:00', '23:00'],
  ['tuesday', '18:00', '23:00'],
  ['wednesday', '18:00', '23:00'],
  ['thursday', '18:00', '23:00'],
  ['friday', '18:00', '23:30'],
  ['saturday', '18:00', '23:30'],
  ['sunday', '18:00', '23:00']
];

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
  onboardingPanel: document.querySelector('#onboardingPanel'),
  onboardingStepText: document.querySelector('#onboardingStepText'),
  onboardingProgressBar: document.querySelector('#onboardingProgressBar'),
  onboardingBackButton: document.querySelector('#onboardingBackButton'),
  onboardingNextButton: document.querySelector('#onboardingNextButton'),
  onboardingProductCategory: document.querySelector('#onboardingProductCategory'),
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
  orderOriginFilter: document.querySelector('#orderOriginFilter'),
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
  refreshTablesButton: document.querySelector('#refreshTablesButton'),
  tableForm: document.querySelector('#tableForm'),
  tabForm: document.querySelector('#tabForm'),
  tabTableSelect: document.querySelector('#tabTableSelect'),
  tablesBoard: document.querySelector('#tablesBoard'),
  tableManagerDialog: document.querySelector('#tableManagerDialog'),
  tableManagerTitle: document.querySelector('#tableManagerTitle'),
  tableManagerSubtitle: document.querySelector('#tableManagerSubtitle'),
  tableManagerBody: document.querySelector('#tableManagerBody'),
  tableManagerCloseButton: document.querySelector('#tableManagerCloseButton'),
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
  printSettingsForm: document.querySelector('#printSettingsForm'),
  testIntegrationsButton: document.querySelector('#testIntegrationsButton'),
  integrationStatusText: document.querySelector('#integrationStatusText'),
  themePreview: document.querySelector('#themePreview'),
  accountForm: document.querySelector('#accountForm'),
  passwordForm: document.querySelector('#passwordForm'),
  adminUserForm: document.querySelector('#adminUserForm'),
  adminUsersList: document.querySelector('#adminUsersList'),
  adminUsersPanel: document.querySelector('#adminUsersPanel'),
  promotionForm: document.querySelector('#promotionForm'),
  promotionList: document.querySelector('#promotionList'),
  promotionFormTitle: document.querySelector('#promotionFormTitle'),
  promotionFormPlaceholder: document.querySelector('#promotionFormPlaceholder'),
  savePromotionButton: document.querySelector('#savePromotionButton'),
  cancelPromotionEditButton: document.querySelector('#cancelPromotionEditButton'),
  openPromotionFormButton: document.querySelector('#openPromotionFormButton'),
  openLoyaltyFormButton: document.querySelector('#openLoyaltyFormButton'),
  closeLoyaltyFormButton: document.querySelector('#closeLoyaltyFormButton'),
  promotionCategories: document.querySelector('#promotionCategories'),
  promotionComboItems: document.querySelector('#promotionComboItems'),
  loyaltyForm: document.querySelector('#loyaltyForm'),
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
els.logoutButton?.addEventListener('click', logout);
els.adminHeaderLogoutButton.addEventListener('click', logout);
els.onboardingBackButton?.addEventListener('click', previousOnboardingStep);
els.onboardingNextButton?.addEventListener('click', nextOnboardingStep);
els.startOperationButton?.addEventListener('click', startOperation);
els.stopOperationButton?.addEventListener('click', stopOperation);
els.refreshAdminButton.addEventListener('click', () => loadSummary());
els.adminOrders.addEventListener('dragover', handleOrderBoardDragOver);
els.adminOrders.addEventListener('dragleave', handleOrderBoardDragLeave);
els.adminOrders.addEventListener('drop', handleOrderBoardDrop);
els.orderOriginFilter?.addEventListener('change', () => {
  state.orderOriginFilter = els.orderOriginFilter.value || 'all';
  renderOrders();
});
els.refreshCategoriesButton.addEventListener('click', () => loadSummary());
els.refreshProductsButton.addEventListener('click', () => loadSummary());
els.refreshModifiersButton?.addEventListener('click', () => loadSummary());
els.newCategoryButton.addEventListener('click', openNewCategoryDialog);
els.clearQueueButton.addEventListener('click', clearOrderQueue);
els.archiveClosedOrdersButton?.addEventListener('click', archiveClosedOrders);
els.loadReportButton.addEventListener('click', loadDailyReport);
els.exportReportCsvButton?.addEventListener('click', exportCurrentReportCsv);
els.printReportButton?.addEventListener('click', printCurrentReport);
els.refreshTablesButton?.addEventListener('click', () => loadSummary());
els.tableForm?.addEventListener('submit', submitTable);
els.tabForm?.addEventListener('submit', submitTab);
els.tableManagerCloseButton?.addEventListener('click', () => closeTableManager());
els.tableManagerDialog?.addEventListener('close', () => {
  state.selectedTableId = null;
});
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
  renderThemePreview();
});
els.storeForm.addEventListener('change', () => {
  state.storeFormDirty = true;
  renderThemePreview();
});
els.storeForm.addEventListener('click', (event) => {
  const button = event.target.closest('[data-theme-preset]');
  if (!button) return;
  applyThemePreset(button.dataset.themePreset);
});
els.testIntegrationsButton?.addEventListener('click', testIntegrations);
els.accountForm.addEventListener('submit', submitAccount);
els.passwordForm.addEventListener('submit', submitPassword);
els.adminUserForm?.addEventListener('submit', submitAdminUser);
els.promotionForm?.addEventListener('submit', submitPromotion);
els.cancelPromotionEditButton?.addEventListener('click', resetPromotionForm);
els.openPromotionFormButton?.addEventListener('click', () => {
  resetPromotionForm({ keepOpen: true });
  showPromotionForm();
});
els.openLoyaltyFormButton?.addEventListener('click', showLoyaltyForm);
els.closeLoyaltyFormButton?.addEventListener('click', hideLoyaltyForm);
els.loyaltyForm?.addEventListener('submit', submitLoyalty);

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
    if (hasPermission('reports')) await loadReportPreset('today');
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
  state.promotions = data.promotions || [];
  state.adminUsers = data.admins || [];
  state.diningTables = data.dining_tables || [];
  state.customerTabs = data.customer_tabs || [];
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
  renderPromotions();
  renderTables();
  renderTableManager();
  renderPromotionOptions();
  renderMenu();
  renderCategoryOptions();
  renderPermissionedNavigation();
  renderAdminUsers();
  fillStoreForm();
  fillPrintSettingsForm();
  fillLoyaltyForm();
  fillAccountForm();
  renderOnboarding();
  renderSoundButton();
}

function renderOrderMetrics() {
  els.metricOrders.textContent = todaysOrders().length;
  els.metricOpen.textContent = state.orders.filter((order) => !['completed', 'cancelled'].includes(order.status)).length;
  els.metricCustomers.textContent = state.customers.length;
}

function renderTables() {
  if (!els.tablesBoard) return;
  rememberOpenTabMenus();
  const sortedTables = [...state.diningTables].sort((a, b) =>
    Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name, 'pt-BR')
  );
  if (els.tabTableSelect) {
    els.tabTableSelect.replaceChildren(
      optionElement('', 'Sem mesa'),
      ...sortedTables.map((table) => optionElement(table.id, table.is_active ? table.name : `${table.name} (inativa)`))
    );
  }
  if (!state.diningTables.length && !state.customerTabs.length) {
    els.tablesBoard.innerHTML = '<p class="empty-state">Nenhuma mesa cadastrada ainda.</p>';
    return;
  }
  const tableCards = sortedTables.map((table) => {
    const openTabs = (table.open_tabs?.length ? table.open_tabs : state.customerTabs.filter((tab) => tab.status === 'open' && tab.dining_table_id === table.id));
    const openTotal = openTabs.reduce((sum, tab) => sum + Number(tab.current_total || 0), 0);
    const activeText = table.is_active ? (openTabs.length ? `${openTabs.length} comanda(s)` : 'Livre') : 'Inativa';
    return `
      <article class="table-card ${table.is_active ? '' : 'muted-card'}">
        <div class="table-card-head">
          <div>
            <strong>${escapeHtml(table.name)}</strong>
            <small>${activeText}</small>
          </div>
          <span class="pill ${openTabs.length ? 'pill-warn' : table.is_active ? 'pill-ok' : 'pill-muted'}">${openTabs.length ? 'Ocupada' : table.is_active ? 'Livre' : 'Inativa'}</span>
        </div>
        <div class="table-card-summary">
          <span><small>Comandas</small><strong>${openTabs.length}</strong></span>
          <span><small>Total aberto</small><strong>${money(openTotal)}</strong></span>
        </div>
        <div class="row-actions table-card-actions">
          <button class="primary-button compact" type="button" data-manage-table="${escapeAttribute(table.id)}">Gerenciar mesa</button>
        </div>
      </article>
    `;
  }).join('');
  const looseTabs = state.customerTabs
    .filter((tab) => tab.status === 'open' && !tab.dining_table_id)
    .map((tab) => `
      <article class="table-card">
        <div class="table-card-head"><strong>${escapeHtml(tab.name)}</strong><span class="pill pill-warn">Comanda sem mesa</span></div>
        <p>${escapeHtml(tab.customer_name || 'Cliente não informado')} - ${money(tab.current_total || 0)}</p>
        <div class="row-actions"><button class="primary-button compact" type="button" data-close-tab="${escapeAttribute(tab.id)}">Fechar comanda</button></div>
      </article>
    `).join('');
  els.tablesBoard.innerHTML = tableCards + looseTabs;
  bindTableManagementActions(els.tablesBoard);
}

function bindTableManagementActions(root) {
  if (!root) return;
  root.querySelectorAll('[data-manage-table]').forEach((button) => {
    button.addEventListener('click', () => openTableManager(button.dataset.manageTable));
  });
  root.querySelectorAll('[data-copy-table-qr]').forEach((button) => {
    button.addEventListener('click', async () => {
      await navigator.clipboard?.writeText(button.dataset.copyTableQr);
      toast('Link/QR da mesa copiado.');
    });
  });
  root.querySelectorAll('[data-toggle-table]').forEach((button) => {
    button.addEventListener('click', async () => {
      const table = state.diningTables.find((entry) => entry.id === button.dataset.toggleTable);
      await updateDiningTable(table.id, { is_active: !table.is_active });
    });
  });
  root.querySelectorAll('[data-delete-table]').forEach((button) => {
    button.addEventListener('click', async () => {
      const table = state.diningTables.find((entry) => entry.id === button.dataset.deleteTable);
      if (!table) return;
      const openTabs = table.open_tabs?.length ? table.open_tabs : state.customerTabs.filter((tab) => tab.status === 'open' && tab.dining_table_id === table.id);
      if (openTabs.length) {
        toast('Feche ou transfira as comandas antes de excluir esta mesa.');
        return;
      }
      if (!window.confirm(`Excluir ${table.name}? Esta ação não pode ser desfeita.`)) return;
      await deleteDiningTable(table.id);
    });
  });
  root.querySelectorAll('[data-print-table-qr]').forEach((button) => {
    button.addEventListener('click', () => {
      const table = state.diningTables.find((entry) => entry.id === button.dataset.printTableQr);
      if (table) printTableQr(table);
    });
  });
  root.querySelectorAll('[data-view-table-qr]').forEach((button) => {
    button.addEventListener('click', () => {
      const table = state.diningTables.find((entry) => entry.id === button.dataset.viewTableQr);
      if (table) printTableQr(table, { autoPrint: false });
    });
  });
  root.querySelectorAll('[data-open-tab]').forEach((button) => {
    button.addEventListener('click', async () => {
      await createCustomerTab({ name: `Comanda ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, dining_table_id: button.dataset.openTab });
    });
  });
  root.querySelectorAll('[data-close-tab]').forEach((button) => {
    button.addEventListener('click', async () => {
      await closeCustomerTab(button.dataset.closeTab, { payment_method: 'Pagamento no fechamento' });
    });
  });
  root.querySelectorAll('[data-transfer-tab]').forEach((button) => {
    button.addEventListener('click', async () => {
      const select = root.querySelector(`[data-transfer-select="${CSS.escape(button.dataset.transferTab)}"]`);
      if (!select?.value) {
        toast('Selecione uma mesa de destino ativa.');
        return;
      }
      await transferCustomerTab(button.dataset.transferTab, { dining_table_id: select.value });
    });
  });
  root.querySelectorAll('[data-add-tab-item]').forEach((button) => {
    button.addEventListener('click', async () => {
      const row = button.closest('.tab-menu-item');
      const quantity = Number.parseInt(row?.querySelector('[data-tab-item-qty]')?.value, 10) || 1;
      button.disabled = true;
      try {
        await addItemToCustomerTab(button.dataset.addTabItem, {
          item_id: button.dataset.itemId,
          quantity
        });
      } catch (error) {
        toast(error.message || 'Não foi possível adicionar o item.');
      } finally {
        button.disabled = false;
      }
    });
  });
  root.querySelectorAll('.tab-menu-picker').forEach((details) => {
    details.addEventListener('toggle', () => {
      const id = details.dataset.tabMenuId;
      if (!id) return;
      if (details.open) state.openTabMenuIds.add(id);
      else state.openTabMenuIds.delete(id);
    });
  });
}

function openTableManager(tableId) {
  state.selectedTableId = tableId;
  renderTableManager();
  els.tableManagerDialog?.showModal();
}

function closeTableManager() {
  state.selectedTableId = null;
  els.tableManagerDialog?.close();
}

function renderTableManager() {
  if (!els.tableManagerDialog || !els.tableManagerBody) return;
  if (!els.tableManagerDialog.open && !state.selectedTableId) return;
  const table = state.diningTables.find((entry) => entry.id === state.selectedTableId);
  if (!table) {
    if (els.tableManagerDialog.open) closeTableManager();
    return;
  }
  const sortedTables = [...state.diningTables].sort((a, b) =>
    Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name, 'pt-BR')
  );
  const openTabs = openTabsForTable(table);
  const tableOrders = ordersForTable(table.id);
  const qrUrl = tableQrUrl(table);
  els.tableManagerTitle.textContent = table.name;
  els.tableManagerSubtitle.textContent = `${table.is_active ? 'Mesa ativa' : 'Mesa inativa'} - ${openTabs.length ? `${openTabs.length} comanda(s) aberta(s)` : 'sem comanda aberta'}`;
  els.tableManagerBody.innerHTML = `
    <section class="table-manager-overview">
      <article>
        <small>Status</small>
        <strong>${table.is_active ? 'Ativa' : 'Inativa'}</strong>
      </article>
      <article>
        <small>Comandas abertas</small>
        <strong>${openTabs.length}</strong>
      </article>
      <article>
        <small>Pedidos da mesa</small>
        <strong>${tableOrders.length}</strong>
      </article>
      <article>
        <small>Total em aberto</small>
        <strong>${money(openTabs.reduce((sum, tab) => sum + Number(tab.current_total || 0), 0))}</strong>
      </article>
    </section>

    <section class="table-manager-actions">
      <button class="primary-button compact" type="button" data-open-tab="${escapeAttribute(table.id)}">Abrir nova comanda</button>
      <button class="ghost-button compact" type="button" data-copy-table-qr="${escapeAttribute(qrUrl)}">Copiar link da mesa</button>
      <button class="ghost-button compact" type="button" data-view-table-qr="${escapeAttribute(table.id)}">Ver QR</button>
      <button class="ghost-button compact" type="button" data-print-table-qr="${escapeAttribute(table.id)}">Imprimir QR</button>
      <button class="ghost-button compact" type="button" data-toggle-table="${escapeAttribute(table.id)}">${table.is_active ? 'Desativar mesa' : 'Ativar mesa'}</button>
      <button class="danger-button compact" type="button" data-delete-table="${escapeAttribute(table.id)}">Excluir mesa</button>
    </section>

    <section class="table-manager-section">
      <div class="section-actions compact-section-actions">
        <div>
          <p class="eyebrow">Comandas</p>
          <h3>Gerenciamento da mesa</h3>
        </div>
      </div>
      ${openTabs.length ? renderTableOpenTabs(openTabs, sortedTables, table.id) : `
        <div class="table-empty-state">
          <strong>Nenhuma comanda aberta nesta mesa</strong>
          <p>Abra uma comanda para lançar itens ou deixe o cliente iniciar o pedido pelo QR Code.</p>
        </div>
      `}
    </section>

    <section class="table-manager-section">
      <div>
        <p class="eyebrow">Itens pedidos</p>
        <h3>Histórico desta mesa</h3>
      </div>
      ${renderTableOrders(tableOrders)}
    </section>
  `;
  bindTableManagementActions(els.tableManagerBody);
}

function openTabsForTable(table) {
  return table.open_tabs?.length
    ? table.open_tabs
    : state.customerTabs.filter((tab) => tab.status === 'open' && tab.dining_table_id === table.id);
}

function ordersForTable(tableId) {
  return state.orders
    .filter((order) => order.dining_table_id === tableId || order.table_snapshot?.id === tableId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function renderTableOrders(orders) {
  if (!orders.length) {
    return '<p class="empty-state">Nenhum pedido registrado para esta mesa ainda.</p>';
  }
  return `
    <div class="table-order-list">
      ${orders.map((order) => {
        const createdAt = new Date(order.created_at);
        const tab = order.tab_snapshot?.name ? ` - ${escapeHtml(order.tab_snapshot.name)}` : '';
        return `
          <article class="table-order-card">
            <div class="table-order-head">
              <div>
                <strong>#${escapeHtml(order.public_code)}${tab}</strong>
                <small>${createdAt.toLocaleString('pt-BR')} - ${statusLabel(order.status)}</small>
              </div>
              <span class="order-status-badge">${statusLabel(order.status)}</span>
            </div>
            <div class="mini-items expanded">${(order.items || []).map(orderItemHtml).join('')}</div>
            ${order.notes ? `<p class="order-note"><strong>Obs.</strong> ${escapeHtml(order.notes)}</p>` : ''}
          </article>
        `;
      }).join('')}
    </div>
  `;
}

function rememberOpenTabMenus() {
  if (!els.tablesBoard) return;
  els.tablesBoard.querySelectorAll('.tab-menu-picker').forEach((details) => {
    const id = details.dataset.tabMenuId;
    if (!id) return;
    if (details.open) state.openTabMenuIds.add(id);
    else state.openTabMenuIds.delete(id);
  });
}

function renderTableOpenTabs(tabs, sortedTables, currentTableId) {
  return `
    <div class="table-tabs-list">
      ${tabs.map((tab) => `
      <section class="table-tab-card">
        <div class="table-tab-summary">
          <div>
            <strong>${escapeHtml(tab.name)}</strong>
            ${tab.customer_name ? `<small>${escapeHtml(tab.customer_name)}</small>` : '<small>Cliente não informado</small>'}
          </div>
          <span>${money(tab.current_total || 0)} em consumo</span>
        </div>
        ${renderTabOrderSummary(tab.id)}
        ${renderTabMenuPicker(tab)}
        <div class="table-transfer">
          <label>
            Transferir comanda
            <select data-transfer-select="${escapeAttribute(tab.id)}">
              ${sortedTables.filter((target) => target.id !== currentTableId && target.is_active).map((target) => `<option value="${escapeAttribute(target.id)}">${escapeHtml(target.name)}</option>`).join('')}
            </select>
          </label>
          <div class="table-tab-actions">
            <button class="ghost-button compact" type="button" data-transfer-tab="${escapeAttribute(tab.id)}">Transferir</button>
            <button class="primary-button compact" type="button" data-close-tab="${escapeAttribute(tab.id)}">Fechar comanda</button>
          </div>
        </div>
      </section>
      `).join('')}
    </div>
  `;
}

function renderTabOrderSummary(tabId) {
  const orders = ordersForTab(tabId).filter((order) => order.status !== 'cancelled');
  if (!orders.length) {
    return '<p class="table-tab-empty">Nenhum item lançado nesta comanda ainda.</p>';
  }
  return `
    <details class="table-tab-orders">
      <summary><span>Itens pedidos</span><small>${orders.length} pedido(s)</small></summary>
      <div class="table-tab-order-list">
        ${orders.map((order) => `
          <article>
            <strong>#${escapeHtml(order.public_code)} - ${statusLabel(order.status)}</strong>
            <div class="mini-items expanded">${(order.items || []).map(orderItemHtml).join('')}</div>
          </article>
        `).join('')}
      </div>
    </details>
  `;
}

function ordersForTab(tabId) {
  return state.orders
    .filter((order) => order.customer_tab_id === tabId || order.tab_snapshot?.id === tabId)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

function renderTabMenuPicker(tab) {
  const categories = state.categories
    .map((category) => ({
      ...category,
      items: (category.items || []).filter((item) => item.is_available !== false)
    }))
    .filter((category) => category.items.length);

  if (!categories.length) {
    return '<p class="muted">Nenhum item disponível no cardápio para lançar nesta comanda.</p>';
  }

  return `
    <details class="tab-menu-picker" data-tab-menu-id="${escapeAttribute(tab.id)}" ${state.openTabMenuIds.has(String(tab.id)) ? 'open' : ''}>
      <summary><span>Adicionar itens do cardápio</span><small>${categories.reduce((sum, category) => sum + category.items.length, 0)} itens</small></summary>
      <div class="tab-menu-category-list">
        ${categories.map((category) => `
          <details class="tab-menu-category">
            <summary><span>${escapeHtml(category.name)}</span><small>${category.items.length} item(ns)</small></summary>
            <div class="tab-menu-items">
              ${category.items.map((item) => {
              const requiredGroups = (item.modifier_groups || []).filter((group) => group.is_required);
              return `
                <div class="tab-menu-item">
                  <div>
                    <strong>${escapeHtml(item.name)}</strong>
                    <small>${money(item.price)}${requiredGroups.length ? ' - possui adicionais obrigatórios' : ''}</small>
                  </div>
                  <input data-tab-item-qty type="number" min="1" max="99" value="1" aria-label="Quantidade de ${escapeAttribute(item.name)}">
                  <button class="primary-button compact" type="button" data-add-tab-item="${escapeAttribute(tab.id)}" data-item-id="${escapeAttribute(item.id)}">Adicionar</button>
                </div>
              `;
            }).join('')}
            </div>
          </details>
        `).join('')}
      </div>
    </details>
  `;
}

function optionElement(value, label) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

function tableQrUrl(table) {
  return `${window.location.origin}/?mesa=${encodeURIComponent(table.code)}`;
}

function tableQrImageUrl(table) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(tableQrUrl(table))}`;
}

function printTableQr(table, options = {}) {
  const autoPrint = options.autoPrint !== false;
  const popup = window.open('', '_blank', 'width=420,height=620');
  if (!popup) {
    toast('Permita pop-ups para imprimir o QR Code.');
    return;
  }
  const url = tableQrUrl(table);
  popup.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <title>QR Code - ${escapeHtml(table.name)}</title>
        <style>
          body { margin: 0; font-family: Arial, sans-serif; color: #111827; }
          main { width: 80mm; margin: 0 auto; padding: 10mm 6mm; text-align: center; }
          h1 { margin: 0 0 4mm; font-size: 22px; }
          p { margin: 0 0 5mm; font-size: 13px; }
          img { width: 58mm; height: 58mm; }
          small { display: block; margin-top: 4mm; word-break: break-all; font-size: 10px; color: #4b5563; }
          @media print { @page { size: 80mm auto; margin: 0; } }
        </style>
      </head>
      <body>
        <main>
          <h1>${escapeHtml(table.name)}</h1>
          <p>Aponte a câmera para abrir o cardápio e pedir nesta mesa.</p>
          <img src="${escapeAttribute(tableQrImageUrl(table))}" alt="QR Code">
          <small>${escapeHtml(url)}</small>
        </main>
      </body>
    </html>
  `);
  popup.document.close();
  popup.focus();
  if (autoPrint) {
    popup.setTimeout(() => {
      popup.print();
    }, 400);
  }
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

function renderOnboarding() {
  if (!els.onboardingPanel || !state.store) return;
  const completed = state.store.onboarding_completed === true || localStorage.getItem(ONBOARDING_COMPLETED_KEY) === 'true';
  if (state.store.onboarding_completed === true) {
    localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
  }
  els.onboardingPanel.hidden = completed;
  if (completed) return;
  fillOnboardingDefaults();
  updateOnboardingProductCategories();
  showOnboardingStep(state.onboardingStep);
}

function fillOnboardingDefaults() {
  const store = state.store || {};
  const whatsappInput = document.querySelector('[data-onboarding-step="0"] input[name="whatsapp_number"]');
  if (whatsappInput && !whatsappInput.value) whatsappInput.value = store.whatsapp_number || '';

  const hoursForm = document.querySelector('[data-onboarding-step="1"]');
  const monday = store.business_hours?.monday || {};
  if (hoursForm && !hoursForm.elements.open.value) hoursForm.elements.open.value = monday.open || '18:00';
  if (hoursForm && !hoursForm.elements.close.value) hoursForm.elements.close.value = monday.close || '23:00';

  document.querySelectorAll('[data-onboarding-step="2"] input[name="payment_methods"]').forEach((input) => {
    input.checked = (store.payment_methods || ['Pix', 'Dinheiro']).includes(input.value);
  });

  const deliveryForm = document.querySelector('[data-onboarding-step="3"]');
  if (deliveryForm && !deliveryForm.elements.delivery_fee.value) deliveryForm.elements.delivery_fee.value = store.delivery_fee || 0;
  if (deliveryForm && !deliveryForm.elements.minimum_order.value) deliveryForm.elements.minimum_order.value = store.minimum_order || 0;
  if (deliveryForm && !deliveryForm.elements.delivery_neighborhood_fees.value) {
    deliveryForm.elements.delivery_neighborhood_fees.value = neighborhoodFeesToText(store.delivery_neighborhood_fees);
  }
}

function showOnboardingStep(step) {
  const steps = [...document.querySelectorAll('[data-onboarding-step]')];
  const max = steps.length - 1;
  state.onboardingStep = Math.max(0, Math.min(max, step));
  steps.forEach((form, index) => {
    form.classList.toggle('active', index === state.onboardingStep);
  });
  const current = state.onboardingStep + 1;
  const total = steps.length;
  if (els.onboardingStepText) els.onboardingStepText.textContent = `Passo ${current} de ${total}`;
  if (els.onboardingProgressBar) els.onboardingProgressBar.style.width = `${Math.round((current / total) * 100)}%`;
  if (els.onboardingBackButton) els.onboardingBackButton.disabled = state.onboardingStep === 0;
  if (els.onboardingNextButton) els.onboardingNextButton.textContent = state.onboardingStep === max ? 'Finalizar configuração' : 'Salvar e continuar';
}

function previousOnboardingStep() {
  showOnboardingStep(state.onboardingStep - 1);
}

async function nextOnboardingStep() {
  const form = document.querySelector(`[data-onboarding-step="${state.onboardingStep}"]`);
  if (!form?.reportValidity()) return;
  els.onboardingNextButton.disabled = true;
  try {
    await saveOnboardingStep(state.onboardingStep, new FormData(form));
    const total = document.querySelectorAll('[data-onboarding-step]').length;
    if (state.onboardingStep >= total - 1) {
      await completeOnboarding();
      return;
    }
    showOnboardingStep(state.onboardingStep + 1);
    toast('Etapa salva.');
  } catch (error) {
    toast(error.message || 'Não foi possível salvar esta etapa.');
  } finally {
    els.onboardingNextButton.disabled = false;
  }
}

async function saveOnboardingStep(step, data) {
  if (step === 0) {
    const whatsapp = digits(data.get('whatsapp_number'));
    if (!whatsapp || whatsapp.length < 12) throw new Error('Informe o WhatsApp com DDI e DDD.');
    await updateOnboardingStore({ whatsapp_number: whatsapp });
  }
  if (step === 1) {
    await updateOnboardingStore({ business_hours: businessHoursEveryDay(data.get('open') || '18:00', data.get('close') || '23:00') });
  }
  if (step === 2) {
    const paymentMethods = data.getAll('payment_methods');
    if (!paymentMethods.length) throw new Error('Escolha ao menos uma forma de pagamento.');
    await updateOnboardingStore({ payment_methods: paymentMethods });
  }
  if (step === 3) {
    await updateOnboardingStore({
      delivery_fee: data.get('delivery_fee'),
      minimum_order: data.get('minimum_order'),
      delivery_neighborhood_fees: parseNeighborhoodFees(data.get('delivery_neighborhood_fees'))
    });
  }
  if (step === 4) {
    const category = await createOnboardingCategory({
      name: data.get('name'),
      description: data.get('description'),
      sort_order: nextCategorySortOrder(),
      is_active: true
    });
    state.onboardingCategoryId = category?.id || state.onboardingCategoryId;
    await loadSummary();
    updateOnboardingProductCategories();
  }
  if (step === 5) {
    const categoryId = data.get('category_id') || state.onboardingCategoryId || state.categories[0]?.id;
    if (!categoryId) throw new Error('Crie uma categoria antes do produto.');
    await request('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category_id: categoryId,
        name: data.get('name'),
        description: data.get('description'),
        price: data.get('price'),
        is_featured: true,
        is_available: true,
        sort_order: 0,
        tags: []
      })
    });
    await loadSummary();
  }
}

async function updateOnboardingStore(partial) {
  const payload = { ...(state.store || {}), ...partial };
  const result = await request('/api/admin/store', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  state.store = Array.isArray(result) ? result[0] : result?.[0] || result?.store || result;
  saveAdminCache();
}

async function createOnboardingCategory(payload) {
  const result = await request('/api/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return Array.isArray(result) ? result[0] : result?.[0] || result?.category || result;
}

async function completeOnboarding() {
  localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
  if (els.onboardingPanel) els.onboardingPanel.hidden = true;
  await updateOnboardingStore({ onboarding_completed: true });
  await loadSummary();
  toast('Sistema pronto para receber pedidos.');
}

function businessHoursEveryDay(open, close) {
  return Object.fromEntries(businessDayLabels.map(([day]) => [day, {
    open,
    close,
    closed: false
  }]));
}

function updateOnboardingProductCategories() {
  if (!els.onboardingProductCategory) return;
  const selected = state.onboardingCategoryId || els.onboardingProductCategory.value || state.categories[0]?.id || '';
  els.onboardingProductCategory.replaceChildren(...state.categories.map((category) => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    option.selected = category.id === selected;
    return option;
  }));
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
  await withReportLoading(async () => {
    setReportPresetActive(null);
    const data = await request(`/api/admin/reports/daily?date=${encodeURIComponent(els.reportDate.value)}`);
    renderDailyReport(data.report);
  });
}

async function loadReportPreset(preset = 'today') {
  if (!state.admin) return;
  await withReportLoading(async () => {
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
  });
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

async function withReportLoading(callback) {
  const buttons = [els.loadReportButton, ...els.reportPresetButtons].filter(Boolean);
  buttons.forEach((button) => { button.disabled = true; });
  const previousTitle = els.reportOrdersTitle.textContent;
  els.reportOrdersTitle.textContent = 'Carregando relatório...';
  try {
    await callback();
  } catch (error) {
    toast(error.message || 'Não foi possível carregar o relatório.');
    els.reportSummary.innerHTML = '<p class="muted">Não foi possível carregar o relatório com esse filtro.</p>';
    els.reportOrders.innerHTML = '';
    els.reportOrdersTitle.textContent = previousTitle || 'Pedidos do período';
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
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
  const originRows = (report.by_origin || []).map((row) => `
    <span><strong>${escapeHtml(originLabel(row.key))}</strong><small>${row.count} - ${money(row.total)} - ticket ${money(row.average_ticket || 0)}</small></span>
  `).join('');
  const productRows = (report.top_products || []).map((row) => `
    <span><strong>${escapeHtml(row.name)}</strong><small>${row.quantity} un. - ${money(row.total)}</small></span>
  `).join('');

  els.reportOrders.innerHTML = `
    <article class="report-breakdown">
      <div><h3>Por status</h3>${statusRows || '<p class="muted">Sem pedidos.</p>'}</div>
      <div><h3>Por pagamento</h3>${paymentRows || '<p class="muted">Sem faturamento.</p>'}</div>
      <div><h3>Por origem</h3>${originRows || '<p class="muted">Sem faturamento.</p>'}</div>
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
    ['Por origem'],
    ['Origem', 'Pedidos', 'Total', 'Ticket médio']
  );
  for (const origin of report.by_origin || []) {
    rows.push([
      originLabel(origin.key),
      origin.count || 0,
      money(origin.total),
      money(origin.average_ticket || 0)
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
    ['Pedido', 'Data', 'Cliente', 'Telefone', 'Origem', 'Status', 'Pagamento', 'Total']
  );
  for (const order of report.orders || []) {
    const customer = order.customer_snapshot || {};
    rows.push([
      order.public_code,
      new Date(order.created_at).toLocaleString('pt-BR'),
      customer.name || '',
      customer.phone || '',
      originLabel(order.fulfillment_method),
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

function originLabel(value) {
  return ({
    delivery: 'Delivery',
    pickup: 'Retirada',
    counter: 'Balcão',
    table: 'Mesa',
    tab: 'Comanda'
  })[value] || value || 'Não informado';
}

function reportOrderCard(order) {
  const customer = order.customer_snapshot || {};
  return `
    <article class="list-card report-order-row status-${order.status}">
      <div>
        <strong>#${escapeHtml(order.public_code)} - ${escapeHtml(customer.name || 'Cliente')}</strong>
        <p>${new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} - ${statusLabel(order.status)} - ${escapeHtml(orderOriginLabel(order))} - ${escapeHtml(order.payment_method || 'Pagamento não informado')}</p>
      </div>
      <strong>${money(order.total)}</strong>
    </article>
  `;
}

function rememberOpenOrderDetails() {
  if (!els.adminOrders) return;
  els.adminOrders.querySelectorAll('.order-card').forEach((card) => {
    const id = String(card.dataset.orderId || '');
    const details = card.querySelector('.order-details');
    if (!id || !details) return;
    if (details.open) {
      state.openOrderDetailIds.add(id);
    } else {
      state.openOrderDetailIds.delete(id);
    }
  });
}

function renderOrders() {
  rememberOpenOrderDetails();
  const groups = ['new', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'];
  const visible = state.orderOriginFilter === 'all'
    ? state.orders
    : state.orders.filter((order) => order.fulfillment_method === state.orderOriginFilter);
  els.adminOrders.replaceChildren(...groups.map((status) => {
    const column = document.createElement('section');
    column.className = `order-column status-${status}`;
    column.dataset.orderStatus = status;
    const orders = visible.filter((order) => order.status === status);
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
  const createdAt = new Date(order.created_at);
  const fulfillment = orderCardOriginLabel(order, createdAt);
  const payment = order.payment_method ? escapeHtml(order.payment_method) : 'Pagamento não informado';
  const latestWhatsapp = (order.whatsapp_logs || [])[0];
  const itemCount = (order.items || []).reduce((total, item) => total + Number(item.quantity || 0), 0);
  card.innerHTML = `
    <div class="order-card-top">
      <div>
        <strong>#${escapeHtml(order.public_code)}</strong>
        <p>${escapeHtml(orderCardSubtitle(order, createdAt, customer))}</p>
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
      <span>${financialStatusLabel(order.financial_status)}</span>
      ${customer.phone ? `<span>${escapeHtml(customer.phone)}</span>` : ''}
    </div>
    <details class="order-details" ${state.openOrderDetailIds.has(String(order.id)) ? 'open' : ''}>
      <summary>Ver detalhes</summary>
      <div class="order-details-body">
        <dl>
          <div><dt>Horário</dt><dd>${createdAt.toLocaleString('pt-BR')}</dd></div>
          <div><dt>Telefone</dt><dd>${escapeHtml(customer.phone || 'Sem telefone')}</dd></div>
          <div><dt>Origem</dt><dd>${fulfillment}</dd></div>
          ${order.table_snapshot?.name ? `<div><dt>Mesa</dt><dd>${escapeHtml(order.table_snapshot.name)}</dd></div>` : ''}
          ${order.tab_snapshot?.name ? `<div><dt>Comanda</dt><dd>${escapeHtml(order.tab_snapshot.name)}</dd></div>` : ''}
          <div><dt>Pagamento</dt><dd>${payment}</dd></div>
          <div><dt>Status financeiro</dt><dd>${financialStatusLabel(order.financial_status)}</dd></div>
          ${order.payment_transaction_id ? `<div><dt>Transação</dt><dd>${escapeHtml(order.payment_transaction_id)}</dd></div>` : ''}
          ${order.paid_amount ? `<div><dt>Valor pago</dt><dd>${money(order.paid_amount)}</dd></div>` : ''}
          ${order.paid_at ? `<div><dt>Pago em</dt><dd>${new Date(order.paid_at).toLocaleString('pt-BR')}</dd></div>` : ''}
          ${latestWhatsapp ? `<div><dt>Último WhatsApp</dt><dd>${whatsappLogLabel(latestWhatsapp)}</dd></div>` : ''}
          ${order.payment_details?.change_for ? `<div><dt>Troco</dt><dd>Para ${money(order.payment_details.change_for)}</dd></div>` : ''}
          <div><dt>Subtotal</dt><dd>${money(order.subtotal)}</dd></div>
          <div><dt>Entrega</dt><dd>${money(order.delivery_fee)}</dd></div>
        </dl>
        ${orderAddressHtml(order)}
        ${order.notes ? `<p class="order-note"><strong>Obs.</strong> ${escapeHtml(order.notes)}</p>` : ''}
        <div class="mini-items expanded">${(order.items || []).map(orderItemHtml).join('')}</div>
        ${renderWhatsappLogs(order)}
        <div class="row-actions order-detail-actions">
          <button class="ghost-button compact print-order-button" type="button" data-print-order="${escapeAttribute(order.id)}" data-print-type="kitchen">Imprimir cozinha</button>
          <button class="ghost-button compact print-order-button" type="button" data-print-order="${escapeAttribute(order.id)}" data-print-type="customer">Imprimir cliente</button>
          <button class="ghost-button compact print-order-button" type="button" data-print-order="${escapeAttribute(order.id)}" data-print-type="both">Imprimir ambas</button>
          <button class="ghost-button compact print-order-button" type="button" data-preview-order="${escapeAttribute(order.id)}">Pré-visualizar</button>
          <button class="ghost-button compact print-order-button" type="button" data-reprint-order="${escapeAttribute(order.id)}">Reimprimir</button>
          <button class="ghost-button compact" type="button" data-whatsapp-status="${escapeAttribute(order.id)}">Reenviar WhatsApp</button>
        </div>
      </div>
    </details>
  `;
  const details = card.querySelector('.order-details');
  details?.addEventListener('mousedown', (event) => event.stopPropagation());
  details?.addEventListener('touchstart', (event) => event.stopPropagation(), { passive: true });
  details?.addEventListener('toggle', () => {
    if (details.open) {
      state.openOrderDetailIds.add(String(order.id));
    } else {
      state.openOrderDetailIds.delete(String(order.id));
    }
  });
  card.querySelectorAll('[data-print-order]').forEach((button) => {
    button.addEventListener('click', () => printOrder(order, { type: button.dataset.printType || 'kitchen', reason: 'manual' }));
  });
  card.querySelector('[data-preview-order]')?.addEventListener('click', () => printOrder(order, { type: 'both', preview: true, reason: 'preview' }));
  card.querySelector('[data-reprint-order]')?.addEventListener('click', () => printOrder(order, { type: 'both', reason: 'retry' }));
  card.querySelector('[data-whatsapp-status]')?.addEventListener('click', () => notifyOrderStatus(order));
  card.addEventListener('dragstart', (event) => {
    if (event.target.closest('.order-details') || event.target.closest('button') || event.target.closest('select')) {
      event.preventDefault();
      return;
    }
    state.draggedOrderId = order.id;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', order.id);
    event.dataTransfer.setData('application/json', JSON.stringify({ id: order.id, status: order.status }));
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => {
    state.draggedOrderId = null;
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

function renderWhatsappLogs(order) {
  const logs = order.whatsapp_logs || [];
  if (!logs.length) return '<p class="order-note"><strong>WhatsApp</strong> Nenhuma mensagem registrada.</p>';
  return `
    <div class="order-message-history">
      <strong>Histórico de WhatsApp</strong>
      ${logs.slice(0, 4).map((log) => `
        <span>
          <small>${new Date(log.created_at).toLocaleString('pt-BR')} - ${escapeHtml(statusLabel(log.order_status))}</small>
          <em>${escapeHtml(whatsappLogLabel(log))}${log.error_message ? `: ${escapeHtml(log.error_message)}` : ''}</em>
        </span>
      `).join('')}
    </div>
  `;
}

function whatsappLogLabel(log = {}) {
  return ({
    sent: 'enviado',
    failed: 'falhou',
    skipped: 'não enviado',
    pending: 'pendente'
  })[log.delivery_status] || 'registrado';
}

function financialStatusLabel(status) {
  return ({
    pending: 'Pagamento pendente',
    paid: 'Pago',
    failed: 'Pagamento falhou',
    expired: 'Pix expirado',
    cancelled: 'Pagamento cancelado',
    refunded: 'Estornado'
  })[status] || 'Pagamento pendente';
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

function orderOriginLabel(order) {
  if (order.fulfillment_method === 'delivery') return 'Delivery';
  if (order.fulfillment_method === 'pickup') return 'Retirada';
  if (order.fulfillment_method === 'counter') return 'Balcão';
  if (order.fulfillment_method === 'table') return order.table_snapshot?.name ? orderTableLabel(order) : 'Mesa';
  if (order.fulfillment_method === 'tab') {
    const tabName = orderTabDisplayName(order);
    return tabName ? `Comanda ${tabName}` : 'Comanda';
  }
  return order.fulfillment_method || 'Pedido';
}

function orderCardOriginLabel(order, createdAt = new Date(order.created_at)) {
  if (order.fulfillment_method === 'tab') {
    const time = createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const tabName = orderTabDisplayName(order);
    return ['Comanda', tabName, orderTableLabel(order), time].filter(Boolean).join(' ');
  }
  if (order.fulfillment_method === 'table') {
    const time = createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${orderTableLabel(order)} ${time}`;
  }
  return orderOriginLabel(order);
}

function orderCardSubtitle(order, createdAt = new Date(order.created_at), customer = order.customer_snapshot || {}) {
  const time = createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (order.fulfillment_method === 'tab') {
    return `${orderTableLabel(order)} - Comanda - Horário: ${time}`;
  }
  if (order.fulfillment_method === 'table') {
    return `${orderTableLabel(order)} - Horário: ${time}`;
  }
  return `${customer.name || 'Cliente'} - ${time}`;
}

function orderTabDisplayName(order) {
  const rawName = String(order.tab_snapshot?.name || '').trim();
  if (!rawName) return '';
  const withoutPrefix = rawName.replace(/^comanda\b\s*/i, '').trim();
  return withoutPrefix || rawName;
}

function orderTableLabel(order) {
  const tableName = String(order.table_snapshot?.name || '').trim();
  if (!tableName) return 'Mesa não informada';
  return /^mesa\b/i.test(tableName) ? tableName : `Mesa ${tableName}`;
}

function shouldAutoPrintKitchen(order, status, previousStatus) {
  if (!order?.id) return false;
  const settings = currentPrintSettings();
  if (!settings.autoPrintKitchen) return false;
  if (status !== settings.autoPrintKitchenStatus || previousStatus === settings.autoPrintKitchenStatus) return false;
  return !state.autoPrintedKitchenIds.has(String(order.id));
}

function markAutoPrintedKitchen(orderId) {
  state.autoPrintedKitchenIds.add(String(orderId));
  const ids = [...state.autoPrintedKitchenIds].slice(-500);
  state.autoPrintedKitchenIds = new Set(ids);
  localStorage.setItem('adminAutoPrintedKitchenIds', JSON.stringify(ids));
}

function printOrderLabel(order, copies = 1) {
  printOrder(order, { type: 'both', kitchenCopies: copies, customerCopies: copies, reason: 'manual' });
}

async function printOrder(order, options = {}) {
  const settings = currentPrintSettings();
  const type = ['kitchen', 'customer', 'both'].includes(options.type) ? options.type : 'kitchen';
  const paperWidth = options.paperWidth || settings.paperWidth;
  const kitchenCopies = options.kitchenCopies || settings.kitchenCopies;
  const customerCopies = options.customerCopies || settings.customerCopies;
  const preview = Boolean(options.preview);
  const popup = window.open('', '_blank', 'width=420,height=640');
  if (!popup) {
    await registerPrintLog(order, type, paperWidth, type === 'customer' ? customerCopies : kitchenCopies, options.reason || 'manual', 'blocked');
    toast('Permita pop-ups para imprimir a etiqueta.');
    return;
  }

  await registerPrintLog(order, type, paperWidth, type === 'customer' ? customerCopies : kitchenCopies, options.reason || 'manual', 'attempted');
  popup.document.write(orderThermalDocument(order, {
    type,
    paperWidth,
    kitchenCopies,
    customerCopies,
    showKitchenPrices: settings.showKitchenPrices,
    highlightNotes: settings.highlightNotes
  }));
  popup.document.close();
  popup.focus();
  if (!preview) {
    popup.setTimeout(() => {
      popup.print();
      registerPrintLog(order, type, paperWidth, type === 'customer' ? customerCopies : kitchenCopies, options.reason || 'manual', 'completed').catch(() => {});
      popup.setTimeout(() => popup.close(), 500);
    }, 150);
  }
}

async function notifyOrderStatus(order) {
  try {
    const result = await request(`/api/admin/orders/${order.id}/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: order.status })
    });
    toast(`WhatsApp: ${whatsappLogLabel(result.log)}.`);
    await loadSummary({ skipNotifications: true, silent: true });
  } catch (error) {
    toast(error.message || 'Não foi possível reenviar a mensagem.');
  }
}

function currentPrintSettings() {
  return {
    paperWidth: ['58', '80'].includes(String(state.store?.print_settings?.paperWidth)) ? String(state.store.print_settings.paperWidth) : '80',
    kitchenCopies: clampNumber(state.store?.print_settings?.kitchenCopies, 1, 5, 1),
    customerCopies: clampNumber(state.store?.print_settings?.customerCopies, 1, 5, 1),
    autoPrintKitchen: Boolean(state.store?.print_settings?.autoPrintKitchen),
    autoPrintKitchenStatus: ['new', 'accepted', 'preparing'].includes(String(state.store?.print_settings?.autoPrintKitchenStatus))
      ? String(state.store.print_settings.autoPrintKitchenStatus)
      : 'accepted',
    showKitchenPrices: Boolean(state.store?.print_settings?.showKitchenPrices),
    highlightNotes: state.store?.print_settings?.highlightNotes !== false
  };
}

async function registerPrintLog(order, type, paperWidth, copies, reason, status) {
  await request('/api/admin/print-logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order_id: order.id,
      print_type: type,
      paper_width: paperWidth,
      copies,
      reason,
      status
    })
  });
}

function orderThermalDocument(order, options = {}) {
  const type = options.type || 'kitchen';
  const paperWidth = ['58', '80'].includes(String(options.paperWidth)) ? String(options.paperWidth) : '80';
  const sections = [];
  if (['kitchen', 'both'].includes(type)) {
    sections.push(...repeatCopies(options.kitchenCopies, (copy, total) => kitchenReceiptHtml(order, { ...options, copy, totalCopies: total })));
  }
  if (['customer', 'both'].includes(type)) {
    sections.push(...repeatCopies(options.customerCopies, (copy, total) => customerReceiptHtml(order, { ...options, copy, totalCopies: total })));
  }
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>Pedido #${escapeHtml(order.public_code)}</title>
    <style>
      @page { size: ${paperWidth}mm auto; margin: 0; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: #000;
        font-family: Arial, Helvetica, sans-serif;
        font-size: ${paperWidth === '58' ? '10px' : '11px'};
      }
      .receipt {
        width: ${paperWidth}mm;
        padding: ${paperWidth === '58' ? '3mm 2.5mm' : '4mm'};
        overflow-wrap: anywhere;
      }
      .receipt + .receipt {
        break-before: page;
        page-break-before: always;
      }
      h1, h2, h3, p { margin: 0; }
      h1 {
        border-bottom: 2px solid #000;
        padding-bottom: 4px;
        font-family: "Courier New", monospace;
        font-size: ${paperWidth === '58' ? '17px' : '21px'};
      }
      h2 {
        margin-top: 7px;
        font-size: ${paperWidth === '58' ? '11px' : '12px'};
        text-transform: uppercase;
      }
      .center { text-align: center; }
      .store { font-weight: 900; text-transform: uppercase; }
      .meta, .box { border-bottom: 1px dashed #000; padding: 6px 0; }
      .meta p, .box p { margin-top: 3px; line-height: 1.35; }
      .line { display: flex; justify-content: space-between; gap: 8px; }
      ul { list-style: none; margin: 5px 0 0; padding: 0; }
      li { border-top: 1px dashed #999; padding: 6px 0; }
      li:first-child { border-top: 0; }
      .item-title { display: flex; justify-content: space-between; gap: 8px; font-size: ${paperWidth === '58' ? '13px' : '15px'}; font-weight: 900; }
      .modifier, .item-note, .order-note { display: block; margin-top: 3px; line-height: 1.25; }
      .item-note, .order-note { ${options.highlightNotes === false ? '' : 'border: 1px solid #000; padding: 3px; font-weight: 900;'} }
      .total { border-top: 2px solid #000; margin-top: 7px; padding-top: 7px; font-size: ${paperWidth === '58' ? '16px' : '18px'}; font-weight: 900; }
      .cut { border-top: 1px dashed #000; margin-top: 10px; padding-top: 5px; text-align: center; font-size: 9px; }
      @media print { body { width: ${paperWidth}mm; } }
    </style>
  </head>
  <body>${sections.join('')}</body>
</html>`;
}

function repeatCopies(copies, render) {
  const count = Math.max(1, Math.min(5, Number(copies) || 1));
  return Array.from({ length: count }, (_, index) => render(index + 1, count));
}

function kitchenReceiptHtml(order, options = {}) {
  const createdAt = new Date(order.created_at);
  const type = orderOriginLabel(order);
  const mesa = order.table_snapshot?.name ? `<p><strong>Mesa:</strong> ${escapeHtml(order.table_snapshot.name)}</p>` : '';
  const copy = options.totalCopies > 1 ? ` - Via ${options.copy}/${options.totalCopies}` : '';
  return `
    <main class="receipt">
      <p class="center store">VIA DA COZINHA${copy}</p>
      <h1>#${escapeHtml(order.public_code)}</h1>
      <section class="meta">
        ${mesa}
        <p><strong>Tipo:</strong> ${escapeHtml(type)}</p>
        <p><strong>Horário:</strong> ${createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
      </section>
      <section class="box">
        <h2>Itens</h2>
        <ul>${(order.items || []).map((item) => thermalItemHtml(item, { showPrices: options.showKitchenPrices })).join('')}</ul>
      </section>
      ${order.notes ? `<section class="box"><h2>Obs. do pedido</h2><p class="order-note">${escapeHtml(order.notes)}</p></section>` : ''}
      <p class="cut">corte aqui</p>
    </main>
  `;
}

function customerReceiptHtml(order, options = {}) {
  const customer = order.customer_snapshot || {};
  const createdAt = new Date(order.created_at);
  const addressLines = order.fulfillment_method === 'delivery'
    ? orderAddressLines(order.address_snapshot || {}).map((line) => `<p>${escapeHtml(line)}</p>`).join('')
    : '';
  const paymentDetails = order.payment_details || {};
  const copy = options.totalCopies > 1 ? ` - Via ${options.copy}/${options.totalCopies}` : '';
  return `
    <main class="receipt">
      <p class="center store">${escapeHtml(state.store?.name || 'Cardápio')}${copy}</p>
      ${state.store?.address ? `<p class="center">${escapeHtml(state.store.address)}</p>` : ''}
      <h1>#${escapeHtml(order.public_code)}</h1>
      <section class="meta">
        <p><strong>Data:</strong> ${createdAt.toLocaleDateString('pt-BR')}</p>
        <p><strong>Horário:</strong> ${createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
        <p><strong>Tipo:</strong> ${escapeHtml(orderOriginLabel(order))}</p>
        <p><strong>Pagamento:</strong> ${escapeHtml(order.payment_method || 'Não informado')}</p>
        ${paymentDetails.change_for ? `<p><strong>Troco:</strong> Para ${money(paymentDetails.change_for)}</p>` : ''}
      </section>
      <section class="box">
        <h2>Cliente</h2>
        <p><strong>${escapeHtml(customer.name || 'Cliente')}</strong></p>
        ${customer.phone ? `<p>${escapeHtml(customer.phone)}</p>` : ''}
      </section>
      ${addressLines ? `<section class="box"><h2>Endereço</h2>${addressLines}</section>` : ''}
      <section class="box">
        <h2>Itens</h2>
        <ul>${(order.items || []).map((item) => thermalItemHtml(item, { showPrices: true })).join('')}</ul>
      </section>
      ${order.notes ? `<section class="box"><h2>Obs. do pedido</h2><p class="order-note">${escapeHtml(order.notes)}</p></section>` : ''}
      <section class="box">
        <p class="line"><span>Subtotal</span><strong>${money(order.subtotal)}</strong></p>
        ${Number(order.delivery_fee || 0) > 0 ? `<p class="line"><span>Entrega</span><strong>${money(order.delivery_fee)}</strong></p>` : ''}
        ${Number(order.discount || 0) > 0 ? `<p class="line"><span>Desconto</span><strong>- ${money(order.discount)}</strong></p>` : ''}
      </section>
      <div class="line total"><span>Total</span><strong>${money(order.total)}</strong></div>
      <p class="cut">corte aqui</p>
    </main>
  `;
}

function thermalItemHtml(item, options = {}) {
  const name = item.item_snapshot?.name || 'Item';
  const modifiers = item.item_snapshot?.modifiers || [];
  return `
    <li>
      <div class="item-title"><span>${Number(item.quantity || 0)}x ${escapeHtml(name)}</span>${options.showPrices ? `<span>${money(item.total)}</span>` : ''}</div>
      ${modifiers.map((modifier) => `<span class="modifier">+ ${escapeHtml(modifierText(modifier))}${options.showPrices && Number(modifier.price_delta || 0) > 0 ? ` (${money(modifier.price_delta)})` : ''}</span>`).join('')}
      ${item.notes ? `<span class="item-note">Obs: ${escapeHtml(item.notes)}</span>` : ''}
    </li>
  `;
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
        <p><strong>Origem:</strong> ${escapeHtml(orderOriginLabel(order))}</p>
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
  const orderId = event.dataTransfer.getData('text/plain') || state.draggedOrderId;
  const status = column.dataset.orderStatus;
  const order = state.orders.find((item) => String(item.id) === String(orderId));
  if (!order || !status || order.status === status) return;
  updateOrderStatus(order.id, status);
  toast(`Pedido #${order.public_code} movido para ${statusLabel(status)}.`);
}

function closestOrderColumnFromPoint(x, y) {
  const columns = [...els.adminOrders.querySelectorAll('.order-column')];
  const elementAtPoint = document.elementFromPoint(x, y);
  const directColumn = elementAtPoint?.closest?.('.order-column');
  if (directColumn && els.adminOrders.contains(directColumn)) return directColumn;

  const boardRect = els.adminOrders.getBoundingClientRect();
  const outsideBoard =
    x < boardRect.left - 24 ||
    x > boardRect.right + 24 ||
    y < boardRect.top - 24 ||
    y > boardRect.bottom + 24;
  if (outsideBoard) return null;

  const containingColumn = columns.find((column) => {
    const rect = column.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  });
  if (containingColumn) return containingColumn;

  return columns
    .map((column) => {
      const rect = column.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const horizontalDistance = Math.abs(x - centerX);
      const verticalDistance = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
      return { column, distance: horizontalDistance + verticalDistance * 1.5 };
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
  if (state.updatingOrderIds.has(orderId)) return;
  const order = state.orders.find((item) => String(item.id) === String(orderId));
  const previousStatus = order?.status;

  if (previousStatus === status) return;
  state.updatingOrderIds.add(orderId);

  if (order && previousStatus !== status) {
    applyOrderStatusLocally(order, status);
  }

  try {
    await request(`/api/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (shouldAutoPrintKitchen(order, status, previousStatus)) {
      markAutoPrintedKitchen(order.id);
      printOrder({ ...order, status }, { type: 'kitchen', reason: 'auto' });
    }
    loadSummary({ skipNotifications: true, silent: true }).catch(() => {});
  } catch (error) {
    if (order && previousStatus) {
      applyOrderStatusLocally(order, previousStatus);
    }
    toast(error.message || 'Não foi possível atualizar o pedido.');
  } finally {
    state.updatingOrderIds.delete(orderId);
  }
}

function applyOrderStatusLocally(order, status) {
  order.status = status;
  renderOrderMetrics();

  const currentCard = [...els.adminOrders.querySelectorAll('.order-card')]
    .find((card) => String(card.dataset.orderId) === String(order.id));
  const targetColumn = [...els.adminOrders.querySelectorAll('.order-column')]
    .find((column) => column.dataset.orderStatus === status);

  if (!currentCard || !targetColumn) {
    renderOrders();
    return;
  }

  const freshCard = orderCard(order);
  targetColumn.append(freshCard);
  currentCard.remove();
  updateOrderColumnCounts();
}

function updateOrderColumnCounts() {
  els.adminOrders.querySelectorAll('.order-column').forEach((column) => {
    const count = state.orders.filter((order) => order.status === column.dataset.orderStatus).length;
    const badge = column.querySelector('h3 strong');
    if (badge) badge.textContent = count;
  });
}

function renderCustomers() {
  rememberOpenCustomers();
  if (state.customers.length === 0) {
    els.adminCustomers.innerHTML = '<p class="muted">Nenhum cliente cadastrado.</p>';
    return;
  }
  els.adminCustomers.replaceChildren(...state.customers.map(customerEditor));
}

function renderPromotions() {
  if (!els.promotionList) return;
  if (!state.promotions.length) {
    els.promotionList.innerHTML = '<p class="muted">Nenhuma promoção cadastrada.</p>';
    return;
  }
  const salesPromotions = state.promotions.filter((promotion) => !isLoyaltyPromotion(promotion));
  const loyaltyPromotions = state.promotions.filter(isLoyaltyPromotion);
  els.promotionList.replaceChildren(
    promotionGroupSection('Cupons e promoções', 'Descontos, frete grátis, valor fixo, percentual e combos.', salesPromotions),
    promotionGroupSection('Fidelidade e relacionamento', 'Primeira compra, aniversário e benefícios para clientes recorrentes.', loyaltyPromotions)
  );
}

function promotionGroupSection(title, description, promotions) {
  const section = document.createElement('section');
  section.className = 'promotion-group-panel';
  section.innerHTML = `
    <div class="promotion-group-head">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(description)}</p>
      </div>
      <span class="pill">${promotions.length}</span>
    </div>
    <div class="promotion-card-grid"></div>
  `;
  const grid = section.querySelector('.promotion-card-grid');
  if (promotions.length) {
    grid.replaceChildren(...promotions.map(promotionCard));
  } else {
    grid.innerHTML = '<p class="muted">Nenhuma campanha deste tipo ainda.</p>';
  }
  return section;
}

function isLoyaltyPromotion(promotion) {
  return ['first_order', 'birthday', 'recurring'].includes(promotion.promotion_type || 'general');
}

function renderPromotionOptions() {
  if (els.promotionCategories) {
    els.promotionCategories.replaceChildren(...state.categories.map((category) => {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.name;
      return option;
    }));
  }
  if (els.promotionComboItems) {
    const items = promotionMenuItems();
    els.promotionComboItems.replaceChildren(...items.map((item) => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = `${item.name} - ${item.categoryName}`;
      return option;
    }));
  }
}

function promotionMenuItems() {
  return state.categories.flatMap((category) => (
    (category.items || []).map((item) => ({ ...item, categoryName: category.name }))
  ));
}

function promotionTypeLabel(type) {
  return ({
    general: 'Geral',
    first_order: 'Primeira compra',
    free_delivery: 'Frete grátis',
    fixed: 'Valor fixo',
    percent: 'Percentual',
    combo: 'Combo',
    birthday: 'Aniversário',
    recurring: 'Cliente recorrente'
  })[type || 'general'] || 'Geral';
}

function promotionCard(promotion) {
  const card = document.createElement('article');
  card.className = `list-card promo-card ${promotion.is_active ? '' : 'muted-card'}`;
  const discount = promotion.discount_type === 'free_delivery'
    ? 'Frete grátis'
    : promotion.discount_type === 'percent'
      ? `${Number(promotion.discount_value || 0)}%`
      : money(promotion.discount_value || 0);
  const period = [
    promotion.starts_at ? `Início ${new Date(promotion.starts_at).toLocaleDateString('pt-BR')}` : null,
    promotion.ends_at ? `Fim ${new Date(promotion.ends_at).toLocaleDateString('pt-BR')}` : null
  ].filter(Boolean).join(' - ') || 'Sem período definido';
  const usage = promotion.max_uses
    ? `${promotion.used_count || 0}/${promotion.max_uses} uso(s)`
    : `${promotion.used_count || 0} uso(s)`;
  const perCustomerUsage = `${promotion.max_uses_per_customer || 1} por cliente`;
  const categoryNames = cleanPromotionIds(promotion.allowed_category_ids)
    .map((id) => findCategory(id)?.name)
    .filter(Boolean)
    .join(', ');
  const comboNames = cleanPromotionIds(promotion.combo_item_ids)
    .map((id) => findProduct(id)?.name)
    .filter(Boolean)
    .join(' + ');
  const rules = [
    promotionTypeLabel(promotion.promotion_type),
    categoryNames ? `Categorias: ${categoryNames}` : null,
    comboNames ? `Combo: ${comboNames}` : null,
    promotion.promotion_type === 'recurring' ? `${promotion.recurring_min_orders || 2}+ pedidos` : null,
    promotion.promotion_type === 'birthday' ? `${promotion.birthday_window_days || 7} dia(s) do aniversário` : null
  ].filter(Boolean).join(' | ');
  card.innerHTML = `
    <div>
      <div class="promo-card-top">
        <strong>${escapeHtml(promotion.name)}</strong>
        <span class="pill">${promotion.is_active ? 'Ativa' : 'Pausada'}</span>
      </div>
      <p><code>${escapeHtml(promotion.code)}</code> <b>${discount}</b></p>
      <small>${escapeHtml(rules)}</small>
      <small>Mínimo ${money(promotion.minimum_order || 0)} - ${usage} - ${perCustomerUsage}</small>
      <small>${escapeHtml(promotion.description || period)}</small>
    </div>
    <div class="row-actions">
      <button class="ghost-button compact" type="button" data-action="edit">Editar</button>
      <button class="ghost-button compact" type="button" data-action="toggle">${promotion.is_active ? 'Pausar' : 'Ativar'}</button>
      <button class="danger-button compact" type="button" data-action="delete">Excluir</button>
    </div>
  `;
  card.querySelector('[data-action="edit"]').addEventListener('click', () => editPromotion(promotion));
  card.querySelector('[data-action="toggle"]').addEventListener('click', async () => {
    await updatePromotion(promotion.id, { is_active: !promotion.is_active });
    toast(promotion.is_active ? 'Promoção pausada.' : 'Promoção ativada.');
  });
  card.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    if (!confirm(`Excluir a promoção "${promotion.name}"?`)) return;
    await deletePromotion(promotion.id);
    toast('Promoção excluída.');
  });
  return card;
}

async function submitPromotion(event) {
  event.preventDefault();
  const data = promotionPayloadFromForm(els.promotionForm);
  data.is_active = els.promotionForm.elements.is_active.checked;
  const editingId = state.editingPromotionId;
  const result = await request(editingId ? `/api/admin/promotions/${editingId}` : '/api/admin/promotions', {
    method: editingId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (editingId) {
    state.promotions = state.promotions.map((promotion) => promotion.id === editingId ? result.promotion : promotion);
  } else {
    state.promotions.unshift(result.promotion);
  }
  resetPromotionForm();
  renderPromotions();
  toast(editingId ? 'Promoção atualizada.' : 'Promoção criada.');
}

function promotionPayloadFromForm(form) {
  const data = Object.fromEntries(new FormData(form));
  data.allowed_category_ids = [...form.elements.allowed_category_ids.selectedOptions].map((option) => option.value);
  data.combo_item_ids = [...form.elements.combo_item_ids.selectedOptions].map((option) => option.value);
  return data;
}

function editPromotion(promotion) {
  showPromotionForm();
  state.editingPromotionId = promotion.id;
  els.promotionFormTitle.textContent = 'Editar promoção';
  els.savePromotionButton.textContent = 'Salvar alterações';
  els.cancelPromotionEditButton.hidden = false;
  setValue(els.promotionForm.elements.name, promotion.name);
  setValue(els.promotionForm.elements.code, promotion.code);
  setValue(els.promotionForm.elements.description, promotion.description || '');
  setValue(els.promotionForm.elements.promotion_type, promotion.promotion_type || 'general');
  setValue(els.promotionForm.elements.discount_type, promotion.discount_type || 'fixed');
  setValue(els.promotionForm.elements.discount_value, promotion.discount_value || 0);
  setValue(els.promotionForm.elements.minimum_order, promotion.minimum_order || 0);
  setValue(els.promotionForm.elements.max_uses, promotion.max_uses || '');
  setValue(els.promotionForm.elements.max_uses_per_customer, promotion.max_uses_per_customer || 1);
  setValue(els.promotionForm.elements.starts_at, dateTimeLocalValue(promotion.starts_at));
  setValue(els.promotionForm.elements.ends_at, dateTimeLocalValue(promotion.ends_at));
  setValue(els.promotionForm.elements.recurring_min_orders, promotion.recurring_min_orders || 2);
  setValue(els.promotionForm.elements.birthday_window_days, promotion.birthday_window_days || 7);
  els.promotionForm.elements.is_active.checked = promotion.is_active !== false;
  setMultiSelectValues(els.promotionForm.elements.allowed_category_ids, cleanPromotionIds(promotion.allowed_category_ids));
  setMultiSelectValues(els.promotionForm.elements.combo_item_ids, cleanPromotionIds(promotion.combo_item_ids));
  els.promotionForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showPromotionForm() {
  if (els.promotionForm) els.promotionForm.hidden = false;
  if (els.promotionFormPlaceholder) els.promotionFormPlaceholder.hidden = true;
  hideLoyaltyForm();
}

function hidePromotionForm() {
  if (els.promotionForm) els.promotionForm.hidden = true;
  if (els.promotionFormPlaceholder && els.loyaltyForm?.hidden !== false) els.promotionFormPlaceholder.hidden = false;
}

function showLoyaltyForm() {
  if (els.loyaltyForm) els.loyaltyForm.hidden = false;
  if (els.promotionFormPlaceholder) els.promotionFormPlaceholder.hidden = true;
  hidePromotionForm();
  els.loyaltyForm?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function hideLoyaltyForm() {
  if (els.loyaltyForm) els.loyaltyForm.hidden = true;
  if (els.promotionFormPlaceholder && els.promotionForm?.hidden !== false) els.promotionFormPlaceholder.hidden = false;
}

function resetPromotionForm(options = {}) {
  state.editingPromotionId = null;
  els.promotionForm.reset();
  els.promotionFormTitle.textContent = 'Criar promoção';
  els.savePromotionButton.textContent = 'Salvar promoção';
  els.promotionForm.elements.is_active.checked = true;
  els.promotionForm.elements.max_uses_per_customer.value = 1;
  els.promotionForm.elements.recurring_min_orders.value = 2;
  els.promotionForm.elements.birthday_window_days.value = 7;
  setMultiSelectValues(els.promotionForm.elements.allowed_category_ids, []);
  setMultiSelectValues(els.promotionForm.elements.combo_item_ids, []);
  if (!options.keepOpen) hidePromotionForm();
}

function setMultiSelectValues(select, values) {
  const selected = new Set(values);
  [...select.options].forEach((option) => {
    option.selected = selected.has(option.value);
  });
}

function dateTimeLocalValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function cleanPromotionIds(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

async function updatePromotion(id, payload) {
  const result = await request(`/api/admin/promotions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  state.promotions = state.promotions.map((promotion) => promotion.id === id ? result.promotion : promotion);
  renderPromotions();
}

async function deletePromotion(id) {
  await request(`/api/admin/promotions/${id}`, { method: 'DELETE' });
  state.promotions = state.promotions.filter((promotion) => promotion.id !== id);
  renderPromotions();
}

function fillLoyaltyForm() {
  if (!els.loyaltyForm || !state.store) return;
  const program = state.store.loyalty_program || {};
  els.loyaltyForm.elements.is_active.checked = program.is_active === true;
  setValue(els.loyaltyForm.elements.mode, program.mode || 'orders_reward');
  setValue(els.loyaltyForm.elements.reward, program.reward || 'Item grátis');
  setValue(els.loyaltyForm.elements.orders_required, program.orders_required || 5);
  setValue(els.loyaltyForm.elements.points_target, program.points_target || 500);
  setValue(els.loyaltyForm.elements.points_per_currency, program.points_per_currency || 1);
}

async function submitLoyalty(event) {
  event.preventDefault();
  const form = new FormData(els.loyaltyForm);
  const payload = {
    is_active: els.loyaltyForm.elements.is_active.checked,
    mode: form.get('mode'),
    reward: form.get('reward'),
    orders_required: form.get('orders_required'),
    points_target: form.get('points_target'),
    points_per_currency: form.get('points_per_currency')
  };
  const result = await request('/api/admin/loyalty', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  state.store = result.store;
  saveAdminCache();
  fillLoyaltyForm();
  hideLoyaltyForm();
  toast('Fidelidade atualizada.');
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
  const completedOrders = customerOrders.filter((order) => order.status === 'completed').length;
  const customerRevenue = customerOrders
    .filter((order) => order.status !== 'cancelled')
    .reduce((total, order) => total + Number(order.total || 0), 0);
  const lastSeen = customer.last_login_at
    ? `Último acesso ${new Date(customer.last_login_at).toLocaleDateString('pt-BR')}`
    : `Cadastrado em ${new Date(customer.created_at).toLocaleDateString('pt-BR')}`;
  const customerFormId = `customerForm-${customer.id}`;
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
        <span class="pill">${customerOrders.length} pedido${customerOrders.length === 1 ? '' : 's'}</span>
        <span class="pill">${money(customerRevenue)}</span>
      </div>
      <div class="row-actions">
        <button class="ghost-button compact" type="button" data-action="edit">Editar</button>
        <button class="danger-button compact" type="button" data-action="delete">Excluir</button>
      </div>
    </div>
    <div class="customer-dropdown" ${state.openCustomerIds.has(customer.id) ? '' : 'hidden'}>
      <form class="customer-main-form" id="${escapeAttribute(customerFormId)}">
        <div class="section-actions">
          <h3>Cadastro do cliente</h3>
          <span class="pill">${completedOrders} concluído(s)</span>
        </div>
      <div class="editor-grid">
        <label>Nome<input name="name" required value="${escapeAttribute(customer.name)}"></label>
        <label>Telefone<input name="phone" required inputmode="tel" value="${escapeAttribute(customer.phone)}"></label>
        <label>E-mail<input name="email" type="email" value="${escapeAttribute(customer.email || '')}"></label>
        <label>Nascimento<input name="birth_date" type="date" value="${escapeAttribute(customer.birth_date || '')}"></label>
        <label>Nova senha<input name="password" type="password" minlength="8" placeholder="Opcional"></label>
        <label class="editor-wide">Observações<textarea name="notes">${escapeHtml(customer.notes || '')}</textarea></label>
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
      <details class="customer-addresses customer-orders-history" ${customerOrders.length ? '' : 'open'}>
        <summary>
          <span>
            <strong>Histórico de pedidos</strong>
            <small>${customerOrders.length ? `${customerOrders.length} pedido${customerOrders.length === 1 ? '' : 's'} carregado${customerOrders.length === 1 ? '' : 's'}` : 'Nenhum pedido recente'}</small>
          </span>
          <em>Ver pedidos</em>
        </summary>
        <div class="customer-order-list">
          ${customerOrders.slice(0, 8).map(customerOrderHistoryRow).join('') || '<p class="muted">Sem pedidos recentes para este cliente.</p>'}
        </div>
      </details>
      <div class="row-actions customer-dropdown-footer">
        <button class="primary-button compact" form="${escapeAttribute(customerFormId)}">Salvar cliente</button>
      </div>
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
  card.querySelectorAll('[data-whatsapp-status]').forEach((button) => {
    button.addEventListener('click', () => {
      const order = state.orders.find((item) => item.id === button.dataset.whatsappStatus);
      if (order) notifyOrderStatus(order);
    });
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

function customerOrderHistoryRow(order) {
  const createdAt = new Date(order.created_at).toLocaleString('pt-BR');
  return `
    <article class="customer-order-row status-${order.status}">
      <div>
        <strong>#${escapeHtml(order.public_code)} - ${money(order.total)}</strong>
        <small>${createdAt} - ${statusLabel(order.status)}</small>
      </div>
      <button class="ghost-button compact" type="button" data-whatsapp-status="${escapeAttribute(order.id)}">Avisar</button>
    </article>
  `;
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

async function submitAdminUser(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(els.adminUserForm));
  const result = await request('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  state.adminUsers = [result.admin, ...state.adminUsers.filter((admin) => admin.id !== result.admin.id)];
  els.adminUserForm.reset();
  renderAdminUsers();
  toast('Conta criada.');
}

function renderAdminUsers() {
  if (!els.adminUsersPanel || !els.adminUsersList) return;
  const canManage = hasPermission('admin_users');
  els.adminUsersPanel.hidden = !canManage;
  if (!canManage) return;
  if (!state.adminUsers.length) {
    els.adminUsersList.innerHTML = '<p class="empty-state">Nenhuma conta cadastrada além da atual.</p>';
    return;
  }
  els.adminUsersList.innerHTML = state.adminUsers.map((admin) => `
    <article class="admin-user-card">
      <div class="admin-user-main">
        <div>
          <strong>${escapeHtml(admin.name)}</strong>
          <small>${escapeHtml(admin.email)}</small>
        </div>
        <span class="pill ${admin.is_active ? 'pill-ok' : 'pill-muted'}">${admin.is_active ? 'Ativa' : 'Inativa'}</span>
      </div>
      <div class="admin-user-permissions">
        <span>${escapeHtml(admin.role_label || adminRoleLabel(admin.role))}</span>
        <small>${adminPermissionSummary(admin.role)}</small>
      </div>
      <form class="admin-user-edit-form" data-admin-user-id="${escapeAttribute(admin.id)}">
        <label>Função
          <select name="role">
            ${adminRoleOptions(admin.role)}
          </select>
        </label>
        <label>Status
          <select name="is_active">
            <option value="true" ${admin.is_active ? 'selected' : ''}>Ativa</option>
            <option value="false" ${!admin.is_active ? 'selected' : ''}>Inativa</option>
          </select>
        </label>
        <label>Nova senha
          <input name="password" type="password" minlength="8" placeholder="Opcional">
        </label>
        <button class="ghost-button compact">Salvar</button>
      </form>
    </article>
  `).join('');
  els.adminUsersList.querySelectorAll('.admin-user-edit-form').forEach((form) => {
    form.addEventListener('submit', submitAdminUserUpdate);
  });
}

async function submitAdminUserUpdate(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  data.is_active = data.is_active === 'true';
  if (!String(data.password || '').trim()) delete data.password;
  const result = await request(`/api/admin/users/${form.dataset.adminUserId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  state.adminUsers = state.adminUsers.map((admin) => admin.id === result.admin.id ? result.admin : admin);
  if (state.admin?.id === result.admin.id) state.admin = result.admin;
  render();
  toast('Conta atualizada.');
}

function adminRoleOptions(selectedRole) {
  return [
    ['admin', 'Administrador'],
    ['waiter', 'Garçom'],
    ['kitchen', 'Cozinha']
  ].map(([value, label]) => `<option value="${value}" ${value === selectedRole ? 'selected' : ''}>${label}</option>`).join('');
}

function adminRoleLabel(role) {
  return ({
    admin: 'Administrador',
    waiter: 'Garçom',
    kitchen: 'Cozinha'
  })[role] || 'Administrador';
}

function adminPermissionSummary(role) {
  return ({
    admin: 'Acesso completo ao painel.',
    waiter: 'Pedidos, mesas e comandas.',
    kitchen: 'Pedidos e produção da cozinha.'
  })[role] || 'Acesso completo ao painel.';
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
      description: 'Escolha os extras que combinam com seu pedido.',
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
      description: 'Selecione uma opção para definir o tamanho do produto.',
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
      description: 'Informe como a carne deve ser preparada.',
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
      description: 'Adicione uma borda recheada se quiser.',
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
      description: 'Marque os ingredientes que não devem ir no pedido.',
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
  els.modifierGroupForm.elements.description.value = selected.description || '';
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
    els.modifierGroupForm.elements.description.value = '';
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
          <small>${escapeHtml(group.description || choicesText)}</small>
        </span>
        <em>${modifiers.length} resposta${modifiers.length === 1 ? '' : 's'}</em>
      </summary>
      <div class="modifier-group-body">
        <form class="modifier-rule-form" data-modifier-group-form="${escapeAttribute(group.id)}">
          <input name="sort_order" type="hidden" value="${Number(group.sort_order || 0)}">
          <label>Pergunta<input name="name" required value="${escapeAttribute(group.name)}"></label>
          <label>Descrição<input name="description" value="${escapeAttribute(group.description || '')}" placeholder="Ex: Escolha até 3 adicionais."></label>
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
        ${group.description ? `<p>${escapeHtml(group.description)}</p>` : ''}
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

async function submitTable(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(els.tableForm));
  data.is_active = els.tableForm.elements.is_active.checked;
  await request('/api/admin/tables', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  els.tableForm.reset();
  els.tableForm.elements.is_active.checked = true;
  await loadSummary();
  toast('Mesa cadastrada.');
}

async function submitTab(event) {
  event.preventDefault();
  await createCustomerTab(Object.fromEntries(new FormData(els.tabForm)));
  els.tabForm.reset();
}

async function updateDiningTable(id, payload) {
  await request(`/api/admin/tables/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  await loadSummary();
}

async function deleteDiningTable(id) {
  await request(`/api/admin/tables/${id}`, { method: 'DELETE' });
  await loadSummary();
  toast('Mesa excluída.');
}

async function createCustomerTab(payload) {
  await request('/api/admin/tabs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  await loadSummary();
  toast('Comanda aberta.');
}

async function closeCustomerTab(id, payload) {
  await request(`/api/admin/tabs/${id}/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  await loadSummary();
  toast('Comanda fechada.');
}

async function transferCustomerTab(id, payload) {
  await request(`/api/admin/tabs/${id}/transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  await loadSummary();
  toast('Comanda transferida.');
}

async function addItemToCustomerTab(id, payload) {
  await request(`/api/admin/tabs/${id}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  await loadSummary();
  toast('Item adicionado à comanda.');
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
  await withSaving(els.storeForm, async () => {
    const result = await request('/api/admin/store', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const updatedStore = Array.isArray(result) ? result[0] : result?.[0] || result?.store || result;
    if (updatedStore?.id) {
      state.store = updatedStore;
    } else {
      state.store = { ...(state.store || {}), ...payload };
    }
    state.storeFormDirty = false;
    saveAdminCache();
    renderOperation();
    fillStoreForm();
    toast(`Loja atualizada. WhatsApp salvo: ${payload.whatsapp_number}`);
  });
}

function printSettingsFromForm() {
  const field = (name) => els.printSettingsForm?.querySelector(`[name="${name}"]`);
  return {
    print_settings: {
      paperWidth: field('paperWidth')?.value,
      kitchenCopies: field('kitchenCopies')?.value,
      customerCopies: field('customerCopies')?.value,
      autoPrintKitchenStatus: field('autoPrintKitchenStatus')?.value,
      autoPrintKitchen: Boolean(field('autoPrintKitchen')?.checked),
      showKitchenPrices: Boolean(field('showKitchenPrices')?.checked),
      highlightNotes: field('highlightNotes') ? Boolean(field('highlightNotes').checked) : true
    }
  };
}

function fillPrintSettingsForm() {
  if (!els.printSettingsForm) return;
  const settings = currentPrintSettings();
  const field = (name) => els.printSettingsForm.querySelector(`[name="${name}"]`);
  setValue(field('paperWidth'), settings.paperWidth);
  setValue(field('kitchenCopies'), settings.kitchenCopies);
  setValue(field('customerCopies'), settings.customerCopies);
  setValue(field('autoPrintKitchenStatus'), settings.autoPrintKitchenStatus);
  if (field('autoPrintKitchen')) field('autoPrintKitchen').checked = settings.autoPrintKitchen;
  if (field('showKitchenPrices')) field('showKitchenPrices').checked = settings.showKitchenPrices;
  if (field('highlightNotes')) field('highlightNotes').checked = settings.highlightNotes;
}

function integrationSettingsFromForm(form) {
  return {
    whatsapp: {
      enabled: form.elements.integration_whatsapp_enabled?.checked || false,
      provider: form.elements.integration_whatsapp_provider?.value || 'official',
      phoneNumberId: form.elements.integration_whatsapp_phoneNumberId?.value || '',
      accessToken: form.elements.integration_whatsapp_accessToken?.value || '',
      apiUrl: form.elements.integration_whatsapp_apiUrl?.value || ''
    },
    pix: {
      enabled: form.elements.integration_pix_enabled?.checked || false,
      provider: form.elements.integration_pix_provider?.value || 'mock',
      apiKey: form.elements.integration_pix_apiKey?.value || '',
      webhookSecret: form.elements.integration_pix_webhookSecret?.value || '',
      expirationMinutes: form.elements.integration_pix_expirationMinutes?.value || 15
    }
  };
}

function fillIntegrationSettings(settings = {}) {
  const whatsapp = settings.whatsapp || {};
  const pix = settings.pix || {};
  const form = els.storeForm;
  if (!form) return;
  if (form.elements.integration_whatsapp_enabled) form.elements.integration_whatsapp_enabled.checked = Boolean(whatsapp.enabled);
  setValue(form.elements.integration_whatsapp_provider, whatsapp.provider || 'official');
  setValue(form.elements.integration_whatsapp_phoneNumberId, whatsapp.phoneNumberId || '');
  setValue(form.elements.integration_whatsapp_accessToken, whatsapp.accessToken || '');
  setValue(form.elements.integration_whatsapp_apiUrl, whatsapp.apiUrl || '');
  if (form.elements.integration_pix_enabled) form.elements.integration_pix_enabled.checked = Boolean(pix.enabled);
  setValue(form.elements.integration_pix_provider, pix.provider || 'mock');
  setValue(form.elements.integration_pix_apiKey, pix.apiKey || '');
  setValue(form.elements.integration_pix_webhookSecret, pix.webhookSecret || '');
  setValue(form.elements.integration_pix_expirationMinutes, pix.expirationMinutes || 15);
  renderIntegrationStatus(settings);
}

function renderIntegrationStatus(settings = state.store?.integration_settings || {}) {
  if (!els.integrationStatusText) return;
  const whatsapp = settings.whatsapp || {};
  const pix = settings.pix || {};
  els.integrationStatusText.textContent = `WhatsApp automático: ${whatsapp.enabled ? 'ativo' : 'desativado'} - Pix online: ${pix.enabled ? 'ativo' : 'desativado'}.`;
}

async function testIntegrations() {
  try {
    const result = await request('/api/admin/integrations/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integration_settings: integrationSettingsFromForm(els.storeForm) })
    });
    const whatsapp = result.result?.whatsapp;
    const pix = result.result?.pix;
    if (els.integrationStatusText) {
      els.integrationStatusText.textContent = `${whatsapp?.message || 'WhatsApp verificado.'} ${pix?.message || 'Pix verificado.'}`;
    }
    toast('Teste de integrações concluído.');
  } catch (error) {
    toast(error.message || 'Não foi possível testar as integrações.');
  }
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
  if (!canAccessTab(tab)) {
    const fallback = firstAllowedAdminTab();
    if (fallback && fallback !== tab) {
      activateAdminTab(fallback);
    }
    return;
  }
  const titles = {
    operation: 'Operação',
    orders: 'Pedidos',
    menu: 'Cardápio',
    reports: 'Relatórios',
    tables: 'Mesas e comandas',
    promotions: 'Promoções',
    customers: 'Clientes',
    store: 'Loja',
    account: 'Conta'
  };
  state.activeAdminTab = tab;
  els.adminTitle.textContent = titles[tab] || 'Painel';
  document.querySelectorAll('[data-admin-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.adminTab === tab);
  });
  document.querySelectorAll('[data-admin-section]').forEach((section) => {
    section.classList.toggle('active', section.dataset.adminSection === tab);
  });
}

function renderPermissionedNavigation() {
  document.querySelectorAll('[data-admin-tab]').forEach((button) => {
    const allowed = canAccessTab(button.dataset.adminTab);
    button.hidden = !allowed;
  });
  document.querySelectorAll('[data-admin-section]').forEach((section) => {
    section.hidden = !canAccessTab(section.dataset.adminSection);
  });
  if (!canAccessTab(state.activeAdminTab)) {
    activateAdminTab(firstAllowedAdminTab());
  }
}

function firstAllowedAdminTab() {
  return ['operation', 'orders', 'tables', 'menu', 'reports', 'promotions', 'customers', 'store', 'account']
    .find((tab) => canAccessTab(tab)) || 'account';
}

function canAccessTab(tab) {
  if (tab === 'account') return true;
  const permission = ({
    operation: 'operation',
    orders: 'orders',
    menu: 'menu',
    reports: 'reports',
    tables: 'tables',
    promotions: 'promotions',
    customers: 'customers',
    store: 'store'
  })[tab];
  return !permission || hasPermission(permission);
}

function hasPermission(permission) {
  const permissions = state.admin?.permissions || [];
  return permissions.includes(permission);
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
  setValue(els.storeForm.elements.delivery_neighborhood_fees, neighborhoodFeesToText(store.delivery_neighborhood_fees));
  els.storeForm.querySelectorAll('input[name="payment_methods"]').forEach((input) => {
    input.checked = paymentMethods.includes(input.value);
  });
  setValue(els.storeForm.elements.payment_methods_extra, extraPayments.join(', '));
  els.storeForm.elements.is_open.checked = store.is_open !== false;
  els.storeForm.elements.accepts_delivery.checked = store.accepts_delivery !== false;
  els.storeForm.elements.accepts_pickup.checked = store.accepts_pickup !== false;
  fillBusinessHours(store.business_hours || {});
  fillThemeSettings(store.theme_settings || {});
  fillPrintSettingsForm();
  fillIntegrationSettings(store.integration_settings || {});
  renderThemePreview();
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
  if (state.activeAdminTab !== 'orders') return;
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

async function toggleAutoPrint() {
  const settings = currentPrintSettings();
  const next = { print_settings: { ...settings, autoPrintKitchen: !settings.autoPrintKitchen } };
  await request('/api/admin/print-settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(next)
  });
  state.store = { ...(state.store || {}), print_settings: next.print_settings };
  fillPrintSettingsForm();
  renderAutoPrintButton();
}

function renderAutoPrintButton() {
  if (!els.autoPrintButton) return;
  const enabled = currentPrintSettings().autoPrintKitchen;
  els.autoPrintButton.textContent = enabled ? 'Auto cozinha ativa' : 'Auto cozinha';
  els.autoPrintButton.classList.toggle('sound-enabled', enabled);
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
    description: data.get('description'),
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
    delivery_neighborhood_fees: parseNeighborhoodFees(data.get('delivery_neighborhood_fees')),
    minimum_order: data.get('minimum_order'),
    payment_methods: [...new Set(paymentMethods)],
    business_hours: businessHoursFromForm(data),
    theme_settings: themeSettingsFromForm(form),
    print_settings: printSettingsFromForm().print_settings,
    integration_settings: integrationSettingsFromForm(form),
    is_open: data.get('is_open') === 'on',
    accepts_delivery: data.get('accepts_delivery') === 'on',
    accepts_pickup: data.get('accepts_pickup') === 'on'
  };
}

function fillThemeSettings(theme = {}) {
  const settings = { ...THEME_DEFAULTS, ...theme };
  Object.entries(settings).forEach(([key, value]) => {
    const input = els.storeForm.elements[`theme_${key}`];
    if (input) setValue(input, validThemeColor(value) ? value : THEME_DEFAULTS[key]);
  });
}

function applyThemePreset(presetKey) {
  const preset = THEME_PRESETS[presetKey];
  if (!preset) return;
  fillThemeSettings(preset);
  state.storeFormDirty = true;
  renderThemePreview();
  toast('Tema aplicado. Clique em Salvar loja para gravar.');
}

function themeSettingsFromForm(form) {
  return Object.fromEntries(Object.entries(THEME_DEFAULTS).map(([key, fallback]) => {
    const value = form.elements[`theme_${key}`]?.value;
    return [key, validThemeColor(value) ? value : fallback];
  }));
}

function renderThemePreview() {
  if (!els.themePreview || !els.storeForm) return;
  const theme = themeSettingsFromForm(els.storeForm);
  els.themePreview.style.setProperty('--preview-primary', theme.primaryColor);
  els.themePreview.style.setProperty('--preview-secondary', theme.secondaryColor);
  els.themePreview.style.setProperty('--preview-background', theme.backgroundColor);
  els.themePreview.style.setProperty('--preview-button', theme.buttonColor);
  els.themePreview.style.setProperty('--preview-button-text', theme.buttonTextColor);
  els.themePreview.style.setProperty('--preview-selection', theme.selectionColor);
  els.themePreview.style.setProperty('--preview-selection-text', theme.selectionTextColor);
}

function validThemeColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || '').trim());
}

function neighborhoodFeesToText(value) {
  if (!value || typeof value !== 'object') return '';
  return Object.entries(value)
    .map(([name, price]) => `${name}=${String(price).replace('.', ',')}`)
    .join('\n');
}

function parseNeighborhoodFees(value) {
  const fees = {};
  String(value || '').split(/\r?\n/).forEach((line) => {
    const [name, ...priceParts] = line.split('=');
    const cleanName = String(name || '').trim();
    if (!cleanName) return;
    const price = Number.parseFloat(priceParts.join('=').trim().replace(',', '.'));
    if (Number.isNaN(price) || price < 0) return;
    fees[cleanName] = price;
  });
  return fees;
}

function fillBusinessHours(hours = {}) {
  for (const [day, defaultOpen, defaultClose] of businessDayLabels) {
    const entry = hours[day] || {};
    setValue(els.storeForm.elements[`${day}_open`], entry.open || defaultOpen);
    setValue(els.storeForm.elements[`${day}_close`], entry.close || defaultClose);
    if (els.storeForm.elements[`${day}_closed`]) {
      els.storeForm.elements[`${day}_closed`].checked = Boolean(entry.closed);
    }
  }
}

function businessHoursFromForm(data) {
  return Object.fromEntries(businessDayLabels.map(([day, defaultOpen, defaultClose]) => [day, {
    open: data.get(`${day}_open`) || defaultOpen,
    close: data.get(`${day}_close`) || defaultClose,
    closed: data.get(`${day}_closed`) === 'on'
  }]));
}

function customerPayloadFromForm(form) {
  const data = new FormData(form);
  const payload = {
    customer: {
      name: data.get('name'),
      phone: data.get('phone'),
      email: data.get('email'),
      birth_date: data.get('birth_date'),
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

function clampNumber(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
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



