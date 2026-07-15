const state = {
  admin: null,
  store: null,
  categories: [],
  orders: [],
  customers: [],
  promotions: [],
  plan: null,
  storeDomains: [],
  adminUsers: [],
  diningTables: [],
  customerTabs: [],
  knownOrderIds: new Set(),
  initialOrdersLoaded: false,
  orderPollTimer: null,
  ordersRefreshing: false,
  soundEnabled: localStorage.getItem('adminSoundEnabled') === 'true',
  kitchenMode: localStorage.getItem('adminKitchenMode') === 'true',
  autoPrintAccepted: localStorage.getItem('adminAutoPrintAccepted') === 'true',
  autoPrintedKitchenIds: new Set(JSON.parse(localStorage.getItem('adminAutoPrintedKitchenIds') || '[]')),
  orderOriginFilter: 'all',
  categorySearch: '',
  categoryStatusFilter: 'all',
  productSearch: '',
  productStatusFilter: 'all',
  audioContext: null,
  storeFormDirty: false,
  integrationsFormDirty: false,
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
  pendingOrderStatuses: new Map(),
  onboardingStep: 0,
  onboardingCategoryId: null,
  onboardingOverview: null,
  activeAdminTab: 'operation',
  loadedAdminTabs: new Set(),
  loadingAdminTabs: new Set(),
  selectedAdminUserIds: new Set(),
  supportTickets: []
};

const ADMIN_CACHE_KEY = 'admin_profile_cache_v2';
const ONBOARDING_COMPLETED_KEY = 'admin_onboarding_completed_v1';
const ONBOARDING_SKIPPED_KEY = 'admin_onboarding_skipped_v1';
const ONBOARDING_STEP_LABELS = ['Boas-vindas', 'Loja', 'Operação', 'Pagamentos', 'Entrega', 'Categoria', 'Produto', 'Aparência', 'Treinamento', 'Publicar'];
const PLAN_FEATURE_CODES = [
  'orders',
  'digital_menu',
  'menu_categories',
  'tables',
  'customers',
  'promotions',
  'basic_reports',
  'store_settings',
  'admin_users',
  'manual_whatsapp',
  'automatic_whatsapp',
  'print_kitchen',
  'custom_domain'
];
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

const ADMIN_ROLE_DEFINITIONS = {
  admin: {
    label: 'Administrador',
    short: 'Tudo da loja',
    description: 'Acesso completo ao painel da loja, equipe, cardápio, pedidos, relatórios e configurações.',
    permissions: ['Operação', 'Pedidos', 'Cardápio', 'Relatórios', 'Clientes', 'Configurações', 'Usuários']
  },
  attendant: {
    label: 'Atendimento',
    short: 'Pedidos e clientes',
    description: 'Ideal para quem atende pedidos, acompanha clientes, mesas e comandas.',
    permissions: ['Pedidos', 'Mesas', 'Clientes']
  },
  waiter: {
    label: 'Garcom',
    short: 'Salao e comandas',
    description: 'Acesso focado em pedidos de mesa, comandas e atendimento no salão.',
    permissions: ['Pedidos', 'Mesas', 'Comandas']
  },
  kitchen: {
    label: 'Cozinha',
    short: 'Producao',
    description: 'Acesso simples para ver pedidos e movimentar preparo na cozinha.',
    permissions: ['Pedidos', 'Modo cozinha']
  },
  delivery: {
    label: 'Entrega',
    short: 'Entrega',
    description: 'Acesso para acompanhar pedidos e fluxo de entrega.',
    permissions: ['Pedidos', 'Entrega']
  },
  superadmin: {
    label: 'Superadmin',
    short: 'Plataforma',
    description: 'Acesso reservado para gestao da plataforma SaaS.',
    permissions: ['Plataforma', 'Todas as lojas', 'Planos']
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
  storeSwitcherWrap: document.querySelector('#storeSwitcherWrap'),
  storeSwitcher: document.querySelector('#storeSwitcher'),
  setupForm: document.querySelector('#setupForm'),
  loginForm: document.querySelector('#loginForm'),
  adminLoginMessage: document.querySelector('#adminLoginMessage'),
  logoutButton: document.querySelector('#logoutButton'),
  adminHeaderLogoutButton: document.querySelector('#adminHeaderLogoutButton'),
  supportModeBanner: document.querySelector('#supportModeBanner'),
  supportModeText: document.querySelector('#supportModeText'),
  endSupportModeButton: document.querySelector('#endSupportModeButton'),
  onboardingPanel: document.querySelector('#onboardingPanel'),
  onboardingStepText: document.querySelector('#onboardingStepText'),
  onboardingProgressBar: document.querySelector('#onboardingProgressBar'),
  onboardingStepNav: document.querySelector('#onboardingStepNav'),
  onboardingStatusMessage: document.querySelector('#onboardingStatusMessage'),
  onboardingSkipButton: document.querySelector('#onboardingSkipButton'),
  onboardingResumeButton: document.querySelector('#onboardingResumeButton'),
  onboardingReminder: document.querySelector('#onboardingReminder'),
  onboardingPublishButton: document.querySelector('#onboardingPublishButton'),
  onboardingPublicLink: document.querySelector('#onboardingPublicLink'),
  onboardingFinalChecklist: document.querySelector('#onboardingFinalChecklist'),
  onboardingSlugStatus: document.querySelector('#onboardingSlugStatus'),
  onboardingBackButton: document.querySelector('#onboardingBackButton'),
  onboardingNextButton: document.querySelector('#onboardingNextButton'),
  onboardingProductCategory: document.querySelector('#onboardingProductCategory'),
  operationTitle: document.querySelector('#operationTitle'),
  operationText: document.querySelector('#operationText'),
  operationBadge: document.querySelector('#operationBadge'),
  operationMetricOrders: document.querySelector('#operationMetricOrders'),
  operationMetricOpen: document.querySelector('#operationMetricOpen'),
  operationMetricStatus: document.querySelector('#operationMetricStatus'),
  dashboardRevenue: document.querySelector('#dashboardRevenue'),
  dashboardRevenueHint: document.querySelector('#dashboardRevenueHint'),
  dashboardProducts: document.querySelector('#dashboardProducts'),
  dashboardProductsHint: document.querySelector('#dashboardProductsHint'),
  dashboardTables: document.querySelector('#dashboardTables'),
  dashboardTablesHint: document.querySelector('#dashboardTablesHint'),
  dashboardPlan: document.querySelector('#dashboardPlan'),
  dashboardPlanHint: document.querySelector('#dashboardPlanHint'),
  dashboardAlertText: document.querySelector('#dashboardAlertText'),
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
  categorySearch: document.querySelector('#categorySearch'),
  categoryStatusFilter: document.querySelector('#categoryStatusFilter'),
  productSearch: document.querySelector('#productSearch'),
  productStatusFilter: document.querySelector('#productStatusFilter'),
  categoryPlanAlert: document.querySelector('#categoryPlanAlert'),
  productPlanAlert: document.querySelector('#productPlanAlert'),
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
  storePathPreview: document.querySelector('#storePathPreview'),
  customDomainInput: document.querySelector('#customDomainInput'),
  addDomainButton: document.querySelector('#addDomainButton'),
  customDomainList: document.querySelector('#customDomainList'),
  integrationsForm: document.querySelector('#integrationsForm'),
  printSettingsForm: document.querySelector('#printSettingsForm'),
  testIntegrationsButton: document.querySelector('#testIntegrationsButton'),
  integrationStatusText: document.querySelector('#integrationStatusText'),
  integrationHelpDialog: document.querySelector('#integrationHelpDialog'),
  integrationHelpEyebrow: document.querySelector('#integrationHelpEyebrow'),
  integrationHelpTitle: document.querySelector('#integrationHelpTitle'),
  integrationHelpBody: document.querySelector('#integrationHelpBody'),
  abacateWebhookUrl: document.querySelector('#abacateWebhookUrl'),
  themePreview: document.querySelector('#themePreview'),
  accountForm: document.querySelector('#accountForm'),
  passwordForm: document.querySelector('#passwordForm'),
  accountProfileAvatar: document.querySelector('#accountProfileAvatar'),
  accountProfileName: document.querySelector('#accountProfileName'),
  accountProfileEmail: document.querySelector('#accountProfileEmail'),
  accountProfileRole: document.querySelector('#accountProfileRole'),
  accountProfileStore: document.querySelector('#accountProfileStore'),
  deleteAccountForm: document.querySelector('#deleteAccountForm'),
  adminUserForm: document.querySelector('#adminUserForm'),
  adminUserRoleSelect: document.querySelector('#adminUserRoleSelect'),
  adminUserSearch: document.querySelector('#adminUserSearch'),
  adminUserRoleFilter: document.querySelector('#adminUserRoleFilter'),
  adminUsersBulkActions: document.querySelector('#adminUsersBulkActions'),
  selectAllAdminUsers: document.querySelector('#selectAllAdminUsers'),
  selectedAdminUsersCount: document.querySelector('#selectedAdminUsersCount'),
  deleteSelectedAdminUsersButton: document.querySelector('#deleteSelectedAdminUsersButton'),
  adminRoleOverview: document.querySelector('#adminRoleOverview'),
  adminRolePreview: document.querySelector('#adminRolePreview'),
  inviteAdminButton: document.querySelector('#inviteAdminButton'),
  adminUsersList: document.querySelector('#adminUsersList'),
  adminUsersPanel: document.querySelector('#adminUsersPanel'),
  refreshPlanButton: document.querySelector('#refreshPlanButton'),
  planAlerts: document.querySelector('#planAlerts'),
  planSummary: document.querySelector('#planSummary'),
  planBilling: document.querySelector('#planBilling'),
  planRenewal: document.querySelector('#planRenewal'),
  planUsage: document.querySelector('#planUsage'),
  planFeatures: document.querySelector('#planFeatures'),
  planCompare: document.querySelector('#planCompare'),
  planHistory: document.querySelector('#planHistory'),
  adminSupportTicketForm: document.querySelector('#adminSupportTicketForm'),
  adminSupportTicketList: document.querySelector('#adminSupportTicketList'),
  refreshSupportTicketsButton: document.querySelector('#refreshSupportTicketsButton'),
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
els.endSupportModeButton?.addEventListener('click', endSupportMode);
els.storeSwitcher?.addEventListener('change', switchStore);
els.refreshPlanButton?.addEventListener('click', () => loadPlanData({ force: true }));
els.onboardingBackButton?.addEventListener('click', previousOnboardingStep);
els.onboardingNextButton?.addEventListener('click', nextOnboardingStep);
els.onboardingSkipButton?.addEventListener('click', skipOnboardingForNow);
els.onboardingResumeButton?.addEventListener('click', reopenOnboarding);
els.onboardingPublishButton?.addEventListener('click', publishOnboardingFromWizard);
document.querySelectorAll('[data-reopen-onboarding]').forEach((button) => {
  button.addEventListener('click', reopenOnboarding);
});
els.startOperationButton?.addEventListener('click', startOperation);
els.stopOperationButton?.addEventListener('click', stopOperation);
els.refreshAdminButton.addEventListener('click', () => loadSummary());
els.adminOrders.addEventListener('dragend', finishOrderDrag);
els.orderOriginFilter?.addEventListener('change', () => {
  state.orderOriginFilter = els.orderOriginFilter.value || 'all';
  renderOrders();
});
els.categorySearch?.addEventListener('input', () => {
  state.categorySearch = els.categorySearch.value || '';
  renderCategoryEditors();
});
els.categoryStatusFilter?.addEventListener('change', () => {
  state.categoryStatusFilter = els.categoryStatusFilter.value || 'all';
  renderCategoryEditors();
});
els.productSearch?.addEventListener('input', () => {
  state.productSearch = els.productSearch.value || '';
  renderProductEditors();
});
els.productStatusFilter?.addEventListener('change', () => {
  state.productStatusFilter = els.productStatusFilter.value || 'all';
  renderProductEditors();
});
document.querySelectorAll('[data-admin-tab-jump]').forEach((button) => {
  button.addEventListener('click', () => activateAdminTab(button.dataset.adminTabJump));
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.admin) {
    refreshOrdersOnly({ silent: true, skipNotifications: true }).catch(() => {});
  }
});
els.refreshCategoriesButton.addEventListener('click', () => loadMenuData({ force: true }));
els.refreshProductsButton.addEventListener('click', () => loadMenuData({ force: true }));
els.refreshModifiersButton?.addEventListener('click', () => loadMenuData({ force: true }));
els.newCategoryButton.addEventListener('click', openNewCategoryDialog);
els.clearQueueButton.addEventListener('click', clearOrderQueue);
els.archiveClosedOrdersButton?.addEventListener('click', archiveClosedOrders);
els.loadReportButton.addEventListener('click', loadDailyReport);
els.exportReportCsvButton?.addEventListener('click', exportCurrentReportCsv);
els.printReportButton?.addEventListener('click', printCurrentReport);
els.refreshTablesButton?.addEventListener('click', () => loadTablesData({ force: true }));
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
els.addDomainButton?.addEventListener('click', addCustomDomain);
els.integrationsForm?.addEventListener('submit', submitIntegrations);
els.storeForm.addEventListener('input', () => {
  state.storeFormDirty = true;
  renderStorePathPreview();
  renderThemePreview();
});
els.storeForm.addEventListener('change', () => {
  state.storeFormDirty = true;
  renderStorePathPreview();
  renderThemePreview();
});
els.integrationsForm?.addEventListener('input', () => {
  state.integrationsFormDirty = true;
});
els.integrationsForm?.addEventListener('change', () => {
  state.integrationsFormDirty = true;
});
els.integrationsForm?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-integration-help]');
  if (!button) return;
  openIntegrationHelp(button.dataset.integrationHelp);
});
els.storeForm.addEventListener('click', (event) => {
  const button = event.target.closest('[data-theme-preset]');
  if (!button) return;
  applyThemePreset(button.dataset.themePreset);
});
els.testIntegrationsButton?.addEventListener('click', testIntegrations);
els.accountForm.addEventListener('submit', submitAccount);
els.passwordForm.addEventListener('submit', submitPassword);
els.deleteAccountForm?.addEventListener('submit', submitDeleteAccount);
els.adminUserForm?.addEventListener('submit', submitAdminUser);
els.adminUserRoleSelect?.addEventListener('change', renderAdminRolePreview);
els.adminUserSearch?.addEventListener('input', renderAdminUsers);
els.adminUserRoleFilter?.addEventListener('change', renderAdminUsers);
els.selectAllAdminUsers?.addEventListener('change', toggleVisibleAdminUsersSelection);
els.deleteSelectedAdminUsersButton?.addEventListener('click', deleteSelectedAdminUsers);
els.adminSupportTicketForm?.addEventListener('submit', submitAdminSupportTicket);
els.refreshSupportTicketsButton?.addEventListener('click', () => loadSupportTickets({ force: true }));
els.inviteAdminButton?.addEventListener('click', submitAdminInvitation);
els.promotionForm?.addEventListener('submit', submitPromotion);
els.cancelPromotionEditButton?.addEventListener('click', resetPromotionForm);
els.openPromotionFormButton?.addEventListener('click', () => {
  resetPromotionForm({ keepOpen: true });
  showPromotionForm();
});
els.openLoyaltyFormButton?.addEventListener('click', showLoyaltyForm);
els.closeLoyaltyFormButton?.addEventListener('click', hideLoyaltyForm);
els.loyaltyForm?.addEventListener('submit', submitLoyalty);

initStoreAccordions();
renderKitchenModeButton();
renderAutoPrintButton();
init();

function initStoreAccordions() {
  const sections = [...document.querySelectorAll('#storeForm .store-settings-section')];
  sections.forEach((section, index) => {
    if (section.dataset.accordionReady) return;
    section.dataset.accordionReady = 'true';
    section.classList.add('store-settings-dropdown');
    section.style.setProperty('--section-accent', storeSettingsAccent(index));

    const copy = section.querySelector('.store-settings-copy');
    const fields = section.querySelector('.store-settings-fields');
    if (!copy || !fields) return;

    const title = copy.querySelector('strong')?.textContent?.trim() || `Configuração ${index + 1}`;
    const description = copy.querySelector('p')?.textContent?.trim() || '';
    const panelId = `storeSettingsPanel-${index}`;
    const isOpen = index === 0;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'store-settings-toggle';
    toggle.setAttribute('aria-controls', panelId);
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.innerHTML = `
      <span>
        <strong>${escapeHtml(title)}</strong>
        ${description ? `<small>${escapeHtml(description)}</small>` : ''}
      </span>
    `;

    fields.id = panelId;
    fields.hidden = !isOpen;
    section.classList.toggle('is-open', isOpen);
    copy.hidden = true;
    section.insertBefore(toggle, copy);

    toggle.addEventListener('click', () => {
      const nextOpen = fields.hidden;
      fields.hidden = !nextOpen;
      section.classList.toggle('is-open', nextOpen);
      toggle.setAttribute('aria-expanded', String(nextOpen));
    });
  });
}

function storeSettingsAccent(index) {
  return ['#dc2626', '#f97316', '#2563eb', '#7c3aed', '#059669', '#ca8a04', '#0891b2'][index % 7];
}

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
  const button = els.loginForm.querySelector('button[type="submit"], button:not([type])');
  if (els.adminLoginMessage) els.adminLoginMessage.textContent = '';
  if (button) {
    button.disabled = true;
    button.textContent = 'Entrando...';
  }
  try {
    const result = await request('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    state.admin = result.admin;
    saveAdminCache();
    showPanel();
    await loadAdminData();
  } catch (error) {
    const message = error.message || 'Não foi possível entrar. Confira os dados e tente novamente.';
    if (els.adminLoginMessage) els.adminLoginMessage.textContent = message;
    toast(message);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Entrar';
    }
  }
}

async function logout() {
  await request('/api/admin/logout', { method: 'POST' });
  state.admin = null;
  clearAdminCache();
  stopOrderPolling();
  showAuth();
}

async function endSupportMode() {
  if (!state.admin?.support_mode?.active) return;
  if (els.endSupportModeButton) {
    els.endSupportModeButton.disabled = true;
    els.endSupportModeButton.textContent = 'Encerrando...';
  }
  try {
    const result = await request('/api/platform/support/impersonate/end', { method: 'POST' });
    clearAdminCache();
    stopOrderPolling();
    toast('Modo suporte encerrado.');
    window.location.href = result.restored ? '/platform' : '/admin';
  } catch (error) {
    toast(error.message || 'Não foi possível encerrar o modo suporte.');
  } finally {
    if (els.endSupportModeButton) {
      els.endSupportModeButton.disabled = false;
      els.endSupportModeButton.textContent = 'Encerrar modo suporte';
    }
  }
}

async function switchStore(event) {
  const storeId = event.target.value;
  if (!storeId || storeId === state.admin?.store_id) return;
  try {
    const result = await request('/api/admin/stores/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id: storeId })
    });
    state.admin = result.admin;
    resetLoadedStoreState();
    saveAdminCache();
    await loadAdminData();
    toast(`Loja ativa: ${state.admin.active_store?.name || 'selecionada'}.`);
  } catch (error) {
    toast(error.message || 'Não foi possível trocar a loja.');
    renderStoreSwitcher();
  }
}

function resetLoadedStoreState() {
  state.store = null;
  state.categories = [];
  state.orders = [];
  state.customers = [];
  state.promotions = [];
  state.diningTables = [];
  state.customerTabs = [];
  state.knownOrderIds = new Set();
  state.initialOrdersLoaded = false;
  state.loadedAdminTabs = new Set();
  state.loadingAdminTabs = new Set();
  state.editingCategoryId = null;
  state.editingProductId = null;
  state.editingPromotionId = null;
  state.selectedTableId = null;
}

async function loadAdminData() {
  try {
    await loadSummary();
    await loadAdminTabData(state.activeAdminTab);
  } catch (error) {
    toast(error.message || 'Não foi possível atualizar os dados do painel.');
  }
}

async function loadSummary(options = {}) {
  const previousIds = new Set(state.knownOrderIds);
  const startedAt = performance.now();
  const data = await request('/api/admin/summary');
  state.store = data.store || null;
  if ('categories' in data) state.categories = data.categories || [];
  if ('orders' in data) state.orders = data.orders || [];
  if ('customers' in data) state.customers = data.customers || [];
  if ('promotions' in data) state.promotions = data.promotions || [];
  if ('admins' in data) state.adminUsers = data.admins || [];
  if ('dining_tables' in data) state.diningTables = data.dining_tables || [];
  if ('customer_tabs' in data) state.customerTabs = data.customer_tabs || [];
  if (Array.isArray(data.permissions)) state.admin.permissions = data.permissions;
  if (data.plan_access) state.admin.plan_access = data.plan_access;
  saveAdminCache();
  detectNewOrders(previousIds, state.orders, options);
  state.knownOrderIds = new Set(state.orders.map((order) => String(order.id)));
  state.initialOrdersLoaded = true;
  state.loadedAdminTabs.add('operation');
  state.loadedAdminTabs.add('orders');
  logSlowClientLoad('summary', startedAt);
  render();
  if (!state.plan) loadPlanData({ force: true, background: true }).catch(() => {});
}

async function refreshOrdersOnly(options = {}) {
  if (state.ordersRefreshing) return;
  state.ordersRefreshing = true;
  const previousIds = new Set(state.knownOrderIds);
  const startedAt = performance.now();
  try {
    const data = await request('/api/admin/orders');
    state.orders = data.orders || [];
    detectNewOrders(previousIds, state.orders, options);
    state.knownOrderIds = new Set(state.orders.map((order) => String(order.id)));
    state.initialOrdersLoaded = true;
    logSlowClientLoad('orders', startedAt);
    renderOperation();
    renderOrderMetrics();
    renderOrders();
    renderTables();
    renderTableManager();
  } finally {
    state.ordersRefreshing = false;
  }
}

function logSlowClientLoad(scope, startedAt) {
  const elapsed = Math.round(performance.now() - startedAt);
  if (elapsed > 1200) console.warn(`Carregamento admin lento (${scope}): ${elapsed}ms`);
}

async function loadAdminTabData(tab, options = {}) {
  if (!canAccessTab(tab)) return;
  if (!options.force && state.loadedAdminTabs.has(tab)) return;
  if (state.loadingAdminTabs.has(tab)) return;
  state.loadingAdminTabs.add(tab);
  try {
    if (tab === 'orders' || tab === 'operation') {
      await refreshOrdersOnly({ silent: true });
      state.loadedAdminTabs.add(tab);
      return;
    }
    if (tab === 'menu') {
      await loadMenuData(options);
      return;
    }
    if (tab === 'tables') {
      await loadTablesData(options);
      return;
    }
    if (tab === 'customers') {
      await loadCustomersData(options);
      return;
    }
    if (tab === 'promotions') {
      await Promise.all([loadPromotionsData(options), loadMenuData(options), loadStoreData(options)]);
      return;
    }
    if (tab === 'store' || tab === 'integrations') {
      await loadStoreData(options);
      return;
    }
    if (tab === 'plan') {
      await loadPlanData(options);
      return;
    }
    if (tab === 'support') {
      await loadSupportTickets(options);
      return;
    }
    if (tab === 'account') {
      await loadAdminUsersData(options);
      return;
    }
    if (tab === 'reports') {
      await loadReportPreset(activeReportPreset() || 'today');
      state.loadedAdminTabs.add('reports');
    }
  } catch (error) {
    toast(error.message || 'Não foi possível carregar esta área.');
  } finally {
    state.loadingAdminTabs.delete(tab);
  }
}

async function loadMenuData(options = {}) {
  if (!options.force && state.loadedAdminTabs.has('menu')) return;
  const startedAt = performance.now();
  const data = await request('/api/admin/menu-data');
  state.categories = data.categories || [];
  state.loadedAdminTabs.add('menu');
  logSlowClientLoad('menu', startedAt);
  renderMenu();
  renderCategoryOptions();
  renderPromotionOptions();
  if (options.force && options.refreshPlan !== false && state.loadedAdminTabs.has('plan')) {
    await loadPlanData({ force: true });
  }
}

async function loadCustomersData(options = {}) {
  if (!options.force && state.loadedAdminTabs.has('customers')) return;
  const startedAt = performance.now();
  const data = await request('/api/admin/customers');
  state.customers = data.customers || [];
  state.loadedAdminTabs.add('customers');
  logSlowClientLoad('customers', startedAt);
  renderCustomers();
  renderOrderMetrics();
}

async function loadPromotionsData(options = {}) {
  if (!options.force && state.loadedAdminTabs.has('promotions')) return;
  const startedAt = performance.now();
  const data = await request('/api/admin/promotions');
  state.promotions = data.promotions || [];
  state.loadedAdminTabs.add('promotions');
  logSlowClientLoad('promotions', startedAt);
  renderPromotions();
}

async function loadTablesData(options = {}) {
  if (!options.force && state.loadedAdminTabs.has('tables')) return;
  const startedAt = performance.now();
  const data = await request('/api/admin/tables');
  state.diningTables = data.tables || [];
  state.customerTabs = data.tabs || [];
  state.loadedAdminTabs.add('tables');
  logSlowClientLoad('tables', startedAt);
  renderTables();
  renderTableManager();
}

async function loadStoreData(options = {}) {
  if (!options.force && state.loadedAdminTabs.has('store')) return;
  const startedAt = performance.now();
  const [data, domains] = await Promise.all([
    request('/api/admin/store'),
    request('/api/admin/domains').catch(() => ({ domains: [] })),
    loadMenuData({ force: true }).catch(() => null)
  ]);
  state.store = data.store || state.store;
  state.storeDomains = domains.domains || [];
  await loadOnboardingOverview();
  state.loadedAdminTabs.add('store');
  state.loadedAdminTabs.add('integrations');
  logSlowClientLoad('store', startedAt);
  applyFavicon(state.store?.favicon_url);
  fillStoreForm();
  renderCustomDomains();
  if (!state.integrationsFormDirty) fillIntegrationSettings(state.store?.integration_settings || {});
  fillPrintSettingsForm();
  fillLoyaltyForm();
  renderOperation();
  renderOnboarding();
}

async function loadOnboardingOverview() {
  if (!els.onboardingPanel) return null;
  try {
    state.onboardingOverview = await request('/api/admin/onboarding');
  } catch (error) {
    state.onboardingOverview = null;
  }
  return state.onboardingOverview;
}

async function loadAdminUsersData(options = {}) {
  if (!hasPermission('admin_users')) return;
  if (!options.force && state.loadedAdminTabs.has('account')) return;
  const startedAt = performance.now();
  const data = await request('/api/admin/users');
  state.adminUsers = data.admins || [];
  state.loadedAdminTabs.add('account');
  logSlowClientLoad('admin-users', startedAt);
  renderAdminUsers();
}

async function loadPlanData(options = {}) {
  if (!options.force && state.loadedAdminTabs.has('plan')) return;
  const startedAt = performance.now();
  const data = await request('/api/admin/plan');
  state.plan = data;
  if (state.admin && Array.isArray(data.features)) {
    state.admin.plan_access = planFeaturesToAccess(data.features);
  }
  state.loadedAdminTabs.add('plan');
  logSlowClientLoad('plan', startedAt);
  renderPlan();
  renderOperation();
  renderPlanFeatureHints();
}

function render() {
  els.adminUser.textContent = state.admin ? `${state.admin.name} - ${state.admin.email}` : 'Painel';
  renderSupportModeBanner();
  renderStoreSwitcher();
  renderOperation();
  renderOrderMetrics();
  renderOrders();
  renderCustomers();
  renderPromotions();
  renderTables();
  renderPlan();
  renderTableManager();
  renderPromotionOptions();
  renderMenu();
  renderCategoryOptions();
  renderPlanFeatureHints();
  renderPermissionedNavigation();
  renderAdminUsers();
  fillStoreForm();
  applyFavicon(state.store?.favicon_url);
  if (!state.integrationsFormDirty) fillIntegrationSettings(state.store?.integration_settings || {});
  fillPrintSettingsForm();
  fillLoyaltyForm();
  fillAccountForm();
  renderOnboarding();
  renderSoundButton();
}

function renderSupportModeBanner() {
  if (!els.supportModeBanner) return;
  const supportMode = state.admin?.support_mode;
  els.supportModeBanner.hidden = !supportMode?.active;
  if (!supportMode?.active) return;
  const storeName = supportMode.target_store_name || state.admin?.active_store?.name || 'loja';
  const expires = supportMode.expires_at ? new Date(supportMode.expires_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'em breve';
  if (els.supportModeText) {
    els.supportModeText.textContent = `Loja: ${storeName}. Sessão expira às ${expires}. Ações sensíveis ficam bloqueadas.`;
  }
}

function adminStoreHomeUrl() {
  const store = state.admin?.active_store || state.store || state.admin?.stores?.[0] || null;
  return store?.public_url || (store?.slug ? '/' + store.slug : '/cardapio');
}

function updateAdminStoreHomeLinks() {
  document.querySelectorAll('[data-admin-store-home]').forEach((link) => {
    link.href = adminStoreHomeUrl();
  });
}

function renderStoreSwitcher() {
  const stores = Array.isArray(state.admin?.stores) ? state.admin.stores : [];
  const activeId = state.admin?.store_id || state.admin?.active_store?.id || '';
  if (!els.storeSwitcher || !els.storeSwitcherWrap) return;
  els.storeSwitcherWrap.hidden = stores.length <= 1;
  els.storeSwitcher.innerHTML = stores.map((store) => `
    <option value="${escapeAttribute(store.id)}"${store.id === activeId ? ' selected' : ''}>${escapeHtml(store.name || store.slug || 'Loja')}</option>
  `).join('');
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
    els.operationText.textContent = 'Buscando o status real da loja antes de liberar qualquer ação.';
    els.operationBadge.textContent = 'Carregando';
    els.operationBadge.classList.remove('closed');
    els.operationMetricOrders.textContent = '-';
    els.operationMetricOpen.textContent = '-';
    els.operationMetricStatus.textContent = '-';
    if (els.dashboardRevenue) els.dashboardRevenue.textContent = '-';
    if (els.dashboardProducts) els.dashboardProducts.textContent = '-';
    if (els.dashboardTables) els.dashboardTables.textContent = '-';
    if (els.dashboardPlan) els.dashboardPlan.textContent = '-';
    if (els.dashboardAlertText) els.dashboardAlertText.textContent = 'Carregando dados da loja.';
    els.startOperationButton.disabled = true;
    els.stopOperationButton.disabled = true;
    return;
  }

  const isOpen = state.store?.is_open !== false;
  const openOrders = state.orders.filter((order) => !['completed', 'cancelled'].includes(order.status)).length;
  const todayList = todaysOrders();
  const todayOrders = todayList.length;
  const todayRevenue = todayList
    .filter((order) => order.status !== 'cancelled')
    .reduce((sum, order) => sum + Number(order.total || 0), 0);
  const activeProducts = state.categories.reduce((sum, category) => (
    sum + (category.items || []).filter((item) => item.is_available !== false).length
  ), 0);
  const activeTables = state.diningTables.filter((table) => table.is_active !== false).length;
  const plan = state.plan?.plan || {};
  const subscription = state.plan?.subscription || {};
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
  if (els.dashboardRevenue) els.dashboardRevenue.textContent = money(todayRevenue);
  if (els.dashboardRevenueHint) els.dashboardRevenueHint.textContent = `${todayOrders} pedido(s) hoje, ${openOrders} em aberto.`;
  if (els.dashboardProducts) els.dashboardProducts.textContent = activeProducts;
  if (els.dashboardProductsHint) els.dashboardProductsHint.textContent = `${state.categories.length} categoria(s) cadastrada(s).`;
  if (els.dashboardTables) els.dashboardTables.textContent = activeTables;
  if (els.dashboardTablesHint) els.dashboardTablesHint.textContent = `${state.customerTabs.filter((tab) => tab.status === 'open').length} comanda(s) aberta(s).`;
  if (els.dashboardPlan) els.dashboardPlan.textContent = plan.name || 'Carregando';
  if (els.dashboardPlanHint) {
    const status = subscription.status ? commercialStatusLabel(subscription.status) : 'Abra Meu plano para detalhes.';
    els.dashboardPlanHint.textContent = status;
  }
  if (els.dashboardAlertText) els.dashboardAlertText.textContent = dashboardAlertMessage({ isOpen, openOrders, activeProducts, activeTables, plan });
}

function dashboardAlertMessage({ isOpen, openOrders, activeProducts, activeTables, plan }) {
  if (!state.store?.onboarding_completed) return 'Configuração inicial incompleta. Termine o onboarding para publicar com segurança.';
  if (!isOpen) return 'A loja está offline. Inicie a operação para receber pedidos.';
  if (!activeProducts) return 'Nenhum produto ativo no cardápio. Ative ou cadastre um produto antes de divulgar.';
  if (openOrders > 0) return `${openOrders} pedido(s) precisam de acompanhamento agora.`;
  if (!activeTables) return 'Cadastre mesas para usar QR Code e comandas no salão.';
  if (!plan?.name) return 'Plano ainda carregando. Confira limites e recursos em Meu plano.';
  return 'Tudo pronto para operar. Acompanhe novos pedidos e mantenha o cardápio atualizado.';
}

function renderOnboarding() {
  if (!els.onboardingPanel || !state.store) return;
  const completed = state.store.onboarding_completed === true || state.onboardingOverview?.progress?.is_completed === true;
  const skipped = localStorage.getItem(onboardingStorageKey(ONBOARDING_SKIPPED_KEY)) === 'true';
  if (completed) {
    localStorage.setItem(onboardingStorageKey(ONBOARDING_COMPLETED_KEY), 'true');
    localStorage.removeItem(onboardingStorageKey(ONBOARDING_SKIPPED_KEY));
  }
  els.onboardingPanel.hidden = completed || skipped;
  if (els.onboardingReminder) els.onboardingReminder.hidden = completed || !skipped;
  if (completed) return;
  fillOnboardingDefaults();
  updateOnboardingProductCategories();
  renderOnboardingStepNav();
  renderOnboardingChecklist();
  showOnboardingStep(state.onboardingStep);
}

function fillOnboardingDefaults() {
  const store = state.store || {};
  const storeForm = document.querySelector('[data-onboarding-step="1"]');
  if (storeForm) {
    setValue(storeForm.elements.name, store.name);
    setValue(storeForm.elements.slug, store.slug);
    setValue(storeForm.elements.description, store.description);
    setValue(storeForm.elements.address, store.address);
    setValue(storeForm.elements.whatsapp_number, store.whatsapp_number);
  }

  const hoursForm = document.querySelector('[data-onboarding-step="2"]');
  const monday = store.business_hours?.monday || {};
  if (hoursForm && !hoursForm.elements.open.value) hoursForm.elements.open.value = monday.open || '18:00';
  if (hoursForm && !hoursForm.elements.close.value) hoursForm.elements.close.value = monday.close || '23:00';
  if (hoursForm?.elements.accepts_delivery) hoursForm.elements.accepts_delivery.checked = store.accepts_delivery !== false;
  if (hoursForm?.elements.accepts_pickup) hoursForm.elements.accepts_pickup.checked = store.accepts_pickup !== false;

  document.querySelectorAll('[data-onboarding-step="3"] input[name="payment_methods"]').forEach((input) => {
    input.checked = (store.payment_methods || ['Pix', 'Dinheiro']).includes(input.value);
  });

  const deliveryForm = document.querySelector('[data-onboarding-step="4"]');
  if (deliveryForm && !deliveryForm.elements.delivery_fee.value) deliveryForm.elements.delivery_fee.value = store.delivery_fee || 0;
  if (deliveryForm && !deliveryForm.elements.minimum_order.value) deliveryForm.elements.minimum_order.value = store.minimum_order || 0;
  if (deliveryForm && !deliveryForm.elements.delivery_neighborhood_fees.value) {
    deliveryForm.elements.delivery_neighborhood_fees.value = neighborhoodFeesToText(store.delivery_neighborhood_fees);
  }

  const appearanceForm = document.querySelector('[data-onboarding-step="7"]');
  if (appearanceForm) {
    setValue(appearanceForm.elements.logo_url, store.logo_url);
    setValue(appearanceForm.elements.cover_url, store.cover_url);
    setValue(appearanceForm.elements.theme_primaryColor, store.theme_settings?.primaryColor || THEME_PRESETS.classic.primaryColor);
    setValue(appearanceForm.elements.theme_buttonColor, store.theme_settings?.buttonColor || THEME_PRESETS.classic.buttonColor);
    setValue(appearanceForm.elements.theme_backgroundColor, store.theme_settings?.backgroundColor || THEME_PRESETS.classic.backgroundColor);
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
  if (els.onboardingNextButton) {
    els.onboardingNextButton.hidden = state.onboardingStep === max;
    els.onboardingNextButton.textContent = 'Salvar e continuar';
  }
  renderOnboardingStepNav();
  renderOnboardingChecklist();
}

function renderOnboardingStepNav() {
  if (!els.onboardingStepNav) return;
  const steps = [...document.querySelectorAll('[data-onboarding-step]')];
  const completed = new Set(state.onboardingOverview?.progress?.completed_steps || []);
  els.onboardingStepNav.innerHTML = steps.map((form, index) => {
    const key = form.dataset.onboardingKey || String(index);
    const done = completed.has(key) || inferredOnboardingDone(key);
    return `<button class="${index === state.onboardingStep ? 'active' : ''} ${done ? 'done' : ''}" type="button" data-onboarding-jump="${index}"><span>${index + 1}</span>${escapeHtml(ONBOARDING_STEP_LABELS[index] || key)}</button>`;
  }).join('');
  els.onboardingStepNav.querySelectorAll('[data-onboarding-jump]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = Number(button.dataset.onboardingJump);
      if (canJumpToOnboardingStep(target)) {
        setOnboardingStatus('');
        showOnboardingStep(target);
        return;
      }
      setOnboardingStatus('Salve as etapas anteriores antes de avançar para este passo.');
      els.onboardingNextButton?.focus();
    });
  });
}

function canJumpToOnboardingStep(target) {
  if (!Number.isFinite(target) || target <= state.onboardingStep) return true;
  const steps = [...document.querySelectorAll('[data-onboarding-step]')];
  return steps.slice(0, target).every((form) => {
    const key = form.dataset.onboardingKey || '';
    return (state.onboardingOverview?.progress?.completed_steps || []).includes(key) || inferredOnboardingDone(key);
  });
}

function renderOnboardingChecklist() {
  if (!els.onboardingFinalChecklist) return;
  const checks = [
    ['Dados da loja', Boolean(state.store?.name && state.store?.slug && state.store?.whatsapp_number)],
    ['Operação configurada', Boolean(state.store?.business_hours && Object.keys(state.store.business_hours || {}).length)],
    ['Pagamentos definidos', Array.isArray(state.store?.payment_methods) && state.store.payment_methods.length > 0],
    ['Entrega revisada', state.store?.delivery_fee !== undefined && state.store?.minimum_order !== undefined],
    ['Categoria criada', state.categories.length > 0],
    ['Produto criado', state.categories.some((category) => (category.items || []).length > 0)],
    ['Treinamento visto', (state.onboardingOverview?.progress?.completed_steps || []).includes('training')]
  ];
  els.onboardingFinalChecklist.innerHTML = checks.map(([label, done]) => `
    <article class="${done ? 'done' : ''}">
      <span>${done ? 'OK' : 'Pendente'}</span>
      <strong>${escapeHtml(label)}</strong>
    </article>
  `).join('');
  if (els.onboardingPublicLink) els.onboardingPublicLink.href = adminStoreHomeUrl();
}

function inferredOnboardingDone(key) {
  if (key === 'welcome') return true;
  if (key === 'store') return Boolean(state.store?.name && state.store?.slug && state.store?.whatsapp_number);
  if (key === 'operation') return Boolean(state.store?.business_hours && Object.keys(state.store.business_hours || {}).length);
  if (key === 'payments') return Array.isArray(state.store?.payment_methods) && state.store.payment_methods.length > 0;
  if (key === 'delivery') return state.store?.delivery_fee !== undefined && state.store?.minimum_order !== undefined;
  if (key === 'category') return state.categories.length > 0;
  if (key === 'product') return state.categories.some((category) => (category.items || []).length > 0);
  if (key === 'appearance') return Boolean(state.store?.logo_url || state.store?.cover_url || Object.keys(state.store?.theme_settings || {}).length);
  if (key === 'publish') return state.store?.onboarding_completed === true;
  return false;
}

function previousOnboardingStep() {
  showOnboardingStep(state.onboardingStep - 1);
}

async function nextOnboardingStep() {
  const form = document.querySelector(`[data-onboarding-step="${state.onboardingStep}"]`);
  if (!form?.reportValidity()) return;
  els.onboardingNextButton.disabled = true;
  setOnboardingStatus('');
  try {
    await saveOnboardingStep(state.onboardingStep, new FormData(form));
    const total = document.querySelectorAll('[data-onboarding-step]').length;
    if (state.onboardingStep >= total - 1) return;
    showOnboardingStep(state.onboardingStep + 1);
    toast('Etapa salva.');
  } catch (error) {
    setOnboardingStatus(error.message || 'Não foi possível salvar esta etapa.');
    toast(error.message || 'Não foi possível salvar esta etapa.');
  } finally {
    els.onboardingNextButton.disabled = false;
  }
}

async function saveOnboardingStep(step, data) {
  const form = document.querySelector(`[data-onboarding-step="${step}"]`);
  const key = form?.dataset.onboardingKey || String(step);
  if (step === 0) {
    await saveOnboardingProgress(key);
    return;
  }
  if (step === 1) {
    const name = cleanText(data.get('name'));
    const slug = publicSlug(data.get('slug') || name);
    const whatsapp = digits(data.get('whatsapp_number'));
    if (!name) throw new Error('Informe o nome da loja.');
    if (!slug || slug.length < 3) throw new Error('Informe um link público válido.');
    if (!whatsapp || whatsapp.length < 12) throw new Error('Informe o WhatsApp com DDI e DDD.');
    await validateOnboardingSlug(slug);
    await updateOnboardingStore({
      name,
      slug,
      description: data.get('description'),
      address: data.get('address'),
      whatsapp_number: whatsapp
    });
  }
  if (step === 2) {
    await updateOnboardingStore({
      accepts_delivery: data.get('accepts_delivery') === 'on',
      accepts_pickup: data.get('accepts_pickup') === 'on',
      business_hours: businessHoursEveryDay(data.get('open') || '18:00', data.get('close') || '23:00'),
      is_open: false
    });
    await saveOnboardingProgress(key, {
      accepts_counter: data.get('accepts_counter') === 'on',
      accepts_tables: data.get('accepts_tables') === 'on',
      start_closed: data.get('start_closed') === 'on'
    });
    return;
  }
  if (step === 3) {
    const paymentMethods = data.getAll('payment_methods');
    if (!paymentMethods.length) throw new Error('Escolha ao menos uma forma de pagamento.');
    await updateOnboardingStore({ payment_methods: paymentMethods });
    await saveOnboardingProgress(key, { payment_notes: cleanText(data.get('payment_notes')) });
    return;
  }
  if (step === 4) {
    await updateOnboardingStore({
      delivery_fee: data.get('delivery_fee'),
      minimum_order: data.get('minimum_order'),
      delivery_neighborhood_fees: parseNeighborhoodFees(data.get('delivery_neighborhood_fees'))
    });
  }
  if (step === 5) {
    const name = cleanText(data.get('name'));
    if (!state.categories.length || name) {
      if (!name) throw new Error('Informe o nome da primeira categoria.');
      const category = await createOnboardingCategory({
        name,
        description: data.get('description'),
        sort_order: nextCategorySortOrder(),
        is_active: true
      });
      state.onboardingCategoryId = category?.id || state.onboardingCategoryId;
      await loadMenuData({ force: true });
      updateOnboardingProductCategories();
    }
  }
  if (step === 6) {
    const categoryId = data.get('category_id') || state.onboardingCategoryId || state.categories[0]?.id;
    const name = cleanText(data.get('name'));
    const price = Number.parseFloat(String(data.get('price') || '').replace(',', '.'));
    if (!categoryId) throw new Error('Crie uma categoria antes do produto.');
    if (!name) throw new Error('Informe o nome do produto inicial.');
    if (!Number.isFinite(price) || price <= 0) throw new Error('Informe um preço válido para o produto.');
    await request('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category_id: categoryId,
        name,
        description: data.get('description'),
        price,
        is_featured: true,
        is_available: true,
        sort_order: 0,
        tags: []
      })
    });
    await loadMenuData({ force: true });
  }
  if (step === 7) {
    await updateOnboardingStore({
      logo_url: data.get('logo_url'),
      cover_url: data.get('cover_url'),
      theme_settings: {
        ...(state.store?.theme_settings || {}),
        primaryColor: data.get('theme_primaryColor') || THEME_PRESETS.classic.primaryColor,
        buttonColor: data.get('theme_buttonColor') || THEME_PRESETS.classic.buttonColor,
        backgroundColor: data.get('theme_backgroundColor') || THEME_PRESETS.classic.backgroundColor,
        buttonTextColor: '#ffffff'
      }
    });
  }
  if (step === 8) {
    if (data.get('training_seen') !== 'on') throw new Error('Confirme que você viu o treinamento rápido.');
  }
  await saveOnboardingProgress(key);
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
  await loadOnboardingOverview();
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
  await publishOnboardingFromWizard();
}

async function saveOnboardingProgress(stepKey, metadata = {}) {
  state.onboardingOverview = await request('/api/admin/onboarding', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      current_step: stepKey,
      completed_steps: [stepKey],
      metadata: {
        ...(state.onboardingOverview?.progress?.metadata || {}),
        ...metadata
      }
    })
  });
}

async function validateOnboardingSlug(slug) {
  const currentSlug = publicSlug(state.store?.slug || '');
  if (slug === currentSlug) return;
  const data = await request(`/api/portal/slug?slug=${encodeURIComponent(slug)}`);
  if (!data.available) throw new Error(data.reason || 'Este link público já está em uso.');
  if (els.onboardingSlugStatus) {
    els.onboardingSlugStatus.textContent = 'Endereço disponível.';
    els.onboardingSlugStatus.className = 'muted slug-ok';
  }
}

function setOnboardingStatus(message) {
  if (els.onboardingStatusMessage) els.onboardingStatusMessage.textContent = message || '';
}

function skipOnboardingForNow() {
  localStorage.setItem(onboardingStorageKey(ONBOARDING_SKIPPED_KEY), 'true');
  renderOnboarding();
  toast('Onboarding pausado. Você pode reabrir quando quiser.');
}

function reopenOnboarding() {
  localStorage.removeItem(onboardingStorageKey(ONBOARDING_SKIPPED_KEY));
  if (els.onboardingPanel) els.onboardingPanel.hidden = false;
  if (els.onboardingReminder) els.onboardingReminder.hidden = true;
  renderOnboarding();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function publishOnboardingFromWizard() {
  if (!els.onboardingPublishButton) return;
  els.onboardingPublishButton.disabled = true;
  setOnboardingStatus('');
  try {
    const overview = state.onboardingOverview || await loadOnboardingOverview();
    if (overview && !overview.can_publish) {
      throw new Error(`Antes de publicar, conclua: ${overview.blockers.join(', ')}.`);
    }
    state.onboardingOverview = await request('/api/admin/onboarding/publish', { method: 'POST' });
    localStorage.setItem(onboardingStorageKey(ONBOARDING_COMPLETED_KEY), 'true');
    localStorage.removeItem(onboardingStorageKey(ONBOARDING_SKIPPED_KEY));
    await loadStoreData({ force: true });
    activateAdminTab('operation');
    toast('Loja publicada e pronta para receber pedidos.');
  } catch (error) {
    setOnboardingStatus(error.message || 'Revise os itens pendentes antes de publicar.');
    toast(error.message || 'Não foi possível publicar a loja.');
  } finally {
    els.onboardingPublishButton.disabled = false;
  }
}

function onboardingStorageKey(baseKey) {
  const storeKey = state.store?.store_id || state.store?.id || state.admin?.store_id || state.store?.slug || 'global';
  return `${baseKey}:${storeKey}`;
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
    await refreshOrdersOnly({ skipNotifications: true, silent: true });
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
    await loadStoreData({ force: true });
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
  await refreshOrdersOnly({ skipNotifications: true, silent: true });
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
  await refreshOrdersOnly({ skipNotifications: true, silent: true });
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
  els.reportSummary.innerHTML = reportSummarySkeleton();
  els.reportOrders.innerHTML = reportContentSkeleton();
  try {
    await callback();
  } catch (error) {
    toast(error.message || 'Não foi possível carregar o relatório.');
    els.reportSummary.innerHTML = reportStateMessage('!', 'Relatório indisponível', 'Não foi possível carregar os dados com esse filtro.');
    els.reportOrders.innerHTML = `
      <section class="report-state report-state-error">
        <span class="report-state-icon">!</span>
        <strong>Não foi possível carregar o relatório.</strong>
        <p>Confira o período selecionado e tente novamente.</p>
        <button class="ghost-button" type="button" id="retryReportButton">Tentar novamente</button>
      </section>
    `;
    document.getElementById('retryReportButton')?.addEventListener('click', () => loadReportPreset(activeReportPreset() || 'today'));
    els.reportOrdersTitle.textContent = previousTitle || 'Pedidos do período';
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

function renderDailyReport(report) {
  if (!report) {
    state.currentReport = null;
    els.reportSummary.innerHTML = reportStateMessage('i', 'Selecione um período', 'Escolha uma data ou um atalho para montar o relatório.');
    els.reportOrders.innerHTML = '';
    return;
  }

  state.currentReport = report;
  const totals = report.totals || {};
  const comparison = report.comparison || {};
  const closing = report.cash_closing || {};
  const period = report.period || { label: report.date ? `Dia ${formatDateLabel(report.date)}` : 'Período selecionado' };
  const orders = Array.isArray(report.orders) ? report.orders : [];
  const totalOrders = safeReportNumber(totals.orders || sumReportRows(report.by_status || [], 'count') || orders.length);
  const statusRows = buildStatusRows(report.by_status || [], totalOrders);
  const paymentRows = buildPaymentRows(report.by_payment || []);
  const originRows = buildOriginRows(report.by_origin || []);
  const topProducts = Array.isArray(report.top_products) ? report.top_products : [];
  const hourRows = Array.isArray(report.by_hour) ? report.by_hour : [];
  const totalRevenue = safeReportNumber(totals.gross_revenue);
  const topPayment = paymentRows.filter((row) => row.total > 0 || row.count > 0).sort((a, b) => b.count - a.count || b.total - a.total)[0];
  const topOrigin = originRows.filter((row) => row.total > 0 || row.count > 0).sort((a, b) => b.total - a.total || b.count - a.count)[0];
  const peakHour = hourRows.slice().sort((a, b) => safeReportNumber(b.count) - safeReportNumber(a.count))[0];
  const revenueHour = hourRows.slice().sort((a, b) => safeReportNumber(b.total) - safeReportNumber(a.total))[0];
  const hasOrders = totalOrders > 0 || orders.length > 0;

  els.reportOrdersTitle.textContent = `Pedidos - ${period.label}`;
  els.reportSummary.innerHTML = `
    ${reportMetricCard('R$', escapeHtml(period.label), money(totalRevenue), 'Faturamento sem cancelados', 'accent')}
    ${reportMetricCard('#', 'Pedidos', totalOrders, `${safeReportNumber(totals.billable_orders)} pedido(s) faturáveis`, 'muted')}
    ${reportMetricCard('T', 'Ticket médio', money(totals.average_ticket || 0), `${safeReportNumber(totals.completed_orders)} concluído(s)`, 'success')}
    ${reportMetricCard('%', 'Comparativo', formatDeltaMoney(comparison.revenue_delta || 0), `${formatDeltaNumber(comparison.orders_delta || 0)} pedido(s) vs. período anterior`, reportTone(comparison.revenue_delta || 0))}
    ${reportMetricCard('C', 'Fechamento', money(closing.expected_revenue || 0), `${money(closing.pending_revenue || 0)} ainda pendente`, 'warning')}
  `;

  els.reportOrders.innerHTML = `
    ${hasOrders ? '' : reportEmptyState('Sem pedidos no período', 'Quando chegarem pedidos, os gráficos e rankings aparecerão aqui.')}
    <article class="report-breakdown">
      ${reportStatusCard(statusRows, totalOrders)}
      ${reportPaymentCard(paymentRows, topPayment)}
      ${reportOriginCard(originRows, topOrigin)}
      ${reportTopProductsCard(topProducts)}
      ${reportHoursCard(hourRows, peakHour, revenueHour)}
      ${reportCashClosingCard(closing)}
    </article>
    <section class="report-orders-list">
      <div class="report-card-title-row">
        <div>
          <span class="report-kicker">Detalhamento</span>
          <h3>Pedidos do período</h3>
        </div>
        <strong>${orders.length} pedido(s)</strong>
      </div>
      ${orders.map(reportOrderCard).join('') || reportEmptyState('Nenhum pedido listado', 'A lista respeita o período selecionado e os dados da loja atual.')}
    </section>
  `;
}

function safeReportNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function sumReportRows(rows, field) {
  return (rows || []).reduce((total, row) => total + safeReportNumber(row?.[field]), 0);
}

function reportPercent(value, total) {
  const base = safeReportNumber(total);
  if (base <= 0) return 0;
  return Math.max(0, Math.min(100, (safeReportNumber(value) / base) * 100));
}

function reportPercentLabel(value, total) {
  return `${reportPercent(value, total).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function normalizeReportKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function reportTone(value) {
  const number = safeReportNumber(value);
  if (number > 0) return 'success';
  if (number < 0) return 'danger';
  return 'muted';
}

function reportMetricCard(icon, label, value, helper, tone = 'accent') {
  return `
    <article class="report-metric report-tone-${tone}">
      <div class="report-card-head">
        <span class="report-icon">${escapeHtml(icon)}</span>
        <span>${label}</span>
      </div>
      <strong>${value}</strong>
      <p>${escapeHtml(helper)}</p>
    </article>
  `;
}

function reportStateMessage(icon, title, message) {
  return `
    <article class="report-state report-state-inline">
      <span class="report-state-icon">${escapeHtml(icon)}</span>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(message)}</p>
    </article>
  `;
}

function reportEmptyState(title, message) {
  return `
    <div class="report-state">
      <span class="report-state-icon">i</span>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function reportSummarySkeleton() {
  return Array.from({ length: 5 }).map(() => `
    <article class="report-metric report-skeleton-card" aria-hidden="true">
      <span class="report-skeleton-line short"></span>
      <span class="report-skeleton-line big"></span>
      <span class="report-skeleton-line"></span>
    </article>
  `).join('');
}

function reportContentSkeleton() {
  return `
    <article class="report-breakdown">
      ${Array.from({ length: 6 }).map(() => `
        <div class="report-card report-skeleton-card" aria-hidden="true">
          <span class="report-skeleton-line short"></span>
          <span class="report-skeleton-line big"></span>
          <span class="report-skeleton-line"></span>
          <span class="report-skeleton-line"></span>
        </div>
      `).join('')}
    </article>
  `;
}

const REPORT_STATUS_META = {
  new: { label: 'Novo', color: '#f59e0b' },
  accepted: { label: 'Confirmado', color: '#2563eb' },
  preparing: { label: 'Preparando', color: '#ea580c' },
  ready: { label: 'Pronto', color: '#7c3aed' },
  completed: { label: 'Entregue', color: '#16a34a' },
  cancelled: { label: 'Cancelado', color: '#dc2626' }
};

function buildStatusRows(rows, totalOrders) {
  const byKey = new Map((rows || []).map((row) => [row.key, row]));
  return Object.entries(REPORT_STATUS_META).map(([key, meta]) => {
    const row = byKey.get(key) || {};
    const count = safeReportNumber(row.count);
    const total = safeReportNumber(row.total);
    return { key, ...meta, count, total, percent: reportPercent(count, totalOrders) };
  });
}

function paymentBucket(value) {
  const key = normalizeReportKey(value);
  if (key.includes('pix')) return 'pix';
  if (key.includes('dinheiro')) return 'cash';
  if (key.includes('cartao') || key.includes('credito') || key.includes('debito') || key.includes('card')) return 'card';
  return 'other';
}

function buildPaymentRows(rows) {
  const buckets = {
    pix: { key: 'pix', label: 'Pix', color: '#16a34a', count: 0, total: 0 },
    cash: { key: 'cash', label: 'Dinheiro', color: '#f59e0b', count: 0, total: 0 },
    card: { key: 'card', label: 'Cartão', color: '#2563eb', count: 0, total: 0 },
    other: { key: 'other', label: 'Outros', color: '#64748b', count: 0, total: 0 }
  };
  for (const row of rows || []) {
    const bucket = buckets[paymentBucket(row.key)];
    bucket.count += safeReportNumber(row.count);
    bucket.total += safeReportNumber(row.total);
  }
  const totalRevenue = Object.values(buckets).reduce((sum, row) => sum + row.total, 0);
  return Object.values(buckets).map((row) => ({ ...row, percent: reportPercent(row.total, totalRevenue) }));
}

function originBucket(value) {
  const key = normalizeReportKey(value);
  if (key.includes('mesa')) return 'table';
  if (key.includes('comanda') || key === 'tab') return 'tab';
  if (key.includes('balcao') || key.includes('counter')) return 'counter';
  if (key.includes('delivery') || key.includes('entrega')) return 'delivery';
  if (key.includes('whatsapp')) return 'whatsapp';
  if (key.includes('admin')) return 'admin';
  return 'online';
}

function buildOriginRows(rows) {
  const buckets = {
    online: { key: 'online', label: 'Cardápio online', color: '#e11d48', count: 0, total: 0 },
    table: { key: 'table', label: 'Mesa', color: '#7c3aed', count: 0, total: 0 },
    counter: { key: 'counter', label: 'Balcão', color: '#f97316', count: 0, total: 0 },
    delivery: { key: 'delivery', label: 'Delivery', color: '#0ea5e9', count: 0, total: 0 },
    whatsapp: { key: 'whatsapp', label: 'WhatsApp', color: '#16a34a', count: 0, total: 0 },
    admin: { key: 'admin', label: 'Administração', color: '#64748b', count: 0, total: 0 },
    tab: { key: 'tab', label: 'Comanda', color: '#db2777', count: 0, total: 0 }
  };
  for (const row of rows || []) {
    const bucket = buckets[originBucket(row.key)] || buckets.online;
    bucket.count += safeReportNumber(row.count);
    bucket.total += safeReportNumber(row.total);
  }
  const totalRevenue = Object.values(buckets).reduce((sum, row) => sum + row.total, 0);
  return Object.values(buckets).map((row) => ({ ...row, percent: reportPercent(row.total, totalRevenue) }));
}

function reportProgressRow(row, total, mode = 'count') {
  const value = mode === 'value' ? safeReportNumber(row.total) : safeReportNumber(row.count);
  return `
    <div class="report-progress-row">
      <div class="report-progress-label">
        <strong>${escapeHtml(row.label)}</strong>
        <small>${safeReportNumber(row.count)} pedido(s) · ${money(row.total || 0)}</small>
      </div>
      <span>${reportPercentLabel(value, total)}</span>
      <div class="report-progress-track" aria-hidden="true">
        <i style="width: ${reportPercent(value, total)}%; background: ${row.color};"></i>
      </div>
    </div>
  `;
}

function reportStatusCard(rows, totalOrders) {
  return `
    <div class="report-card">
      <div class="report-card-title-row">
        <div><span class="report-kicker">Status</span><h3>Por status</h3></div>
        <span class="report-icon">#</span>
      </div>
      <strong class="report-main-number">${totalOrders} pedido(s)</strong>
      <p class="report-card-summary">Distribuição da operação no período selecionado.</p>
      ${totalOrders > 0 ? rows.map((row) => reportProgressRow(row, totalOrders)).join('') : reportEmptyState('Sem pedidos por status', 'Os status aparecem assim que houver pedidos.')}
    </div>
  `;
}

function reportPaymentCard(rows, topPayment) {
  const totalRevenue = rows.reduce((sum, row) => sum + row.total, 0);
  return `
    <div class="report-card">
      <div class="report-card-title-row">
        <div><span class="report-kicker">Pagamento</span><h3>Por pagamento</h3></div>
        <span class="report-icon">R$</span>
      </div>
      <strong class="report-main-number">${money(totalRevenue)}</strong>
      <p class="report-card-summary">${topPayment ? `${escapeHtml(topPayment.label)} é a forma mais usada.` : 'Sem forma de pagamento dominante.'}</p>
      ${totalRevenue > 0 ? rows.map((row) => reportProgressRow(row, totalRevenue, 'value')).join('') : reportEmptyState('Sem faturamento por pagamento', 'Quando houver pedidos pagos, a participação por método aparecerá aqui.')}
    </div>
  `;
}

function reportOriginCard(rows, topOrigin) {
  const totalRevenue = rows.reduce((sum, row) => sum + row.total, 0);
  return `
    <div class="report-card">
      <div class="report-card-title-row">
        <div><span class="report-kicker">Origem</span><h3>Por origem</h3></div>
        <span class="report-icon">O</span>
      </div>
      <strong class="report-main-number">${money(totalRevenue)}</strong>
      <p class="report-card-summary">${topOrigin ? `${escapeHtml(topOrigin.label)} gerou o maior faturamento.` : 'Sem origem dominante no período.'}</p>
      ${totalRevenue > 0 ? rows.map((row) => reportProgressRow(row, totalRevenue, 'value')).join('') : reportEmptyState('Sem faturamento por origem', 'Os canais aparecem quando houver pedidos no período.')}
    </div>
  `;
}

function reportTopProductsCard(products) {
  const visibleProducts = products.slice(0, 5);
  const maxQuantity = Math.max(...visibleProducts.map((row) => safeReportNumber(row.quantity)), 0);
  return `
    <div class="report-card">
      <div class="report-card-title-row">
        <div><span class="report-kicker">Produtos</span><h3>Mais vendidos</h3></div>
        <span class="report-icon">5</span>
      </div>
      <strong class="report-main-number">${visibleProducts.length ? `${safeReportNumber(visibleProducts[0].quantity)} un.` : '0 un.'}</strong>
      <p class="report-card-summary">${visibleProducts[0] ? `${escapeHtml(visibleProducts[0].name)} lidera o ranking.` : 'Nenhum item vendido no período.'}</p>
      ${visibleProducts.length ? visibleProducts.map((row, index) => `
        <div class="report-ranking-row">
          <span class="report-rank">${index + 1}</span>
          <div>
            <strong>${escapeHtml(row.name || 'Produto sem nome')}</strong>
            <small>${safeReportNumber(row.quantity)} un. · ${money(row.total || 0)}</small>
            <div class="report-progress-track" aria-hidden="true">
              <i style="width: ${reportPercent(row.quantity, maxQuantity)}%;"></i>
            </div>
          </div>
        </div>
      `).join('') : reportEmptyState('Sem itens vendidos', 'O ranking será montado com os produtos dos pedidos.')}
      ${products.length > 5 ? `<details class="report-more"><summary>Ver mais ${products.length - 5} produto(s)</summary>${products.slice(5).map((row) => `<p>${escapeHtml(row.name || 'Produto sem nome')} · ${safeReportNumber(row.quantity)} un. · ${money(row.total || 0)}</p>`).join('')}</details>` : ''}
    </div>
  `;
}

function reportHoursCard(rows, peakHour, revenueHour) {
  const hourSlots = buildReportHourSlots(rows);
  const maxOrders = Math.max(...hourSlots.map((row) => safeReportNumber(row.count)), 0);
  const maxRevenue = Math.max(...hourSlots.map((row) => safeReportNumber(row.total)), 0);
  return `
    <div class="report-card">
      <div class="report-card-title-row">
        <div><span class="report-kicker">Horários</span><h3>Horários de pico</h3></div>
        <span class="report-icon">H</span>
      </div>
      <strong class="report-main-number">${peakHour ? escapeHtml(peakHour.key) : '--:--'}</strong>
      <p class="report-card-summary">${peakHour ? `${safeReportNumber(peakHour.count)} pedido(s) no maior movimento.` : 'Sem movimento por hora.'}</p>
      ${hourSlots.length ? `
        <div class="report-hour-legend">
          <span><i class="movement"></i>Pedidos</span>
          <span><i class="revenue"></i>Faturamento</span>
        </div>
        <div class="report-hour-chart" role="img" aria-label="Pedidos por hora no período selecionado">
          ${hourSlots.map((row) => {
            const orderHeight = row.count ? Math.max(24, reportPercent(row.count, maxOrders) * 0.74 + 14) : 5;
            const revenueHeight = row.total ? Math.max(12, reportPercent(row.total, maxRevenue) * 0.82 + 8) : 0;
            const averageTicket = row.count ? safeReportNumber(row.total) / safeReportNumber(row.count) : 0;
            const tooltip = `${row.key} | ${safeReportNumber(row.count)} pedido(s) | ${money(row.total || 0)} | Ticket ${money(averageTicket)}`;
            return `
            <div class="report-hour-bar ${row.count ? 'has-data' : 'is-empty'} ${peakHour?.key === row.key ? 'active' : ''} ${revenueHour?.key === row.key ? 'revenue-active' : ''}" data-tooltip="${escapeHtml(tooltip)}" aria-label="${escapeHtml(tooltip)}" tabindex="0">
              <span class="report-hour-value">${row.count ? safeReportNumber(row.count) : ''}</span>
              <i style="--hour-height: ${orderHeight}%; --revenue-height: ${revenueHeight}%;">
                <b></b>
              </i>
              <span class="report-hour-label">${escapeHtml(row.label)}</span>
            </div>
          `;
          }).join('')}
        </div>
        <div class="report-mini-facts">
          <span>Maior movimento <strong>${escapeHtml(peakHour?.key || '--')}</strong></span>
          <span>Maior faturamento <strong>${escapeHtml(revenueHour?.key || '--')} · ${money(revenueHour?.total || 0)}</strong></span>
        </div>
      ` : reportEmptyState('Sem horários no período', 'O gráfico aparece quando houver pedidos com horário registrado.')}
    </div>
  `;
}

function buildReportHourSlots(rows) {
  const normalizedRows = (rows || [])
    .map((row) => {
      const hour = Number.parseInt(String(row.key || '').slice(0, 2), 10);
      if (!Number.isFinite(hour)) return null;
      return {
        key: `${String(hour).padStart(2, '0')}:00`,
        label: `${String(hour).padStart(2, '0')}h`,
        count: safeReportNumber(row.count),
        total: safeReportNumber(row.total)
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number.parseInt(a.key, 10) - Number.parseInt(b.key, 10));

  if (!normalizedRows.length) return [];

  const byHour = new Map(normalizedRows.map((row) => [Number.parseInt(row.key, 10), row]));
  const hours = [...byHour.keys()];
  let start = Math.max(0, Math.min(...hours) - 1);
  let end = Math.min(23, Math.max(...hours) + 1);

  while (end - start < 7) {
    if (start > 0) start -= 1;
    if (end - start >= 7) break;
    if (end < 23) end += 1;
    if (start === 0 && end === 23) break;
  }

  return Array.from({ length: end - start + 1 }, (_, index) => {
    const hour = start + index;
    return byHour.get(hour) || {
      key: `${String(hour).padStart(2, '0')}:00`,
      label: `${String(hour).padStart(2, '0')}h`,
      count: 0,
      total: 0
    };
  });
}

function reportCashClosingCard(closing) {
  const divergence = safeReportNumber(closing.divergence);
  const isBalanced = Math.abs(divergence) < 0.01;
  const paymentRows = buildPaymentRows(closing.by_payment || []).filter((row) => row.total > 0 || row.count > 0);
  return `
    <div class="report-card report-cash-card">
      <div class="report-card-title-row">
        <div><span class="report-kicker">Caixa</span><h3>Fechamento de caixa</h3></div>
        <span class="report-badge ${isBalanced ? 'success' : 'danger'}">${isBalanced ? 'Correto' : 'Divergência'}</span>
      </div>
      <strong class="report-main-number">${money(closing.expected_revenue || 0)}</strong>
      <p class="report-card-summary">Resumo financeiro do período selecionado.</p>
      <div class="report-finance-grid">
        ${reportFinanceItem('Recebido', closing.completed_revenue, 'positive')}
        ${reportFinanceItem('Pendente', closing.pending_revenue, 'pending')}
        ${reportFinanceItem('Taxas', closing.delivery_fees, 'neutral')}
        ${reportFinanceItem('Descontos', closing.discounts, 'danger')}
        ${reportFinanceItem('Cupons', closing.coupons, 'neutral', false)}
        ${reportFinanceItem('Divergência', divergence, isBalanced ? 'positive' : 'danger')}
      </div>
      <div class="report-payment-summary">
        <span class="report-kicker">Resumo por pagamento</span>
        ${paymentRows.length ? paymentRows.map((row) => `<p><strong>${escapeHtml(row.label)}</strong><span>${money(row.total)}</span></p>`).join('') : '<p><strong>Sem recebimentos</strong><span>R$ 0,00</span></p>'}
      </div>
    </div>
  `;
}

function reportFinanceItem(label, value, tone, formatAsMoney = true) {
  const safeValue = safeReportNumber(value);
  return `
    <span class="report-finance-item report-finance-${tone}">
      <small>${escapeHtml(label)}</small>
      <strong>${formatAsMoney ? money(safeValue) : safeValue}</strong>
    </span>
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
    wireOrderDropColumn(column);
    return column;
  }));
}

function wireOrderDropColumn(column) {
  column.addEventListener('dragenter', handleOrderColumnDragEnter);
  column.addEventListener('dragover', handleOrderColumnDragOver);
  column.addEventListener('dragleave', handleOrderColumnDragLeave);
  column.addEventListener('drop', handleOrderColumnDrop);
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
  const canSendManualWhatsapp = canUsePlanFeature('manual_whatsapp');
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
      ${orderOriginBadge(order, fulfillment)}
      <span>${payment}</span>
      <span class="financial-status-badge financial-status-${escapeAttribute(order.financial_status || 'pending')}">${financialStatusLabel(order.financial_status)}</span>
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
        <div class="row-actions order-detail-actions">
          <button class="ghost-button compact print-order-button" type="button" data-print-order="${escapeAttribute(order.id)}" data-print-type="kitchen">Imprimir cozinha</button>
          <button class="ghost-button compact print-order-button" type="button" data-print-order="${escapeAttribute(order.id)}" data-print-type="customer">Imprimir cliente</button>
          <button class="ghost-button compact print-order-button" type="button" data-print-order="${escapeAttribute(order.id)}" data-print-type="both">Imprimir ambas</button>
          <button class="ghost-button compact print-order-button" type="button" data-preview-order="${escapeAttribute(order.id)}">Pré-visualizar</button>
          <button class="ghost-button compact print-order-button" type="button" data-reprint-order="${escapeAttribute(order.id)}">Reimprimir</button>
          ${canSendManualWhatsapp ? `<button class="ghost-button compact" type="button" data-whatsapp-status="${escapeAttribute(order.id)}">Reenviar WhatsApp</button>` : ''}
          ${order.financial_status === 'paid' ? `<button class="danger-button compact" type="button" data-refund-order="${escapeAttribute(order.id)}">Estornar pagamento</button>` : ''}
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
  card.querySelector('[data-refund-order]')?.addEventListener('click', () => refundOrder(order));
  card.addEventListener('dragstart', (event) => {
    if (event.target.closest('.order-details') || event.target.closest('button') || event.target.closest('select')) {
      event.preventDefault();
      return;
    }
    state.draggedOrderId = order.id;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', order.id);
    event.dataTransfer.setData('application/json', JSON.stringify({ id: order.id, status: order.status }));
    els.adminOrders.classList.add('is-dragging');
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', finishOrderDrag);
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
  const modifiersLine = orderItemAddonsText(modifiers);
  const notes = item.notes ? `<small>Obs: ${escapeHtml(item.notes)}</small>` : '';
  return `
    <span>
      <strong>${Number(item.quantity || 0)}x ${name}</strong>
      <small>${money(item.total)}</small>
      ${modifiersLine ? `<small>Adicionais: ${escapeHtml(modifiersLine)}</small>` : ''}
      ${notes}
    </span>
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

function financialStatusBadge(order) {
  const status = order.financial_status || 'pending';
  return `<span class="financial-status-badge financial-status-${escapeAttribute(status)}">${financialStatusLabel(status)}</span>`;
}

function orderOriginBadge(order, label = orderOriginLabel(order)) {
  const method = order.fulfillment_method || 'delivery';
  return `<span class="origin-badge origin-${escapeAttribute(method)}">${escapeHtml(label)}</span>`;
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
  return `${modifier.name || 'Adicional'}${delta > 0 ? ` (+ ${money(delta)})` : ''}`;
}

function orderItemAddonsText(modifiers = []) {
  return modifiers
    .map((modifier) => {
      const delta = Number(modifier.price_delta || 0);
      return `${modifier.name || 'Adicional'}${delta > 0 ? ` (+ ${money(delta)})` : ''}`;
    })
    .join(', ');
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
    await refreshOrdersOnly({ skipNotifications: true, silent: true });
  } catch (error) {
    toast(error.message || 'Não foi possível reenviar a mensagem.');
  }
}

async function refundOrder(order) {
  if (!window.confirm(`Estornar pagamento do pedido #${order.public_code}?`)) return;
  try {
    await request(`/api/admin/orders/${order.id}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Estorno pelo painel administrativo' })
    });
    toast('Pagamento estornado.');
    await refreshOrdersOnly({ skipNotifications: true, silent: true });
  } catch (error) {
    toast(error.message || 'Não foi possível estornar o pagamento.');
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

function handleOrderColumnDragEnter(event) {
  if (!state.draggedOrderId) return;
  event.preventDefault();
  markDragColumn(event.currentTarget);
}

function handleOrderColumnDragOver(event) {
  if (!state.draggedOrderId) return;
  event.preventDefault();
  event.stopPropagation();
  markDragColumn(event.currentTarget);
  event.dataTransfer.dropEffect = 'move';
}

function handleOrderColumnDragLeave(event) {
  if (!state.draggedOrderId) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const stillInside =
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom;
  if (!stillInside) event.currentTarget.classList.remove('drag-over');
}

async function handleOrderColumnDrop(event) {
  if (!state.draggedOrderId) return;
  event.preventDefault();
  event.stopPropagation();
  const column = event.currentTarget?.classList?.contains('order-column')
    ? event.currentTarget
    : closestOrderColumnFromPoint(event.clientX, event.clientY);
  clearDragColumns();
  if (!column) return;
  const orderId = draggedOrderIdFromEvent(event) || state.draggedOrderId;
  state.draggedOrderId = null;
  const status = column.dataset.orderStatus;
  const order = state.orders.find((item) => String(item.id) === String(orderId));
  if (!order || !status || order.status === status) return;
  updateOrderStatus(order.id, status);
  toast(`Pedido #${order.public_code} movido para ${statusLabel(status)}.`);
}

function draggedOrderIdFromEvent(event) {
  const raw = event.dataTransfer?.getData('text/plain');
  if (raw) return raw;
  const json = event.dataTransfer?.getData('application/json');
  if (!json) return '';
  try {
    return JSON.parse(json).id || '';
  } catch {
    return '';
  }
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

  const columnAtX = columns.find((column) => {
    const rect = column.getBoundingClientRect();
    return x >= rect.left && x <= rect.right;
  });
  if (columnAtX) return columnAtX;

  return columns
    .map((column) => {
      const rect = column.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      return { column, distance: Math.abs(x - centerX) };
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

function finishOrderDrag() {
  state.draggedOrderId = null;
  els.adminOrders?.classList.remove('is-dragging');
  clearDragColumns();
  els.adminOrders?.querySelectorAll('.order-card.dragging').forEach((card) => card.classList.remove('dragging'));
}

async function updateOrderStatus(orderId, status, options = {}) {
  const orderKey = String(orderId);
  const order = state.orders.find((item) => String(item.id) === orderKey);
  if (state.updatingOrderIds.has(orderKey)) {
    state.pendingOrderStatuses.set(orderKey, status);
    if (order && order.status !== status) applyOrderStatusLocally(order, status);
    return;
  }
  const previousStatus = order?.status;

  if (previousStatus === status && !options.force) return;
  state.updatingOrderIds.add(orderKey);

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
    if (!state.pendingOrderStatuses.has(orderKey)) {
      await refreshOrdersOnly({ skipNotifications: true, silent: true });
      if (state.loadedAdminTabs.has('tables')) await loadTablesData({ force: true });
      if (state.loadedAdminTabs.has('plan')) await loadPlanData({ force: true });
    }
  } catch (error) {
    if (order && previousStatus) {
      applyOrderStatusLocally(order, previousStatus);
    }
    toast(error.message || 'Não foi possível atualizar o pedido.');
  } finally {
    state.updatingOrderIds.delete(orderKey);
    const pendingStatus = state.pendingOrderStatuses.get(orderKey);
    state.pendingOrderStatuses.delete(orderKey);
    if (pendingStatus && pendingStatus !== status) {
      updateOrderStatus(orderId, pendingStatus, { force: true });
    }
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
  const whatsappAction = canUsePlanFeature('manual_whatsapp')
    ? `<button class="ghost-button compact" type="button" data-whatsapp-status="${escapeAttribute(order.id)}">Avisar</button>`
    : '';
  return `
    <article class="customer-order-row status-${order.status}">
      <div>
        <strong>#${escapeHtml(order.public_code)} - ${money(order.total)}</strong>
        <small>${createdAt} - ${statusLabel(order.status)}</small>
        ${financialStatusBadge(order)}
      </div>
      ${whatsappAction}
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

async function loadSupportTickets(options = {}) {
  if (!options.force && state.loadedAdminTabs.has('support')) return;
  const data = await request('/api/admin/support/tickets');
  state.supportTickets = data.tickets || [];
  state.loadedAdminTabs.add('support');
  renderSupportTickets();
}

async function submitAdminSupportTicket(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  try {
    await request('/api/admin/support/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    form.reset();
    toast('Chamado aberto com sucesso.');
    state.loadedAdminTabs.delete('support');
    await loadSupportTickets({ force: true });
  } catch (error) {
    toast(error.message || 'Não foi possível abrir o chamado.');
  }
}

function renderSupportTickets() {
  if (!els.adminSupportTicketList) return;
  const tickets = state.supportTickets || [];
  els.adminSupportTicketList.innerHTML = tickets.length ? tickets.map((ticket) => `
    <article class="support-ticket-card">
      <div class="section-actions compact-section-actions">
        <div>
          <strong>${escapeHtml(ticket.subject)}</strong>
          <small>${formatDateTime(ticket.created_at)} · ${escapeHtml(ticket.category || 'sem categoria')}</small>
        </div>
        <span class="pill ${ticket.priority === 'critical' || ticket.priority === 'high' ? 'pill-danger' : 'pill-muted'}">${escapeHtml(priorityLabel(ticket.priority))}</span>
        <span class="pill ${ticket.status === 'resolved' || ticket.status === 'closed' ? 'pill-ok' : 'pill-muted'}">${escapeHtml(ticketStatusLabel(ticket.status))}</span>
      </div>
      <div class="support-ticket-messages">
        ${(ticket.messages || []).map((message) => `
          <div>
            <strong>${escapeHtml(message.author_name || message.author_type)}</strong>
            <small>${formatDateTime(message.created_at)}</small>
            <p>${escapeHtml(message.message)}</p>
          </div>
        `).join('') || '<p class="empty-state">Sem mensagens.</p>'}
      </div>
    </article>
  `).join('') : '<p class="empty-state">Você ainda não abriu chamados de suporte.</p>';
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

async function submitDeleteAccount(event) {
  event.preventDefault();
  const button = els.deleteAccountForm.querySelector('button[type="submit"]');
  const data = Object.fromEntries(new FormData(els.deleteAccountForm));
  if (String(data.confirmation || '').trim() !== 'EXCLUIR CONTA') {
    toast('Digite EXCLUIR CONTA para confirmar.');
    return;
  }
  if (!String(data.password || '').trim()) {
    toast('Informe sua senha atual para excluir a conta.');
    els.deleteAccountForm.elements.password?.focus();
    return;
  }
  const confirmed = window.confirm('Esta ação não pode ser desfeita. Todos os dados da empresa e loja serão apagados. Deseja continuar?');
  if (!confirmed) return;
  if (button) {
    button.disabled = true;
    button.textContent = 'Excluindo...';
  }
  try {
    await request('/api/admin/account/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    state.admin = null;
    clearAdminCache();
    stopOrderPolling();
    showAuth();
    toast('Conta excluída.');
  } catch (error) {
    toast(error.message || 'Não foi possível excluir a conta.');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Excluir definitivamente';
    }
  }
}

async function submitAdminUser(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(els.adminUserForm));
  if (!String(data.password || '').trim()) {
    toast('Informe uma senha inicial ou use Gerar convite.');
    return;
  }
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

async function submitAdminInvitation() {
  const data = Object.fromEntries(new FormData(els.adminUserForm));
  try {
    const result = await request('/api/admin/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const link = `${location.origin}${result.invitation.invite_link}`;
    await navigator.clipboard?.writeText(link).catch(() => null);
    els.adminUserForm.reset();
    toast(result.invitation.whatsapp_status === 'sent'
      ? 'Convite enviado por WhatsApp e link copiado.'
      : `Convite gerado e link copiado: ${link}`);
  } catch (error) {
    toast(error.message || 'Não foi possível gerar o convite.');
  }
}

function renderAdminUsers() {
  if (!els.adminUsersPanel || !els.adminUsersList) return;
  const canManage = hasPermission('admin_users');
  els.adminUsersPanel.hidden = !canManage;
  if (!canManage) return;
  renderAdminRoleOverview();
  renderAdminRolePreview();
  const search = normalizeSearch(els.adminUserSearch?.value || '');
  const roleFilter = els.adminUserRoleFilter?.value || 'all';
  const users = state.adminUsers.filter((admin) => {
    const matchesSearch = !search || normalizeSearch(`${admin.name || ''} ${admin.email || ''}`).includes(search);
    const matchesRole = roleFilter === 'all'
      || (roleFilter === 'inactive' ? admin.is_active === false : admin.role === roleFilter);
    return matchesSearch && matchesRole;
  });
  pruneSelectedAdminUsers(users);
  if (!state.adminUsers.length) {
    els.adminUsersList.innerHTML = `
      <div class="empty-state account-empty-state">
        <strong>Nenhuma conta extra criada.</strong>
        <span>Crie acessos separados para atendimento, cozinha, entrega ou garçom. Cada pessoa entra com o próprio login.</span>
      </div>
    `;
    updateAdminUsersBulkActions(users);
    return;
  }
  if (!users.length) {
    els.adminUsersList.innerHTML = `
      <div class="empty-state account-empty-state">
        <strong>Nenhuma conta encontrada.</strong>
        <span>Ajuste a busca ou o filtro de funcao para visualizar outros acessos.</span>
      </div>
    `;
    updateAdminUsersBulkActions(users);
    return;
  }
  els.adminUsersList.innerHTML = users.map((admin) => {
    const canDelete = String(state.admin?.id || '') !== String(admin.id || '');
    return `
    <details class="admin-user-card">
      <summary class="admin-user-main">
        <span class="admin-user-select-wrap" title="${canDelete ? 'Selecionar conta' : 'Você não pode selecionar sua própria conta'}">
          <input class="admin-user-select" type="checkbox" data-admin-user-id="${escapeAttribute(admin.id)}" ${state.selectedAdminUserIds.has(String(admin.id)) ? 'checked' : ''} ${canDelete ? '' : 'disabled'} aria-label="Selecionar ${escapeAttribute(admin.name || admin.email || 'conta')}">
        </span>
        <div class="admin-user-avatar">${escapeHtml((admin.name || admin.email || 'A').slice(0, 1).toUpperCase())}</div>
        <div class="admin-user-title">
          <strong>${escapeHtml(admin.name || 'Conta')}</strong>
          <small>${escapeHtml(admin.email || '')}</small>
        </div>
        <span class="team-role-badge">${escapeHtml(admin.role_label || adminRoleLabel(admin.role))}</span>
        <span class="pill ${admin.is_active ? 'pill-ok' : 'pill-muted'}">${admin.is_active ? 'Ativa' : 'Inativa'}</span>
      </summary>
      <div class="admin-user-permissions">
        <span>${escapeHtml(roleDefinition(admin.role).short)}</span>
        <small>${adminPermissionSummary(admin.role)}</small>
        <div class="team-permission-chips">${rolePermissionChips(admin.role)}</div>
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
        <div class="admin-user-form-actions">
          <button class="ghost-button compact">Salvar</button>
          ${canDelete ? `<button class="danger-button compact admin-user-delete-button" type="button" data-admin-user-id="${escapeAttribute(admin.id)}" data-admin-user-name="${escapeAttribute(admin.name || admin.email || 'esta conta')}">Excluir</button>` : ''}
        </div>
      </form>
    </details>
  `;
  }).join('');
  els.adminUsersList.querySelectorAll('.admin-user-edit-form').forEach((form) => {
    form.addEventListener('submit', submitAdminUserUpdate);
  });
  els.adminUsersList.querySelectorAll('.admin-user-delete-button').forEach((button) => {
    button.addEventListener('click', deleteAdminUser);
  });
  els.adminUsersList.querySelectorAll('.admin-user-select').forEach((checkbox) => {
    checkbox.addEventListener('click', (event) => event.stopPropagation());
    checkbox.addEventListener('change', toggleAdminUserSelection);
  });
  updateAdminUsersBulkActions(users);
}

function selectableAdminUsers(users = visibleAdminUsers()) {
  return users.filter((admin) => String(state.admin?.id || '') !== String(admin.id || ''));
}

function visibleAdminUsers() {
  const search = normalizeSearch(els.adminUserSearch?.value || '');
  const roleFilter = els.adminUserRoleFilter?.value || 'all';
  return state.adminUsers.filter((admin) => {
    const matchesSearch = !search || normalizeSearch(`${admin.name || ''} ${admin.email || ''}`).includes(search);
    const matchesRole = roleFilter === 'all'
      || (roleFilter === 'inactive' ? admin.is_active === false : admin.role === roleFilter);
    return matchesSearch && matchesRole;
  });
}

function pruneSelectedAdminUsers(visibleUsers = visibleAdminUsers()) {
  const visibleIds = new Set(visibleUsers.map((admin) => String(admin.id)));
  for (const id of [...state.selectedAdminUserIds]) {
    if (!visibleIds.has(id) || String(state.admin?.id || '') === id) {
      state.selectedAdminUserIds.delete(id);
    }
  }
}

function updateAdminUsersBulkActions(visibleUsers = visibleAdminUsers()) {
  if (!els.adminUsersBulkActions) return;
  const selectable = selectableAdminUsers(visibleUsers);
  const selectableIds = selectable.map((admin) => String(admin.id));
  const selectedCount = selectableIds.filter((id) => state.selectedAdminUserIds.has(id)).length;
  els.adminUsersBulkActions.hidden = !state.adminUsers.length;
  if (els.selectedAdminUsersCount) {
    els.selectedAdminUsersCount.textContent = `${selectedCount} selecionada${selectedCount === 1 ? '' : 's'}`;
  }
  if (els.deleteSelectedAdminUsersButton) {
    els.deleteSelectedAdminUsersButton.disabled = selectedCount === 0;
  }
  if (els.selectAllAdminUsers) {
    els.selectAllAdminUsers.disabled = selectable.length === 0;
    els.selectAllAdminUsers.checked = selectable.length > 0 && selectedCount === selectable.length;
    els.selectAllAdminUsers.indeterminate = selectedCount > 0 && selectedCount < selectable.length;
  }
}

function toggleAdminUserSelection(event) {
  const checkbox = event.currentTarget;
  const id = String(checkbox.dataset.adminUserId || '');
  if (!id) return;
  if (checkbox.checked) {
    state.selectedAdminUserIds.add(id);
  } else {
    state.selectedAdminUserIds.delete(id);
  }
  updateAdminUsersBulkActions();
}

function toggleVisibleAdminUsersSelection(event) {
  const checked = event.currentTarget.checked;
  const selectable = selectableAdminUsers();
  for (const admin of selectable) {
    const id = String(admin.id);
    if (checked) {
      state.selectedAdminUserIds.add(id);
    } else {
      state.selectedAdminUserIds.delete(id);
    }
  }
  renderAdminUsers();
}

function renderAdminRoleOverview() {
  if (!els.adminRoleOverview) return;
  const roles = ['admin', 'attendant', 'waiter', 'kitchen', 'delivery'];
  els.adminRoleOverview.innerHTML = roles.map((role) => {
    const entry = roleDefinition(role);
    const count = state.adminUsers.filter((admin) => admin.role === role && admin.is_active !== false).length;
    return `
      <article class="team-role-card" data-team-role="${escapeAttribute(role)}">
        <div>
          <strong>${escapeHtml(entry.label)}</strong>
          <small>${escapeHtml(entry.short)}</small>
        </div>
        <span>${count}</span>
      </article>
    `;
  }).join('');
  els.adminRoleOverview.querySelectorAll('[data-team-role]').forEach((card) => {
    card.addEventListener('click', () => {
      if (els.adminUserRoleFilter) els.adminUserRoleFilter.value = card.dataset.teamRole;
      renderAdminUsers();
    });
  });
}

function renderAdminRolePreview() {
  if (!els.adminRolePreview) return;
  const role = els.adminUserRoleSelect?.value || 'admin';
  const entry = roleDefinition(role);
  els.adminRolePreview.innerHTML = `
    <div>
      <strong>${escapeHtml(entry.label)}</strong>
      <span>${escapeHtml(entry.description)}</span>
    </div>
    <div class="team-permission-chips">${rolePermissionChips(role)}</div>
  `;
}

function roleDefinition(role) {
  return ADMIN_ROLE_DEFINITIONS[role] || ADMIN_ROLE_DEFINITIONS.admin;
}

function rolePermissionChips(role) {
  return roleDefinition(role).permissions
    .map((permission) => `<span>${escapeHtml(permission)}</span>`)
    .join('');
}

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function renderPlan() {
  if (!els.planSummary || !els.planUsage || !els.planFeatures) return;
  const data = state.plan;
  if (!data) {
    els.planSummary.innerHTML = '<p class="empty-state">Abra esta aba para carregar seu plano.</p>';
    els.planUsage.innerHTML = '<p class="empty-state">Uso ainda não carregado.</p>';
    return;
  }
  const plan = data.plan || {};
  const subscription = data.subscription || {};
  const pendingSubscription = data.pending_subscription || {};
  const availablePlans = Array.isArray(data.available_plans) ? data.available_plans : [];
  const company = data.company || {};
  const usage = data.usage || {};
  const features = data.features || [];
  const billingHistory = Array.isArray(data.billing_history) ? data.billing_history : [];
  const selectedPlanCode = plan.code || availablePlans[0]?.code || '';
  const status = subscription.status || company.status || 'indefinido';
  const statusLabel = commercialStatusLabel(status);
  const nextRenewal = subscription.next_renewal_at || subscription.current_period_ends_at || subscription.trial_ends_at || '';
  const pendingCheckoutUrl = pendingSubscription.metadata?.checkout_url || '';
  const daysRemaining = subscriptionDaysRemaining(nextRenewal);
  const billingStatus = pendingSubscription.id
    ? commercialStatusLabel(pendingSubscription.status)
    : status === 'active' || status === 'trial'
      ? 'Em dia'
      : statusLabel;

  if (els.planAlerts) {
    els.planAlerts.innerHTML = planAlerts({ subscription, pendingSubscription, usage, features });
  }

  els.planSummary.innerHTML = `
    <div class="plan-main-card">
      <p class="eyebrow">Plano atual</p>
      <div class="plan-main-title">
        <h2>${escapeHtml(plan.name || 'Sem plano definido')}</h2>
        <span class="plan-status ${planStatusClass(status)}">${escapeHtml(statusLabel)}</span>
      </div>
      <p class="muted">${escapeHtml(plan.description || 'Configure o plano pelo painel da plataforma.')}</p>
      <strong>${formatPlanPrice(plan.monthly_price)}</strong>
      <div class="plan-mini-list">
        <span>Status <strong>${escapeHtml(statusLabel)}</strong></span>
        <span>Dias restantes <strong>${daysRemaining === null ? '-' : `${daysRemaining} dia(s)`}</strong></span>
      </div>
      <div class="plan-actions">
        <label>Plano para contratar
          <select id="billingPlanSelect">
            ${availablePlans.map((entry) => `<option value="${escapeAttribute(entry.code)}"${entry.code === selectedPlanCode ? ' selected' : ''}>${escapeHtml(entry.name)} - ${money(entry.monthly_price || 0)}/mês</option>`).join('')}
          </select>
        </label>
        <button class="primary-button compact" id="billingCheckoutButton" type="button"${availablePlans.length ? '' : ' disabled'}>${plan.code ? 'Alterar plano' : 'Ativar plano'}</button>
      </div>
    </div>
  `;
  document.querySelector('#billingCheckoutButton')?.addEventListener('click', () => createBillingCheckout());

  if (els.planBilling) {
    els.planBilling.innerHTML = `
      <p class="eyebrow">Cobrança</p>
      <h2>${escapeHtml(billingStatus)}</h2>
      <p class="muted">${pendingSubscription.id ? 'Finalize o pagamento para ativar ou alterar a assinatura.' : 'Plano sem cobrança em aberto no momento.'}</p>
      <div class="plan-mini-list">
        <span>Status <strong>${escapeHtml(pendingSubscription.id ? commercialStatusLabel(pendingSubscription.status) : statusLabel)}</strong></span>
        <span>Valor <strong>${money(pendingSubscription.metadata?.amount_cents ? Number(pendingSubscription.metadata.amount_cents) / 100 : plan.monthly_price || 0)}</strong></span>
        <span>Vencimento <strong>${dateLabel(pendingSubscription.payment_due_at) || '-'}</strong></span>
      </div>
      <div class="row-actions">
        ${pendingCheckoutUrl ? `<a class="primary-button compact" href="${escapeAttribute(pendingCheckoutUrl)}" target="_blank" rel="noopener">Abrir pagamento</a>` : ''}
        <button class="ghost-button compact" id="billingRenewButton" type="button"${availablePlans.length ? '' : ' disabled'}>${pendingSubscription.id ? 'Trocar plano' : 'Ativar/alterar plano'}</button>
      </div>
    `;
    document.querySelector('#billingRenewButton')?.addEventListener('click', () => createBillingCheckout());
  }

  if (els.planRenewal) {
    els.planRenewal.innerHTML = `
      <p class="eyebrow">Próxima renovação</p>
      <h2>${dateLabel(nextRenewal) || '-'}</h2>
      <p class="muted">${renewalMessage(subscription)}</p>
      <div class="plan-mini-list">
        <span>Início do ciclo <strong>${dateLabel(subscription.current_period_starts_at) || '-'}</strong></span>
        <span>Fim do ciclo <strong>${dateLabel(subscription.current_period_ends_at || subscription.trial_ends_at) || '-'}</strong></span>
      </div>
    `;
  }

  els.planUsage.innerHTML = `
    <p class="eyebrow">Uso</p>
    <h2>Uso e limites</h2>
    <div class="plan-usage-list">
      ${usageBar('Produtos cadastrados', usage.products, featureLimit(features, 'digital_menu'))}
      ${usageBar('Categorias', usage.categories, featureLimit(features, 'menu_categories'))}
      ${usageBar('Pedidos no mês', usage.orders_month ?? usage.orders, featureLimit(features, 'orders'))}
      ${usageBar('Clientes', usage.customers, featureLimit(features, 'customers'))}
      ${usageBar('Mesas', usage.tables, featureLimit(features, 'tables'))}
      ${usageBar('Usuários da equipe', usage.users, featureLimit(features, 'admin_users'))}
      ${usageBar('WhatsApp/mensagens', usage.whatsapp_messages, featureLimit(features, 'automatic_whatsapp') || featureLimit(features, 'manual_whatsapp'))}
    </div>
  `;
  els.planFeatures.innerHTML = features.length ? features.map((entry) => {
    const feature = entry.feature || {};
    const enabled = entry.is_enabled !== false;
    return `
      <article class="feature-row compact ${enabled ? 'enabled' : 'disabled'}">
        <div>
          <strong>${escapeHtml(feature.name || feature.code || 'Recurso')}</strong>
          <small>${escapeHtml(feature.description || 'Recurso incluso neste plano.')}</small>
        </div>
        <span class="feature-limit">${featureStatusLabel(entry)}</span>
      </article>
    `;
  }).join('') : '<p class="empty-state">Nenhum recurso cadastrado para este plano.</p>';

  if (els.planCompare) {
    els.planCompare.innerHTML = availablePlans.length ? availablePlans.map((entry) => comparePlanCard(entry, plan.code)).join('') : '<p class="empty-state">Nenhum plano disponível.</p>';
    els.planCompare.querySelectorAll('[data-plan-code]').forEach((button) => {
      button.addEventListener('click', () => createBillingCheckout(button.dataset.planCode));
    });
  }

  if (els.planHistory) {
    els.planHistory.innerHTML = billingHistory.length ? `
      <div class="plan-history-table">
        ${billingHistory.map((event) => billingHistoryRow(event)).join('')}
      </div>
    ` : '<p class="empty-state">Nenhum evento de cobrança registrado.</p>';
  }
}

async function createBillingCheckout(forcedPlanCode = '') {
  const planCode = forcedPlanCode || document.querySelector('#billingPlanSelect')?.value || state.plan?.plan?.code;
  if (!planCode) {
    toast('Plano não encontrado para cobrança.');
    return;
  }
  if (planCode === state.plan?.plan?.code && ['trial', 'active'].includes(state.plan?.subscription?.status)) {
    toast('Este já é o plano atual.');
    return;
  }
  const buttons = [...document.querySelectorAll('#billingCheckoutButton, #billingRenewButton, [data-plan-code]')];
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const result = await request('/api/admin/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_code: planCode })
    });
    await loadPlanData({ force: true });
    if (result.checkout_url) {
      window.open(result.checkout_url, '_blank', 'noopener');
      toast('Cobrança aberta em uma nova aba.');
    } else if (result.activated) {
      toast(result.already_current ? 'Este já era o plano atual.' : 'Plano ativado com sucesso.');
    } else {
      toast('Solicitação registrada.');
    }
  } catch (error) {
    toast(error.message || 'Não foi possível criar a cobrança.');
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

function planStatusClass(status) {
  return ({
    active: 'ok',
    trial: 'warn',
    payment_pending: 'warn',
    past_due: 'danger',
    suspended: 'danger',
    cancelled: 'muted',
    expired: 'muted'
  })[status] || 'muted';
}

function dateLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR');
}

function dateTimeLabel(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function subscriptionDaysRemaining(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86400000));
}

function formatPlanPrice(value) {
  const price = Number(value || 0);
  return price > 0 ? `${money(price)} / mês` : 'R$ 0 / teste';
}

function renewalMessage(subscription = {}) {
  if (subscription.status === 'trial') return 'Período de teste ativo. A data acima mostra o fim do teste.';
  if (subscription.status === 'payment_pending') return 'Existe pagamento pendente para regularizar a assinatura.';
  if (subscription.status === 'active') return 'Assinatura ativa e liberada para operação.';
  return 'Acompanhe aqui a data comercial mais relevante da assinatura.';
}

function featureLimit(features, code) {
  const entry = features.find((item) => item.feature?.code === code);
  const limit = Number(entry?.limit_value || 0);
  return Number.isFinite(limit) && limit > 0 ? limit : null;
}

function usageBar(label, value, limit) {
  const current = Number(value || 0);
  const hasLimit = Number(limit || 0) > 0;
  const percent = hasLimit ? Math.min(100, Math.round((current / Number(limit)) * 100)) : 0;
  const tone = !hasLimit || percent < 70 ? 'ok' : percent < 90 ? 'warn' : 'danger';
  return `
    <article class="plan-usage-row">
      <div>
        <strong>${escapeHtml(label)}</strong>
        <span>${current} ${hasLimit ? `/ ${Number(limit)}` : '/ ilimitado'}</span>
      </div>
      <div class="plan-progress" aria-label="${escapeAttribute(label)}">
        <span class="${tone}" style="width:${hasLimit ? percent : 100}%"></span>
      </div>
    </article>
  `;
}

function featureStatusLabel(entry) {
  if (entry.is_enabled === false) return 'Bloqueado';
  return entry.limit_value ? `Até ${Number(entry.limit_value)}` : 'Ilimitado';
}

function comparePlanCard(plan, currentCode) {
  const isCurrent = plan.code === currentCode;
  const featured = /professional|profissional/i.test(`${plan.code || ''} ${plan.name || ''}`);
  const features = billingPlanHighlights(plan);
  const daily = billingPlanDailyPrice(plan);
  return `
    <article class="plan-compare-card ${isCurrent ? 'current' : ''} ${featured ? 'featured' : ''}">
      <div>
        <span class="plan-status ${isCurrent ? 'ok' : featured ? 'warn' : 'muted'}">${isCurrent ? 'Plano atual' : featured ? 'Mais escolhido' : 'Disponível'}</span>
        <h3>${escapeHtml(plan.name || 'Plano')}</h3>
        <p>${escapeHtml(plan.description || '')}</p>
      </div>
      <strong>${money(plan.monthly_price || 0)} / mês</strong>
      ${daily ? `<small class="muted">${escapeHtml(daily)}</small>` : ''}
      <ul>
        ${features.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}
      </ul>
      ${isCurrent
        ? '<button class="ghost-button compact" type="button" disabled>Plano atual</button>'
        : `<button class="primary-button compact" type="button" data-plan-code="${escapeAttribute(plan.code)}">Mudar para este plano</button>`}
    </article>
  `;
}

function billingPlanHighlights(plan) {
  const code = String(plan?.code || '').toLowerCase();
  if (code.includes('trial')) return ['Até 10 produtos', 'Até 3 categorias', 'Até 30 pedidos', '1 usuário'];
  if (code.includes('essential')) return ['Até 25 produtos', 'Até 5 categorias', 'Até 150 pedidos/mês', 'WhatsApp manual'];
  if (code.includes('professional')) return ['Até 100 produtos', 'Pedidos ilimitados', 'Até 5 usuários', 'Mesas, cupons, KDS e relatórios'];
  if (code.includes('premium')) return ['Produtos ilimitados', 'Automação WhatsApp', 'Fidelidade e sugestões', 'Domínio próprio e suporte prioritário'];
  return (Array.isArray(plan.features) ? plan.features : []).slice(0, 5).map((entry) => {
    const limit = entry.limit_value ? ` · até ${Number(entry.limit_value)}` : '';
    return `${entry.name || entry.code || 'Recurso'}${limit}`;
  });
}

function billingPlanDailyPrice(plan) {
  const code = String(plan?.code || '').toLowerCase();
  if (code.includes('essential')) return 'Menos de R$ 1,70 por dia';
  if (code.includes('professional')) return 'Menos de R$ 3 por dia';
  if (code.includes('premium')) return 'Menos de R$ 5 por dia';
  return '';
}

function billingHistoryRow(event) {
  const payload = event.metadata || {};
  const planCode = payload.plan_code || payload.planCode || payload.plan_name || '-';
  const receipt = payload.checkout_url || payload.receipt_url || payload.url || '';
  const amount = payload.amount_cents ? money(Number(payload.amount_cents) / 100) : '-';
  return `
    <article class="plan-history-row">
      <span>${dateTimeLabel(event.created_at)}</span>
      <strong>${escapeHtml(planCode)}</strong>
      <span>${escapeHtml(billingEventLabel(event.event_type || event.type || 'Evento'))}</span>
      <span>${escapeHtml(amount)}</span>
      ${receipt ? `<a href="${escapeAttribute(receipt)}" target="_blank" rel="noopener">Abrir</a>` : '<span>-</span>'}
    </article>
  `;
}

function billingEventLabel(value) {
  const label = String(value || '').replace(/^billing\./, '');
  return ({
    active: 'Pago',
    checkout_created: 'Cobrança criada',
    plan_activated: 'Plano ativado',
    plan_changed: 'Plano alterado',
    payment_pending: 'Pendente',
    past_due: 'Atrasado',
    cancelled: 'Cancelado',
    suspended: 'Suspenso'
  })[label] || label;
}

function planAlerts({ subscription = {}, pendingSubscription = {}, usage = {}, features = [] }) {
  const alerts = [];
  if (subscription.status === 'trial' && subscription.trial_ends_at) {
    const days = Math.ceil((new Date(subscription.trial_ends_at).getTime() - Date.now()) / 86400000);
    if (days >= 0 && days <= 7) alerts.push(`Seu teste termina em ${days || 1} dia(s).`);
  }
  if (pendingSubscription.id) alerts.push('Existe uma cobrança pendente. Regularize para evitar bloqueio.');
  [
    ['Produtos', usage.products, featureLimit(features, 'digital_menu')],
    ['Categorias', usage.categories, featureLimit(features, 'menu_categories')],
    ['Pedidos no mês', usage.orders_month ?? usage.orders, featureLimit(features, 'orders')],
    ['Usuários', usage.users, featureLimit(features, 'admin_users')],
    ['Mesas', usage.tables, featureLimit(features, 'tables')]
  ].forEach(([label, value, limit]) => {
    if (!limit) return;
    const percent = (Number(value || 0) / Number(limit)) * 100;
    if (percent >= 90) alerts.push(`${label} chegou a ${Math.round(percent)}% do limite do plano.`);
  });
  return alerts.length ? alerts.map((alert) => `<div class="plan-alert">${escapeHtml(alert)}</div>`).join('') : '';
}

function usageMetric(label, value) {
  return `<article><span>${escapeHtml(label)}</span><strong>${Number(value || 0)}</strong></article>`;
}

function commercialStatusLabel(status) {
  return ({
    trial: 'Teste',
    active: 'Ativo',
    payment_pending: 'Pagamento pendente',
    past_due: 'Pendente',
    grace_period: 'Prazo de regularização',
    suspended: 'Suspenso',
    cancelled: 'Cancelado',
    expired: 'Expirado',
    archived: 'Arquivado',
    indefinido: 'Indefinido'
  })[status] || status;
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

async function deleteAdminUser(event) {
  const button = event.currentTarget;
  const userId = button.dataset.adminUserId;
  const userName = button.dataset.adminUserName || 'esta conta';
  if (!userId) return;
  if (!confirm(`Excluir ${userName}? Essa pessoa perdera o acesso ao painel.`)) return;
  button.disabled = true;
  try {
    await request(`/api/admin/users/${userId}`, { method: 'DELETE' });
    state.adminUsers = state.adminUsers.filter((admin) => admin.id !== userId);
    state.selectedAdminUserIds.delete(String(userId));
    renderAdminUsers();
    toast('Conta excluida.');
  } catch (error) {
    toast(error.message || 'Não foi possível excluir a conta.');
  } finally {
    button.disabled = false;
  }
}

async function deleteSelectedAdminUsers() {
  const selectedIds = [...state.selectedAdminUserIds].filter((id) => String(state.admin?.id || '') !== String(id));
  if (!selectedIds.length) return;
  const selectedUsers = state.adminUsers.filter((admin) => selectedIds.includes(String(admin.id)));
  const confirmed = confirm(`Excluir ${selectedUsers.length} conta(s) selecionada(s)?\n\nEssas pessoas perderão o acesso ao painel.`);
  if (!confirmed) return;
  if (els.deleteSelectedAdminUsersButton) {
    els.deleteSelectedAdminUsersButton.disabled = true;
    els.deleteSelectedAdminUsersButton.textContent = 'Excluindo...';
  }
  let deleted = 0;
  const failures = [];
  for (const admin of selectedUsers) {
    try {
      await request(`/api/admin/users/${admin.id}`, { method: 'DELETE' });
      deleted += 1;
      state.selectedAdminUserIds.delete(String(admin.id));
      state.adminUsers = state.adminUsers.filter((item) => String(item.id) !== String(admin.id));
    } catch (error) {
      failures.push({
        name: admin.name || admin.email || 'Conta',
        message: error.message || 'Falha ao excluir.'
      });
    }
  }
  renderAdminUsers();
  if (els.deleteSelectedAdminUsersButton) {
    els.deleteSelectedAdminUsersButton.textContent = 'Excluir selecionadas';
  }
  toast(failures.length
    ? `${deleted} conta(s) excluída(s). ${failures.length} falharam: ${failures.slice(0, 2).map((item) => `${item.name}: ${item.message}`).join(' | ')}${failures.length > 2 ? '...' : ''}`
    : `${deleted} conta(s) excluída(s).`);
}

function adminRoleOptions(selectedRole) {
  const options = [
    ['admin', roleDefinition('admin').label],
    ['waiter', roleDefinition('waiter').label],
    ['attendant', roleDefinition('attendant').label],
    ['delivery', roleDefinition('delivery').label],
    ['kitchen', roleDefinition('kitchen').label]
  ];
  if (selectedRole === 'superadmin') options.unshift(['superadmin', roleDefinition('superadmin').label]);
  return options.map(([value, label]) => `<option value="${value}" ${value === selectedRole ? 'selected' : ''}>${label}</option>`).join('');
}

function adminRoleLabel(role) {
  return roleDefinition(role).label;
}

function adminPermissionSummary(role) {
  return roleDefinition(role).description;
}

function renderCategoryEditors() {
  const categories = filteredCategories();
  if (state.categories.length === 0) {
    els.categoryEditorList.innerHTML = '<p class="muted">Nenhuma categoria cadastrada.</p>';
    return;
  }
  if (categories.length === 0) {
    els.categoryEditorList.innerHTML = '<p class="muted">Nenhuma categoria encontrada com os filtros atuais.</p>';
    return;
  }

  els.categoryEditorList.replaceChildren(...categories.map((category, index) => categoryEditor(category, index, categories.length)));
}

function filteredCategories() {
  const search = normalizeSearch(state.categorySearch);
  return state.categories.filter((category) => {
    const matchesSearch = !search || normalizeSearch(`${category.name || ''} ${category.description || ''}`).includes(search);
    const matchesStatus = state.categoryStatusFilter === 'all'
      || (state.categoryStatusFilter === 'active' && category.is_active !== false)
      || (state.categoryStatusFilter === 'inactive' && category.is_active === false);
    return matchesSearch && matchesStatus;
  });
}

function categoryEditor(category, index, visibleCount = state.categories.length) {
  const card = document.createElement('article');
  card.className = 'category-list-card';
  card.dataset.categoryId = category.id;
  const filtered = Boolean(normalizeSearch(state.categorySearch)) || state.categoryStatusFilter !== 'all';
  card.draggable = !filtered;
  card.innerHTML = `
    <div class="category-row-summary">
      <div class="category-reorder" aria-label="Ordenar categoria">
        <button class="icon-button mini-icon" type="button" title="${filtered ? 'Limpe os filtros para ordenar' : 'Subir categoria'}" aria-label="Subir categoria" data-category-move="-1" ${filtered || index === 0 ? 'disabled' : ''}>&uarr;</button>
        <button class="icon-button mini-icon" type="button" title="${filtered ? 'Limpe os filtros para ordenar' : 'Descer categoria'}" aria-label="Descer categoria" data-category-move="1" ${filtered || index === visibleCount - 1 ? 'disabled' : ''}>&darr;</button>
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
  await loadMenuData({ force: true });
  toast('Ordem das categorias atualizada.');
}

function renderProductEditors() {
  const products = filteredProducts();

  if (orderedProducts().length === 0) {
    els.productEditorList.innerHTML = '<p class="muted">Nenhum produto cadastrado.</p>';
    return;
  }
  if (products.length === 0) {
    els.productEditorList.innerHTML = '<p class="muted">Nenhum produto encontrado com os filtros atuais.</p>';
    return;
  }

  els.productEditorList.replaceChildren(...products.map((item, index) => productEditor(item, index, products)));
}

function filteredProducts() {
  const search = normalizeSearch(state.productSearch);
  return orderedProducts().filter((item) => {
    const matchesSearch = !search || normalizeSearch(`${item.name || ''} ${item.description || ''} ${item.categoryName || ''}`).includes(search);
    const matchesStatus = state.productStatusFilter === 'all'
      || (state.productStatusFilter === 'active' && item.is_available !== false)
      || (state.productStatusFilter === 'inactive' && item.is_available === false);
    return matchesSearch && matchesStatus;
  });
}

function productEditor(item, _index, products) {
  const card = document.createElement('article');
  card.className = 'product-list-card';
  card.dataset.productId = item.id;
  card.dataset.categoryId = item.category_id;
  const filtered = Boolean(normalizeSearch(state.productSearch)) || state.productStatusFilter !== 'all';
  card.draggable = !filtered;
  const sameCategory = products.filter((product) => product.category_id === item.category_id);
  const categoryIndex = sameCategory.findIndex((product) => product.id === item.id);
  card.innerHTML = `
    <div class="product-row-summary">
      <div class="product-reorder" aria-label="Ordenar produto">
        <button class="icon-button mini-icon" type="button" title="${filtered ? 'Limpe os filtros para ordenar' : 'Subir produto'}" aria-label="Subir produto" data-product-move="-1" ${filtered || categoryIndex === 0 ? 'disabled' : ''}>&uarr;</button>
        <button class="icon-button mini-icon" type="button" title="${filtered ? 'Limpe os filtros para ordenar' : 'Descer produto'}" aria-label="Descer produto" data-product-move="1" ${filtered || categoryIndex === sameCategory.length - 1 ? 'disabled' : ''}>&darr;</button>
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
  await loadMenuData({ force: true });
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
  setValue(els.itemForm.elements.product_type, productTypeFromTags(item.tags || []));
  setValue(els.itemForm.elements.tags, visibleProductTags(item.tags || []).join(', '));
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
  await loadMenuData({ force: true });
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
  await loadMenuData({ force: true });
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
    await loadMenuData({ force: true });
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

    await request('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    await loadMenuData({ force: true });
    state.editingProductId = null;
    state.selectedOptionsProductId = null;
    els.itemForm.reset();
    els.itemForm.dataset.itemId = '';
    if (els.productDialog.open) els.productDialog.close();
    toast('Produto criado.');
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
  await refreshTablesAfterMutation();
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
  await refreshTablesAfterMutation();
}

async function deleteDiningTable(id) {
  await request(`/api/admin/tables/${id}`, { method: 'DELETE' });
  await refreshTablesAfterMutation();
  toast('Mesa excluída.');
}

async function createCustomerTab(payload) {
  await request('/api/admin/tabs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  await refreshTablesAfterMutation();
  toast('Comanda aberta.');
}

async function closeCustomerTab(id, payload) {
  await request(`/api/admin/tabs/${id}/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  await refreshTablesAfterMutation();
  toast('Comanda fechada.');
}

async function transferCustomerTab(id, payload) {
  await request(`/api/admin/tabs/${id}/transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  await refreshTablesAfterMutation();
  toast('Comanda transferida.');
}

async function addItemToCustomerTab(id, payload) {
  await request(`/api/admin/tabs/${id}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  await refreshTablesAfterMutation();
  toast('Item adicionado à comanda.');
}

async function refreshTablesAfterMutation() {
  await loadTablesData({ force: true });
  if (state.loadedAdminTabs.has('orders') || state.loadedAdminTabs.has('operation')) {
    await refreshOrdersOnly({ silent: true, skipNotifications: true });
  }
  if (state.loadedAdminTabs.has('plan')) {
    await loadPlanData({ force: true });
  }
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
    const logoFile = els.storeForm.elements.logo_file?.files?.[0];
    const faviconFile = els.storeForm.elements.favicon_file?.files?.[0];
    const coverFile = els.storeForm.elements.cover_file?.files?.[0];
    if (logoFile) {
      const uploaded = await uploadImage(logoFile, 'logo');
      payload.logo_url = uploaded.url;
    }
    if (faviconFile) {
      const uploaded = await uploadImage(faviconFile, 'favicon');
      payload.favicon_url = uploaded.url;
    }
    if (coverFile) {
      const uploaded = await uploadImage(coverFile, 'cover');
      payload.cover_url = uploaded.url;
    }
    const result = await request('/api/admin/store', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const updatedStore = Array.isArray(result) ? result[0] : result?.[0] || result?.store || result;
    if (updatedStore?.id) {
      state.store = {
        ...updatedStore,
        slug: payload.slug,
        public_url: `/${payload.slug}`
      };
    } else {
      state.store = { ...(state.store || {}), ...payload, public_url: `/${payload.slug}` };
    }
    state.storeFormDirty = false;
    saveAdminCache();
    renderOperation();
    applyFavicon(state.store?.favicon_url);
    fillStoreForm();
    renderStorePathPreview();
    if (els.storeForm.elements.logo_file) els.storeForm.elements.logo_file.value = '';
    if (els.storeForm.elements.favicon_file) els.storeForm.elements.favicon_file.value = '';
    if (els.storeForm.elements.cover_file) els.storeForm.elements.cover_file.value = '';
    toast(`Loja atualizada. WhatsApp salvo: ${payload.whatsapp_number}`);
  });
}

async function addCustomDomain() {
  const domain = els.customDomainInput?.value || '';
  if (!domain.trim()) {
    toast('Informe o domínio.');
    return;
  }
  const result = await request('/api/admin/domains', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain })
  });
  state.storeDomains = [result.domain, ...state.storeDomains.filter((item) => item.id !== result.domain.id)];
  if (els.customDomainInput) els.customDomainInput.value = '';
  renderCustomDomains();
  toast('Domínio cadastrado.');
}

async function verifyCustomDomain(id) {
  const result = await request(`/api/admin/domains/${id}/verify`, { method: 'POST' });
  state.storeDomains = state.storeDomains.map((item) => item.id === result.domain.id ? result.domain : item);
  renderCustomDomains();
  toast('Domínio verificado.');
}

async function deleteCustomDomain(id) {
  await request(`/api/admin/domains/${id}`, { method: 'DELETE' });
  state.storeDomains = state.storeDomains.filter((item) => item.id !== id);
  renderCustomDomains();
  toast('Domínio removido.');
}

function renderCustomDomains() {
  if (!els.customDomainList) return;
  if (!state.storeDomains.length) {
    els.customDomainList.innerHTML = '<p class="empty-state">Nenhum domínio cadastrado.</p>';
    return;
  }
  els.customDomainList.innerHTML = state.storeDomains.map((domain) => `
    <article class="domain-row">
      <div>
        <strong>${escapeHtml(domain.domain)}</strong>
        <small>Status: ${escapeHtml(domain.status)} - Token DNS: ${escapeHtml(domain.verification_token || '')}</small>
      </div>
      <div class="row-actions">
        <button class="ghost-button compact" data-domain-verify="${escapeAttribute(domain.id)}" type="button">Verificar</button>
        <button class="ghost-button compact danger" data-domain-delete="${escapeAttribute(domain.id)}" type="button">Remover</button>
      </div>
    </article>
  `).join('');
  els.customDomainList.querySelectorAll('[data-domain-verify]').forEach((button) => {
    button.addEventListener('click', () => verifyCustomDomain(button.dataset.domainVerify));
  });
  els.customDomainList.querySelectorAll('[data-domain-delete]').forEach((button) => {
    button.addEventListener('click', () => deleteCustomDomain(button.dataset.domainDelete));
  });
}

async function submitIntegrations(event) {
  event.preventDefault();
  const payload = { integration_settings: integrationSettingsFromForm(els.integrationsForm) };
  await withSaving(els.integrationsForm, async () => {
    const result = await request('/api/admin/integrations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    state.store = result.store || { ...(state.store || {}), integration_settings: payload.integration_settings };
    state.integrationsFormDirty = false;
    saveAdminCache();
    fillIntegrationSettings(state.store.integration_settings || payload.integration_settings);
    renderIntegrationStatus(state.store.integration_settings || payload.integration_settings);
    toast('Integrações salvas.');
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
  const target = form || els.integrationsForm;
  const current = state.store?.integration_settings || {};
  const currentWhatsapp = current.whatsapp || {};
  const currentPix = current.pix || {};
  return {
    whatsapp: {
      enabled: target?.elements.integration_whatsapp_enabled?.checked || false,
      provider: target?.elements.integration_whatsapp_provider?.value || 'official',
      phoneNumberId: target?.elements.integration_whatsapp_phoneNumberId?.value || '',
      accessToken: target?.elements.integration_whatsapp_accessToken?.value || currentWhatsapp.accessToken || '',
      apiUrl: target?.elements.integration_whatsapp_apiUrl?.value || ''
    },
    pix: {
      enabled: target?.elements.integration_pix_enabled?.checked || false,
      provider: 'abacatepay',
      apiKey: target?.elements.integration_pix_apiKey?.value || currentPix.apiKey || '',
      webhookSecret: target?.elements.integration_pix_webhookSecret?.value || currentPix.webhookSecret || '',
      expirationMinutes: target?.elements.integration_pix_expirationMinutes?.value || 15
    },
    card: {
      enabled: false,
      provider: 'mock',
      apiKey: '',
      returnUrl: ''
    },
    split: {
      enabled: false,
      recipientId: '',
      percentage: 0
    },
    reconciliation: {
      enabled: false,
      days: 7
    }
  };
}

function fillIntegrationSettings(settings = {}) {
  const whatsapp = settings.whatsapp || {};
  const pix = settings.pix || {};
  const form = els.integrationsForm;
  if (!form) return;
  if (form.elements.integration_whatsapp_enabled) form.elements.integration_whatsapp_enabled.checked = Boolean(whatsapp.enabled);
  setValue(form.elements.integration_whatsapp_provider, inferredWhatsappProvider(whatsapp));
  setValue(form.elements.integration_whatsapp_phoneNumberId, whatsapp.phoneNumberId || '');
  setValue(form.elements.integration_whatsapp_accessToken, whatsapp.accessToken || '');
  setValue(form.elements.integration_whatsapp_apiUrl, whatsapp.apiUrl || '');
  if (form.elements.integration_pix_enabled) form.elements.integration_pix_enabled.checked = Boolean(pix.enabled);
  setValue(form.elements.integration_pix_provider, 'abacatepay');
  setValue(form.elements.integration_pix_apiKey, pix.apiKey || '');
  setValue(form.elements.integration_pix_webhookSecret, pix.webhookSecret || '');
  setValue(form.elements.integration_pix_expirationMinutes, pix.expirationMinutes || 15);
  renderAbacateWebhookUrl();
  renderIntegrationStatus(settings);
}

function inferredWhatsappProvider(whatsapp = {}) {
  const provider = whatsapp.provider || 'official';
  const apiUrl = String(whatsapp.apiUrl || '').toLowerCase();
  if (provider === 'webhook' && (apiUrl.includes('relaxsolucoes') || apiUrl.includes('whatsevolution'))) return 'whatsevolution';
  return provider;
}

function renderIntegrationStatus(settings = state.store?.integration_settings || {}) {
  if (!els.integrationStatusText) return;
  const whatsapp = settings.whatsapp || {};
  const pix = settings.pix || {};
  els.integrationStatusText.textContent = `WhatsApp: ${whatsapp.enabled ? 'ativo' : 'desativado'} - Abacate Pay/Pix: ${pix.enabled ? 'ativo' : 'desativado'}.`;
}

async function testIntegrations() {
  const button = els.testIntegrationsButton;
  const previousText = button?.textContent || 'Testar integrações';
  try {
    if (button) {
      button.disabled = true;
      button.textContent = 'Testando...';
    }
    if (els.integrationStatusText) {
      els.integrationStatusText.textContent = 'Testando WhatsApp e Abacate Pay...';
    }
    const result = await request('/api/admin/integrations/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integration_settings: integrationSettingsFromForm(els.integrationsForm) })
    });
    const whatsapp = result.result?.whatsapp;
    const pix = result.result?.pix;
    const hasFailure = [whatsapp, pix].some((item) => item && item.ok === false);
    if (els.integrationStatusText) {
      els.integrationStatusText.textContent = [
        integrationTestMessage('WhatsApp', whatsapp),
        integrationTestMessage('Abacate Pay', pix)
      ].join(' ');
    }
    toast(hasFailure ? 'Teste concluído com pendências.' : 'Integrações testadas com sucesso.');
  } catch (error) {
    if (els.integrationStatusText) {
      els.integrationStatusText.textContent = error.message || 'Não foi possível testar as integrações.';
    }
    toast(error.message || 'Não foi possível testar as integrações.');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previousText;
    }
  }
}

function integrationTestMessage(label, result) {
  if (!result) return `${label}: não testado.`;
  const prefix = result.ok === false ? `${label}: atenção -` : `${label}: ok -`;
  return `${prefix} ${result.message || 'verificado.'}`;
}

function renderAbacateWebhookUrl() {
  if (!els.abacateWebhookUrl) return;
  const origin = window.location.origin || '';
  els.abacateWebhookUrl.textContent = `${origin}/api/payments/webhook?provider=abacatepay`;
}

function openIntegrationHelp(type) {
  const origin = window.location.origin || 'https://sua-loja.com';
  const webhookUrl = `${origin}/api/payments/webhook?provider=abacatepay`;
  const content = {
    'abacate-key': {
      eyebrow: 'Abacate Pay',
      title: 'Onde pegar a API key',
      body: `
        <ol>
          <li>Entre no painel da Abacate Pay.</li>
          <li>Acesse <strong>Integrar</strong> e depois <strong>API Keys</strong>.</li>
          <li>Copie a chave de produção quando a loja já estiver pronta para vender.</li>
          <li>Cole no campo <strong>API key da Abacate Pay</strong> e salve.</li>
        </ol>
        <p>Por segurança, depois de salva a chave fica protegida no servidor e aparece como campo de senha.</p>
      `
    },
    'abacate-webhook': {
      eyebrow: 'Webhook',
      title: 'Como receber confirmação do Pix',
      body: `
        <ol>
          <li>No painel da Abacate Pay, abra a área de webhooks.</li>
          <li>Cadastre a URL abaixo como endpoint HTTPS:</li>
        </ol>
        <code>${escapeHtml(webhookUrl)}</code>
        <ol start="3">
          <li>Configure no provedor o header <strong>x-webhook-secret</strong> com o mesmo valor do campo <strong>Segredo do webhook</strong>.</li>
          <li>Salve as integrações antes de testar a confirmação do Pix.</li>
          <li>Faça um pedido teste com Pix online e confira se o status muda para pago após a confirmação.</li>
        </ol>
      `
    }
  }[type];
  if (!content || !els.integrationHelpDialog) return;
  els.integrationHelpEyebrow.textContent = content.eyebrow;
  els.integrationHelpTitle.textContent = content.title;
  els.integrationHelpBody.innerHTML = content.body;
  els.integrationHelpDialog.showModal();
}

async function updateCategory(id, payload, options = {}) {
  await request(`/api/categories/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (options.reload !== false) await loadMenuData({ force: true });
}

async function updateItem(id, payload, options = {}) {
  await request(`/api/items/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (options.reload !== false) await loadMenuData({ force: true });
}

async function updateAdminCustomer(id, payload) {
  await request(`/api/admin/customers/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  await loadCustomersData({ force: true });
}

async function createAdminCustomerAddress(customerId, payload) {
  await request(`/api/admin/customers/${customerId}/addresses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  await loadCustomersData({ force: true });
}

async function updateAdminCustomerAddress(customerId, addressId, payload) {
  await request(`/api/admin/customers/${customerId}/addresses/${addressId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  await loadCustomersData({ force: true });
}

async function deleteAdminCustomerAddress(customerId, addressId) {
  await request(`/api/admin/customers/${customerId}/addresses/${addressId}`, { method: 'DELETE' });
  await loadCustomersData({ force: true });
}

async function removeAdminCustomer(id) {
  await request(`/api/admin/customers/${id}`, { method: 'DELETE' });
  state.openCustomerIds.delete(String(id));
  await loadCustomersData({ force: true });
}

async function removeCategory(id) {
  await request(`/api/categories/${id}`, { method: 'DELETE' });
  await loadMenuData({ force: true });
}

async function removeItem(id) {
  await request(`/api/items/${id}`, { method: 'DELETE' });
  await loadMenuData({ force: true });
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
  await loadMenuData({ force: true });
}

async function deleteModifierGroup(groupId) {
  await request(`/api/modifier-groups/${groupId}`, { method: 'DELETE' });
  await loadMenuData({ force: true });
}

async function createModifier(groupId, payload) {
  await request(`/api/modifier-groups/${groupId}/modifiers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  await loadMenuData({ force: true });
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
  await loadMenuData({ force: true });
}

async function deleteModifier(modifierId) {
  await request(`/api/modifiers/${modifierId}`, { method: 'DELETE' });
  await loadMenuData({ force: true });
}

async function uploadImage(file, usage = 'product') {
  const dataBase64 = await fileToBase64(file);
  return request('/api/admin/uploads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type,
      dataBase64,
      usage
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
    if (document.hidden) return;
    refreshOrdersOnly({ silent: true }).catch(() => {});
  }, 8000);
}

function stopOrderPolling() {
  if (!state.orderPollTimer) return;
  clearInterval(state.orderPollTimer);
  state.orderPollTimer = null;
}

function activateAdminTab(tab) {
  if (!canAccessTab(tab)) {
    if (hasRoleAccessToTab(tab) && !isTabAvailableInPlan(tab)) {
      toast('Recurso disponível em planos superiores.');
    }
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
    customers: 'Clientes',
    promotions: 'Cupons e Campanhas',
    store: 'Configurações da Loja',
    integrations: 'Integrações',
    plan: 'Plano',
    support: 'Suporte',
    account: 'Conta e usuários'
  };
  state.activeAdminTab = tab;
  els.adminTitle.textContent = titles[tab] || 'Painel';
  document.querySelectorAll('[data-admin-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.adminTab === tab);
  });
  document.querySelectorAll('[data-admin-section]').forEach((section) => {
    section.classList.toggle('active', section.dataset.adminSection === tab);
  });
  loadAdminTabData(tab).catch(() => {});
}

function renderPermissionedNavigation() {
  document.querySelectorAll('[data-admin-tab]').forEach((button) => {
    const tab = button.dataset.adminTab;
    const roleAllowed = hasRoleAccessToTab(tab);
    const planAllowed = isTabAvailableInPlan(tab);
    button.hidden = !roleAllowed;
    button.disabled = roleAllowed && !planAllowed;
    button.classList.toggle('plan-locked', roleAllowed && !planAllowed);
    if (roleAllowed && !planAllowed) button.title = 'Recurso disponível em planos superiores';
  });
  document.querySelectorAll('[data-admin-section]').forEach((section) => {
    section.hidden = !canAccessTab(section.dataset.adminSection);
    renderPlanBlockedSection(section);
  });
  if (!canAccessTab(state.activeAdminTab)) {
    activateAdminTab(firstAllowedAdminTab());
  }
}

function firstAllowedAdminTab() {
  return ['operation', 'orders', 'tables', 'menu', 'reports', 'promotions', 'customers', 'store', 'integrations', 'plan', 'support', 'account']
    .find((tab) => canAccessTab(tab)) || 'account';
}

function canAccessTab(tab) {
  if (tab === 'account' || tab === 'support') return true;
  if (!hasRoleAccessToTab(tab)) return false;
  return isTabAvailableInPlan(tab);
}

function hasRoleAccessToTab(tab) {
  if (tab === 'account' || tab === 'support') return true;
  const permission = ({
    operation: 'operation',
    orders: 'orders',
    menu: 'menu',
    reports: 'reports',
    tables: 'tables',
    promotions: 'promotions',
    customers: 'customers',
    store: 'store',
    integrations: 'store',
    plan: 'plan',
    support: null
  })[tab];
  return !permission || hasPermission(permission);
}

function isTabAvailableInPlan(tab) {
  const feature = ({
    operation: 'orders',
    orders: 'orders',
    menu: 'digital_menu',
    reports: 'basic_reports',
    tables: 'tables',
    promotions: 'promotions',
    customers: 'customers',
    store: 'store_settings',
    integrations: 'store_settings'
  })[tab];
  if (!feature || tab === 'plan' || tab === 'account' || tab === 'support') return true;
  const access = state.admin?.plan_access?.[feature];
  return access ? access.enabled !== false : true;
}

function canUsePlanFeature(feature) {
  const access = state.admin?.plan_access?.[feature];
  return access ? access.enabled !== false : true;
}

function planFeaturesToAccess(features = []) {
  const map = Object.fromEntries(PLAN_FEATURE_CODES.map((code) => [code, {
    enabled: false,
    limit_value: null,
    source: 'plan'
  }]));
  return features.reduce((map, entry) => {
    const code = entry.feature?.code;
    if (!code) return map;
    map[code] = {
      enabled: entry.is_enabled !== false,
      limit_value: entry.limit_value ?? null,
      source: 'plan'
    };
    return map;
  }, map);
}

function renderPlanFeatureHints() {
  const categoryAllowed = canUsePlanFeature('menu_categories');
  const productAllowed = canUsePlanFeature('digital_menu');
  const tableAllowed = canUsePlanFeature('tables');
  setFeatureGate(els.newCategoryButton, els.categoryPlanAlert, categoryAllowed, 'Novas categorias estão disponíveis em planos superiores.');
  setFeatureGate(els.newProductButton, els.productPlanAlert, productAllowed, 'Novos produtos estão disponíveis em planos superiores.');
  setFormFeatureGate(els.tableForm, tableAllowed, 'Mesas e QR Code estão disponíveis em planos superiores.');
}

function setFeatureGate(button, alert, allowed, message) {
  if (button) {
    button.disabled = !allowed;
    button.title = allowed ? '' : `${message} Acesse Meu plano para liberar.`;
  }
  if (alert) {
    alert.hidden = allowed;
    alert.innerHTML = allowed ? '' : `${escapeHtml(message)} <button type="button" data-admin-tab-jump="plan">Ver planos</button>`;
    alert.querySelector('[data-admin-tab-jump]')?.addEventListener('click', () => activateAdminTab('plan'));
  }
}

function setFormFeatureGate(form, allowed, message) {
  if (!form) return;
  form.querySelectorAll('input, select, textarea, button').forEach((field) => {
    if (field.type !== 'button') field.disabled = !allowed;
  });
  form.title = allowed ? '' : `${message} Acesse Meu plano para liberar.`;
}

function renderPlanBlockedSection(section) {
  if (!section || section.hidden || !section.dataset.adminSection) return;
  if (isTabAvailableInPlan(section.dataset.adminSection)) return;
  section.innerHTML = `
    <section class="panel plan-blocked-panel">
      <p class="eyebrow">Plano atual</p>
      <h2>Recurso disponível em planos superiores</h2>
      <p>Este recurso não faz parte do plano atual da loja. Acesse Meu plano para comparar opções e liberar esta área.</p>
      <button class="primary-button compact" type="button" data-admin-tab-jump="plan">Ver planos</button>
    </section>
  `;
  section.querySelector('[data-admin-tab-jump]')?.addEventListener('click', () => activateAdminTab('plan'));
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
  setValue(els.storeForm.elements.page_title, store.page_title);
  setValue(els.storeForm.elements.favicon_url, store.favicon_url);
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
  renderStorePathPreview();
  renderThemePreview();
}

function renderStorePathPreview() {
  if (!els.storePathPreview || !els.storeForm) return;
  const inputSlug = els.storeForm.elements.slug?.value || state.store?.slug || '';
  const slug = publicSlug(inputSlug || state.store?.slug || state.store?.public_url || '');
  const url = storePublicUrl(slug);
  const link = els.storePathPreview.querySelector('a');
  if (!link) return;
  link.href = url;
  link.textContent = url.replace(/^https?:\/\//, '');
}

function storePublicUrl(slug) {
  const clean = publicSlug(slug);
  return clean ? `${window.location.origin}/${clean}` : `${window.location.origin}/cardapio`;
}

function publicSlug(value) {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/+/, '')
    .split('/')[0]
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function cleanText(value) {
  return String(value || '').trim();
}

function fillAccountForm() {
  if (!state.admin) return;
  setValue(els.accountForm.elements.name, state.admin.name);
  setValue(els.accountForm.elements.email, state.admin.email);
  const name = state.admin.name || 'Administrador';
  const email = state.admin.email || '';
  const storeName = state.admin.active_store?.name || state.store?.name || 'Loja atual';
  if (els.accountProfileAvatar) els.accountProfileAvatar.textContent = name.slice(0, 1).toUpperCase();
  if (els.accountProfileName) els.accountProfileName.textContent = name;
  if (els.accountProfileEmail) els.accountProfileEmail.textContent = email;
  if (els.accountProfileRole) els.accountProfileRole.textContent = state.admin.role_label || adminRoleLabel(state.admin.role);
  if (els.accountProfileStore) els.accountProfileStore.textContent = storeName;
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
  const type = cleanProductType(data.get('product_type'));
  const tags = String(data.get('tags') || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag) => !tag.toLowerCase().startsWith('tipo:'));
  if (type) tags.push(`tipo:${type}`);
  return {
    category_id: selectedCategoryId,
    name: data.get('name'),
    description: data.get('description'),
    price: data.get('price'),
    image_url: data.get('image_url'),
    tags,
    sort_order: sortOrder,
    is_featured: data.get('is_featured') === 'on',
    is_available: data.get('is_available') === 'on'
  };
}

function cleanProductType(value) {
  return ['burger', 'pizza', 'main', 'side', 'drink', 'dessert'].includes(String(value || '')) ? String(value) : '';
}

function productTypeFromTags(tags = []) {
  const type = (tags || [])
    .map((tag) => String(tag || '').trim().toLowerCase())
    .find((tag) => tag.startsWith('tipo:'))
    ?.replace('tipo:', '');
  return cleanProductType(type);
}

function visibleProductTags(tags = []) {
  return (tags || []).filter((tag) => !String(tag || '').trim().toLowerCase().startsWith('tipo:'));
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
    slug: publicSlug(data.get('slug') || data.get('name')),
    description: data.get('description'),
    whatsapp_number: data.get('whatsapp_number'),
    address: data.get('address'),
    page_title: data.get('page_title'),
    favicon_url: data.get('favicon_url'),
    logo_url: data.get('logo_url'),
    cover_url: data.get('cover_url'),
    delivery_fee: data.get('delivery_fee'),
    delivery_neighborhood_fees: parseNeighborhoodFees(data.get('delivery_neighborhood_fees')),
    minimum_order: data.get('minimum_order'),
    payment_methods: [...new Set(paymentMethods)],
    business_hours: businessHoursFromForm(data),
    theme_settings: themeSettingsFromForm(form),
    print_settings: printSettingsFromForm().print_settings,
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
    const error = new Error(detail || data.error || friendlyRequestError(url, response, data));
    error.code = data.code || data.error_code || '';
    error.feature = data.feature || '';
    error.usageKey = data.usage_key || '';
    error.limit = data.limit;
    error.used = data.used;
    throw error;
  }
  return data;
}

function friendlyRequestError(url, response, data = {}) {
  if (data.code === 'PLAN_LIMIT_REACHED') return 'Limite do plano atingido. Acesse Meu plano para liberar mais uso.';
  if (data.code === 'FEATURE_NOT_AVAILABLE') return 'Recurso disponível em planos superiores.';
  const path = String(url || '');
  if (response.status === 401 && path.includes('/login')) return 'Senha incorreta. Confira seus dados e tente novamente.';
  if (response.status === 404 && path.includes('/login')) return 'Não existe uma conta com este e-mail.';
  if (response.status === 413) return 'Arquivo ou dados muito grandes para enviar.';
  if (path.includes('/uploads')) return 'Não foi possível enviar a imagem. Use JPG, PNG ou WebP com até 5 MB.';
  if (path.includes('/billing') || path.includes('/plan')) return 'Não foi possível atualizar o plano ou a cobrança agora.';
  if (path.includes('/tables') || path.includes('/tabs')) return 'Não foi possível atualizar mesas ou comandas.';
  if (path.includes('/categories') || path.includes('/items') || path.includes('/modifier')) return 'Não foi possível salvar o cardápio.';
  if (path.includes('/orders')) return 'Não foi possível atualizar o pedido.';
  if (path.includes('/store')) return 'Não foi possível salvar os dados da loja.';
  if (response.status === 403) return 'Sua conta não tem permissão para esta ação.';
  if (response.status >= 500) return 'Instabilidade no servidor. Tente novamente em instantes.';
  return 'Não foi possível concluir a ação.';
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
    const admin = state.admin ? {
      id: state.admin.id,
      name: state.admin.name,
      email: state.admin.email,
      role: state.admin.role,
      role_label: state.admin.role_label,
      permissions: state.admin.permissions,
      company_id: state.admin.company_id,
      store_id: state.admin.store_id,
      active_store: state.admin.active_store || null,
      plan_access: state.admin.plan_access || {},
      stores: Array.isArray(state.admin.stores) ? state.admin.stores.map((store) => ({
        id: store.id,
        company_id: store.company_id || null,
        name: store.name,
        slug: store.slug,
        public_url: store.public_url,
        is_active: store.is_active !== false
      })) : []
    } : null;
    localStorage.setItem(ADMIN_CACHE_KEY, JSON.stringify({
      version: 2,
      admin,
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
    const cached = JSON.parse(localStorage.getItem(ADMIN_CACHE_KEY) || 'null');
    if (cached?.version !== 2) return null;
    if (cached?.store?.integration_settings) {
      delete cached.store.integration_settings;
      localStorage.setItem(ADMIN_CACHE_KEY, JSON.stringify(cached));
    }
    return cached;
  } catch {
    return null;
  }
}

function clearAdminCache() {
  localStorage.removeItem(ADMIN_CACHE_KEY);
  localStorage.removeItem('admin_profile_cache_v1');
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

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR');
}

function ticketStatusLabel(status) {
  return ({
    open: 'Aberto',
    waiting_customer: 'Aguardando cliente',
    in_review: 'Em análise',
    resolved: 'Resolvido',
    closed: 'Fechado'
  })[status] || status || 'Aberto';
}

function priorityLabel(priority) {
  return ({
    low: 'Baixa',
    medium: 'Média',
    high: 'Alta',
    critical: 'Crítica'
  })[priority] || priority || 'Média';
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






