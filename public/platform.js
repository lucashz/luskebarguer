const state = {
  admin: null,
  companies: [],
  plans: [],
  features: [],
  logs: [],
  backup: null,
  health: null,
  summary: null,
  analytics: null,
  services: null,
  serviceLogs: [],
  billing: null,
  billingPlans: [],
  billingEvents: [],
  billingSubscriptions: [],
  billingAddons: [],
  billingConfig: null,
  billingLoading: false,
  billingLoaded: false,
  billingError: '',
  smtp: null,
  whatsappSettings: null,
  emailTemplates: [],
  supportTickets: [],
  supportActiveTab: 'queue',
  selectedSupportTicketId: null,
  baseLoaded: false,
  baseLoading: false,
  healthLoaded: false,
  servicesLoaded: false,
  auditLoaded: false,
  backupLoaded: false,
  communicationLoaded: false,
  supportLoaded: false,
  companyPage: 1,
  companyPerPage: 100,
  companyPagination: null,
  communicationLoading: false,
  supportLoading: false,
  companyDetails: {},
  commercialLoading: false,
  commercialLoaded: false,
  commercialError: '',
  dailyExpanded: false,
  activeView: 'overview'
};

const PUBLIC_SITE_BASE_URL = resolveExternalBaseUrl('https://taprontomenu.com.br');
const PANEL_BASE_URL = resolveExternalBaseUrl('https://app.taprontomenu.com.br', '/painel');
const PLATFORM_BASE_URL = resolveExternalBaseUrl('https://central.taprontomenu.com.br', '/platform');

function resolveExternalBaseUrl(productionUrl, localPath = '') {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === '') {
    return `${window.location.origin}${localPath}`.replace(/\/+$/, '') || window.location.origin;
  }
  return productionUrl.replace(/\/+$/, '');
}

function externalUrl(baseUrl, path = '/') {
  const cleanPath = String(path || '/').startsWith('/') ? String(path || '/') : `/${path}`;
  if (cleanPath === '/') return String(baseUrl || '').replace(/\/+$/, '');
  if (cleanPath.startsWith('/?')) return `${String(baseUrl || '').replace(/\/+$/, '')}${cleanPath.slice(1)}`;
  return `${String(baseUrl || '').replace(/\/+$/, '')}${cleanPath}`;
}

const PLATFORM_VIEW_META = {
  overview: {
    title: 'Visão Geral',
    subtitle: 'Resumo do SaaS: clientes, receita, pedidos, alertas e operação.',
  },
  commercial: {
    title: 'Métricas Comerciais',
    subtitle: 'Acompanhe MRR, conversão, retenção e desempenho dos planos.',
  },
  clients: {
    title: 'Clientes',
    subtitle: 'Empresas, lojas, planos, ativação, uso e sinais de risco.',
  },
  billing: {
    title: 'Billing',
    subtitle: 'Assinaturas, cobranças, inadimplência, eventos e reativações.',
  },
  support: {
    title: 'Central de Chamados',
    subtitle: 'Atenda clientes com fila, conversa, contexto e SLA.',
  },
  health: {
    title: 'Operação Técnica',
    subtitle: 'Monitore API, banco, backups, SMTP, webhooks, jobs e logs.',
  },
  communication: {
    title: 'Comunicação',
    subtitle: 'Configure SMTP, templates automáticos e testes de entrega.',
  },
  audit: {
    title: 'Auditoria',
    subtitle: 'Rastreie ações sensíveis, alterações, suporte e integrações.',
  },
};

const els = {
  platformUser: document.querySelector('#platformUser'),
  platformPageTitle: document.querySelector('#platformPageTitle'),
  platformPageSubtitle: document.querySelector('#platformPageSubtitle'),
  platformSidebarEmail: document.querySelector('#platformSidebarEmail'),
  platformSidebarName: document.querySelector('#platformSidebarName'),
  platformBlocked: document.querySelector('#platformBlocked'),
  platformLoginPanel: document.querySelector('#platformLoginPanel'),
  platformLoginForm: document.querySelector('#platformLoginForm'),
  platformLoginMessage: document.querySelector('#platformLoginMessage'),
  platformLoginButton: document.querySelector('#platformLoginButton'),
  platformRecoverForm: document.querySelector('#platformRecoverForm'),
  platformRecoverMessage: document.querySelector('#platformRecoverMessage'),
  platformRecoverButton: document.querySelector('#platformRecoverButton'),
  platformContent: document.querySelector('#platformContent'),
  platformTabs: [...document.querySelectorAll('[data-platform-view]')],
  platformSections: [...document.querySelectorAll('[data-platform-section]')],
  platformLogoutButton: document.querySelector('#platformLogoutButton'),
  refreshPlatformButton: document.querySelector('#refreshPlatformButton'),
  analyticsPeriodSelect: document.querySelector('#analyticsPeriodSelect'),
  commercialPeriodMirror: document.querySelector('#commercialPeriodMirror'),
  refreshAnalyticsButton: document.querySelector('#refreshAnalyticsButton'),
  refreshCommercialMirrorButton: document.querySelector('#refreshCommercialMirrorButton'),
  platformKpiGrid: document.querySelector('#platformKpiGrid'),
  platformDailySummary: document.querySelector('#platformDailySummary'),
  platformDailyChart: document.querySelector('#platformDailyChart'),
  platformDailyDetails: document.querySelector('#platformDailyDetails'),
  platformStoreRanking: document.querySelector('#platformStoreRanking'),
  platformAccessMetrics: document.querySelector('#platformAccessMetrics'),
  platformBillingMetrics: document.querySelector('#platformBillingMetrics'),
  platformCommercialAlerts: document.querySelector('#platformCommercialAlerts'),
  platformOperationalOverviewAlerts: document.querySelector('#platformOperationalOverviewAlerts'),
  platformPlanMrr: document.querySelector('#platformPlanMrr'),
  platformConversionGrid: document.querySelector('#platformConversionGrid'),
  clientFilterForm: document.querySelector('#clientFilterForm'),
  clientPlanFilter: document.querySelector('#clientPlanFilter'),
  platformAttentionPanel: document.querySelector('#platformAttentionPanel'),
  auditFilterForm: document.querySelector('#auditFilterForm'),
  auditCompanySelect: document.querySelector('#auditCompanySelect'),
  auditStoreSelect: document.querySelector('#auditStoreSelect'),
  companyList: document.querySelector('#companyList'),
  auditList: document.querySelector('#auditList'),
  backupStatus: document.querySelector('#backupStatus'),
  healthPeriodSelect: document.querySelector('#healthPeriodSelect'),
  refreshHealthButton: document.querySelector('#refreshHealthButton'),
  healthMeta: document.querySelector('#healthMeta'),
  platformStatusGrid: document.querySelector('#platformStatusGrid'),
  platformMetrics: document.querySelector('#platformMetrics'),
  platformConfigChecklist: document.querySelector('#platformConfigChecklist'),
  platformAlerts: document.querySelector('#platformAlerts'),
  operationalLogTypeFilter: document.querySelector('#operationalLogTypeFilter'),
  operationalLogStatusFilter: document.querySelector('#operationalLogStatusFilter'),
  operationalLogSeverityFilter: document.querySelector('#operationalLogSeverityFilter'),
  operationalLogServiceFilter: document.querySelector('#operationalLogServiceFilter'),
  operationalLogCompanyFilter: document.querySelector('#operationalLogCompanyFilter'),
  operationalLogStoreFilter: document.querySelector('#operationalLogStoreFilter'),
  platformOperationalLogs: document.querySelector('#platformOperationalLogs'),
  refreshServicesButton: document.querySelector('#refreshServicesButton'),
  servicesMeta: document.querySelector('#servicesMeta'),
  platformServicesGrid: document.querySelector('#platformServicesGrid'),
  platformBackupList: document.querySelector('#platformBackupList'),
  platformServiceLogs: document.querySelector('#platformServiceLogs'),
  platformRiskZone: document.querySelector('#platformRiskZone'),
  previewLogCleanupButton: document.querySelector('#previewLogCleanupButton'),
  logCleanupResult: document.querySelector('#logCleanupResult'),
  billingPeriodSelect: document.querySelector('#billingPeriodSelect'),
  billingStatusFilter: document.querySelector('#billingStatusFilter'),
  billingPlanFilter: document.querySelector('#billingPlanFilter'),
  refreshBillingButton: document.querySelector('#refreshBillingButton'),
  platformBillingSummaryGrid: document.querySelector('#platformBillingSummaryGrid'),
  platformSubscriptionList: document.querySelector('#platformSubscriptionList'),
  platformBillingPlanList: document.querySelector('#platformBillingPlanList'),
  platformBillingAddonList: document.querySelector('#platformBillingAddonList'),
  platformBillingEventList: document.querySelector('#platformBillingEventList'),
  platformBillingAlertList: document.querySelector('#platformBillingAlertList'),
  platformBillingConfigForm: document.querySelector('#platformBillingConfigForm'),
  billingConfigStatusText: document.querySelector('#billingConfigStatusText'),
  billingWebhookUrl: document.querySelector('#billingWebhookUrl'),
  saveBillingConfigButton: document.querySelector('#saveBillingConfigButton'),
  testBillingConfigButton: document.querySelector('#testBillingConfigButton'),
  testBillingConfigButtonHealth: document.querySelector('#testBillingConfigButtonHealth'),
  openCommunicationFromHealth: document.querySelector('#openCommunicationFromHealth'),
  refreshCommunicationButton: document.querySelector('#refreshCommunicationButton'),
  platformSmtpForm: document.querySelector('#platformSmtpForm'),
  platformSmtpTestForm: document.querySelector('#platformSmtpTestForm'),
  smtpStatusText: document.querySelector('#smtpStatusText'),
  platformWhatsappForm: document.querySelector('#platformWhatsappForm'),
  platformWhatsappStatusText: document.querySelector('#platformWhatsappStatusText'),
  platformWhatsappWebhookUrl: document.querySelector('#platformWhatsappWebhookUrl'),
  savePlatformWhatsappButton: document.querySelector('#savePlatformWhatsappButton'),
  testPlatformWhatsappButton: document.querySelector('#testPlatformWhatsappButton'),
  platformEmailTemplateList: document.querySelector('#platformEmailTemplateList'),
  refreshSupportButton: document.querySelector('#refreshSupportButton'),
  platformSupportSummaryGrid: document.querySelector('#platformSupportSummaryGrid'),
  platformSupportInsights: document.querySelector('#platformSupportInsights'),
  platformSupportTabs: [...document.querySelectorAll('[data-support-tab]')],
  platformSupportPanels: [...document.querySelectorAll('[data-support-panel]')],
  supportSearchFilter: document.querySelector('#supportSearchFilter'),
  supportStatusFilter: document.querySelector('#supportStatusFilter'),
  supportPriorityFilter: document.querySelector('#supportPriorityFilter'),
  supportSlaFilter: document.querySelector('#supportSlaFilter'),
  supportPlanFilter: document.querySelector('#supportPlanFilter'),
  supportQuickReplies: document.querySelector('#supportQuickReplies'),
  platformSupportTicketList: document.querySelector('#platformSupportTicketList'),
  platformSupportDetail: document.querySelector('#platformSupportDetail'),
  platformConfirmBackdrop: document.querySelector('#platformConfirmBackdrop'),
  platformConfirmForm: document.querySelector('#platformConfirmForm'),
  platformConfirmTitle: document.querySelector('#platformConfirmTitle'),
  platformConfirmMessage: document.querySelector('#platformConfirmMessage'),
  platformConfirmCancel: document.querySelector('#platformConfirmCancel'),
  platformConfirmSubmit: document.querySelector('#platformConfirmSubmit'),
  toast: document.querySelector('#toast')
};

els.platformLoginForm?.addEventListener('submit', submitPlatformLogin);
els.platformRecoverForm?.addEventListener('submit', submitPlatformRecover);
els.platformLogoutButton?.addEventListener('click', logout);
els.refreshPlatformButton?.addEventListener('click', () => loadPlatform({ force: true }));
els.auditFilterForm?.addEventListener('submit', submitAuditFilters);
els.refreshHealthButton?.addEventListener('click', loadHealth);
els.healthPeriodSelect?.addEventListener('change', loadHealth);
els.refreshAnalyticsButton?.addEventListener('click', loadCommercialAnalytics);
els.refreshCommercialMirrorButton?.addEventListener('click', loadCommercialAnalytics);
els.refreshServicesButton?.addEventListener('click', loadServices);
els.previewLogCleanupButton?.addEventListener('click', previewLogCleanup);
els.refreshBillingButton?.addEventListener('click', loadBilling);
els.refreshCommunicationButton?.addEventListener('click', loadCommunication);
els.refreshSupportButton?.addEventListener('click', loadSupport);
els.platformSmtpForm?.addEventListener('submit', submitSmtpSettings);
els.platformSmtpTestForm?.addEventListener('submit', submitSmtpTest);
els.platformWhatsappForm?.addEventListener('submit', submitPlatformWhatsappSettings);
els.testPlatformWhatsappButton?.addEventListener('click', testPlatformWhatsappSettings);
document.addEventListener('submit', (event) => {
  if (event.target?.matches?.('.platform-support-message-form')) {
    submitSupportTicketMessage(event);
  }
});
els.supportStatusFilter?.addEventListener('change', renderSupport);
els.supportPriorityFilter?.addEventListener('change', renderSupport);
els.supportSlaFilter?.addEventListener('change', renderSupport);
els.supportPlanFilter?.addEventListener('change', renderSupport);
els.supportSearchFilter?.addEventListener('input', renderSupport);
els.platformSupportTabs.forEach((button) => {
  button.addEventListener('click', () => activateSupportTab(button.dataset.supportTab || 'queue'));
});
els.analyticsPeriodSelect?.addEventListener('change', loadCommercialAnalytics);
els.commercialPeriodMirror?.addEventListener('change', () => {
  if (els.analyticsPeriodSelect) els.analyticsPeriodSelect.value = els.commercialPeriodMirror.value;
  loadCommercialAnalytics();
});
els.billingPeriodSelect?.addEventListener('change', loadBilling);
els.billingStatusFilter?.addEventListener('change', loadBilling);
els.billingPlanFilter?.addEventListener('change', loadBilling);
els.platformBillingConfigForm?.addEventListener('submit', submitBillingConfig);
els.testBillingConfigButton?.addEventListener('click', testBillingConfig);
els.testBillingConfigButtonHealth?.addEventListener('click', testBillingConfig);
els.openCommunicationFromHealth?.addEventListener('click', () => activatePlatformView('communication', { load: true }));
els.clientFilterForm?.addEventListener('input', renderCompanies);
els.clientFilterForm?.addEventListener('change', renderCompanies);
els.operationalLogTypeFilter?.addEventListener('change', loadHealth);
els.operationalLogStatusFilter?.addEventListener('change', loadHealth);
els.operationalLogSeverityFilter?.addEventListener('change', loadHealth);
els.operationalLogServiceFilter?.addEventListener('change', loadHealth);
els.operationalLogCompanyFilter?.addEventListener('change', loadHealth);
els.operationalLogStoreFilter?.addEventListener('change', loadHealth);
els.platformTabs.forEach((button) => {
  button.addEventListener('click', () => activatePlatformView(button.dataset.platformView, { load: true }));
});
document.querySelectorAll('[data-critical-action]').forEach((button) => {
  button.addEventListener('click', () => openCriticalAction(button.dataset.criticalAction));
});
els.platformConfirmCancel?.addEventListener('click', closeCriticalDialog);
els.platformConfirmBackdrop?.addEventListener('click', (event) => {
  if (event.target === els.platformConfirmBackdrop) closeCriticalDialog();
});
els.platformConfirmForm?.addEventListener('submit', submitCriticalAction);

init().catch((error) => {
  toast(error.message || 'Não foi possível carregar a plataforma.');
});

async function init() {
  hidePlatformGateways();
  try {
    const { admin } = await request('/api/admin/me');
    await enterPlatformWithAdmin(admin);
  } catch (error) {
    if (isAuthError(error)) {
      showPlatformLogin();
      return;
    }
    throw error;
  }
}

async function enterPlatformWithAdmin(admin) {
  state.admin = admin;
  document.body.classList.remove('platform-guest');
  document.body.classList.add('platform-authenticated');
  if (els.platformUser) els.platformUser.textContent = `${admin.name} - ${admin.email}`;
  if (els.platformSidebarEmail) els.platformSidebarEmail.textContent = admin.email || 'administrador.local';
  if (els.platformSidebarName) els.platformSidebarName.textContent = admin.name || 'Administrador';
  hidePlatformGateways();
  if (!hasPermission('platform')) {
    document.body.classList.add('platform-blocked-session');
    if (els.platformBlocked) els.platformBlocked.hidden = false;
    return;
  }
  document.body.classList.remove('platform-blocked-session');
  if (els.platformContent) els.platformContent.hidden = false;
  await loadPlatform();
}

function hidePlatformGateways() {
  if (els.platformLoginPanel) els.platformLoginPanel.hidden = true;
  if (els.platformBlocked) els.platformBlocked.hidden = true;
  if (els.platformContent) els.platformContent.hidden = true;
  if (els.platformLogoutButton) els.platformLogoutButton.hidden = false;
}

function showPlatformLogin(message = '') {
  state.admin = null;
  document.body.classList.add('platform-guest');
  document.body.classList.remove('platform-authenticated');
  document.body.classList.remove('platform-blocked-session');
  hidePlatformGateways();
  if (els.platformLoginPanel) els.platformLoginPanel.hidden = false;
  if (els.platformUser) els.platformUser.textContent = 'Central TáPronto';
  if (els.platformPageTitle) els.platformPageTitle.textContent = 'Entrar na Central';
  if (els.platformPageSubtitle) els.platformPageSubtitle.textContent = 'Acesse com uma conta superadmin.';
  if (els.platformSidebarEmail) els.platformSidebarEmail.textContent = 'administrador.local';
  if (els.platformSidebarName) els.platformSidebarName.textContent = 'Admin Master';
  if (els.platformLogoutButton) els.platformLogoutButton.hidden = true;
  if (els.platformLoginMessage) els.platformLoginMessage.textContent = message;
  setTimeout(() => els.platformLoginForm?.elements.email?.focus(), 50);
}

function isAuthError(error) {
  const message = String(error?.message || '');
  return error?.status === 401 || error?.status === 403 || /sessão|session|login|autentic/i.test(message);
}

async function submitPlatformLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  if (els.platformLoginMessage) els.platformLoginMessage.textContent = '';
  if (els.platformLoginButton) {
    els.platformLoginButton.disabled = true;
    els.platformLoginButton.textContent = 'Entrando...';
  }
  try {
    const result = await request('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: data.email,
        password: data.password
      })
    });
    form.reset();
    await enterPlatformWithAdmin(result.admin);
  } catch (error) {
    const message = error.message || 'Não foi possível entrar na Central.';
    if (els.platformLoginMessage) els.platformLoginMessage.textContent = message;
  } finally {
    if (els.platformLoginButton) {
      els.platformLoginButton.disabled = false;
      els.platformLoginButton.textContent = 'Entrar na Central';
    }
  }
}

async function submitPlatformRecover(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const loginEmail = els.platformLoginForm?.elements?.email?.value || '';
  const data = Object.fromEntries(new FormData(form));
  const email = data.email || loginEmail;
  if (els.platformRecoverMessage) els.platformRecoverMessage.textContent = '';
  if (els.platformRecoverButton) {
    els.platformRecoverButton.disabled = true;
    els.platformRecoverButton.textContent = 'Enviando...';
  }
  try {
    const result = await request('/api/portal/recover-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const message = result.message || 'Se o e-mail existir, enviaremos as instruções de recuperação.';
    if (els.platformRecoverMessage) els.platformRecoverMessage.textContent = message;
    toast(message);
  } catch (error) {
    const message = error.message || 'Não foi possível solicitar recuperação.';
    if (els.platformRecoverMessage) els.platformRecoverMessage.textContent = message;
    toast(message);
  } finally {
    if (els.platformRecoverButton) {
      els.platformRecoverButton.disabled = false;
      els.platformRecoverButton.textContent = 'Enviar link';
    }
  }
}

async function loadPlatform(options = {}) {
  state.baseLoading = true;
  state.commercialError = '';
  if (!state.baseLoaded) render();
  try {
    if (options.resetPage !== false) state.companyPage = 1;
    const [companies, plans] = await Promise.all([
      request(companiesUrl()),
      request('/api/platform/plans')
    ]);
    state.companies = companies.companies || [];
    state.companyPagination = companies.pagination || null;
    state.features = companies.features || [];
    state.plans = plans.plans || [];
    state.baseLoaded = true;
    render();
    await ensurePlatformViewData(state.activeView, { force: options.force === true });
  } catch (error) {
    state.baseLoaded = false;
    state.commercialError = error.message || 'Não foi possível carregar a plataforma.';
    toast(state.commercialError);
  } finally {
    state.baseLoading = false;
    render();
  }
}

function companiesUrl() {
  const params = new URLSearchParams();
  params.set('page', String(state.companyPage || 1));
  params.set('per_page', String(state.companyPerPage || 100));
  return `/api/platform/companies?${params.toString()}`;
}

async function loadMoreCompanies() {
  const nextPage = Number(state.companyPagination?.page || state.companyPage || 1) + 1;
  const button = els.companyList?.querySelector('[data-load-more-companies]');
  if (button) {
    button.disabled = true;
    button.textContent = 'Carregando...';
  }
  try {
    state.companyPage = nextPage;
    const companies = await request(companiesUrl());
    const existingIds = new Set(state.companies.map((company) => company.id));
    state.companies = [
      ...state.companies,
      ...(companies.companies || []).filter((company) => !existingIds.has(company.id))
    ];
    state.companyPagination = companies.pagination || null;
    render();
  } catch (error) {
    state.companyPage = Math.max(1, nextPage - 1);
    toast(error.message || 'Não foi possível carregar mais clientes.');
    renderCompanies();
  }
}

async function ensurePlatformViewData(view, options = {}) {
  const force = options.force === true;
  if (['overview', 'commercial'].includes(view) && (force || !state.commercialLoaded)) {
    await loadCommercialAnalytics({ silent: true, renderBefore: true, renderAfter: true });
    if (view === 'overview' && (force || !state.healthLoaded)) await loadHealth({ silent: true });
  } else if (view === 'health' && (force || !state.healthLoaded)) {
    await loadHealth({ silent: true });
  } else if (view === 'billing' && (force || !state.billingLoaded)) {
    await loadBilling({ silent: true });
  } else if (view === 'communication' && (force || !state.communicationLoaded)) {
    await loadCommunication({ silent: true });
  } else if (view === 'support' && (force || !state.supportLoaded)) {
    await loadSupport({ silent: true });
  } else if (view === 'audit' && (force || !state.auditLoaded)) {
    await loadAudit({ silent: true });
  } else if (view === 'backups' && (force || !state.backupLoaded)) {
    await loadBackup({ silent: true });
  }
}

async function loadServicesSnapshot() {
  try {
    const [status, logs] = await Promise.all([
      request('/api/platform/services/status'),
      request('/api/platform/services/logs?period=24h')
    ]);
    return { status, logs: logs.logs || [] };
  } catch (error) {
    return { status: { error: error.message || 'Não foi possível carregar serviços.' }, logs: [] };
  }
}

async function loadServices(options = {}) {
  if (els.refreshServicesButton) els.refreshServicesButton.disabled = true;
  try {
    const data = await loadServicesSnapshot();
    state.services = data.status;
    state.serviceLogs = data.logs || [];
    state.servicesLoaded = !data.status?.error;
    renderServices();
    if (!options.silent) toast('Serviços atualizados.');
  } catch (error) {
    state.services = { error: error.message || 'Não foi possível carregar serviços.' };
    state.servicesLoaded = false;
    renderServices();
    if (!options.silent) toast(error.message || 'Não foi possível carregar serviços.');
  } finally {
    if (els.refreshServicesButton) els.refreshServicesButton.disabled = false;
  }
}

async function loadCommercialAnalytics(options = {}) {
  state.commercialLoading = true;
  if (options.renderBefore !== false) renderCommercialDashboard();
  if (els.refreshAnalyticsButton) els.refreshAnalyticsButton.disabled = true;
  if (els.refreshCommercialMirrorButton) els.refreshCommercialMirrorButton.disabled = true;
  try {
    const [summary, analytics] = await Promise.all([
      request('/api/platform/summary'),
      request(analyticsUrl())
    ]);
    state.summary = summary;
    state.analytics = analytics;
    state.commercialLoaded = true;
    state.commercialError = '';
    if (options.renderAfter !== false) renderCommercialDashboard();
    if (options.renderAfter !== false) renderCompanies();
  } catch (error) {
    state.commercialLoaded = false;
    state.commercialError = error.message || 'Não foi possível carregar métricas comerciais.';
    renderCommercialDashboard();
    if (!options.silent) toast(error.message || 'Não foi possível carregar métricas comerciais.');
  } finally {
    state.commercialLoading = false;
    if (els.refreshAnalyticsButton) els.refreshAnalyticsButton.disabled = false;
    if (els.refreshCommercialMirrorButton) els.refreshCommercialMirrorButton.disabled = false;
    if (options.renderAfter !== false) renderCommercialDashboard();
  }
}

async function loadCommercialSnapshot() {
  try {
    const [summary, analytics] = await Promise.all([
      request('/api/platform/summary'),
      request(analyticsUrl())
    ]);
    return { summary, analytics };
  } catch (error) {
    return { error: error.message || 'Não foi possível carregar métricas comerciais.' };
  }
}

async function loadBillingSnapshot() {
  try {
    const [summary, plans, events, subscriptions, addons, config] = await Promise.all([
      request(billingUrl('/api/platform/billing/summary')),
      request('/api/platform/billing/plans'),
      request(billingUrl('/api/platform/billing/events')),
      request(billingUrl('/api/platform/billing/subscriptions')),
      request(billingUrl('/api/platform/billing/addons')),
      request('/api/platform/billing/config')
    ]);
    return {
      summary,
      plans: plans.plans || [],
      events: events.events || [],
      subscriptions: subscriptions.subscriptions || [],
      addons: addons.addons || [],
      config: config.billing || null
    };
  } catch (error) {
    return { error: error.message || 'Não foi possível carregar billing.' };
  }
}

async function loadBilling(options = {}) {
  state.billingLoading = true;
  if (els.refreshBillingButton) els.refreshBillingButton.disabled = true;
  if (options.renderBefore !== false) renderBilling();
  try {
    const data = await loadBillingSnapshot();
    state.billing = data.summary || null;
    state.billingPlans = data.plans || [];
    state.billingEvents = data.events || [];
    state.billingSubscriptions = data.subscriptions || [];
    state.billingAddons = data.addons || [];
    state.billingConfig = data.config || null;
    state.billingLoaded = !data.error;
    state.billingError = data.error || '';
    if (state.billingError && !options.silent) toast(state.billingError);
  } finally {
    state.billingLoading = false;
    if (els.refreshBillingButton) els.refreshBillingButton.disabled = false;
    renderBilling();
  }
}

async function loadCommunicationSnapshot() {
  try {
    const [smtp, templates, whatsapp] = await Promise.all([
      request('/api/platform/smtp'),
      request('/api/platform/email-templates'),
      request('/api/platform/whatsapp/settings')
    ]);
    return { smtp: smtp.smtp || null, templates: templates.templates || [], whatsapp: whatsapp.whatsapp || null };
  } catch (error) {
    return { error: error.message || 'Não foi possível carregar comunicação.', smtp: null, templates: [], whatsapp: null };
  }
}

async function loadCommunication(options = {}) {
  state.communicationLoading = true;
  try {
    const data = await loadCommunicationSnapshot();
    state.smtp = data.smtp || null;
    state.whatsappSettings = data.whatsapp || null;
    state.emailTemplates = data.templates || [];
    state.communicationLoaded = !data.error;
    renderCommunication();
    if (!options.silent && !data.error) toast('Comunicação atualizada.');
    if (data.error && !options.silent) toast(data.error);
  } finally {
    state.communicationLoading = false;
    renderCommunication();
  }
}

async function loadSupportSnapshot() {
  try {
    const data = await request(supportUrl());
    return { tickets: data.tickets || [] };
  } catch (error) {
    return { error: error.message || 'Não foi possível carregar chamados.', tickets: [] };
  }
}

async function loadSupport(options = {}) {
  state.supportLoading = true;
  try {
    const data = await loadSupportSnapshot();
    state.supportTickets = data.tickets || [];
    state.supportLoaded = !data.error;
    renderSupport();
    if (!options.silent && !data.error) toast('Chamados atualizados.');
    if (data.error && !options.silent) toast(data.error);
  } finally {
    state.supportLoading = false;
    renderSupport();
  }
}

function supportUrl() {
  return '/api/platform/support/tickets';
}

function analyticsUrl() {
  const period = state.activeView === 'commercial'
    ? (els.commercialPeriodMirror?.value || els.analyticsPeriodSelect?.value || '30d')
    : (els.analyticsPeriodSelect?.value || els.commercialPeriodMirror?.value || '30d');
  if (els.analyticsPeriodSelect) els.analyticsPeriodSelect.value = period;
  if (els.commercialPeriodMirror) els.commercialPeriodMirror.value = period;
  return `/api/platform/analytics?period=${encodeURIComponent(period)}`;
}

function billingUrl(base) {
  const params = new URLSearchParams();
  params.set('period', els.billingPeriodSelect?.value || '30d');
  const status = els.billingStatusFilter?.value || '';
  const plan = els.billingPlanFilter?.value || '';
  if (status) params.set('status', status);
  if (plan) params.set('plan', plan);
  return `${base}?${params.toString()}`;
}

async function loadHealth(options = {}) {
  if (els.refreshHealthButton) els.refreshHealthButton.disabled = true;
  try {
    const [health, services] = await Promise.all([
      request(healthUrl()),
      loadServicesSnapshot()
    ]);
    state.health = health;
    state.services = services.status;
    state.serviceLogs = services.logs || [];
    state.healthLoaded = true;
    state.servicesLoaded = !services.status?.error;
    renderHealth();
    renderCommercialDashboard();
  } catch (error) {
    state.health = { error: error.message || 'Não foi possível carregar saúde operacional.' };
    state.healthLoaded = false;
    renderHealth();
    if (!options.silent) toast(error.message || 'Não foi possível carregar saúde operacional.');
  } finally {
    if (els.refreshHealthButton) els.refreshHealthButton.disabled = false;
  }
}

async function loadAudit(options = {}) {
  try {
    const audit = await request(`/api/platform/audit${auditQueryString()}`);
    state.logs = audit.logs || [];
    state.auditLoaded = true;
    renderAudit();
    if (!options.silent) toast('Auditoria atualizada.');
  } catch (error) {
    state.logs = [];
    state.auditLoaded = false;
    renderAudit();
    if (!options.silent) toast(error.message || 'Não foi possível carregar auditoria.');
  }
}

async function loadBackup(options = {}) {
  try {
    state.backup = await request('/api/platform/backups');
    state.backupLoaded = true;
    renderBackupStatus();
    if (!options.silent) toast('Backups atualizados.');
  } catch (error) {
    state.backup = { status: 'unknown', error: error.message || 'Não foi possível carregar backup.', recent: [] };
    state.backupLoaded = false;
    renderBackupStatus();
    if (!options.silent) toast(state.backup.error);
  }
}

function healthUrl() {
  const params = new URLSearchParams();
  params.set('period', els.healthPeriodSelect?.value || '24h');
  const filters = [
    ['type', els.operationalLogTypeFilter?.value || ''],
    ['status', els.operationalLogStatusFilter?.value || ''],
    ['severity', els.operationalLogSeverityFilter?.value || ''],
    ['service', els.operationalLogServiceFilter?.value || ''],
    ['company_id', els.operationalLogCompanyFilter?.value || ''],
    ['store_id', els.operationalLogStoreFilter?.value || '']
  ];
  for (const [key, value] of filters) {
    if (value) params.set(key, value);
  }
  return `/api/platform/health?${params.toString()}`;
}

function render() {
  renderSelects();
  renderCommercialDashboard();
  renderAttentionPanel();
  renderCompanies();
  renderAudit();
  renderBackupStatus();
  renderHealth();
  renderServices();
  renderBilling();
  renderCommunication();
  renderSupport();
  activatePlatformView(state.activeView);
}

async function activatePlatformView(view = 'overview', options = {}) {
  state.activeView = view || 'overview';
  const meta = PLATFORM_VIEW_META[state.activeView] || PLATFORM_VIEW_META.overview;
  if (els.platformPageTitle) els.platformPageTitle.textContent = meta.title;
  if (els.platformPageSubtitle) els.platformPageSubtitle.textContent = meta.subtitle;
  els.platformTabs.forEach((button) => {
    button.classList.toggle('active', button.dataset.platformView === state.activeView);
    button.setAttribute('aria-current', button.dataset.platformView === state.activeView ? 'page' : 'false');
  });
  els.platformSections.forEach((section) => {
    section.hidden = section.dataset.platformSection !== state.activeView;
  });
  if (options.load) await ensurePlatformViewData(state.activeView);
}

function renderSelects() {
  const planOptions = state.plans.map((plan) => `<option value="${escapeAttribute(plan.code)}">${escapeHtml(plan.name)}</option>`).join('');
  if (els.clientPlanFilter) {
    const selected = els.clientPlanFilter.value;
    els.clientPlanFilter.innerHTML = `<option value="">Todos planos</option>${planOptions}`;
    els.clientPlanFilter.value = selected;
  }
  if (els.billingPlanFilter) {
    const selected = els.billingPlanFilter.value;
    els.billingPlanFilter.innerHTML = `<option value="">Todos planos</option>${planOptions}`;
    els.billingPlanFilter.value = selected;
  }
  if (els.supportPlanFilter) {
    const selected = els.supportPlanFilter.value;
    els.supportPlanFilter.innerHTML = `<option value="">Todos planos</option>${planOptions}`;
    els.supportPlanFilter.value = selected;
  }
  renderSupportQuickReplies();
  const companyOptions = state.companies
    .map((company) => `<option value="${escapeAttribute(company.id)}">${escapeHtml(company.name)}</option>`)
    .join('');
  els.auditCompanySelect.innerHTML = `<option value="">Todas empresas</option>${companyOptions}`;
  if (els.operationalLogCompanyFilter) {
    const selected = els.operationalLogCompanyFilter.value;
    els.operationalLogCompanyFilter.innerHTML = `<option value="">Todos clientes</option>${companyOptions}`;
    els.operationalLogCompanyFilter.value = selected;
  }
  const stores = state.companies.flatMap((company) => (company.stores || []).map((store) => ({ ...store, company_name: company.name })));
  const storeOptions = stores
    .map((store) => `<option value="${escapeAttribute(store.id)}">${escapeHtml(store.name)} - ${escapeHtml(store.company_name)}</option>`)
    .join('');
  els.auditStoreSelect.innerHTML = '<option value="">Todas lojas</option>' + storeOptions;
  if (els.operationalLogStoreFilter) {
    const selected = els.operationalLogStoreFilter.value;
    els.operationalLogStoreFilter.innerHTML = '<option value="">Todas lojas</option>' + storeOptions;
    els.operationalLogStoreFilter.value = selected;
  }
}

function renderCommercialDashboard() {
  renderKpis();
  renderDailyChart();
  renderStoreRanking();
  renderAccessMetrics();
  renderBillingMetrics();
  renderCommercialAlerts();
  renderOperationalOverviewAlerts();
  renderPlanMrr();
  renderConversion();
}

function renderKpis() {
  if (!els.platformKpiGrid) return;
  if (state.commercialLoading && !state.commercialLoaded) {
    els.platformKpiGrid.innerHTML = Array.from({ length: 12 }).map(() => `
      <article class="platform-kpi-card platform-loading-card">
        <span>Carregando</span>
        <strong>...</strong>
        <p>Atualizando métricas da plataforma.</p>
      </article>
    `).join('');
    return;
  }
  if (state.commercialError && !state.commercialLoaded) {
    els.platformKpiGrid.innerHTML = `<article class="platform-kpi-card platform-error-card"><span>Métricas</span><strong>Erro</strong><p>${escapeHtml(state.commercialError)}</p></article>`;
    return;
  }
  const cards = state.summary?.cards || {};
  const items = [
    ['Clientes ativos', cards.active_clients, 'Empresas usando o sistema', 'success'],
    ['Clientes em teste', cards.trial_clients, 'Avaliações em andamento', 'info'],
    ['Inadimplentes', cards.delinquent_clients, 'Cobranças pendentes ou vencidas', Number(cards.delinquent_clients || 0) ? 'danger' : 'neutral'],
    ['Suspensos', cards.suspended_clients, 'Contas com acesso bloqueado', Number(cards.suspended_clients || 0) ? 'danger' : 'neutral'],
    ['Lojas publicadas', cards.published_stores, 'Cardápios disponíveis ao público', 'success'],
    ['Lojas não publicadas', cards.unpublished_stores, 'Precisam concluir configuração', Number(cards.unpublished_stores || 0) ? 'warning' : 'neutral'],
    ['Pedidos hoje', cards.orders_today, 'Pedidos recebidos hoje', Number(cards.orders_today || 0) ? 'success' : 'neutral'],
    ['Faturamento hoje', moneyCents(cards.revenue_today_cents, cards.revenue_today), 'Receita bruta de pedidos', Number(cards.revenue_today_cents || cards.revenue_today || 0) ? 'success' : 'neutral'],
    ['MRR estimado', moneyCents(cards.mrr_estimated_cents, cards.mrr_estimated), 'Mensalidades ativas previstas', 'finance'],
    ['Trials vencendo', cards.trials_ending, 'Clientes para converter', Number(cards.trials_ending || 0) ? 'warning' : 'neutral'],
    ['Webhooks com erro', cards.webhook_errors, 'Falhas recentes', Number(cards.webhook_errors || 0) ? 'danger' : 'neutral'],
    ['Backups atrasados', cards.delayed_backups, 'Rotina de segurança', Number(cards.delayed_backups || 0) ? 'warning' : 'neutral'],
    ['Chamados abertos', cards.open_support_tickets ?? cards.support_open ?? 0, 'Clientes aguardando retorno', Number(cards.open_support_tickets ?? cards.support_open ?? 0) ? 'support' : 'neutral'],
    ['Cancelamentos', cards.churn_clients, 'Clientes perdidos ou arquivados', Number(cards.churn_clients || 0) ? 'danger' : 'neutral']
  ];
  els.platformKpiGrid.innerHTML = items.map(([label, value, hint, tone]) => `
    <article class="platform-kpi-card tone-${escapeAttribute(tone || 'neutral')}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value ?? 0)}</strong>
      <p>${escapeHtml(hint)}</p>
    </article>
  `).join('');
}

function renderDailyChart() {
  if (!els.platformDailyChart) return;
  if (state.commercialLoading && !state.commercialLoaded) {
    if (els.platformDailySummary) els.platformDailySummary.innerHTML = '';
    if (els.platformDailyDetails) els.platformDailyDetails.innerHTML = '';
    els.platformDailyChart.innerHTML = '<p class="empty-state">Atualizando evolução de pedidos e receita...</p>';
    return;
  }
  if (state.commercialError && !state.commercialLoaded) {
    if (els.platformDailySummary) els.platformDailySummary.innerHTML = '';
    if (els.platformDailyDetails) els.platformDailyDetails.innerHTML = '';
    els.platformDailyChart.innerHTML = `<p class="empty-state">${escapeHtml(state.commercialError)}</p>`;
    return;
  }
  const rows = [...(state.analytics?.daily || [])]
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  if (!rows.length) {
    if (els.platformDailySummary) els.platformDailySummary.innerHTML = '';
    if (els.platformDailyDetails) els.platformDailyDetails.innerHTML = '';
    els.platformDailyChart.innerHTML = '<p class="empty-state">Ainda não há pedidos no período selecionado. Quando as lojas venderem, o gráfico aparece aqui.</p>';
    return;
  }
  const maxOrders = Math.max(1, ...rows.map((row) => Number(row.orders || 0)));
  const maxRevenue = Math.max(1, ...rows.map((row) => Number(row.revenue_cents ?? row.revenue ?? 0)));
  const totalOrders = rows.reduce((sum, row) => sum + Number(row.orders || 0), 0);
  const totalRevenue = rows.reduce((sum, row) => sum + Number(row.revenue_cents ?? row.revenue ?? 0), 0);
  const daysWithOrders = rows.filter((row) => Number(row.orders || 0) > 0).length;
  const bestOrdersDay = [...rows].sort((a, b) => Number(b.orders || 0) - Number(a.orders || 0))[0];
  const bestRevenueDay = [...rows].sort((a, b) => Number(b.revenue_cents ?? b.revenue ?? 0) - Number(a.revenue_cents ?? a.revenue ?? 0))[0];
  const avgOrders = totalOrders / Math.max(1, rows.length);
  const avgRevenue = totalRevenue / Math.max(1, rows.length);
  const averageTicket = totalOrders ? Math.round(totalRevenue / totalOrders) : 0;
  const formatDay = (date = '') => String(date).slice(5).split('-').reverse().join('/');
  const formatWeekday = (date = '') => {
    const parsed = new Date(`${String(date).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  };
  if (els.platformDailySummary) {
    els.platformDailySummary.innerHTML = [
      {
        label: 'Pedidos',
        value: totalOrders,
        hint: `${avgOrders.toFixed(1).replace('.', ',')} por dia`,
        tone: 'orders'
      },
      {
        label: 'Receita',
        value: moneyCents(totalRevenue),
        hint: `${moneyCents(Math.round(avgRevenue))} por dia`,
        tone: 'revenue'
      },
      {
        label: 'Ticket médio',
        value: moneyCents(averageTicket),
        hint: totalOrders ? 'Por pedido faturado' : 'Sem pedidos no período',
        tone: 'ticket'
      },
      {
        label: 'Dias com venda',
        value: `${daysWithOrders}/${rows.length}`,
        hint: 'Dias com ao menos 1 pedido',
        tone: 'active'
      }
    ].map((item) => `
      <article class="platform-daily-kpi tone-${escapeAttribute(item.tone)}">
        <span>${escapeHtml(item.label)}</span>
        <strong>${escapeHtml(item.value)}</strong>
        <small>${escapeHtml(item.hint)}</small>
      </article>
    `).join('');
  }
  const visibleRows = state.dailyExpanded ? rows : rows.slice(0, 3);
  els.platformDailyChart.innerHTML = visibleRows.map((row) => {
    const orders = Number(row.orders || 0);
    const revenueValue = Number(row.revenue_cents ?? row.revenue ?? 0);
    const orderWidth = Math.max(orders ? 6 : 2, Math.round((orders / maxOrders) * 100));
    const revenueWidth = Math.max(revenueValue ? 6 : 2, Math.round((revenueValue / maxRevenue) * 100));
    const label = formatDay(row.date);
    const ticket = orders ? moneyCents(Math.round(revenueValue / orders)) : moneyCents(0);
    return `
      <article class="platform-daily-row" title="${escapeAttribute(`${label}: ${orders} pedido(s), ${moneyCents(row.revenue_cents, row.revenue)}, ticket médio ${ticket}`)}">
        <div class="platform-daily-date">
          <strong>${escapeHtml(label)}</strong>
          <small>${escapeHtml(formatWeekday(row.date))}</small>
        </div>
        <div class="platform-daily-metrics">
          <span><b>${orders}</b> pedido(s)</span>
          <span><b>${moneyCents(row.revenue_cents, row.revenue)}</b> receita</span>
          <span><b>${ticket}</b> ticket médio</span>
        </div>
        <div class="platform-daily-bars" aria-hidden="true">
          <div class="platform-daily-bar-line">
            <small>Pedidos</small>
            <span><i class="orders" style="width:${orderWidth}%"></i></span>
            <b>${orders}</b>
          </div>
          <div class="platform-daily-bar-line">
            <small>Receita</small>
            <span><i class="revenue" style="width:${revenueWidth}%"></i></span>
            <b>${moneyCents(row.revenue_cents, row.revenue)}</b>
          </div>
        </div>
      </article>
    `;
  }).join('') + (rows.length > 3 ? `
    <div class="platform-daily-more">
      <button class="ghost-button compact" type="button" data-daily-toggle>
        ${state.dailyExpanded ? 'Mostrar apenas os 3 últimos dias' : `Exibir mais ${rows.length - 3} dia(s)`}
      </button>
    </div>
  ` : '');
  els.platformDailyChart.querySelector('[data-daily-toggle]')?.addEventListener('click', () => {
    state.dailyExpanded = !state.dailyExpanded;
    renderDailyChart();
  });
  if (els.platformDailyDetails) {
    els.platformDailyDetails.innerHTML = `
      <div class="platform-daily-legend">
        <span><i class="orders"></i>Pedidos: volume do dia comparado ao maior dia do período</span>
        <span><i class="revenue"></i>Receita: faturamento do dia comparado ao maior faturamento do período</span>
      </div>
      <div class="platform-daily-insights">
        <article>
          <span>Maior movimento</span>
          <strong>${escapeHtml(formatDay(bestOrdersDay?.date))}</strong>
          <small>${Number(bestOrdersDay?.orders || 0)} pedido(s)</small>
        </article>
        <article>
          <span>Maior faturamento</span>
          <strong>${escapeHtml(formatDay(bestRevenueDay?.date))}</strong>
          <small>${moneyCents(bestRevenueDay?.revenue_cents, bestRevenueDay?.revenue)}</small>
        </article>
        <article>
          <span>Conversão de dias</span>
          <strong>${Math.round((daysWithOrders / Math.max(1, rows.length)) * 100)}%</strong>
          <small>${daysWithOrders} dia(s) com venda</small>
        </article>
        <article>
          <span>Receita média</span>
          <strong>${moneyCents(Math.round(avgRevenue))}</strong>
          <small>Por dia no período</small>
        </article>
      </div>
    `;
  }
}

function renderStoreRanking() {
  if (!els.platformStoreRanking) return;
  if (state.commercialLoading && !state.commercialLoaded) {
    els.platformStoreRanking.innerHTML = '<p class="empty-state">Montando ranking de lojas com mais movimento...</p>';
    return;
  }
  if (state.commercialError && !state.commercialLoaded) {
    els.platformStoreRanking.innerHTML = `<p class="empty-state">${escapeHtml(state.commercialError)}</p>`;
    return;
  }
  const rows = state.analytics?.ranking || [];
  const max = Math.max(1, ...rows.map((row) => Number(row.orders || 0)));
  const totalOrders = rows.reduce((sum, row) => sum + Number(row.orders || 0), 0);
  els.platformStoreRanking.innerHTML = rows.length ? rows.map((row, index) => {
    const orders = Number(row.orders || 0);
    const revenueCents = row.revenue_cents !== undefined && row.revenue_cents !== null
      ? Number(row.revenue_cents || 0)
      : Math.round(Number(row.revenue || 0) * 100);
    return `
      <article class="platform-ranking-row">
        <div>
          <strong>${index + 1}. ${escapeHtml(row.store_name)}</strong>
          <small>/${escapeHtml(row.slug || '')}</small>
        </div>
        <span>
          ${orders} pedido(s)
          <small>${Math.round((orders / Math.max(1, totalOrders)) * 100)}% do volume</small>
        </span>
        <em>
          ${moneyCents(row.revenue_cents, row.revenue)}
          <small>Ticket ${orders ? moneyCents(Math.round(revenueCents / orders)) : moneyCents(0)}</small>
        </em>
        <div class="platform-progress-meta">
          <small>Volume de pedidos</small>
          <small>${Math.round((orders / Math.max(1, totalOrders)) * 100)}%</small>
        </div>
        <i style="--value:${Math.max(8, (orders / max) * 100)}%"></i>
      </article>
    `;
  }).join('') : '<p class="empty-state">Nenhuma loja teve pedidos no período selecionado.</p>';
}

function renderAccessMetrics() {
  if (!els.platformAccessMetrics) return;
  if (state.commercialLoading && !state.commercialLoaded) {
    els.platformAccessMetrics.innerHTML = '<p class="empty-state">Carregando acessos públicos...</p>';
    return;
  }
  if (state.commercialError && !state.commercialLoaded) {
    els.platformAccessMetrics.innerHTML = `<p class="empty-state">${escapeHtml(state.commercialError)}</p>`;
    return;
  }
  const access = state.analytics?.access || {};
  const byDevice = access.by_device || [];
  const byPage = access.by_page || [];
  const topStores = access.top_stores || [];
  const maxStoreViews = Math.max(1, ...topStores.map((row) => Number(row.views || 0)));
  const deviceLabel = {
    desktop: 'Desktop',
    mobile: 'Celular',
    tablet: 'Tablet'
  };
  const pageLabel = {
    home: 'Home',
    ajuda: 'Ajuda',
    cardapio: 'Cardápios',
    checkout: 'Checkout',
    conta: 'Conta',
    pedido: 'Pedido'
  };
  els.platformAccessMetrics.innerHTML = Number(access.total_views || 0) ? `
    <div class="platform-access-summary">
      <article>
        <span>Visualizações</span>
        <strong>${Number(access.total_views || 0)}</strong>
        <small>Total de páginas públicas abertas</small>
      </article>
      <article>
        <span>Visitantes</span>
        <strong>${Number(access.unique_visitors || 0)}</strong>
        <small>Estimativa por navegador/dispositivo</small>
      </article>
      <article>
        <span>Média</span>
        <strong>${Number(access.average_views_per_visitor || 0).toLocaleString('pt-BR')}</strong>
        <small>Visualizações por visitante</small>
      </article>
    </div>
    <div class="platform-access-columns">
      <section>
        <h4>Por página</h4>
        ${(byPage.length ? byPage : []).slice(0, 5).map((row) => `
          <p><span>${escapeHtml(pageLabel[row.page_type] || row.page_type || 'Página')}</span><strong>${Number(row.count || 0)}</strong></p>
        `).join('') || '<p class="empty-state">Sem páginas registradas.</p>'}
      </section>
      <section>
        <h4>Por dispositivo</h4>
        ${(byDevice.length ? byDevice : []).slice(0, 5).map((row) => `
          <p><span>${escapeHtml(deviceLabel[row.device_type] || row.device_type || 'Outro')}</span><strong>${Number(row.count || 0)}</strong></p>
        `).join('') || '<p class="empty-state">Sem dispositivos registrados.</p>'}
      </section>
    </div>
    <div class="platform-access-ranking">
      <h4>Cardápios mais acessados</h4>
      ${topStores.length ? topStores.map((row) => `
        <article>
          <div>
            <strong>${escapeHtml(row.store_name || 'Loja')}</strong>
            <small>/${escapeHtml(row.slug || '')} · ${Number(row.visitors || 0)} visitante(s)</small>
          </div>
          <span>${Number(row.views || 0)} acesso(s)</span>
          <i style="--value:${Math.max(8, (Number(row.views || 0) / maxStoreViews) * 100)}%"></i>
        </article>
      `).join('') : '<p class="empty-state">Nenhum cardápio público acessado no período.</p>'}
    </div>
  ` : '<p class="empty-state">Ainda não há acessos registrados no período. As visitas começam a aparecer após alguém abrir a Home, Ajuda ou um cardápio público.</p>';
}

function renderBillingMetrics() {
  if (!els.platformBillingMetrics) return;
  if (state.commercialLoading && !state.commercialLoaded) {
    els.platformBillingMetrics.innerHTML = '<p class="empty-state">Atualizando indicadores comerciais...</p>';
    return;
  }
  if (state.commercialError && !state.commercialLoaded) {
    els.platformBillingMetrics.innerHTML = `<p class="empty-state">${escapeHtml(state.commercialError)}</p>`;
    return;
  }
  const billing = state.summary?.billing || {};
  const highlights = [
    {
      label: 'MRR estimado',
      value: moneyCents(billing.mrr_cents, billing.mrr),
      hint: 'Mensalidades ativas previstas',
      tone: Number(billing.mrr_cents || billing.mrr || 0) ? 'success' : 'neutral'
    },
    {
      label: 'Receita de pedidos',
      value: moneyCents(billing.monthly_order_revenue_cents, billing.monthly_order_revenue),
      hint: 'Pedidos faturados pelas lojas',
      tone: Number(billing.monthly_order_revenue_cents || billing.monthly_order_revenue || 0) ? 'success' : 'neutral'
    }
  ];
  const operations = [
    ['Trials', billing.trials_started || 0, 'Novas contas testando', 'info'],
    ['Upgrades', billing.upgrades || 0, 'Evoluções de plano', 'success'],
    ['Downgrades', billing.downgrades || 0, 'Reduções de plano', 'warning'],
    ['Cancelamentos', billing.cancellations || 0, 'Perdas no período', Number(billing.cancellations || 0) ? 'danger' : 'neutral']
  ];
  const payments = [
    ['Aprovados', billing.paid_events || 0, 'Pagamentos confirmados', 'success'],
    ['Recusados', billing.refused_events || 0, 'Falhas de cobrança', Number(billing.refused_events || 0) ? 'danger' : 'neutral']
  ];
  const revenueByPlan = billing.revenue_by_plan || [];
  const maxRevenue = Math.max(1, ...revenueByPlan.map((entry) => Number(entry.revenue_cents || 0)));
  const totalPlanRevenue = revenueByPlan.reduce((sum, entry) => sum + Number(entry.revenue_cents || 0), 0);
  const kpiCards = [
    ...highlights.map((item) => ({
      group: 'Financeiro',
      label: item.label,
      value: item.value,
      hint: item.hint,
      tone: item.tone
    })),
    ...operations.map(([label, value, hint, tone]) => ({
      group: 'Movimento',
      label,
      value,
      hint,
      tone
    })),
    ...payments.map(([label, value, hint, tone]) => ({
      group: 'Cobranças',
      label,
      value,
      hint,
      tone
    }))
  ];
  els.platformBillingMetrics.innerHTML = `
    <div class="platform-commercial-kpi-grid">
      ${kpiCards.map((item) => `
        <article class="platform-commercial-kpi-card tone-${escapeAttribute(item.tone)}">
          <span>${escapeHtml(item.group)}</span>
          <strong>${escapeHtml(item.value)}</strong>
          <div>
            <b>${escapeHtml(item.label)}</b>
            <small>${escapeHtml(item.hint)}</small>
          </div>
        </article>
      `).join('')}
    </div>
    <div class="platform-plan-revenue">
      <div class="platform-billing-section-title">
        <strong>Receita por plano</strong>
        <small>Distribuição do faturamento comercial</small>
      </div>
      ${revenueByPlan.length ? revenueByPlan.map((entry) => `
        <article class="platform-plan-revenue-row">
          <div>
            <strong>${escapeHtml(entry.plan || 'Sem plano')}</strong>
            <span>${moneyCents(entry.revenue_cents, entry.revenue)}</span>
          </div>
          <div class="platform-progress-meta">
            <small>Participação na receita</small>
            <small>${Math.round((Number(entry.revenue_cents || 0) / Math.max(1, totalPlanRevenue)) * 100)}%</small>
          </div>
          <i style="--value:${Math.max(6, (Number(entry.revenue_cents || 0) / maxRevenue) * 100)}%"></i>
        </article>
      `).join('') : '<p class="empty-state">Ainda não há receita distribuída por plano neste período.</p>'}
    </div>
  `;
}

function renderCommercialAlerts() {
  if (!els.platformCommercialAlerts) return;
  if (state.commercialLoading && !state.commercialLoaded) {
    els.platformCommercialAlerts.innerHTML = '<p class="empty-state">Carregando alertas comerciais...</p>';
    return;
  }
  if (state.commercialError && !state.commercialLoaded) {
    els.platformCommercialAlerts.innerHTML = `<p class="empty-state">${escapeHtml(state.commercialError)}</p>`;
    return;
  }
  const alerts = state.summary?.alerts || [];
  els.platformCommercialAlerts.innerHTML = renderOverviewAlertList(alerts, {
    empty: 'Tudo certo no comercial por enquanto. Nenhum cliente exige ação imediata.',
    moreLabel: 'Ver todos os alertas comerciais'
  });
}

function renderOperationalOverviewAlerts() {
  if (!els.platformOperationalOverviewAlerts) return;
  if (!state.healthLoaded && !state.health?.error) {
    els.platformOperationalOverviewAlerts.innerHTML = '<p class="empty-state">Carregando sinais operacionais...</p>';
    return;
  }
  if (state.health?.error) {
    els.platformOperationalOverviewAlerts.innerHTML = `<p class="empty-state">${escapeHtml(state.health.error)}</p>`;
    return;
  }
  const alerts = state.health?.alerts || [];
  els.platformOperationalOverviewAlerts.innerHTML = renderOverviewAlertList(alerts, {
    empty: 'Operação estável. Nenhum alerta técnico crítico no momento.',
    moreLabel: 'Ver todos os alertas operacionais',
    fallbackText: 'message'
  });
}

function renderOverviewAlertList(alerts = [], options = {}) {
  if (!alerts.length) return `<p class="empty-state">${escapeHtml(options.empty || 'Nenhum alerta no momento.')}</p>`;
  const visible = alerts.slice(0, 5);
  const hidden = alerts.slice(5);
  const renderAlert = (alert) => `
    <article class="platform-commercial-alert severity-${escapeAttribute(alert.severity)}">
      <strong>${escapeHtml(alert.title)}</strong>
      <small>${escapeHtml(alert.action || (options.fallbackText === 'message' ? alert.message : '') || '')}</small>
    </article>
  `;
  return `
    ${visible.map(renderAlert).join('')}
    ${hidden.length ? `
      <details class="platform-alert-expand">
        <summary>
          <strong>${escapeHtml(options.moreLabel || 'Ver todos os alertas')}</strong>
          <span>+${hidden.length}</span>
        </summary>
        <div>${hidden.map(renderAlert).join('')}</div>
      </details>
    ` : ''}
  `;
}

function renderPlanMrr() {
  if (!els.platformPlanMrr) return;
  if (state.commercialLoading && !state.commercialLoaded) {
    els.platformPlanMrr.innerHTML = '<p class="empty-state">Carregando MRR por plano...</p>';
    return;
  }
  if (state.commercialError && !state.commercialLoaded) {
    els.platformPlanMrr.innerHTML = `<p class="empty-state">${escapeHtml(state.commercialError)}</p>`;
    return;
  }
  const rows = state.analytics?.mrr_by_plan || state.analytics?.revenue?.mrr_by_plan || [];
  const max = Math.max(1, ...rows.map((row) => Number(row.mrr_cents || 0)));
  const totalMrr = rows.reduce((sum, row) => sum + Number(row.mrr_cents || 0), 0);
  els.platformPlanMrr.innerHTML = rows.length ? rows.map((row) => {
    const value = Number(row.mrr_cents || 0);
    const share = Math.round((value / Math.max(1, totalMrr)) * 100);
    const bar = Math.max(4, (value / max) * 100);
    return `
      <article class="platform-plan-mrr-row">
        <div>
          <strong>${escapeHtml(row.plan || 'Sem plano')}</strong>
          <small>${Number(row.clients || 0)} cliente(s)</small>
        </div>
        <span>${moneyCents(row.mrr_cents, row.mrr)}</span>
        <div class="platform-progress-meta">
          <small>Participação no MRR</small>
          <small>${share}%</small>
        </div>
        <i style="--value:${bar}%"></i>
      </article>
    `;
  }).join('') : '<p class="empty-state">Ainda não há MRR por plano no período selecionado.</p>';
}

function renderConversion() {
  if (!els.platformConversionGrid) return;
  if (state.commercialLoading && !state.commercialLoaded) {
    els.platformConversionGrid.innerHTML = '<p class="empty-state">Carregando conversão...</p>';
    return;
  }
  if (state.commercialError && !state.commercialLoaded) {
    els.platformConversionGrid.innerHTML = `<p class="empty-state">${escapeHtml(state.commercialError)}</p>`;
    return;
  }
  const conversion = state.analytics?.conversion || {};
  const items = [
    ['Novos clientes', conversion.new_clients, 'Contas criadas no período', 'info'],
    ['Trials iniciados', conversion.trials_started, 'Começaram avaliação', 'info'],
    ['Trials convertidos', conversion.trials_converted, 'Viraram plano pago', 'success'],
    ['Conversão', `${Number(conversion.conversion_rate || 0)}%`, 'Trial para pago', Number(conversion.conversion_rate || 0) ? 'success' : 'neutral'],
    ['Upgrades', conversion.upgrades, 'Evoluções de plano', 'success'],
    ['Downgrades', conversion.downgrades, 'Reduções de plano', Number(conversion.downgrades || 0) ? 'warning' : 'neutral'],
    ['Churn', conversion.churn, 'Cancelamentos/perdas', Number(conversion.churn || 0) ? 'danger' : 'neutral']
  ];
  els.platformConversionGrid.innerHTML = items.map(([label, value, hint, tone]) => `
    <article class="tone-${escapeAttribute(tone)}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value ?? 0)}</strong>
      <small>${escapeHtml(hint)}</small>
    </article>
  `).join('');
}

function renderAttentionPanel() {
  if (!els.platformAttentionPanel) return;
  const alerts = platformClientAlerts();
  els.platformAttentionPanel.innerHTML = `
    <div class="section-actions compact-section-actions">
      <div>
        <p class="eyebrow">Clientes com atenção</p>
        <h3>Prioridades comerciais e de suporte</h3>
      </div>
      <span class="pill ${alerts.length ? 'pill-muted' : 'pill-ok'}">${alerts.length} alerta(s)</span>
    </div>
    ${alerts.length ? `<div class="platform-attention-list">
      ${alerts.slice(0, 8).map((alert) => `
        <button class="platform-attention-item severity-${escapeAttribute(alert.severity)}" type="button" data-focus-company="${escapeAttribute(alert.company_id)}">
          <strong>${escapeHtml(alert.company_name)}</strong>
          <span>${escapeHtml(alert.title)}</span>
          <small>${escapeHtml(alert.action)}</small>
        </button>
      `).join('')}
    </div>` : '<p class="empty-state">Nenhum cliente exige atenção imediata. Ótimo sinal para a operação.</p>'}
  `;
  els.platformAttentionPanel.querySelectorAll('[data-focus-company]').forEach((button) => {
    button.addEventListener('click', () => {
      const card = els.companyList?.querySelector(`[data-company-card="${CSS.escape(button.dataset.focusCompany)}"]`);
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card?.classList.add('is-highlighted');
      setTimeout(() => card?.classList.remove('is-highlighted'), 1200);
    });
  });
}

function renderCompanies() {
  const companies = filteredCompanies();
  if (!state.companies.length) {
    els.companyList.innerHTML = '<p class="empty-state">Nenhuma empresa cadastrada ainda.</p>';
    return;
  }
  if (!companies.length) {
    els.companyList.innerHTML = '<p class="empty-state">Nenhum cliente encontrado. Ajuste os filtros ou tente outro termo de busca.</p>';
    return;
  }
  const cardsHtml = companies.map((company) => {
    const subscription = company.subscription || {};
    const plan = state.plans.find((item) => item.id === subscription.plan_id);
    const stores = company.stores || [];
    const admins = company.admins || [];
    const responsible = admins.find((admin) => ['owner', 'admin', 'manager'].includes(admin.role)) || admins[0] || null;
    const metrics = companyMetrics(company.id);
    const detail = state.companyDetails[company.id];
    const attention = clientAlertsForCompany(company, metrics);
    return `
      <details class="platform-company-card" data-company-card="${escapeAttribute(company.id)}">
        <summary class="platform-company-summary">
          <div>
            <strong>${escapeHtml(company.name)}</strong>
            <small>${escapeHtml(responsible ? `${responsible.name} - ${responsible.email}` : company.billing_email || company.phone || 'Sem responsável')}</small>
          </div>
          <div class="platform-company-summary-metrics">
            <span>${escapeHtml(metrics.plan_name || plan?.name || 'Sem plano')}</span>
            <span>${Number(metrics.orders_month || 0)} pedido(s)/mês</span>
            <span>${moneyCents(metrics.revenue_month_cents, metrics.revenue_month)}</span>
            <span>${Number(metrics.stores_count || stores.length || 0)} loja(s)</span>
          </div>
          <div class="platform-company-summary-status">
            ${attention.length ? `<span class="pill pill-muted">${attention.length} atenção</span>` : ''}
            <span class="pill ${company.status === 'active' ? 'pill-ok' : 'pill-muted'}">${escapeHtml(statusLabel(company.status))}</span>
          </div>
        </summary>

        <div class="platform-company-dropdown">
          <section class="platform-client-metrics">
            <article><span>Lojas</span><strong>${Number(metrics.stores_count || stores.length || 0)}</strong></article>
            <article><span>Plano</span><strong>${escapeHtml(metrics.plan_name || plan?.name || 'Sem plano')}</strong></article>
            <article><span>Pedidos/mês</span><strong>${Number(metrics.orders_month || 0)}</strong></article>
            <article><span>Faturamento/mês</span><strong>${moneyCents(metrics.revenue_month_cents, metrics.revenue_month)}</strong></article>
            <article><span>MRR</span><strong>${moneyCents(metrics.mrr_cents, metrics.mrr)}</strong></article>
            <article><span>Último pedido</span><strong>${metrics.last_order_at ? new Date(metrics.last_order_at).toLocaleDateString('pt-BR') : 'Sem pedidos'}</strong></article>
            <article><span>Último acesso</span><strong>${metrics.last_access_at ? new Date(metrics.last_access_at).toLocaleDateString('pt-BR') : 'Sem acesso'}</strong></article>
            <article><span>Responsável</span><strong>${escapeHtml(responsible?.name || 'Sem responsável')}</strong></article>
            <article><span>Cadastro</span><strong>${company.created_at ? new Date(company.created_at).toLocaleDateString('pt-BR') : '-'}</strong></article>
          </section>

          <section class="platform-client-block">
            <div class="section-actions compact-section-actions">
              <div>
                <p class="eyebrow">Ações rápidas</p>
                <h3>Plano, status e lojas</h3>
              </div>
              <button class="ghost-button compact" data-load-company-detail="${escapeAttribute(company.id)}" type="button">Carregar detalhes</button>
            </div>
            <form class="platform-company-actions" data-company-id="${escapeAttribute(company.id)}">
              <select name="status">
                ${statusOptions(company.status)}
              </select>
              <select name="plan_code">
                ${state.plans.map((item) => `<option value="${escapeAttribute(item.code)}" ${plan?.id === item.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}
              </select>
              <button class="ghost-button compact" data-action="save-status" type="submit">Salvar cliente</button>
            </form>
            <div class="platform-client-quick-actions" data-company-id="${escapeAttribute(company.id)}">
              ${stores[0]?.slug ? `<a class="ghost-button compact" href="${escapeAttribute(externalUrl(PUBLIC_SITE_BASE_URL, `/${stores[0].slug}`))}" target="_blank" rel="noopener">Abrir cardápio</a>` : ''}
              <a class="ghost-button compact" href="${escapeAttribute(externalUrl(PANEL_BASE_URL, '/'))}" target="_blank" rel="noopener">Abrir painel</a>
              ${stores[0]?.id ? `<button class="ghost-button compact" data-company-action="impersonate" data-store-id="${escapeAttribute(stores[0].id)}" type="button">Entrar como suporte</button>` : ''}
              <button class="ghost-button compact" data-company-action="activate" type="button">Liberar cliente</button>
              <button class="danger-button compact" data-company-action="suspend" type="button">Suspender</button>
              <button class="ghost-button compact" data-company-action="reopen-onboarding" type="button">Reabrir onboarding</button>
              <button class="ghost-button compact" data-company-action="resend-billing" type="button">Reenviar cobrança</button>
            </div>
            <div class="store-mini-list">
              ${stores.length ? stores.map((store) => `
                <form class="store-mini-row" data-store-id="${escapeAttribute(store.id)}">
                  <div>
                    <strong>${escapeHtml(store.name)}</strong>
                    <small>/${escapeHtml(store.slug)}</small>
                  </div>
                  <select name="is_active">
                    <option value="true" ${store.is_active !== false ? 'selected' : ''}>Ativa</option>
                    <option value="false" ${store.is_active === false ? 'selected' : ''}>Suspensa</option>
                  </select>
                  <a class="ghost-button compact" href="/${escapeAttribute(store.slug)}" target="_blank" rel="noopener">Abrir cardápio</a>
                  <button class="ghost-button compact">Salvar loja</button>
                </form>
              `).join('') : '<p class="empty-state">Nenhuma loja cadastrada para esta empresa.</p>'}
            </div>
          </section>

          <section class="platform-client-block">
            <div class="section-actions compact-section-actions">
              <div>
                <p class="eyebrow">Informações completas</p>
                <h3>Cliente, cobrança, uso e timeline</h3>
              </div>
            </div>
            <div class="platform-client-detail-grid">
              <article><span>Cadastro</span><strong>${company.created_at ? new Date(company.created_at).toLocaleDateString('pt-BR') : '-'}</strong></article>
              <article><span>Status assinatura</span><strong>${escapeHtml(statusLabel(metrics.subscription_status || subscription.status || company.status))}</strong></article>
              <article><span>Lojas ativas</span><strong>${Number(metrics.active_stores_count || 0)}</strong></article>
              <article><span>Contato</span><strong>${escapeHtml(company.phone || company.billing_email || '-')}</strong></article>
            </div>
            <div class="platform-client-detail-body">
              ${detail ? renderCompanyDetail(detail) : '<p class="empty-state">Carregue os detalhes para ver lojas, admins, plano, cobrança, uso, timeline e notas internas.</p>'}
            </div>
          </section>

          <section class="platform-overrides platform-client-block">
            <strong>Exceções de recursos</strong>
            <form class="platform-override-form" data-company-id="${escapeAttribute(company.id)}">
              <select name="feature_code">
                ${state.features.map((feature) => `<option value="${escapeAttribute(feature.code)}">${escapeHtml(feature.name)}</option>`).join('')}
              </select>
              <select name="override_type">
                <option value="allow">Liberar</option>
                <option value="block">Bloquear</option>
                <option value="limit">Limitar</option>
              </select>
              <input name="limit_value" type="number" min="0" step="1" placeholder="Limite">
              <input name="reason" placeholder="Motivo">
              <button class="ghost-button compact">Adicionar</button>
            </form>
            <div class="override-list">
              ${(company.overrides || []).length ? company.overrides.map((override) => `
                <article class="override-row">
                  <div>
                    <strong>${escapeHtml(override.feature?.name || 'Recurso')}</strong>
                    <small>${escapeHtml(overrideTypeLabel(override.override_type))}${override.limit_value ? ` - limite ${Number(override.limit_value)}` : ''}</small>
                  </div>
                  <button class="ghost-button compact" data-delete-override="${escapeAttribute(override.id)}" type="button">Remover</button>
                </article>
              `).join('') : '<p class="empty-state">Nenhuma exceção cadastrada.</p>'}
            </div>
          </section>
        </div>
      </details>
    `;
  }).join('');
  const loadMoreHtml = state.companyPagination?.has_more ? `
    <div class="platform-load-more">
      <button class="ghost-button compact" data-load-more-companies type="button">Carregar mais clientes</button>
      <small>Mostrando ${Number(state.companies.length || 0)} cliente(s).</small>
    </div>
  ` : '';
  els.companyList.innerHTML = cardsHtml + loadMoreHtml;
  els.companyList.querySelectorAll('.platform-company-actions').forEach((form) => {
    form.addEventListener('submit', submitCompanyManagement);
  });
  els.companyList.querySelectorAll('.store-mini-row').forEach((form) => {
    form.addEventListener('submit', submitStoreStatus);
  });
  els.companyList.querySelectorAll('.platform-override-form').forEach((form) => {
    form.addEventListener('submit', submitOverride);
  });
  els.companyList.querySelectorAll('[data-delete-override]').forEach((button) => {
    button.addEventListener('click', deleteOverride);
  });
  els.companyList.querySelectorAll('[data-load-company-detail]').forEach((button) => {
    button.addEventListener('click', () => loadCompanyDetail(button.dataset.loadCompanyDetail));
  });
  els.companyList.querySelectorAll('[data-company-action]').forEach((button) => {
    button.addEventListener('click', submitCompanyQuickAction);
  });
  els.companyList.querySelector('[data-load-more-companies]')?.addEventListener('click', loadMoreCompanies);
  els.companyList.querySelectorAll('.platform-note-form').forEach((form) => {
    form.addEventListener('submit', submitCompanyNote);
  });
  els.companyList.querySelectorAll('.platform-company-card').forEach((details) => {
    details.addEventListener('toggle', () => {
      const companyId = details.dataset.companyCard;
      if (details.open && companyId && !state.companyDetails[companyId]) loadCompanyDetail(companyId);
    });
  });
}

function filteredCompanies() {
  const data = new FormData(els.clientFilterForm || document.createElement('form'));
  const search = normalizeSearch(data.get('search') || '');
  const status = data.get('status') || '';
  const plan = data.get('plan') || '';
  const activity = data.get('activity') || '';
  const delinquent = new Set(['payment_pending', 'grace_period', 'past_due', 'blocked', 'suspended']);
  return state.companies.filter((company) => {
    const metrics = companyMetrics(company.id);
    const stores = company.stores || [];
    const haystack = normalizeSearch([
      company.name,
      company.billing_email,
      company.phone,
      ...(company.admins || []).flatMap((admin) => [admin.name, admin.email]),
      ...stores.flatMap((store) => [store.name, store.slug, ...(store.domains || []).map((domain) => domain.domain)])
    ].filter(Boolean).join(' '));
    if (search && !haystack.includes(search)) return false;
    if (status === 'delinquent' && !delinquent.has(metrics.subscription_status || company.status)) return false;
    if (status && status !== 'delinquent' && (metrics.subscription_status || company.status) !== status && company.status !== status) return false;
    if (plan && metrics.plan_code !== plan) return false;
    if (activity === 'with_orders' && !metrics.has_orders) return false;
    if (activity === 'without_orders' && metrics.has_orders) return false;
    if (activity === 'payment_due' && !delinquent.has(metrics.subscription_status || company.status)) return false;
    if (activity === 'trial_ending' && !trialEndingSoon(company.subscription)) return false;
    if (activity === 'unpublished_store' && !(stores.some((store) => store.is_active === false) || Number(metrics.unpublished_stores_count || 0) > 0)) return false;
    if (activity === 'no_whatsapp' && !(Number(metrics.stores_without_whatsapp_count || 0) > 0)) return false;
    if (activity === 'no_products' && !(Number(metrics.products_count || 0) === 0 && stores.length)) return false;
    if (activity === 'needs_attention' && !clientAlertsForCompany(company, metrics).length) return false;
    return true;
  });
}

function platformClientAlerts() {
  return state.companies.flatMap((company) => clientAlertsForCompany(company, companyMetrics(company.id)).map((alert) => ({
    ...alert,
    company_id: company.id,
    company_name: company.name
  }))).sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity));
}

function clientAlertsForCompany(company, metrics = {}) {
  const alerts = [];
  const stores = company.stores || [];
  const subscription = company.subscription || {};
  const delinquent = new Set(['payment_pending', 'grace_period', 'past_due', 'blocked', 'suspended']);
  if (trialEndingSoon(subscription)) alerts.push({ type: 'trial', severity: 'warning', title: 'Trial perto do fim', action: 'Entrar em contato e orientar upgrade.' });
  if (delinquent.has(metrics.subscription_status || subscription.status || company.status)) alerts.push({ type: 'billing', severity: 'critical', title: 'Cobrança pendente', action: 'Verificar pagamento e webhook.' });
  if (!stores.length) alerts.push({ type: 'setup', severity: 'critical', title: 'Sem loja criada', action: 'Criar meu Cardápio ou unidade.' });
  if (stores.some((store) => store.is_active === false)) alerts.push({ type: 'store', severity: 'attention', title: 'Loja não publicada ou suspensa', action: 'Validar status da loja.' });
  if (Number(metrics.stores_without_whatsapp_count || 0) > 0) alerts.push({ type: 'whatsapp', severity: 'warning', title: 'Loja sem WhatsApp', action: 'Completar configuração de atendimento.' });
  if (stores.length && Number(metrics.products_count || 0) === 0) alerts.push({ type: 'menu', severity: 'critical', title: 'Sem produto cadastrado', action: 'Ajudar o cliente a montar o cardápio.' });
  if (Number(metrics.incomplete_onboarding_count || 0) > 0) alerts.push({ type: 'onboarding', severity: 'attention', title: 'Onboarding incompleto', action: 'Reabrir onboarding ou orientar cliente.' });
  if (!metrics.has_orders && stores.length) alerts.push({ type: 'sales', severity: 'attention', title: 'Sem pedidos no período', action: 'Acompanhar ativação do cliente.' });
  return alerts;
}

function severityWeight(value) {
  return ({ critical: 3, warning: 2, attention: 1 })[value] || 0;
}

function companyMetrics(companyId) {
  const company = state.companies.find((entry) => entry.id === companyId) || {};
  const listMetrics = company.metrics || {};
  const analyticsMetrics = (state.analytics?.company_metrics || []).find((entry) => entry.company_id === companyId) || {};
  return { ...listMetrics, ...analyticsMetrics, last_access_at: analyticsMetrics.last_access_at || listMetrics.last_access_at };
}

function trialEndingSoon(subscription) {
  if (!subscription?.trial_ends_at) return false;
  const days = Math.ceil((new Date(subscription.trial_ends_at).getTime() - Date.now()) / 86400000);
  return days >= 0 && days <= 3;
}

async function loadCompanyDetail(companyId) {
  if (!companyId) return;
  state.companyDetails[companyId] = { loading: true };
  renderCompanies();
  try {
    const [detail, score, timeline] = await Promise.all([
      request(`/api/platform/companies/${companyId}/detail`),
      request(`/api/platform/companies/${companyId}/score`),
      request(`/api/platform/companies/${companyId}/timeline`)
    ]);
    state.companyDetails[companyId] = {
      ...detail,
      score,
      timeline: timeline.timeline || detail.timeline || []
    };
  } catch (error) {
    state.companyDetails[companyId] = { error: error.message || 'Não foi possível carregar o cliente.' };
  }
  renderCompanies();
  const card = els.companyList?.querySelector(`[data-company-card="${CSS.escape(companyId)}"]`);
  if (card) card.open = true;
}

function renderCompanyDetail(detail) {
  if (detail.loading) return '<p class="empty-state">Carregando detalhe do cliente...</p>';
  if (detail.error) return `<p class="empty-state">${escapeHtml(detail.error)}</p>`;
  const metrics = detail.metrics || {};
  const stores = detail.stores || [];
  const admins = detail.admins || [];
  const billing = detail.billing_history || [];
  const timeline = detail.timeline || [];
  const attention = detail.attention || [];
  const recentOrders = detail.recent_orders || [];
  const usageCounters = detail.usage_counters || [];
  const score = detail.score || {};
  const internalStatus = detail.internal_status || {};
  return `
    <section class="platform-detail-section">
      <div class="platform-score-panel score-${escapeAttribute(score.tone || 'neutral')}">
        <div>
          <p class="eyebrow">Score do cliente</p>
          <h4>${escapeHtml(score.label || 'Sem score')}</h4>
          <p>${escapeHtml((score.reasons || ['Sem sinais suficientes para classificar.'])[0])}</p>
        </div>
        <strong>${Number(score.points || 0)}<small>/100</small></strong>
      </div>
      ${(score.recommendations || []).length ? `<div class="platform-recommendation-list">
        ${score.recommendations.map((item) => `
          <article>
            <strong>${escapeHtml(item.title)}</strong>
            <small>${escapeHtml(item.action)}</small>
          </article>
        `).join('')}
      </div>` : ''}
      <div class="platform-detail-metrics">
        <article><span>Pedidos 7 dias</span><strong>${Number(metrics.orders_7d || 0)}</strong></article>
        <article><span>Faturamento 7 dias</span><strong>${money(metrics.revenue_7d)}</strong></article>
        <article><span>Pedidos 30 dias</span><strong>${Number(metrics.orders_30d || 0)}</strong></article>
        <article><span>Faturamento 30 dias</span><strong>${money(metrics.revenue_30d)}</strong></article>
        <article><span>Ticket médio</span><strong>${money(metrics.average_ticket_30d)}</strong></article>
        <article><span>Produtos ativos</span><strong>${Number(metrics.active_products_count || 0)}</strong></article>
        <article><span>Clientes finais</span><strong>${Number(metrics.customers_count || 0)}</strong></article>
        <article><span>MRR</span><strong>${money(metrics.mrr)}</strong></article>
      </div>
      ${attention.length ? `<div class="platform-detail-alerts">
        ${attention.map((alert) => `<article class="severity-${escapeAttribute(alert.severity)}"><strong>${escapeHtml(alert.title)}</strong><small>${escapeHtml(alert.action)}</small></article>`).join('')}
      </div>` : ''}
      <div class="platform-detail-columns">
        <article>
          <h4>Lojas vinculadas</h4>
          ${stores.length ? stores.map((store) => `
            <div class="platform-detail-row">
              <div>
                <strong>${escapeHtml(store.name)}</strong>
                <small>/${escapeHtml(store.slug)} ${store.domains?.length ? `- ${escapeHtml(store.domains.map((domain) => domain.domain).join(', '))}` : ''}</small>
              </div>
              <span>${store.is_active !== false ? 'Publicada' : 'Inativa'}</span>
            </div>
          `).join('') : '<p class="empty-state">Nenhuma loja vinculada.</p>'}
        </article>
        <article>
          <h4>Admins vinculados</h4>
          ${admins.length ? admins.map((admin) => `
            <div class="platform-detail-row">
              <div>
                <strong>${escapeHtml(admin.name)}</strong>
                <small>${escapeHtml(admin.email)}</small>
              </div>
              <span>${escapeHtml(adminRoleLabel(admin.role))}</span>
            </div>
          `).join('') : '<p class="empty-state">Nenhum admin vinculado.</p>'}
        </article>
      </div>
      <div class="platform-detail-columns">
        <article>
          <h4>Uso do plano</h4>
          ${usageCounters.length ? usageCounters.slice(0, 8).map((entry) => `
            <div class="platform-detail-row">
              <div>
                <strong>${escapeHtml(entry.usage_key || entry.feature_code || 'Uso')}</strong>
                <small>${entry.updated_at ? new Date(entry.updated_at).toLocaleString('pt-BR') : '-'}</small>
              </div>
              <span>${Number(entry.quantity || entry.used || 0)}</span>
            </div>
          `).join('') : '<p class="empty-state">Sem contadores de uso registrados.</p>'}
        </article>
        <article>
          <h4>Últimos pedidos</h4>
          ${recentOrders.length ? recentOrders.map((order) => `
            <div class="platform-detail-row">
              <div>
                <strong>${escapeHtml(order.status || 'Pedido')}</strong>
                <small>${order.created_at ? new Date(order.created_at).toLocaleString('pt-BR') : '-'}</small>
              </div>
              <span>${moneyCents(order.total_cents, order.total)}</span>
            </div>
          `).join('') : '<p class="empty-state">Nenhum pedido registrado.</p>'}
        </article>
      </div>
      <div class="platform-detail-columns">
        <article>
          <h4>Histórico de cobrança</h4>
          ${billing.length ? billing.slice(0, 6).map((entry) => `
            <div class="platform-detail-row">
              <div>
                <strong>${escapeHtml(entry.event_type || entry.type || 'Evento')}</strong>
                <small>${entry.created_at ? new Date(entry.created_at).toLocaleString('pt-BR') : '-'}</small>
              </div>
              <span>${entry.amount_cents ? money(Number(entry.amount_cents) / 100) : escapeHtml(entry.status || '-')}</span>
            </div>
          `).join('') : '<p class="empty-state">Sem eventos de cobrança.</p>'}
        </article>
        <article>
          <h4>Timeline</h4>
          ${timeline.length ? timeline.slice(0, 8).map((entry) => `
            <div class="platform-timeline-row">
              <span></span>
              <div>
                <strong>${escapeHtml(entry.title)}</strong>
                <small>${entry.created_at ? new Date(entry.created_at).toLocaleString('pt-BR') : '-'}</small>
                <p>${escapeHtml(entry.description || '')}</p>
              </div>
            </div>
          `).join('') : '<p class="empty-state">Sem eventos de timeline.</p>'}
        </article>
      </div>
      <form class="platform-note-form" data-company-id="${escapeAttribute(detail.company?.id || '')}">
        <h4>Acompanhamento interno</h4>
        ${internalStatus?.created_at ? `<p class="muted">Último registro: ${new Date(internalStatus.created_at).toLocaleString('pt-BR')}</p>` : ''}
        <textarea name="note" rows="3" placeholder="Registre comentário, combinado ou pendência comercial"></textarea>
        <div class="platform-note-grid">
          <input name="status" placeholder="Status. Ex: Aguardando retorno" value="${escapeAttribute(internalStatus.support_status || '')}">
          <input name="responsible" placeholder="Responsável interno" value="${escapeAttribute(internalStatus.responsible || '')}">
          <select name="priority">
            <option value="medium" ${internalStatus.priority === 'medium' ? 'selected' : ''}>Prioridade média</option>
            <option value="low" ${internalStatus.priority === 'low' ? 'selected' : ''}>Prioridade baixa</option>
            <option value="high" ${internalStatus.priority === 'high' ? 'selected' : ''}>Prioridade alta</option>
            <option value="critical" ${internalStatus.priority === 'critical' ? 'selected' : ''}>Prioridade crítica</option>
          </select>
          <input name="tags" placeholder="Tags. Ex: onboarding, upgrade" value="${escapeAttribute((internalStatus.tags || []).join(', '))}">
          <input name="next_contact_at" type="date" value="${internalStatus.next_contact_at ? escapeAttribute(String(internalStatus.next_contact_at).slice(0, 10)) : ''}">
          <button class="primary-button compact">Salvar nota</button>
        </div>
      </form>
    </section>
  `;
}

async function submitCompanyNote(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const companyId = form.dataset.companyId;
  const data = Object.fromEntries(new FormData(form));
  await request(`/api/platform/companies/${companyId}/internal-status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  toast('Acompanhamento interno registrado.');
  await loadCompanyDetail(companyId);
}

function renderAudit() {
  if (!state.auditLoaded && !state.logs.length) {
    els.auditList.innerHTML = '<p class="empty-state">A auditoria será carregada ao abrir esta aba ou ao aplicar filtros.</p>';
    return;
  }
  els.auditList.innerHTML = state.logs.length ? state.logs.map((log) => `
    <details class="audit-row platform-audit-detail severity-${escapeAttribute(log.severity || 'info')}">
      <summary>
        <div>
          <strong>${escapeHtml(log.action)}</strong>
          <small>${new Date(log.created_at).toLocaleString('pt-BR')} ${log.severity ? `- ${escapeHtml(log.severity)}` : ''}</small>
        </div>
        <span>${escapeHtml(log.entity_type || 'plataforma')}</span>
      </summary>
      <div class="platform-audit-body">
        <article><span>Usuário</span><strong>${escapeHtml(log.actor_admin_email || log.actor_admin_id || '-')}</strong></article>
        <article><span>Cliente</span><strong>${escapeHtml(log.company_name || log.company_id || '-')}</strong></article>
        <article><span>Loja</span><strong>${escapeHtml(log.store_name || log.store_id || '-')}</strong></article>
        <article><span>IP</span><strong>${escapeHtml(log.ip_address || '-')}</strong></article>
        <article><span>Resultado</span><strong>${escapeHtml(log.status || log.after_data?.status || log.severity || '-')}</strong></article>
        <article><span>Mensagem</span><strong>${escapeHtml(log.message || log.after_data?.message || log.after_data?.summary || '-')}</strong></article>
      </div>
    </details>
  `).join('') : '<p class="empty-state">Nenhum evento recente.</p>';
}

function renderHealth() {
  const health = state.health || {};
  if (!state.healthLoaded && !health.error) {
    if (els.healthMeta) els.healthMeta.textContent = 'Abra esta área para verificar status de API, banco, SMTP, backups e webhooks.';
    if (els.platformStatusGrid) els.platformStatusGrid.innerHTML = '<p class="empty-state">Status operacional ainda não carregado.</p>';
    if (els.platformMetrics) els.platformMetrics.innerHTML = '';
    if (els.platformConfigChecklist) els.platformConfigChecklist.innerHTML = '';
    if (els.platformAlerts) els.platformAlerts.innerHTML = '';
    if (els.platformOperationalLogs) els.platformOperationalLogs.innerHTML = '';
    return;
  }
  if (health.error) {
    if (els.healthMeta) els.healthMeta.textContent = health.error;
    if (els.platformStatusGrid) els.platformStatusGrid.innerHTML = '<p class="empty-state">Não foi possível verificar os serviços agora. Tente novamente em instantes.</p>';
    return;
  }
  if (els.healthMeta) {
    els.healthMeta.textContent = health.checked_at
      ? `Última verificação: ${new Date(health.checked_at).toLocaleString('pt-BR')} - ${health.period || 'período atual'}`
      : 'Sem verificação registrada.';
  }
  renderPlatformStatuses(health.statuses || []);
  renderPlatformMetrics(health.metrics || {});
  renderPlatformChecklist(health.config?.items || []);
  renderPlatformAlerts(health.alerts || []);
  renderOperationalLogs();
  renderServices();
}

function renderPlatformStatuses(statuses) {
  if (!els.platformStatusGrid) return;
  const byKey = new Map((statuses || []).map((item) => [item.key, item]));
  const resources = [
    {
      key: 'api',
      label: 'API',
      fallback: { status: 'unknown', message: 'Aplicação ainda não verificada.' }
    },
    {
      key: 'database',
      label: 'Banco',
      fallback: { status: 'unknown', message: 'Banco ainda não verificado.' }
    },
    {
      key: 'backup',
      label: 'Backup',
      fallback: { status: 'unknown', message: 'Backup ainda não verificado.' }
    },
    {
      key: 'smtp',
      label: 'SMTP',
      fallback: { status: 'unknown', message: 'E-mail ainda não verificado.' }
    },
    {
      key: 'billing',
      label: 'Abacate Pay',
      fallback: { status: 'unknown', message: 'Billing ainda não verificado.' }
    },
    {
      key: 'webhooks',
      label: 'Webhooks',
      fallback: { status: 'unknown', message: 'Webhooks ainda não verificados.' }
    },
    platformResourceStatus()
  ].map((resource) => {
    if (resource.key === 'resources') return resource;
    const item = byKey.get(resource.key) || resource.fallback || {};
    return {
      key: resource.key,
      label: resource.label || item.label,
      status: item.status || 'unknown',
      message: item.message || resource.fallback?.message || '-',
      latency_ms: item.latency_ms
    };
  });

  els.platformStatusGrid.innerHTML = resources.length ? resources.map((item) => `
    <article class="platform-status-card status-${escapeAttribute(item.status)}">
      <span>${escapeHtml(statusLabelHealth(item.status))}</span>
      <strong>${escapeHtml(item.label)}</strong>
      <p>${escapeHtml(item.message || '-')}</p>
      ${item.latency_ms !== null && item.latency_ms !== undefined ? `<small>${Number(item.latency_ms)} ms</small>` : ''}
    </article>
  `).join('') : '<p class="empty-state">Nenhum status técnico disponível para exibição.</p>';
}

function platformResourceStatus() {
  const metrics = state.health?.metrics || {};
  const memory = metrics.system?.memory || {};
  const disk = metrics.system?.disk || {};
  const ramUsed = Number(memory.system_used_percent || 0);
  const swapUsed = Number(memory.swap_used_bytes || 0);
  const heapUsed = Number(memory.heap_used_percent || 0);
  const diskFree = Number(disk.lowest_free_percent ?? 100);
  let status = 'healthy';
  if (ramUsed >= 90 || swapUsed >= 1024 * 1024 * 1024 || heapUsed >= 90 || diskFree < 15) status = 'error';
  else if (ramUsed >= 75 || swapUsed >= 512 * 1024 * 1024 || heapUsed >= 80 || diskFree < 25) status = 'attention';
  if (!Object.keys(memory).length && !Object.keys(disk).length) status = 'unknown';
  const message = status === 'unknown'
    ? 'Uso de recursos ainda não verificado.'
    : `RAM ${ramUsed || 0}% · Heap ${heapUsed || 0}% · Disco livre ${diskFree || 0}%`;
  return {
    key: 'resources',
    label: 'Disco/RAM',
    status,
    message,
    latency_ms: null
  };
}

function renderPlatformMetrics(metrics) {
  if (!els.platformMetrics) return;
  const rows = [
    ['API', metrics.api, `${Number(metrics.api?.requests_per_minute || 0)} req/min · ${Number(metrics.api?.errors_5xx || 0)} erro(s) 5xx`],
    ['Banco', metrics.database, metrics.database?.status ? statusLabelHealth(metrics.database.status) : 'Verificação atual'],
    ['Checkout', metrics.checkout, `${Number(metrics.checkout?.requests || 0)} requisição(ões)`],
    ['Pedidos', metrics.order_mutations, `${Number(metrics.order_mutations?.requests || 0)} mutação(ões)`]
  ];
  const system = metrics.system || {};
  const disk = system.disk || {};
  const memory = system.memory || {};
  const cpu = system.cpu || {};
  els.platformMetrics.innerHTML = `
    ${rows.map(([label, data = {}, detail = '']) => `
    <div class="platform-metric-row">
      <strong>${escapeHtml(label)}</strong>
      <span>Média: ${metricMs(data.average_ms)}</span>
      <span>P95: ${metricMs(data.p95_ms)}</span>
      <span>P99: ${metricMs(data.p99_ms)}</span>
      ${data.requests !== undefined ? `<small>${Number(data.requests || 0)} req.</small>` : ''}
      ${detail ? `<small>${escapeHtml(detail)}</small>` : ''}
    </div>
    `).join('')}
    <div class="platform-metric-row platform-system-metric">
      <strong>Memória</strong>
      <span>Processo: ${formatBytes(memory.rss_bytes || 0)}</span>
      <span>Heap: ${formatBytes(memory.heap_used_bytes || 0)} / ${formatBytes(memory.heap_limit_bytes || memory.heap_total_bytes || 0)}</span>
      <small>RAM usada: ${memory.system_used_percent ?? '-'}% · Heap: ${memory.heap_used_percent ?? '-'}%</small>
    </div>
    <div class="platform-metric-row platform-system-metric">
      <strong>Swap</strong>
      <span>Usado: ${formatBytes(memory.swap_used_bytes || 0)}</span>
      <span>Livre: ${formatBytes(memory.swap_free_bytes || 0)}</span>
      <small>Total: ${formatBytes(memory.swap_total_bytes || 0)} · Uso: ${memory.swap_used_percent ?? '-'}%</small>
    </div>
    <div class="platform-metric-row platform-system-metric">
      <strong>CPU</strong>
      <span>Cores: ${Number(cpu.cores || 0)}</span>
      <span>Carga 1m: ${cpu.load_1m ?? '-'}</span>
      <small>Uso estimado: ${cpu.load_percent ?? '-'}%</small>
    </div>
    <div class="platform-metric-row platform-system-metric">
      <strong>Disco</strong>
      <span>Uploads livres: ${formatBytes(metrics.storage?.upload_free_bytes || 0)}</span>
      <span>Backups livres: ${formatBytes(metrics.storage?.backup_free_bytes || 0)}</span>
      <small>Menor espaço livre: ${disk.lowest_free_percent ?? '-'}%</small>
    </div>
  `;
}

function renderPlatformChecklist(items) {
  if (!els.platformConfigChecklist) return;
  els.platformConfigChecklist.innerHTML = items.length ? items.map((item) => `
    <article class="platform-check-row ${item.ok ? 'ok' : 'danger'}">
      <span>${item.ok ? 'OK' : '!'}</span>
      <div>
        <strong>${escapeHtml(item.label)}</strong>
        <small>${escapeHtml(item.hint || '')}</small>
      </div>
    </article>
  `).join('') : '<p class="empty-state">Checklist indisponível.</p>';
}

function renderPlatformAlerts(alerts) {
  if (!els.platformAlerts) return;
  const allowed = new Set(['backup', 'backup_delayed', 'webhook', 'smtp', 'smtp_missing', 'disk_low', 'latency', 'api', 'api_5xx']);
  const importantAlerts = (alerts || []).filter((alert) => allowed.has(alert.type || alert.key));
  els.platformAlerts.innerHTML = importantAlerts.length ? importantAlerts.map((alert) => `
    <article class="platform-alert-row severity-${escapeAttribute(alert.severity)}">
      <strong>${escapeHtml(alert.title)}</strong>
      <p>${escapeHtml(alert.message || '')}</p>
      <small>${escapeHtml(alert.action || '')}</small>
    </article>
  `).join('') : '<p class="empty-state">Nenhum alerta operacional no momento. Serviços sem sinais críticos.</p>';
}

function renderOperationalLogs() {
  if (!els.platformOperationalLogs) return;
  const type = els.operationalLogTypeFilter?.value || '';
  const status = els.operationalLogStatusFilter?.value || '';
  const severity = els.operationalLogSeverityFilter?.value || '';
  const service = els.operationalLogServiceFilter?.value || '';
  const logs = (state.health?.logs || [])
    .filter((entry) => !type || entry.type === type)
    .filter((entry) => !status || entry.status === status)
    .filter((entry) => !severity || entry.severity === severity)
    .filter((entry) => !service || entry.service === service);
  const list = logs.map((entry) => `
    <details class="platform-log-row platform-log-detail status-${escapeAttribute(entry.status)}">
      <summary>
        <div>
          <strong>${escapeHtml(entry.action || entry.type)}</strong>
          <small>${entry.created_at ? new Date(entry.created_at).toLocaleString('pt-BR') : '-'} · ${escapeHtml(entry.type || 'system')}</small>
        </div>
        <span>${escapeHtml(entry.severity || entry.status || 'info')}</span>
      </summary>
      <div class="platform-log-body">
        <article><span>Serviço</span><strong>${escapeHtml(entry.service || 'system')}</strong></article>
        <article><span>Status</span><strong>${escapeHtml(entry.status || 'info')}</strong></article>
        <article><span>Cliente/loja</span><strong>${escapeHtml([entry.company_name, entry.store_name].filter(Boolean).join(' · ') || '-')}</strong></article>
        <article class="is-wide"><span>Mensagem</span><strong>${escapeHtml(entry.message || 'Evento operacional registrado.')}</strong></article>
      </div>
    </details>
  `).join('');
  els.platformOperationalLogs.innerHTML = logs.length ? `
    <details class="platform-log-group">
      <summary>
        <div>
          <strong>Ver logs operacionais</strong>
          <small>Últimas 24h conforme filtros selecionados.</small>
        </div>
        <span>${logs.length} log(s)</span>
      </summary>
      <div class="platform-log-group-body">${list}</div>
    </details>
  ` : '<p class="empty-state">Nenhum log operacional encontrado para os filtros selecionados.</p>';
}

function statusLabelHealth(status) {
  return ({
    healthy: 'Saudável',
    attention: 'Atenção',
    error: 'Erro',
    unknown: 'Desconhecido'
  })[status] || 'Desconhecido';
}

function metricMs(value) {
  return value === null || value === undefined ? '-' : `${Number(value)} ms`;
}

function renderServices() {
  const services = state.services || {};
  if (!state.servicesLoaded && !services.error) {
    if (els.servicesMeta) els.servicesMeta.textContent = 'Abra esta área para carregar serviços, jobs, backups e uso de recursos.';
    if (els.platformServicesGrid) els.platformServicesGrid.innerHTML = '<p class="empty-state">Detalhes operacionais ainda não verificados.</p>';
    if (els.platformServiceLogs) els.platformServiceLogs.innerHTML = '';
    if (els.platformRiskZone) els.platformRiskZone.innerHTML = '';
    return;
  }
  if (services.error) {
    if (els.servicesMeta) els.servicesMeta.textContent = services.error;
    if (els.platformServicesGrid) els.platformServicesGrid.innerHTML = '<p class="empty-state">Não foi possível carregar detalhes técnicos. Verifique a sessão e tente novamente.</p>';
    return;
  }
  if (els.servicesMeta) {
    els.servicesMeta.textContent = services.checked_at
      ? `Detalhes operacionais: ${new Date(services.checked_at).toLocaleString('pt-BR')}`
      : 'Detalhes operacionais ainda não verificados.';
  }
  renderServiceCards(services);
  renderPlatformBackupList(services.backups || {});
  renderServiceLogs();
  renderRiskZone(services.risk_zone || {});
}

function renderBilling() {
  renderBillingSummary();
  renderBillingConfig();
  renderBillingSubscriptions();
  renderBillingPlans();
  renderBillingAddons();
  renderBillingEvents();
  renderBillingAlerts();
}

function renderBillingSummary() {
  if (!els.platformBillingSummaryGrid) return;
  if (!state.billingLoaded && !state.billingLoading && !state.billingError) {
    els.platformBillingSummaryGrid.innerHTML = '<p class="empty-state">Abra Billing para carregar assinaturas, receita e riscos financeiros.</p>';
    return;
  }
  if (state.billingLoading && !state.billingLoaded) {
    els.platformBillingSummaryGrid.innerHTML = Array.from({ length: 8 }).map(() => `
      <article class="platform-kpi-card platform-loading-card">
        <span>Billing</span>
        <strong>...</strong>
        <p>Carregando métricas financeiras.</p>
      </article>
    `).join('');
    return;
  }
  if (state.billingError && !state.billingLoaded) {
    els.platformBillingSummaryGrid.innerHTML = `<article class="platform-kpi-card platform-error-card"><span>Billing</span><strong>Erro</strong><p>${escapeHtml(state.billingError)}</p></article>`;
    return;
  }
  const billing = state.billing || {};
  const delinquency = billing.delinquency || {};
  const events = billing.events || {};
  const items = [
    ['MRR total', moneyCents(billing.mrr_total_cents), 'Receita recorrente ativa e em risco', Number(billing.mrr_total_cents || 0) ? 'finance' : 'neutral'],
    ['MRR ativo', moneyCents(billing.mrr_active_cents), 'Assinaturas ativas', Number(billing.mrr_active_cents || 0) ? 'success' : 'neutral'],
    ['MRR em risco', moneyCents(billing.mrr_at_risk_cents), 'Trial, vencido ou grace period', Number(billing.mrr_at_risk_cents || 0) ? 'warning' : 'neutral'],
    ['Receita pendente', moneyCents(billing.pending_revenue_cents), 'Cobranças abertas', Number(billing.pending_revenue_cents || 0) ? 'warning' : 'neutral'],
    ['Receita perdida', moneyCents(billing.lost_revenue_cents), 'Cancelados ou bloqueados', Number(billing.lost_revenue_cents || 0) ? 'danger' : 'neutral'],
    ['Inadimplência', `${Number(delinquency.rate || 0)}%`, `${Number(delinquency.clients || 0)} cliente(s)`, Number(delinquency.clients || delinquency.rate || 0) ? 'danger' : 'neutral'],
    ['Ticket por cliente', moneyCents(billing.average_ticket_per_client_cents), 'Faturamento de pedidos / clientes pagantes', Number(billing.average_ticket_per_client_cents || 0) ? 'success' : 'neutral'],
    ['Pagamentos aprovados', events.payment_approved || 0, 'Eventos financeiros no período', Number(events.payment_approved || 0) ? 'success' : 'neutral'],
    ['Pagamentos recusados', events.payment_refused || 0, 'Falhas ou recusas', Number(events.payment_refused || 0) ? 'danger' : 'neutral'],
    ['Webhooks com erro', events.webhook_error || 0, 'Eventos que precisam revisão', Number(events.webhook_error || 0) ? 'danger' : 'neutral']
  ];
  els.platformBillingSummaryGrid.innerHTML = items.map(([label, value, hint, tone]) => `
    <article class="platform-kpi-card tone-${escapeAttribute(tone || 'neutral')}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value ?? 0)}</strong>
      <p>${escapeHtml(hint)}</p>
    </article>
  `).join('');
}

function renderBillingConfig() {
  if (!els.platformBillingConfigForm) return;
  const form = els.platformBillingConfigForm;
  const config = state.billingConfig || {};
  if (!state.billingLoaded && !state.billingLoading && !state.billingError) {
    if (els.billingConfigStatusText) els.billingConfigStatusText.textContent = 'Abra Billing para carregar a configuração da Abacate Pay.';
    return;
  }
  form.elements.provider.value = config.provider || 'abacatepay';
  form.elements.public_url.value = config.public_url || window.location.origin;
  form.elements.api_key.value = '';
  form.elements.api_key.placeholder = config.has_api_key
    ? `API key já salva (${config.api_key_masked || 'mascarada'}). Preencha apenas para trocar.`
    : 'Cole a API key da Abacate Pay';
  form.elements.webhook_secret.value = '';
  form.elements.webhook_secret.placeholder = config.has_webhook_secret
    ? `Segredo já salvo (${config.webhook_secret_masked || 'mascarado'}). Preencha apenas para trocar.`
    : 'Cole o segredo do webhook';
  form.elements.password.value = '';
  form.elements.is_active.checked = config.is_active === true;
  if (els.billingWebhookUrl) {
    els.billingWebhookUrl.textContent = config.webhook_url || `${window.location.origin}/api/billing/webhook?provider=abacatepay`;
  }
  if (els.billingConfigStatusText) {
    const status = config.is_active && config.has_api_key ? 'Configurado' : 'Não configurado';
    const test = config.last_test_status
      ? ` Último teste: ${config.last_test_status}${config.last_test_at ? ` em ${formatDateTime(config.last_test_at)}` : ''}.`
      : ' Nenhum teste executado.';
    els.billingConfigStatusText.textContent = `${status}. API key: ${config.has_api_key ? 'salva' : 'ausente'}. Webhook secret: ${config.has_webhook_secret ? 'salvo' : 'ausente'}.${test}`;
  }
}

function renderBillingSubscriptions() {
  if (!els.platformSubscriptionList) return;
  if (!state.billingLoaded && !state.billingLoading && !state.billingError) {
    els.platformSubscriptionList.innerHTML = '<p class="empty-state">As assinaturas aparecem aqui após carregar Billing.</p>';
    return;
  }
  if (state.billingLoading && !state.billingLoaded) {
    els.platformSubscriptionList.innerHTML = '<p class="empty-state">Carregando assinaturas...</p>';
    return;
  }
  if (state.billingError && !state.billingLoaded) {
    els.platformSubscriptionList.innerHTML = `<p class="empty-state">${escapeHtml(state.billingError)}</p>`;
    return;
  }
  const rows = state.billingSubscriptions || [];
  els.platformSubscriptionList.innerHTML = rows.length ? rows.map((row) => `
    <article class="platform-subscription-row status-${escapeAttribute(row.display_status || row.status || 'unknown')}">
      <div class="platform-subscription-main">
        <div>
          <strong>${escapeHtml(row.company_name)}</strong>
          <small>${escapeHtml(row.billing_email || row.phone || 'Sem contato financeiro')}</small>
        </div>
        <span class="pill ${billingStatusPill(row.display_status || row.status)}">${escapeHtml(subscriptionStatusLabel(row.display_status || row.status))}</span>
      </div>
      <div class="platform-subscription-meta">
        <span><b>Plano</b>${escapeHtml(row.plan_name || 'Sem plano')}</span>
        <span><b>Valor</b>${moneyCents(row.value_cents)}</span>
        <span><b>Trial</b>${formatDate(row.trial_ends_at)}</span>
        <span><b>Próxima cobrança</b>${formatDate(row.next_renewal_at || row.payment_due_at)}</span>
        <span><b>Provedor</b>${escapeHtml(row.provider || 'manual')}</span>
        <span><b>Referência</b>${escapeHtml(row.external_reference || '-')}</span>
      </div>
      <div class="platform-subscription-actions" data-company-id="${escapeAttribute(row.company_id)}">
        <select class="compact-date" data-billing-plan-select>
          ${state.plans.map((plan) => `<option value="${escapeAttribute(plan.code)}" ${plan.code === row.plan_code ? 'selected' : ''}>${escapeHtml(plan.name)}</option>`).join('')}
        </select>
        <button class="ghost-button compact" data-billing-action="change-plan" type="button">Alterar plano</button>
        <button class="ghost-button compact" data-billing-action="reactivate" type="button">Reativar</button>
        <button class="danger-button compact" data-billing-action="cancel" type="button">Cancelar</button>
      </div>
    </article>
  `).join('') : '<p class="empty-state">Nenhuma assinatura encontrada para os filtros selecionados.</p>';
  els.platformSubscriptionList.querySelectorAll('[data-billing-action]').forEach((button) => {
    button.addEventListener('click', submitBillingAction);
  });
}

function renderBillingPlans() {
  if (!els.platformBillingPlanList) return;
  if (!state.billingLoaded && !state.billingLoading && !state.billingError) {
    els.platformBillingPlanList.innerHTML = '<p class="empty-state">A distribuição por plano aparece após carregar Billing.</p>';
    return;
  }
  const rows = state.billingPlans || [];
  const max = Math.max(1, ...rows.map((row) => Number(row.mrr_cents || 0)));
  els.platformBillingPlanList.innerHTML = rows.length ? rows.map((row) => `
    <article class="platform-plan-mrr-row">
      <div>
        <strong>${escapeHtml(row.name)}</strong>
        <small>${Number(row.active_subscriptions || 0)} assinatura(s) · ${moneyCents(row.monthly_price_cents)}</small>
      </div>
      <span>${moneyCents(row.mrr_cents)}</span>
      <i style="width:${Math.max(8, (Number(row.mrr_cents || 0) / max) * 100)}%"></i>
    </article>
  `).join('') : '<p class="empty-state">Nenhum plano ativo encontrado com os filtros atuais.</p>';
}

function renderBillingAddons() {
  if (!els.platformBillingAddonList) return;
  if (!state.billingLoaded && !state.billingLoading && !state.billingError) {
    els.platformBillingAddonList.innerHTML = '<p class="empty-state">Os adicionais aparecem após carregar Billing.</p>';
    return;
  }
  const rows = state.billingAddons || [];
  els.platformBillingAddonList.innerHTML = rows.length ? rows.slice(0, 12).map((row) => `
    <article class="platform-plan-mrr-row">
      <div>
        <strong>${escapeHtml(row.store_name || row.company_name || 'Loja')}</strong>
        <small>${escapeHtml(row.addon_name || 'Adicional')} · ${escapeHtml(subscriptionStatusLabel(row.status || 'unknown'))}</small>
      </div>
      <span>${moneyCents(row.price_cents)}</span>
      <small>Custo ${moneyCents(row.provider_cost_cents)} · margem ${moneyCents(row.estimated_margin_cents)}</small>
    </article>
  `).join('') : '<p class="empty-state">Nenhum adicional ativo ou pendente no momento.</p>';
}

function renderBillingEvents() {
  if (!els.platformBillingEventList) return;
  if (!state.billingLoaded && !state.billingLoading && !state.billingError) {
    els.platformBillingEventList.innerHTML = '<p class="empty-state">O histórico financeiro aparece após carregar Billing.</p>';
    return;
  }
  const rows = state.billingEvents || [];
  const renderEvent = (row) => `
    <article class="platform-billing-event-row">
      <div>
        <strong>${escapeHtml(row.label || row.event_type)}</strong>
        <small>${escapeHtml(row.company_name || 'Cliente')} · ${formatDateTime(row.created_at)}</small>
      </div>
      <span>${moneyCents(row.amount_cents)}</span>
      <em>${escapeHtml(row.provider || 'manual')}</em>
      <small>${escapeHtml(row.external_reference || row.plan_name || '-')}</small>
    </article>
  `;
  const visible = rows.slice(0, 5);
  const hidden = rows.slice(5);
  els.platformBillingEventList.innerHTML = rows.length ? `
    ${visible.map(renderEvent).join('')}
    ${hidden.length ? `
      <details class="platform-alert-expand platform-events-expand">
        <summary>
          <strong>Ver histórico financeiro completo</strong>
          <span>+${hidden.length}</span>
        </summary>
        <div>${hidden.map(renderEvent).join('')}</div>
      </details>
    ` : ''}
  ` : '<p class="empty-state">Sem eventos financeiros no período selecionado.</p>';
}

function renderBillingAlerts() {
  if (!els.platformBillingAlertList) return;
  if (!state.billingLoaded && !state.billingLoading && !state.billingError) {
    els.platformBillingAlertList.innerHTML = '<p class="empty-state">Alertas de cobrança aparecem após carregar Billing.</p>';
    return;
  }
  const alerts = state.billing?.alerts || [];
  const statuses = state.billing?.subscriptions_by_status || {};
  els.platformBillingAlertList.innerHTML = `
    <div class="platform-billing-status-grid">
      ${Object.entries(statuses).map(([status, count]) => `
        <article>
          <span>${escapeHtml(subscriptionStatusLabel(status))}</span>
          <strong>${Number(count || 0)}</strong>
        </article>
      `).join('') || '<p class="empty-state">Sem status de assinatura.</p>'}
    </div>
    ${alerts.length ? alerts.map((alert) => `
      <article class="platform-commercial-alert severity-${escapeAttribute(alert.severity)}">
        <strong>${escapeHtml(alert.title)}</strong>
        <small>${escapeHtml(alert.action || '')}</small>
      </article>
    `).join('') : '<p class="empty-state">Nenhum alerta financeiro crítico no momento.</p>'}
  `;
}

function renderCommunication() {
  if (!state.communicationLoaded && !state.communicationLoading) {
    if (els.smtpStatusText) els.smtpStatusText.textContent = 'Configurações SMTP ainda não carregadas.';
    if (els.platformEmailTemplateList) els.platformEmailTemplateList.innerHTML = '<p class="empty-state">Abra Comunicação para carregar SMTP e templates automáticos.</p>';
    return;
  }
  renderSmtpForm();
  renderPlatformWhatsappForm();
  renderEmailTemplates();
}

function renderSmtpForm() {
  if (!els.platformSmtpForm) return;
  const smtp = state.smtp || {};
  const form = els.platformSmtpForm;
  form.elements.host.value = smtp.host || '';
  form.elements.port.value = smtp.port || 587;
  form.elements.username.value = smtp.username || '';
  form.elements.password.value = '';
  form.elements.password.placeholder = smtp.has_password
    ? 'Senha/token já salvo. Preencha apenas para trocar.'
    : 'Informe a senha/token SMTP';
  form.elements.from_email.value = smtp.from_email || '';
  form.elements.from_name.value = smtp.from_name || '';
  form.elements.reply_to.value = smtp.reply_to || '';
  form.elements.use_tls.checked = smtp.use_tls !== false;
  form.elements.is_active.checked = smtp.is_active === true;
  if (els.smtpStatusText) {
    const status = smtp.last_test_status ? `Último teste: ${smtp.last_test_status}${smtp.last_test_at ? ` em ${formatDateTime(smtp.last_test_at)}` : ''}.` : 'Nenhum teste registrado.';
    els.smtpStatusText.textContent = `${smtp.has_password ? 'Senha/token configurado. ' : 'Senha/token ausente. '}${status}`;
  }
}

function renderPlatformWhatsappForm() {
  if (!els.platformWhatsappForm) return;
  const whatsapp = state.whatsappSettings || {};
  const form = els.platformWhatsappForm;
  form.elements.base_url.value = whatsapp.base_url || '';
  form.elements.api_key.value = '';
  form.elements.api_key.placeholder = whatsapp.has_api_key
    ? 'API key já salva. Preencha apenas para trocar.'
    : 'Cole a API key global da Evolution Go';
  form.elements.password.value = '';
  form.elements.is_active.checked = whatsapp.is_active === true;
  if (els.platformWhatsappWebhookUrl) {
    els.platformWhatsappWebhookUrl.textContent = whatsapp.webhook_url || '/api/integrations/evolution/webhook';
  }
  if (els.platformWhatsappStatusText) {
    const config = whatsapp.is_active && whatsapp.has_api_key && whatsapp.base_url ? 'Configurado' : 'Não configurado';
    const test = whatsapp.last_test_status ? ` Último teste: ${whatsapp.last_test_status}${whatsapp.last_test_at ? ` em ${formatDateTime(whatsapp.last_test_at)}` : ''}.` : '';
    els.platformWhatsappStatusText.textContent = `${config}. ${whatsapp.has_api_key ? 'API key salva e mascarada.' : 'API key ausente.'}${test}`;
  }
}

function renderEmailTemplates() {
  if (!els.platformEmailTemplateList) return;
  const templates = state.emailTemplates || [];
  els.platformEmailTemplateList.innerHTML = templates.length ? templates.map((template) => `
    <form class="platform-template-card" data-template-key="${escapeAttribute(template.template_key)}">
      <div class="section-actions compact-section-actions">
        <div>
          <p class="eyebrow">${escapeHtml(template.template_key)}</p>
          <h3>${escapeHtml(template.name)}</h3>
        </div>
        <label class="payment-option"><input name="is_active" type="checkbox" ${template.is_active !== false ? 'checked' : ''}> Ativo</label>
      </div>
      <label>Assunto<input name="subject" value="${escapeAttribute(template.subject || '')}"></label>
      <label>Corpo<textarea name="body" rows="5">${escapeHtml(template.body || '')}</textarea></label>
      <small class="muted">${(template.variables || []).map((item) => `{{${escapeHtml(item)}}}`).join(' ')}</small>
      <button class="ghost-button compact">Salvar template</button>
    </form>
  `).join('') : '<p class="empty-state">Nenhum template disponível. Crie a estrutura de e-mails antes de ativar envios automáticos.</p>';
  els.platformEmailTemplateList.querySelectorAll('.platform-template-card').forEach((form) => {
    form.addEventListener('submit', submitEmailTemplate);
  });
}

function renderSupport() {
  if (!els.platformSupportTicketList) return;
  const tickets = filteredSupportTickets();
  const queueStats = supportQueueStats(tickets);
  const allStats = supportQueueStats(state.supportTickets || []);
  renderSupportSummary(tickets);
  renderSupportInsights(tickets);
  renderSupportTabs();
  if (!state.supportLoaded && !state.supportLoading) {
    els.platformSupportTicketList.innerHTML = '<p class="empty-state">A fila de atendimento aparece aqui quando os chamados forem carregados.</p>';
    if (els.platformSupportDetail) els.platformSupportDetail.innerHTML = supportDetailEmptyState('Selecione um chamado para ver a conversa.');
    return;
  }
  if (state.supportLoading && !tickets.length) {
    els.platformSupportTicketList.innerHTML = '<p class="empty-state">Carregando fila de atendimento...</p>';
    if (els.platformSupportDetail) els.platformSupportDetail.innerHTML = supportDetailEmptyState('Carregando detalhes...');
    return;
  }
  if (!tickets.some((ticket) => ticket.id === state.selectedSupportTicketId)) {
    state.selectedSupportTicketId = tickets.find((ticket) => !['resolved', 'closed'].includes(ticket.status))?.id || tickets[0]?.id || null;
  }
  const queueHeader = `
    <div class="platform-support-list-header">
      <div>
        <strong>Fila · ${queueStats.total} chamado${queueStats.total === 1 ? '' : 's'}</strong>
      </div>
      <div aria-label="Resumo da fila">
        <span>${allStats.open} abertos</span>
        <span>${allStats.overdue} SLA</span>
      </div>
    </div>
  `;
  els.platformSupportTicketList.innerHTML = tickets.length ? queueHeader + tickets.map((ticket) => {
    const context = supportTicketContext(ticket);
    const sla = supportSla(ticket);
    const lastMessage = latestSupportMessage(ticket);
    const waiting = supportWaitingLabel(ticket);
    const ticketShortId = String(ticket.id || '').slice(0, 6).toUpperCase();
    const contactName = supportTicketContactName(ticket);
    const isUnread = supportNeedsAnswer(ticket);
    return `
    <button class="platform-support-list-item priority-${escapeAttribute(ticket.priority)} sla-${escapeAttribute(sla.status)} ${ticket.id === state.selectedSupportTicketId ? 'is-active' : ''}" type="button" data-support-ticket-id="${escapeAttribute(ticket.id)}">
        <span class="platform-ticket-avatar" aria-hidden="true">${escapeHtml(initials(contactName || ticket.company_name || ticket.subject || 'C'))}</span>
        <div class="platform-ticket-main">
        <div class="platform-ticket-kicker">
          <span>${escapeHtml(ticketShortId)}</span>
          <span>${escapeHtml(ticket.company_name || 'Sem empresa')}</span>
        </div>
        <strong class="platform-ticket-title">${escapeHtml(ticket.subject)}</strong>
        <div class="platform-ticket-subtitle">
          ${escapeHtml(ticket.store_name || 'Sem loja')} · ${escapeHtml(context.planName)}
        </div>
        ${contactName ? `<div class="platform-ticket-contact">Contato: ${escapeHtml(contactName)}</div>` : ''}
        <p class="platform-ticket-preview">${escapeHtml(supportMessagePreview(lastMessage) || 'Sem mensagens no chamado.')}</p>
        <div class="platform-ticket-meta">
          <span class="platform-sla-pill ${escapeAttribute(sla.status)}">${escapeHtml(sla.label)}</span>
          <span class="pill ${supportPriorityClass(ticket.priority)}">${escapeHtml(priorityLabel(ticket.priority))}</span>
          <span class="pill ${supportStatusClass(ticket.status)}">${escapeHtml(ticketStatusLabel(ticket.status))}</span>
          <span class="platform-ticket-date">${escapeHtml(formatDateShort(ticket.updated_at || ticket.created_at))}</span>
        </div>
        <small class="platform-ticket-subtitle">${escapeHtml(waiting)}</small>
        </div>
        ${isUnread ? '<i class="platform-ticket-unread" aria-hidden="true"></i>' : '<span></span>'}
    </button>
  `;
  }).join('') : '<p class="empty-state">Nenhum chamado encontrado. Revise busca, status, prioridade ou plano.</p>';
  els.platformSupportTicketList.querySelectorAll('[data-support-ticket-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedSupportTicketId = button.dataset.supportTicketId;
      renderSupport();
    });
  });
  renderSupportDetail(tickets.find((ticket) => ticket.id === state.selectedSupportTicketId) || null);
}

function renderSupportTabs() {
  els.platformSupportTabs.forEach((button) => button.classList.toggle('active', button.dataset.supportTab === state.supportActiveTab));
  els.platformSupportPanels.forEach((panel) => {
    const active = panel.dataset.supportPanel === state.supportActiveTab;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
}

function activateSupportTab(tab = 'queue') {
  state.supportActiveTab = tab;
  renderSupportTabs();
}

function renderSupportDetail(ticket) {
  if (!els.platformSupportDetail) return;
  if (!ticket) {
    els.platformSupportDetail.innerHTML = supportDetailEmptyState('Selecione um chamado para abrir a conversa.');
    return;
  }
  const context = supportTicketContext(ticket);
  const sla = supportSla(ticket);
  const lastMessage = latestSupportMessage(ticket);
  const age = supportTicketAge(ticket);
  const waiting = supportWaitingLabel(ticket);
  const contactName = supportTicketContactName(ticket);
  const clientTitle = ticket.store_name || ticket.company_name || contactName || 'Cliente';
  const clientSubtitle = ticket.company_name && ticket.store_name ? ticket.company_name : 'Cliente';
  els.platformSupportDetail.innerHTML = `
    <article class="platform-support-detail-main">
      <section class="platform-support-workarea">
        <div class="platform-support-detail-header">
          <div>
            <p class="eyebrow">Chamado selecionado</p>
            <h3>${escapeHtml(ticket.subject)}</h3>
            <p>#${escapeHtml(String(ticket.id || '').slice(0, 8).toUpperCase())} · ${escapeHtml(ticket.company_name || 'Sem empresa')} ${ticket.store_name ? `· ${escapeHtml(ticket.store_name)}` : ''} · ${escapeHtml(ticket.category || 'sem categoria')}</p>
            <div class="platform-support-header-chips">
              ${contactName ? `<p class="platform-support-contact-chip"><span>Contato</span>${escapeHtml(contactName)}</p>` : ''}
              <span class="platform-sla-pill ${escapeAttribute(sla.status)}">${escapeHtml(sla.hint)}</span>
              <span class="pill ${supportPriorityClass(ticket.priority)}">${escapeHtml(priorityLabel(ticket.priority))}</span>
              <span class="pill ${supportStatusClass(ticket.status)}">${escapeHtml(ticketStatusLabel(ticket.status))}</span>
            </div>
          </div>
        </div>
        <article class="platform-support-thread">
          <div class="section-actions compact-section-actions">
            <div>
              <h4>Conversa</h4>
              <p class="muted">Última mensagem: ${escapeHtml(lastMessage ? formatDateTime(lastMessage.created_at) : 'sem mensagens')}</p>
            </div>
          </div>
          <div class="platform-support-messages">
            ${(ticket.messages || []).length ? ticket.messages.map((message) => renderPlatformSupportMessage(message, ticket)).join('') : '<p class="empty-state">Este chamado ainda não tem mensagens carregadas.</p>'}
          </div>
          <form class="platform-support-message-form" data-ticket-id="${escapeAttribute(ticket.id)}">
            <div class="platform-support-reply-mode" role="group" aria-label="Tipo de resposta">
              <button class="active" type="button" data-reply-mode="customer">Responder cliente</button>
              <button type="button" data-reply-mode="internal">Nota interna</button>
            </div>
            <input name="is_internal" type="hidden" value="false">
            <button class="support-template-toggle" type="button" data-support-template-toggle aria-label="Abrir respostas rápidas">
              <span aria-hidden="true"></span>
              <span aria-hidden="true"></span>
              <span aria-hidden="true"></span>
            </button>
            <div class="support-template-popover" hidden>
              <strong>Respostas rápidas</strong>
              <div>
                ${supportQuickReplyButtons()}
              </div>
            </div>
            <textarea name="message" rows="5" required placeholder="Escreva uma resposta clara e objetiva para o cliente"></textarea>
            <div class="row-actions">
              <button class="ghost-button compact" type="button" data-support-quick-status="waiting_customer">Marcar aguardando cliente</button>
              <button class="ghost-button compact danger-text" type="button" data-support-quick-status="closed">Encerrar atendimento</button>
              <button class="primary-button compact" type="submit">Enviar resposta</button>
            </div>
          </form>
        </article>
      </section>
      <aside class="platform-support-context">
          <div class="platform-support-context-head support-client-profile">
            <span class="platform-ticket-avatar" aria-hidden="true">${escapeHtml(initials(clientTitle))}</span>
            <div>
              <h4>${escapeHtml(clientTitle)}</h4>
              <span>${escapeHtml(clientSubtitle)}</span>
            </div>
          </div>
          <section class="platform-support-context-box support-action-box">
            <h5>Ações rápidas</h5>
            <div class="support-fast-actions">
              ${context.storeSlug ? `<a class="ghost-button compact" href="/${escapeAttribute(context.storeSlug)}" target="_blank" rel="noopener">Abrir cardápio</a>` : ''}
              ${ticket.company_id ? `<button class="ghost-button compact" data-support-open-client="${escapeAttribute(ticket.company_id)}" type="button">Ver cliente</button>` : ''}
              ${ticket.store_id ? `<button class="ghost-button compact" data-support-impersonate-store="${escapeAttribute(ticket.store_id)}" type="button">Entrar como suporte</button>` : ''}
            </div>
          </section>
          <section class="platform-support-context-box">
            <h5>Comercial</h5>
            <div>
              <span>Plano</span><strong>${escapeHtml(context.planName)}</strong>
              <span>Assinatura</span><strong>${escapeHtml(context.subscriptionStatus)}</strong>
              <span>Trial</span><strong>${escapeHtml(context.trialLabel)}</strong>
              <span>Faturamento/mês</span><strong>${moneyCents(context.revenueMonthCents, context.revenueMonth)}</strong>
            </div>
          </section>
          <section class="platform-support-context-box">
            <h5>Operação</h5>
            <div>
              <span>Loja</span><strong>${escapeHtml(context.storeStatus)}</strong>
              <span>WhatsApp</span><strong>${escapeHtml(context.whatsappLabel)}</strong>
              <span>Lojas</span><strong>${Number(context.storesCount || 0)}</strong>
              <span>Produtos</span><strong>${Number(context.productsCount || 0)}</strong>
              <span>Pedidos/mês</span><strong>${Number(context.ordersMonth || 0)}</strong>
            </div>
          </section>
          <section class="platform-support-context-box">
            <h5>Atividade</h5>
            <div>
              <span>Último pedido</span><strong>${escapeHtml(context.lastOrderLabel)}</strong>
              <span>Último acesso</span><strong>${escapeHtml(context.lastAccessLabel)}</strong>
              <span>Aberto há</span><strong>${escapeHtml(age)}</strong>
              <span>Responsável</span><strong>${escapeHtml(ticket.assigned_to_admin_name || 'Sem responsável')}</strong>
            </div>
          </section>
          <form class="platform-support-update" data-ticket-id="${escapeAttribute(ticket.id)}">
            <p class="eyebrow">Status do atendimento</p>
            <select name="status">${supportStatusOptions(ticket.status)}</select>
            <select name="priority">${supportPriorityOptions(ticket.priority)}</select>
            <select name="assigned_to_admin_id">
              <option value="">Sem responsável</option>
              ${supportAssigneeOptions(ticket.assigned_to_admin_id)}
            </select>
            <button class="ghost-button compact">Salvar atendimento</button>
          </form>
      </aside>
    </article>
  `;
  els.platformSupportDetail.querySelectorAll('.platform-support-update').forEach((form) => form.addEventListener('submit', submitSupportTicketUpdate));
  els.platformSupportDetail.querySelectorAll('[data-reply-mode]').forEach((button) => {
    button.addEventListener('click', () => setSupportReplyMode(button));
  });
  els.platformSupportDetail.querySelectorAll('[data-support-template-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const popover = button.closest('form')?.querySelector('.support-template-popover');
      if (!popover) return;
      popover.hidden = !popover.hidden;
    });
  });
  els.platformSupportDetail.querySelectorAll('[data-support-quick-reply]').forEach((button) => {
    button.addEventListener('click', () => {
      insertSupportQuickReply(button.dataset.supportQuickReply || '');
      const popover = button.closest('.support-template-popover');
      if (popover) popover.hidden = true;
    });
  });
  els.platformSupportDetail.querySelectorAll('[data-support-impersonate-store]').forEach((button) => {
    button.addEventListener('click', () => openSupportImpersonation(button.dataset.supportImpersonateStore));
  });
  els.platformSupportDetail.querySelectorAll('[data-support-open-client]').forEach((button) => {
    button.addEventListener('click', () => openSupportClient(button.dataset.supportOpenClient));
  });
  els.platformSupportDetail.querySelectorAll('[data-support-quick-status]').forEach((button) => {
    button.addEventListener('click', () => quickUpdateSupportTicket(ticket.id, button.dataset.supportQuickStatus));
  });
}

function supportDetailEmptyState(message) {
  return `<div class="platform-support-detail-empty"><strong>${escapeHtml(message)}</strong><p>Escolha um item da fila para responder, adicionar nota interna e ver dados comerciais do cliente.</p></div>`;
}

function supportQueueStats(tickets = []) {
  return tickets.reduce((acc, ticket) => {
    const isClosed = ['resolved', 'closed'].includes(ticket.status);
    const sla = supportSla(ticket);
    acc.total += 1;
    if (!isClosed) acc.open += 1;
    if (supportNeedsAnswer(ticket)) acc.waitingSupport += 1;
    if (sla.status === 'overdue') acc.overdue += 1;
    return acc;
  }, { total: 0, open: 0, waitingSupport: 0, overdue: 0 });
}

function setSupportReplyMode(button) {
  const form = button.closest('.platform-support-message-form');
  if (!form) return;
  const isInternal = button.dataset.replyMode === 'internal';
  form.querySelectorAll('[data-reply-mode]').forEach((item) => item.classList.toggle('active', item === button));
  form.elements.is_internal.value = isInternal ? 'true' : 'false';
  form.querySelector('textarea').placeholder = isInternal ? 'Registre uma nota interna que o cliente não verá' : 'Escreva uma resposta clara e objetiva para o cliente';
  form.querySelector('button.primary-button').textContent = isInternal ? 'Salvar nota interna' : 'Enviar resposta';
}

function renderSupportSummary(tickets = []) {
  if (!els.platformSupportSummaryGrid) return;
  const total = tickets.length;
  const open = tickets.filter((ticket) => !['resolved', 'closed'].includes(ticket.status)).length;
  const critical = tickets.filter((ticket) => ticket.priority === 'critical' && !['resolved', 'closed'].includes(ticket.status)).length;
  const waitingSupport = tickets.filter((ticket) => supportNeedsAnswer(ticket)).length;
  const waiting = tickets.filter((ticket) => ticket.status === 'waiting_customer').length;
  const inReview = tickets.filter((ticket) => ticket.status === 'in_review').length;
  const resolvedToday = tickets.filter((ticket) => ['resolved', 'closed'].includes(ticket.status) && isToday(ticket.updated_at)).length;
  const resolvedTotal = tickets.filter((ticket) => ['resolved', 'closed'].includes(ticket.status)).length;
  const overdue = tickets.filter((ticket) => supportSla(ticket).status === 'overdue').length;
  const averageFirstResponse = supportAverageFirstResponse(tickets);
  const averageResolution = supportAverageResolution(tickets);
  const resolutionRate = total ? Math.round((resolvedTotal / total) * 100) : 0;
  const waitingRate = open ? Math.round((waitingSupport / open) * 100) : 0;
  const items = [
    ['Chamados totais', total, 'Base filtrada da fila', 'neutral', 100],
    ['Abertos', open, 'Em atendimento agora', 'info', total ? (open / total) * 100 : 0],
    ['Aguardando suporte', waitingSupport, `${waitingRate}% dos abertos`, waitingSupport ? 'warning' : 'ok', waitingRate],
    ['SLA vencido', overdue, 'Fora do prazo de resposta', overdue ? 'danger' : 'ok', open ? (overdue / open) * 100 : 0],
    ['Críticos', critical, 'Prioridade máxima', critical ? 'danger' : 'neutral', open ? (critical / open) * 100 : 0],
    ['Aguardando cliente', waiting, 'Dependem do lojista', 'muted', open ? (waiting / open) * 100 : 0],
    ['Em análise', inReview, 'Investigação interna', 'info', open ? (inReview / open) * 100 : 0],
    ['Resolvidos hoje', resolvedToday, 'Concluídos no dia', 'ok', resolvedTotal ? (resolvedToday / resolvedTotal) * 100 : 0],
    ['Taxa de resolução', `${resolutionRate}%`, `${resolvedTotal} encerrado(s)`, resolutionRate >= 60 ? 'ok' : 'muted', resolutionRate],
    ['Primeira resposta', averageFirstResponse, 'Tempo médio até responder', 'muted', 0],
    ['Resolução', averageResolution, 'Tempo médio até concluir', 'muted', 0]
  ];
  els.platformSupportSummaryGrid.innerHTML = items.map(([label, value, hint, tone, progress]) => `
    <article class="platform-kpi-card support-kpi-${escapeAttribute(tone)}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value ?? 0)}</strong>
      <p>${escapeHtml(hint)}</p>
      <i style="--value:${Math.max(0, Math.min(100, Math.round(Number(progress || 0))))}%"></i>
    </article>
  `).join('');
}

function renderSupportInsights(tickets = []) {
  if (!els.platformSupportInsights) return;
  const openTickets = tickets.filter((ticket) => !['resolved', 'closed'].includes(ticket.status));
  const categoryRows = supportDistribution(tickets, (ticket) => ticket.category || 'Sem categoria').slice(0, 5);
  const priorityRows = supportDistribution(tickets, (ticket) => priorityLabel(ticket.priority)).slice(0, 4);
  const statusRows = supportDistribution(tickets, (ticket) => ticketStatusLabel(ticket.status)).slice(0, 5);
  const topClients = supportDistribution(openTickets, (ticket) => ticket.company_name || 'Sem empresa').slice(0, 5);
  els.platformSupportInsights.innerHTML = [
    supportInsightCard('Status dos chamados', 'Distribuição da fila por etapa de atendimento.', statusRows, tickets.length),
    supportInsightCard('Prioridades', 'Peso operacional dos chamados por criticidade.', priorityRows, tickets.length),
    supportInsightCard('Categorias mais comuns', 'Assuntos que mais geram demanda de suporte.', categoryRows, tickets.length),
    supportInsightCard('Clientes com chamados abertos', 'Clientes que mais precisam de atenção agora.', topClients, openTickets.length)
  ].join('');
}

function supportDistribution(items, getKey) {
  const counts = new Map();
  for (const item of items || []) {
    const key = cleanDisplayValue(getKey(item)) || 'Sem dado';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function supportInsightCard(title, description, rows, total) {
  return `
    <article class="platform-support-insight-card">
      <div>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(description)}</p>
      </div>
      ${rows.length ? rows.map((row) => {
        const percent = total ? Math.round((row.count / total) * 100) : 0;
        return `
          <div class="platform-support-insight-row">
            <span>${escapeHtml(row.label)}</span>
            <strong>${Number(row.count)} <small>${percent}%</small></strong>
            <i style="--value:${Math.max(4, percent)}%"></i>
          </div>
        `;
      }).join('') : '<p class="empty-state">Sem dados suficientes para montar este indicador.</p>'}
    </article>
  `;
}

function filteredSupportTickets() {
  const search = normalizeSearch(els.supportSearchFilter?.value || '');
  const statusFilter = els.supportStatusFilter?.value || '';
  const priorityFilter = els.supportPriorityFilter?.value || '';
  const slaFilter = els.supportSlaFilter?.value || '';
  const planFilter = els.supportPlanFilter?.value || '';
  const priorityWeight = { critical: 0, high: 1, medium: 2, low: 3 };
  return (state.supportTickets || [])
    .filter((ticket) => {
      if (!statusFilter) return true;
      if (statusFilter === 'unresolved') return !['resolved', 'closed'].includes(ticket.status);
      return ticket.status === statusFilter;
    })
    .filter((ticket) => !priorityFilter || ticket.priority === priorityFilter)
    .filter((ticket) => {
      if (!search) return true;
      const haystack = normalizeSearch([
        ticket.subject,
        ticket.category,
        ticket.company_name,
        ticket.store_name,
        supportTicketContactName(ticket),
        ticket.assigned_to_admin_name,
        ...(ticket.messages || []).map((message) => message.message)
      ].join(' '));
      return haystack.includes(search);
    })
    .filter((ticket) => {
      if (!slaFilter) return true;
      const sla = supportSla(ticket);
      if (slaFilter === 'unanswered') return supportNeedsAnswer(ticket);
      return sla.status === slaFilter;
    })
    .filter((ticket) => {
      if (!planFilter) return true;
      return supportTicketContext(ticket).planCode === planFilter;
    })
    .sort((a, b) => {
      const aSla = supportSla(a);
      const bSla = supportSla(b);
      const slaWeight = { overdue: 0, due_soon: 1, ok: 2, closed: 3 };
      return (slaWeight[aSla.status] ?? 4) - (slaWeight[bSla.status] ?? 4)
        || (priorityWeight[a.priority] ?? 4) - (priorityWeight[b.priority] ?? 4)
        || new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime();
    });
}

function supportTicketContext(ticket) {
  const company = state.companies.find((item) => item.id === ticket.company_id);
  const stores = company?.stores || [];
  const store = stores.find((item) => item.id === ticket.store_id) || stores[0] || null;
  const subscription = company?.subscription || {};
  const plan = state.plans.find((item) => item.id === subscription.plan_id || item.code === subscription.plan_code);
  const metrics = company ? companyMetrics(company.id) : {};
  const settings = store?.settings || {};
  const trialEndsAt = subscription.trial_ends_at || metrics.trial_ends_at || null;
  return {
    planCode: plan?.code || metrics.plan_code || '',
    planName: plan?.name || metrics.plan_name || 'Sem plano',
    subscriptionStatus: subscription.status || metrics.subscription_status || company?.status || 'sem assinatura',
    trialLabel: trialEndsAt ? formatDateTime(trialEndsAt) : 'Sem trial',
    storeStatus: store ? `${store.is_active === false ? 'Não publicada' : 'Publicada'} · ${settings.is_open === false ? 'Fechada' : 'Aberta'}` : 'Sem loja',
    whatsappLabel: metrics.stores_without_whatsapp_count > 0 ? 'Pendente' : 'Configurado',
    storesCount: metrics.stores_count || stores.length || 0,
    productsCount: metrics.products_count || 0,
    ordersMonth: metrics.orders_month || 0,
    revenueMonth: metrics.revenue_month || 0,
    revenueMonthCents: metrics.revenue_month_cents || 0,
    lastAccessLabel: metrics.last_access_at ? formatDateTime(metrics.last_access_at) : 'Sem acesso',
    lastOrderLabel: metrics.last_order_at ? formatDateTime(metrics.last_order_at) : 'Sem pedido',
    storeSlug: store?.slug || ''
  };
}

function cleanDisplayValue(value) {
  return String(value || '').trim();
}

function latestSupportMessage(ticket) {
  const messages = ticket.messages || [];
  return messages.length ? messages[messages.length - 1] : null;
}

function supportMessagePreview(message) {
  if (!message) return '';
  const parsed = parseSupportMessage(message.message || '');
  return parsed.body || parsed.contact || '';
}

function supportTicketContactName(ticket) {
  const messages = ticket.messages || [];
  const customerMessage = messages.find((message) => !message.is_internal && message.author_type !== 'support');
  const parsed = parseSupportMessage(customerMessage?.message || '');
  return cleanDisplayValue(parsed.contact || ticket.contact_name || ticket.customer_name || '');
}

function parseSupportMessage(text = '') {
  const value = String(text || '').trim();
  const match = value.match(/^Contato:\s*(.+?)(?:\n{2,}|\r\n{2,})([\s\S]*)$/i);
  if (!match) return { contact: '', body: value };
  return { contact: match[1].trim(), body: match[2].trim() };
}

function renderPlatformSupportMessage(message, ticket = null) {
  const parsed = parseSupportMessage(message.message || '');
  const type = message.is_internal ? 'internal' : message.author_type === 'support' ? 'support' : 'customer';
  const author = type === 'support'
    ? 'Equipe de suporte'
    : type === 'internal'
      ? (message.author_name || 'Nota interna')
      : (parsed.contact || supportTicketContactName(ticket || {}) || message.author_name || 'Cliente');
  return `
    <article class="platform-support-message ${escapeAttribute(type)}">
      <span class="support-message-avatar ${type === 'support' ? 'support' : 'client'}" aria-hidden="true">${escapeHtml(initials(author))}</span>
      <div class="support-message-bubble">
        <div class="support-message-head">
          <strong>${escapeHtml(author)}</strong>
          <small>${formatDateTime(message.created_at)}${message.is_internal ? ' · nota interna' : ''}</small>
        </div>
        <p class="support-message-text">${escapeHtml(parsed.body)}</p>
      </div>
    </article>
  `;
}

function supportTicketAge(ticket) {
  return durationLabel(Date.now() - new Date(ticket.created_at || Date.now()).getTime());
}

function supportWaitingLabel(ticket) {
  if (['resolved', 'closed'].includes(ticket.status)) return 'Encerrado';
  const last = latestSupportMessage(ticket);
  if (!last) return 'Sem mensagem';
  const prefix = supportNeedsAnswer(ticket) ? 'Sem resposta há' : 'Última resposta há';
  return `${prefix} ${durationLabel(Date.now() - new Date(last.created_at || ticket.created_at || Date.now()).getTime())}`;
}

function supportPriorityClass(priority) {
  if (priority === 'critical') return 'pill-danger';
  if (priority === 'high') return 'pill-warning';
  if (priority === 'low') return 'pill-ok';
  return 'pill-muted';
}

function supportStatusClass(status) {
  if (['resolved', 'closed'].includes(status)) return 'pill-ok';
  if (status === 'in_review') return 'pill-warning';
  if (status === 'waiting_customer') return 'pill-info';
  return 'pill-muted';
}

function supportNeedsAnswer(ticket) {
  if (['resolved', 'closed', 'waiting_customer'].includes(ticket.status)) return false;
  const last = latestSupportMessage(ticket);
  if (!last) return true;
  return last.author_type !== 'support' && !last.is_internal;
}

function supportSla(ticket) {
  if (['resolved', 'closed'].includes(ticket.status)) return { status: 'closed', label: 'Resolvido', hint: 'Chamado encerrado' };
  const hoursByPriority = { critical: 1, high: 4, medium: 24, low: 48 };
  const limitHours = hoursByPriority[ticket.priority] || 24;
  const base = new Date(ticket.last_message_at || ticket.updated_at || ticket.created_at || Date.now()).getTime();
  const elapsedHours = Math.max(0, (Date.now() - base) / 3600000);
  const remaining = limitHours - elapsedHours;
  if (supportNeedsAnswer(ticket) && remaining <= 0) return { status: 'overdue', label: 'SLA vencido', hint: `${Math.ceil(Math.abs(remaining))}h atrasado` };
  if (supportNeedsAnswer(ticket) && remaining <= Math.max(1, limitHours * 0.25)) return { status: 'due_soon', label: 'Perto de vencer', hint: `${Math.max(1, Math.ceil(remaining))}h restantes` };
  return { status: 'ok', label: 'Dentro do prazo', hint: supportNeedsAnswer(ticket) ? `${Math.ceil(remaining)}h restantes` : 'Aguardando cliente' };
}

function supportAverageFirstResponse(tickets = []) {
  const values = tickets.map(firstSupportResponseMs).filter((value) => value !== null);
  if (!values.length) return '-';
  return durationLabel(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function supportAverageResolution(tickets = []) {
  const values = tickets
    .filter((ticket) => ['resolved', 'closed'].includes(ticket.status))
    .map((ticket) => new Date(ticket.updated_at || 0).getTime() - new Date(ticket.created_at || 0).getTime())
    .filter((value) => Number.isFinite(value) && value >= 0);
  if (!values.length) return '-';
  return durationLabel(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function firstSupportResponseMs(ticket) {
  const created = new Date(ticket.created_at || 0).getTime();
  const first = (ticket.messages || []).find((message) => message.author_type === 'support' && !message.is_internal);
  if (!created || !first) return null;
  return Math.max(0, new Date(first.created_at || 0).getTime() - created);
}

function isToday(value) {
  if (!value) return false;
  const date = new Date(value);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
}

function supportAssigneeOptions(selected = '') {
  const admins = new Map();
  for (const company of state.companies || []) {
    for (const admin of company.admins || []) {
      admins.set(admin.id, admin);
    }
  }
  if (state.admin?.id) admins.set(state.admin.id, state.admin);
  return [...admins.values()].map((admin) => `
    <option value="${escapeAttribute(admin.id)}" ${admin.id === selected ? 'selected' : ''}>${escapeHtml(admin.name || admin.email)}</option>
  `).join('');
}

const SUPPORT_QUICK_REPLIES = [
  ['WhatsApp', 'Olá {{company_name}}, para configurar o WhatsApp acesse Configurações da Loja > Atendimento e pedidos, informe o número com DDI/DDD e salve. Depois faça um pedido de teste para validar.'],
  ['Publicar cardápio', 'Olá {{company_name}}, para publicar o cardápio conclua o onboarding ou acesse Configurações da Loja, revise dados, horário, pagamentos e clique em salvar/publicar. Link: {{cardapio_url}}'],
  ['Cadastrar produto', 'Olá {{company_name}}, para cadastrar um produto acesse Cardápio > Produtos, clique em Novo produto, selecione a categoria, informe nome, preço e disponibilidade. Depois salve e confira no cardápio público.'],
  ['Configurar Pix', 'Olá {{company_name}}, para ativar Pix acesse Configurações da Loja > Integrações/Pagamentos, confira a chave ou provedor configurado e faça um pedido de teste antes de vender.'],
  ['Onboarding', 'Olá {{company_name}}, percebi que a configuração inicial pode estar incompleta. Abra o onboarding pelo painel para revisar loja, operação, pagamento, entrega e primeiro produto.'],
  ['Alterar plano', 'Olá {{company_name}}, sua loja está no plano {{plan_name}}. Se precisar de mais recursos, posso revisar o plano ideal para sua operação e orientar o upgrade.'],
  ['Pedido teste', 'Olá {{company_name}}, recomendo abrir o cardápio público, adicionar um produto, finalizar um pedido teste e conferir se ele aparece em Pedidos no painel.'],
  ['Domínio', 'Olá {{company_name}}, para configurar domínio próprio, cadastre o domínio em Configurações da Loja > Domínio personalizado e aponte o DNS conforme instruções exibidas.'],
  ['Pagamento', 'Olá {{company_name}}, vou verificar os eventos de cobrança e o retorno do provedor. Se houver pagamento pendente, enviarei o link seguro para regularização.']
];

const SUPPORT_QUICK_REPLY_STORAGE_KEY = 'platform_support_quick_replies_v1';

function defaultSupportQuickReplies() {
  return SUPPORT_QUICK_REPLIES.map(([label, text], index) => ({
    id: `default-${index + 1}`,
    label,
    text
  }));
}

function normalizeSupportQuickReply(template, index = 0) {
  if (!template) return null;
  const label = String(template.label || template.name || '').trim();
  const text = String(template.text || template.message || template.value || '').trim();
  if (!label || !text) return null;
  return {
    id: String(template.id || `template-${Date.now()}-${index}`),
    label,
    text
  };
}

function getSupportQuickReplies() {
  try {
    const saved = localStorage.getItem(SUPPORT_QUICK_REPLY_STORAGE_KEY);
    if (!saved) return defaultSupportQuickReplies();
    const parsed = JSON.parse(saved);
    const templates = Array.isArray(parsed)
      ? parsed.map((item, index) => normalizeSupportQuickReply(item, index)).filter(Boolean)
      : [];
    return templates.length ? templates : defaultSupportQuickReplies();
  } catch (error) {
    console.warn('Não foi possível carregar os templates de suporte.', error);
    return defaultSupportQuickReplies();
  }
}

function saveSupportQuickReplies(templates) {
  localStorage.setItem(SUPPORT_QUICK_REPLY_STORAGE_KEY, JSON.stringify(templates));
}

function supportQuickReplyId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `template-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function supportQuickReplyOptions() {
  return getSupportQuickReplies().map(({ label, text }) => `
    <option value="${escapeAttribute(text)}">${escapeHtml(label)}</option>
  `).join('');
}

function supportQuickReplyButtons() {
  const templates = getSupportQuickReplies();
  if (!templates.length) {
    return '<span class="support-template-empty-mini">Nenhum template cadastrado.</span>';
  }
  return templates.map(({ label, text }) => `
    <button type="button" data-support-quick-reply="${escapeAttribute(text)}">${escapeHtml(label)}</button>
  `).join('');
}

function renderSupportQuickReplies() {
  if (!els.supportQuickReplies) return;
  const templates = getSupportQuickReplies();
  els.supportQuickReplies.innerHTML = `
    <form class="support-template-editor" data-support-template-form>
      <input type="hidden" name="id">
      <label>
        <span>Nome do template</span>
        <input name="label" type="text" maxlength="48" placeholder="Ex: Configurar WhatsApp" required>
      </label>
      <label>
        <span>Mensagem</span>
        <textarea name="text" rows="5" maxlength="1200" placeholder="Escreva a resposta pronta para o cliente." required></textarea>
      </label>
      <div class="support-template-editor-actions">
        <button class="primary-button compact" type="submit">Salvar template</button>
        <button class="ghost-button compact" type="button" data-support-template-cancel hidden>Cancelar edição</button>
      </div>
    </form>
    <div class="support-template-list">
      ${templates.map((template) => `
        <article class="support-template-row">
          <div>
            <strong>${escapeHtml(template.label)}</strong>
            <p>${escapeHtml(template.text)}</p>
          </div>
          <div class="support-template-row-actions">
            <button class="ghost-button compact" type="button" data-support-template-edit="${escapeAttribute(template.id)}">Editar</button>
            <button class="ghost-button compact danger-text" type="button" data-support-template-delete="${escapeAttribute(template.id)}">Excluir</button>
          </div>
        </article>
      `).join('') || `
        <div class="support-template-empty">
          <strong>Nenhum template cadastrado.</strong>
          <span>Adicione uma resposta rápida para usar dentro dos chamados.</span>
        </div>
      `}
    </div>
  `;

  const form = els.supportQuickReplies.querySelector('[data-support-template-form]');
  const cancelButton = els.supportQuickReplies.querySelector('[data-support-template-cancel]');

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const id = String(formData.get('id') || '').trim();
    const label = String(formData.get('label') || '').trim();
    const text = String(formData.get('text') || '').trim();
    if (!label || !text) {
      toast('Informe nome e mensagem do template.');
      return;
    }
    const current = getSupportQuickReplies();
    const next = id
      ? current.map((item) => (item.id === id ? { ...item, label, text } : item))
      : [{ id: supportQuickReplyId(), label, text }, ...current];
    saveSupportQuickReplies(next);
    renderSupportQuickReplies();
    toast(id ? 'Template atualizado.' : 'Template criado.');
  });

  cancelButton?.addEventListener('click', () => {
    form.reset();
    const idInput = form.elements.namedItem('id');
    if (idInput) idInput.value = '';
    cancelButton.hidden = true;
  });

  els.supportQuickReplies.querySelectorAll('[data-support-template-edit]').forEach((button) => {
    button.addEventListener('click', () => {
      const template = getSupportQuickReplies().find((item) => item.id === button.dataset.supportTemplateEdit);
      if (!template || !form) return;
      form.elements.namedItem('id').value = template.id;
      form.elements.namedItem('label').value = template.label;
      form.elements.namedItem('text').value = template.text;
      if (cancelButton) cancelButton.hidden = false;
      form.elements.namedItem('label').focus();
    });
  });

  els.supportQuickReplies.querySelectorAll('[data-support-template-delete]').forEach((button) => {
    button.addEventListener('click', () => {
      const template = getSupportQuickReplies().find((item) => item.id === button.dataset.supportTemplateDelete);
      if (!template) return;
      const confirmed = window.confirm(`Excluir o template "${template.label}"?`);
      if (!confirmed) return;
      saveSupportQuickReplies(getSupportQuickReplies().filter((item) => item.id !== template.id));
      renderSupportQuickReplies();
      toast('Template excluído.');
    });
  });
}

function insertSupportQuickReply(template) {
  if (state.supportActiveTab !== 'queue') activateSupportTab('queue');
  const textarea = els.platformSupportDetail?.querySelector('.platform-support-message-form textarea');
  if (!textarea) {
    toast('Selecione um chamado para inserir uma resposta rápida.');
    return;
  }
  const ticket = (state.supportTickets || []).find((item) => item.id === state.selectedSupportTicketId);
  const context = ticket ? supportTicketContext(ticket) : {};
  const text = template
    .replaceAll('{{company_name}}', ticket?.company_name || 'cliente')
    .replaceAll('{{store_name}}', ticket?.store_name || 'loja')
    .replaceAll('{{plan_name}}', context.planName || 'plano atual')
    .replaceAll('{{dashboard_url}}', externalUrl(PANEL_BASE_URL, '/'))
    .replaceAll('{{cardapio_url}}', context.storeSlug ? externalUrl(PUBLIC_SITE_BASE_URL, `/${context.storeSlug}`) : externalUrl(PUBLIC_SITE_BASE_URL, '/cardapio'));
  textarea.value = textarea.value ? `${textarea.value}\n\n${text}` : text;
  textarea.focus();
}

async function openSupportClient(companyId) {
  const company = state.companies.find((item) => item.id === companyId);
  await activatePlatformView('clients', { load: true });
  const search = els.clientFilterForm?.querySelector('input[name="search"]');
  if (search && company) {
    search.value = company.name || company.billing_email || '';
    renderCompanies();
    search.focus();
  }
}

async function openSupportImpersonation(storeId) {
  const confirmation = await requestDangerConfirmation(
    'Entrar como suporte',
    'Você vai abrir uma sessão temporária no admin desta loja. A ação será auditada.'
  );
  if (!confirmation) return;
  try {
    await request('/api/platform/support/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id: storeId, confirmation: confirmation.confirmation, password: confirmation.password })
    });
    window.location.href = externalUrl(PANEL_BASE_URL, '/');
  } catch (error) {
    toast(error.message || 'Não foi possível entrar como suporte.');
  }
}

function renderServiceCards(services = {}) {
  if (!els.platformServicesGrid) return;
  const memory = services.application?.memory || {};
  const storage = services.storage_usage || {};
  const retention = services.retention || {};
  const latestCleanup = storage.latest_cleanup;
  const serviceControlEnabled = services.permissions?.service_control_enabled === true;
  const backup = services.backups || {};
  const smtp = services.smtp || {};
  const webhook = services.webhooks || {};
  const jobs = services.jobs || {};
  const rows = [
    {
      label: 'Runtime da aplicação',
      status: services.application?.status || 'unknown',
      value: services.application?.service_name || 'cardapio.service',
      detail: `Uptime: ${durationLabel((services.application?.uptime_seconds || 0) * 1000)} · Memória: ${formatBytes(memory.rss || 0)}`
    },
    {
      label: 'Banco PostgreSQL',
      status: services.database?.status || 'unknown',
      value: services.database?.latency_ms !== null && services.database?.latency_ms !== undefined ? `${services.database.latency_ms} ms` : statusLabelHealth(services.database?.status),
      detail: services.database?.message || 'Verificação de conexão atual.'
    },
    {
      label: 'SMTP/e-mail',
      status: smtp.status || 'unknown',
      value: smtp.is_active ? 'Ativo' : 'Atenção',
      detail: smtp.last_test_status
        ? `${smtp.message || 'SMTP configurado.'} Último teste: ${smtp.last_test_status}${smtp.last_test_at ? ` em ${formatDateTime(smtp.last_test_at)}` : ''}.`
        : smtp.message || 'Configuração de e-mail operacional.'
    },
    {
      label: 'Backup',
      status: backupHealthTone(backup.status),
      value: backup.latest?.created_at ? formatDateTime(backup.latest.created_at) : backupStatusLabel(backup.status),
      detail: backup.latest?.file
        ? `${backup.latest.file} · ${formatBytes(backup.latest.size_bytes)} · ${Number(backup.retention_days || 7)}d de retenção`
        : backup.error || 'Nenhum arquivo de backup local registrado.'
    },
    {
      label: 'Webhooks',
      status: webhook.status || 'unknown',
      value: webhook.recent_failures ? `${Number(webhook.recent_failures)} falha(s)` : 'Sem falhas recentes',
      detail: `${Number(webhook.recent_events || 0)} evento(s) recente(s)${webhook.last_event_at ? ` · último em ${formatDateTime(webhook.last_event_at)}` : ''}.`
    },
    {
      label: 'Jobs/rotinas',
      status: Object.values(jobs).some((job) => ['failed', 'error'].includes(job?.status)) ? 'error' : 'healthy',
      value: `${Object.keys(jobs).length || 0} rotina(s)`,
      detail: 'Backup, limpeza de logs e limpeza de trials disponíveis.'
    },
    {
      label: 'Armazenamento',
      status: storage.database?.error ? 'attention' : 'healthy',
      value: `Banco: ${formatBytes(storage.database?.bytes || 0)}`,
      detail: `Backups: ${formatBytes(storage.backups?.bytes || 0)} · Uploads: ${formatBytes(storage.uploads?.bytes || 0)}`
    },
    {
      label: 'Retenção',
      status: latestCleanup?.created_at ? 'healthy' : 'attention',
      value: latestCleanup?.created_at ? `Última: ${new Date(latestCleanup.created_at).toLocaleDateString('pt-BR')}` : 'Sem execução registrada',
      detail: `Auditoria ${retention.audit_log_days || 180}d · Operacional ${retention.operational_log_days || 90}d · Backups ${retention.backup_days || 7}d`
    },
    {
      label: 'Deploy',
      status: 'healthy',
      value: services.deploy?.commit || 'indisponível',
      detail: `Branch: ${services.deploy?.branch || 'indisponível'}`
    },
    {
      label: 'Permissões de serviço',
      status: serviceControlEnabled ? 'healthy' : 'attention',
      value: serviceControlEnabled ? 'Controle habilitado' : 'Controle protegido',
      detail: serviceControlEnabled ? 'Restart real liberado por variável de ambiente.' : 'Restart real exige PLATFORM_ALLOW_SERVICE_CONTROL=true.'
    }
  ];
  els.platformServicesGrid.innerHTML = rows.map((row) => `
    <article class="platform-status-card status-${escapeAttribute(row.status)}">
      <span>${escapeHtml(statusLabelHealth(row.status))}</span>
      <strong>${escapeHtml(row.label)}</strong>
      <p>${escapeHtml(row.value)}</p>
      <small>${escapeHtml(row.detail)}</small>
    </article>
  `).join('');
  renderLogCleanupResult(storage.latest_cleanup?.summary || null);
}

function renderPlatformBackupList(backup = {}) {
  if (!els.platformBackupList) return;
  const recent = Array.isArray(backup.recent) ? backup.recent : [];
  const latest = backup.latest || recent[0] || null;
  if (!latest && !recent.length) {
    els.platformBackupList.innerHTML = `
      <div class="platform-backup-empty">
        <strong>Nenhum backup encontrado.</strong>
        <span>Execute um backup manual ou confira a rotina agendada no servidor.</span>
      </div>
    `;
    return;
  }
  const rows = recent.map((entry, index) => {
    const isLatest = latest?.file === entry.file || index === 0;
    return `
      <article class="platform-backup-row ${isLatest ? 'is-latest' : ''}">
        <div>
          <strong>${escapeHtml(entry.file || '-')}</strong>
          <small>${entry.created_at ? formatDateTime(entry.created_at) : '-'}${isLatest ? ' · mais recente' : ''}</small>
        </div>
        <div class="platform-backup-row-actions">
          <span>${formatBytes(entry.size_bytes || 0)}</span>
          <button class="ghost-button compact" type="button" data-backup-restore="${escapeAttribute(entry.file || '')}">Restaurar</button>
        </div>
      </article>
    `;
  }).join('');
  els.platformBackupList.innerHTML = `
    <div class="platform-backup-summary">
      <article>
        <span>Status</span>
        <strong>${escapeHtml(backupStatusLabel(backup.status))}</strong>
      </article>
      <article>
        <span>Último backup</span>
        <strong>${latest?.created_at ? formatDateTime(latest.created_at) : '-'}</strong>
      </article>
      <article>
        <span>Retenção</span>
        <strong>${Number(backup.retention_days || 7)} dias</strong>
      </article>
      <article>
        <span>Tamanho</span>
        <strong>${formatBytes(latest?.size_bytes || 0)}</strong>
      </article>
    </div>
    <details class="platform-backup-details">
      <summary>
        <strong>Ver histórico de backups</strong>
        <span>${recent.length} arquivo(s)</span>
      </summary>
      <p class="platform-backup-warning">Restaurar um backup substitui os dados atuais. Antes da restauração, a Central cria um backup preventivo automaticamente.</p>
      <div>${rows}</div>
    </details>
  `;
  els.platformBackupList.querySelectorAll('[data-backup-restore]').forEach((button) => {
    button.addEventListener('click', () => openCriticalAction('restore-backup', { file: button.dataset.backupRestore || '' }));
  });
}

function renderServiceLogs() {
  if (!els.platformServiceLogs) return;
  const logs = state.serviceLogs || [];
  const list = logs.map((entry) => `
    <details class="platform-log-row platform-log-detail status-${escapeAttribute(entry.status || 'info')}">
      <summary>
        <div>
          <strong>${escapeHtml(entry.action || 'Serviço')}</strong>
          <small>${entry.created_at ? new Date(entry.created_at).toLocaleString('pt-BR') : '-'} · ${escapeHtml(entry.severity || 'info')}</small>
        </div>
        <span>${escapeHtml(entry.status || 'info')}</span>
      </summary>
      <div class="platform-log-body">
        <article><span>Severidade</span><strong>${escapeHtml(entry.severity || 'info')}</strong></article>
        <article><span>Ator</span><strong>${escapeHtml(entry.actor_admin_id || '-')}</strong></article>
        <article><span>IP</span><strong>${escapeHtml(entry.ip_address || '-')}</strong></article>
        <article class="is-wide"><span>Mensagem</span><strong>${escapeHtml(entry.message || 'Evento operacional registrado.')}</strong></article>
      </div>
    </details>
  `).join('');
  els.platformServiceLogs.innerHTML = logs.length ? `
    <details class="platform-log-group">
      <summary>
        <div>
          <strong>Ver logs de serviços</strong>
          <small>Eventos técnicos das últimas 24h.</small>
        </div>
        <span>${logs.length} log(s)</span>
      </summary>
      <div class="platform-log-group-body">${list}</div>
    </details>
  ` : '<p class="empty-state">Nenhum evento recente de serviço nas últimas 24h.</p>';
}

function renderRiskZone(risk = {}) {
  if (!els.platformRiskZone) return;
  const items = [
    {
      label: 'Confirmação forte',
      tone: risk.restart_requires_confirmation !== false ? 'ok' : 'danger',
      badge: risk.restart_requires_confirmation !== false ? 'OK' : '!',
      hint: 'Senha do Admin Master e texto CONFIRMAR obrigatórios em ações críticas.'
    },
    {
      label: 'Controle de banco',
      tone: risk.database_stop_available === true ? 'warning' : 'protected',
      badge: risk.database_stop_available === true ? 'ATENÇÃO' : 'PROTEGIDO',
      hint: risk.database_stop_available === true
        ? 'Parada de banco está habilitada. Use apenas em manutenção planejada.'
        : risk.database_stop_reason || 'Parada de banco bloqueada por segurança. Backup, conexão e diagnóstico continuam disponíveis.'
    },
    {
      label: 'Controle de serviço',
      tone: state.services?.permissions?.service_control_enabled === true ? 'ok' : 'protected',
      badge: state.services?.permissions?.service_control_enabled === true ? 'OK' : 'PROTEGIDO',
      hint: state.services?.permissions?.service_control_enabled
        ? 'Restart real habilitado por variável de ambiente.'
        : 'Restart real protegido neste ambiente. Para liberar no servidor, configure PLATFORM_ALLOW_SERVICE_CONTROL=true.'
    }
  ];
  els.platformRiskZone.innerHTML = items.map((item) => `
    <article class="platform-check-row ${escapeAttribute(item.tone)}">
      <span>${escapeHtml(item.badge)}</span>
      <div>
        <strong>${escapeHtml(item.label)}</strong>
        <small>${escapeHtml(item.hint)}</small>
      </div>
    </article>
  `).join('');
}

function renderLogCleanupResult(cleanup) {
  if (!els.logCleanupResult) return;
  if (!cleanup) {
    els.logCleanupResult.innerHTML = '<small class="muted">Nenhuma limpeza executada nesta sessão.</small>';
    return;
  }
  const summary = cleanup.summary || cleanup;
  const totals = summary.totals || summary.result?.totals || {};
  const removedRows = Number(totals.database_rows || totals.rows || 0);
  const removedFiles = Number(totals.files || 0);
  const removedBytes = Number(totals.bytes || 0);
  const mode = summary.mode || cleanup.mode || 'dry_run';
  const label = mode === 'apply' ? 'Aplicado' : 'Simulação';
  els.logCleanupResult.innerHTML = `
    <div class="platform-cleanup-summary">
      <strong>${escapeHtml(label)}</strong>
      <span>${removedRows} registro(s)</span>
      <span>${removedFiles} arquivo(s)</span>
      <span>${formatBytes(removedBytes)}</span>
    </div>
  `;
}

async function previewLogCleanup() {
  if (!els.previewLogCleanupButton) return;
  els.previewLogCleanupButton.disabled = true;
  els.previewLogCleanupButton.textContent = 'Simulando...';
  try {
    const response = await request('/api/platform/services/log-cleanup/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      timeoutMs: 130000
    });
    renderLogCleanupResult(response.result || response);
    toast('Simulação de limpeza concluída.');
    await loadServices({ silent: true });
  } catch (error) {
    toast(error.message || 'Não foi possível simular a limpeza.');
  } finally {
    els.previewLogCleanupButton.disabled = false;
    els.previewLogCleanupButton.textContent = 'Simular Limpeza';
  }
}

function backupHealthTone(status) {
  if (status === 'success') return 'healthy';
  if (status === 'failed') return 'error';
  if (status === 'running') return 'attention';
  return 'unknown';
}

function durationLabel(ms) {
  const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}

const criticalActions = {
  backup: {
    title: 'Fazer Backup Agora',
    message: 'O sistema vai executar um backup manual do banco e registrar a ação na auditoria.',
    endpoint: '/api/platform/services/backup',
    success: 'Backup manual concluído.'
  },
  'restore-backup': {
    title: 'Restaurar backup',
    message: 'Esta ação substitui os dados atuais pelo arquivo selecionado. A Central cria um backup preventivo antes de restaurar.',
    endpoint: '/api/platform/services/backup/restore',
    success: 'Backup restaurado com sucesso.'
  },
  'trial-cleanup': {
    title: 'Executar Limpeza de Trials',
    message: 'Empresas em teste sem acesso recente poderão ser removidas conforme a regra operacional.',
    endpoint: '/api/platform/services/jobs/trial-cleanup',
    success: 'Limpeza de trials executada.'
  },
  'log-cleanup': {
    title: 'Executar Limpeza de Logs',
    message: 'O sistema vai remover registros e arquivos fora da política de retenção. Simule antes se quiser conferir o impacto.',
    endpoint: '/api/platform/services/log-cleanup',
    success: 'Limpeza de logs executada.'
  },
  'restart-app': {
    title: 'Reiniciar aplicação',
    message: 'A aplicação será reiniciada se o controle de serviço estiver habilitado no ambiente.',
    endpoint: '/api/platform/services/app/restart',
    success: 'Restart da aplicação agendado.'
  }
};

let pendingCriticalAction = null;
let pendingCriticalPayload = {};
let pendingDangerResolve = null;

function openCriticalAction(actionKey, payload = {}) {
  const action = criticalActions[actionKey];
  if (!action || !els.platformConfirmBackdrop || !els.platformConfirmForm) return;
  pendingCriticalAction = actionKey;
  pendingCriticalPayload = payload || {};
  if (els.platformConfirmTitle) els.platformConfirmTitle.textContent = action.title;
  if (els.platformConfirmMessage) {
    const fileInfo = pendingCriticalPayload.file ? ` Arquivo: ${pendingCriticalPayload.file}` : '';
    els.platformConfirmMessage.textContent = `${action.message}${fileInfo}`;
  }
  els.platformConfirmForm.reset();
  els.platformConfirmBackdrop.hidden = false;
  els.platformConfirmForm.elements.confirmation?.focus();
}

function closeCriticalDialog() {
  if (pendingDangerResolve) {
    pendingDangerResolve(null);
    pendingDangerResolve = null;
  }
  pendingCriticalAction = null;
  pendingCriticalPayload = {};
  if (els.platformConfirmBackdrop) els.platformConfirmBackdrop.hidden = true;
  if (els.platformConfirmSubmit) {
    els.platformConfirmSubmit.disabled = false;
    els.platformConfirmSubmit.textContent = 'Confirmar';
  }
}

async function submitCriticalAction(event) {
  event.preventDefault();
  if (pendingDangerResolve) {
    const data = Object.fromEntries(new FormData(els.platformConfirmForm));
    const resolve = pendingDangerResolve;
    pendingDangerResolve = null;
    pendingCriticalAction = null;
    if (els.platformConfirmBackdrop) els.platformConfirmBackdrop.hidden = true;
    resolve(data);
    return;
  }
  const action = criticalActions[pendingCriticalAction];
  if (!action) return;
  const data = { ...pendingCriticalPayload, ...Object.fromEntries(new FormData(els.platformConfirmForm)) };
  if (els.platformConfirmSubmit) {
    els.platformConfirmSubmit.disabled = true;
    els.platformConfirmSubmit.textContent = 'Executando...';
  }
  try {
    const response = await request(action.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      timeoutMs: 130000
    });
    if (pendingCriticalAction === 'log-cleanup') {
      renderLogCleanupResult(response.result || response);
    }
    closeCriticalDialog();
    toast(action.success);
    await loadServices({ silent: true });
    await submitAuditRefreshSilently();
  } catch (error) {
    toast(error.message || 'Não foi possível executar a ação.');
    if (els.platformConfirmSubmit) {
      els.platformConfirmSubmit.disabled = false;
      els.platformConfirmSubmit.textContent = 'Confirmar';
    }
  }
}

function requestDangerConfirmation(title, message) {
  if (!els.platformConfirmBackdrop || !els.platformConfirmForm) return Promise.resolve(null);
  if (els.platformConfirmTitle) els.platformConfirmTitle.textContent = title;
  if (els.platformConfirmMessage) els.platformConfirmMessage.textContent = message;
  els.platformConfirmForm.reset();
  els.platformConfirmBackdrop.hidden = false;
  els.platformConfirmForm.elements.confirmation?.focus();
  return new Promise((resolve) => {
    pendingDangerResolve = resolve;
  });
}

async function submitAuditRefreshSilently() {
  try {
    const audit = await request(`/api/platform/audit${auditQueryString()}`);
    state.logs = audit.logs || [];
    renderAudit();
  } catch {
    // Mantém a tela atual se a auditoria não carregar.
  }
}

function renderBackupStatus() {
  if (!els.backupStatus) return;
  if (!state.backupLoaded && !state.backup) {
    els.backupStatus.innerHTML = '<p class="empty-state">O histórico de backups aparece aqui após carregar a área.</p>';
    return;
  }
  const backup = state.backup || {};
  const latest = backup.latest || {};
  const recent = Array.isArray(backup.recent) ? backup.recent : [];
  els.backupStatus.innerHTML = `
    <article>
      <span>Status</span>
      <strong class="${backup.status === 'success' ? 'ok' : backup.status === 'failed' ? 'danger' : 'muted'}">${escapeHtml(backupStatusLabel(backup.status))}</strong>
      <p>${backup.error ? escapeHtml(backup.error) : 'Última execução registrada pela rotina de backup.'}</p>
    </article>
    <article>
      <span>Último arquivo</span>
      <strong>${escapeHtml(latest.file || backup.last_output || '-')}</strong>
      <p>${latest.size_bytes ? formatBytes(latest.size_bytes) : 'Sem arquivo local registrado.'}</p>
    </article>
    <article>
      <span>Atualizado em</span>
      <strong>${backup.updated_at ? new Date(backup.updated_at).toLocaleString('pt-BR') : '-'}</strong>
      <p>Retenção configurada: ${Number(backup.retention_days || 7)} dia(s).</p>
    </article>
    <article>
      <span>Histórico recente</span>
      <strong>${recent.length} backup(s)</strong>
      <p>${recent.slice(0, 3).map((entry) => `${entry.file} (${formatBytes(entry.size_bytes)})`).join(' · ') || 'Nenhum backup encontrado no diretório local.'}</p>
    </article>
  `;
}

function backupStatusLabel(status) {
  return ({
    success: 'Sucesso',
    failed: 'Falhou',
    running: 'Em execução',
    unknown: 'Sem registro'
  })[status] || 'Sem registro';
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function submitAuditFilters(event) {
  event.preventDefault();
  await loadAudit();
}

function auditQueryString() {
  if (!els.auditFilterForm) return '';
  const params = new URLSearchParams();
  const data = new FormData(els.auditFilterForm);
  for (const [key, value] of data.entries()) {
    if (String(value || '').trim()) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

async function submitCompanyManagement(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  if (['suspended', 'cancelled', 'archived'].includes(data.status)) {
    const confirmation = await requestDangerConfirmation(
      'Alterar status do cliente',
      'Suspender, cancelar ou arquivar um cliente é uma ação sensível. Confirme com sua senha de Admin Master.'
    );
    if (!confirmation) return;
    data.confirmation = confirmation.confirmation;
    data.password = confirmation.password;
  }
  await request(`/api/platform/companies/${form.dataset.companyId}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: data.status, confirmation: data.confirmation, password: data.password })
  });
  await request(`/api/platform/companies/${form.dataset.companyId}/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan_code: data.plan_code, status: data.status === 'trial' ? 'trial' : 'active' })
  });
  await loadPlatform();
  toast('Empresa atualizada.');
}

async function submitCompanyQuickAction(event) {
  const button = event.currentTarget;
  const action = button.dataset.companyAction;
  const companyId = button.closest('[data-company-id]')?.dataset.companyId;
  if (!companyId || !action) return;
  const actions = {
    suspend: {
      endpoint: `/api/platform/companies/${companyId}/suspend`,
      method: 'POST',
      title: 'Suspender cliente',
      message: 'O cliente perderá acesso operacional até ser liberado novamente.',
      critical: true,
      success: 'Cliente suspenso.'
    },
    activate: {
      endpoint: `/api/platform/companies/${companyId}/activate`,
      method: 'POST',
      success: 'Cliente liberado.'
    },
    'reopen-onboarding': {
      endpoint: `/api/platform/companies/${companyId}/reopen-onboarding`,
      method: 'POST',
      title: 'Reabrir onboarding',
      message: 'A configuração inicial voltará a aparecer como pendente para as lojas deste cliente.',
      critical: true,
      success: 'Onboarding reaberto.'
    },
    'resend-billing': {
      endpoint: `/api/platform/companies/${companyId}/resend-billing`,
      method: 'POST',
      success: 'Solicitação de reenvio registrada.'
    },
    impersonate: {
      endpoint: '/api/platform/support/impersonate',
      method: 'POST',
      title: 'Entrar como suporte',
      message: 'Você entrará temporariamente no admin desta loja. A sessão expira automaticamente e tudo será auditado.',
      critical: true,
      success: 'Modo suporte iniciado.',
      redirect: externalUrl(PANEL_BASE_URL, '/'),
      store_id: button.dataset.storeId || ''
    }
  };
  const config = actions[action];
  if (!config) return;
  let payload = {};
  if (config.critical) {
    const confirmation = await requestDangerConfirmation(config.title, config.message);
    if (!confirmation) return;
    payload = confirmation;
  }
  if (config.store_id) {
    payload.store_id = config.store_id;
    payload.ttl_seconds = 30 * 60;
  }
  button.disabled = true;
  try {
    await request(config.endpoint, {
      method: config.method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    toast(config.success);
    if (config.redirect) {
      window.location.href = config.redirect;
      return;
    }
    await Promise.all([
      loadCommercialAnalytics({ silent: true, renderBefore: false, renderAfter: false }),
      loadPlatform()
    ]);
  } catch (error) {
    toast(error.message || 'Não foi possível executar a ação.');
  } finally {
    button.disabled = false;
  }
}

async function submitBillingAction(event) {
  const button = event.currentTarget;
  const action = button.dataset.billingAction;
  const wrapper = button.closest('[data-company-id]');
  const companyId = wrapper?.dataset.companyId;
  if (!companyId || !action) return;
  const planCode = wrapper.querySelector('[data-billing-plan-select]')?.value || '';
  const actions = {
    'change-plan': {
      endpoint: `/api/platform/companies/${companyId}/change-plan`,
      payload: { plan_code: planCode, status: 'active' },
      success: 'Plano alterado.',
      confirm: true,
      title: 'Alterar plano',
      message: 'Alterar plano pode liberar ou limitar recursos deste cliente. Confirme a ação.'
    },
    cancel: {
      endpoint: `/api/platform/companies/${companyId}/cancel-subscription`,
      payload: {},
      success: 'Assinatura cancelada.',
      confirm: true,
      title: 'Cancelar assinatura',
      message: 'O cliente será marcado como cancelado sem apagar os dados. Confirme com sua senha.'
    },
    reactivate: {
      endpoint: `/api/platform/companies/${companyId}/reactivate-subscription`,
      payload: { plan_code: planCode },
      success: 'Assinatura reativada.'
    }
  };
  const config = actions[action];
  if (!config) return;
  const payload = { ...config.payload };
  if (config.confirm) {
    const confirmation = await requestDangerConfirmation(config.title, config.message);
    if (!confirmation) return;
    Object.assign(payload, confirmation, { require_confirmation: true });
  }
  button.disabled = true;
  try {
    await request(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    toast(config.success);
    await Promise.all([
      loadBilling({ silent: true, renderBefore: false }),
      loadCommercialAnalytics({ silent: true, renderBefore: false, renderAfter: false })
    ]);
    await loadPlatform();
  } catch (error) {
    toast(error.message || 'Não foi possível atualizar a assinatura.');
  } finally {
    button.disabled = false;
  }
}

async function submitSmtpSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  data.use_tls = form.elements.use_tls.checked;
  data.is_active = form.elements.is_active.checked;
  if (!String(data.password || '').trim()) delete data.password;
  try {
    const response = await request('/api/platform/smtp', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    state.smtp = response.smtp;
    renderSmtpForm();
    toast('SMTP salvo com segurança.');
  } catch (error) {
    toast(error.message || 'Não foi possível salvar SMTP.');
  }
}

async function submitPlatformWhatsappSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  data.is_active = form.elements.is_active.checked;
  if (!String(data.api_key || '').trim()) delete data.api_key;
  const button = els.savePlatformWhatsappButton;
  const previousText = button?.textContent || 'Salvar Evolution Go';
  try {
    if (button) {
      button.disabled = true;
      button.textContent = 'Salvando...';
    }
    const response = await request('/api/platform/whatsapp/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    state.whatsappSettings = response.whatsapp;
    renderPlatformWhatsappForm();
    toast('Evolution Go salva com segurança.');
    await loadHealth({ silent: true });
  } catch (error) {
    toast(error.message || 'Não foi possível salvar Evolution Go.');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previousText;
    }
  }
}

async function testPlatformWhatsappSettings() {
  const button = els.testPlatformWhatsappButton;
  const previousText = button?.textContent || 'Testar conexão';
  try {
    if (button) {
      button.disabled = true;
      button.textContent = 'Testando...';
    }
    const response = await request('/api/platform/whatsapp/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    toast(response.message || 'Evolution Go validada.');
    await loadCommunication({ silent: true });
    await loadHealth({ silent: true });
  } catch (error) {
    toast(error.message || 'Não foi possível testar Evolution Go.');
    await loadCommunication({ silent: true });
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previousText;
    }
  }
}

async function submitBillingConfig(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  data.is_active = form.elements.is_active.checked;
  if (!String(data.api_key || '').trim()) delete data.api_key;
  if (!String(data.webhook_secret || '').trim()) delete data.webhook_secret;
  if (els.saveBillingConfigButton) {
    els.saveBillingConfigButton.disabled = true;
    els.saveBillingConfigButton.textContent = 'Salvando...';
  }
  try {
    const response = await request('/api/platform/billing/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    state.billingConfig = response.billing;
    renderBillingConfig();
    toast('Configuração da Abacate Pay salva.');
    await loadHealth({ silent: true });
  } catch (error) {
    toast(error.message || 'Não foi possível salvar Abacate Pay.');
  } finally {
    if (els.saveBillingConfigButton) {
      els.saveBillingConfigButton.disabled = false;
      els.saveBillingConfigButton.textContent = 'Salvar configuração';
    }
  }
}

async function testBillingConfig() {
  const buttons = [els.testBillingConfigButton, els.testBillingConfigButtonHealth].filter(Boolean);
  buttons.forEach((button) => {
    button.disabled = true;
    button.dataset.originalText = button.dataset.originalText || button.textContent;
    button.textContent = 'Testando...';
  });
  try {
    const response = await request('/api/platform/billing/config/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    toast(response.message || 'Conexão validada.');
    await loadBilling({ silent: true, renderBefore: false });
    await loadHealth({ silent: true });
  } catch (error) {
    toast(error.message || 'Não foi possível testar Abacate Pay.');
    await loadBilling({ silent: true, renderBefore: false });
  } finally {
    buttons.forEach((button) => {
      button.disabled = false;
      button.textContent = button.dataset.originalText || 'Testar conexão';
    });
  }
}

async function submitSmtpTest(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  try {
    const response = await request('/api/platform/smtp/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    toast(response.message || 'E-mail de teste enviado.');
    await loadCommunication({ silent: true });
  } catch (error) {
    toast(error.message || 'Falha no teste de SMTP.');
  }
}

async function submitEmailTemplate(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  data.template_key = form.dataset.templateKey;
  data.is_active = form.elements.is_active.checked;
  try {
    await request('/api/platform/email-templates', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    toast('Template salvo.');
    await loadCommunication({ silent: true });
  } catch (error) {
    toast(error.message || 'Não foi possível salvar template.');
  }
}

async function submitSupportTicketUpdate(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  try {
    await request(`/api/platform/support/tickets/${form.dataset.ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    toast('Chamado atualizado.');
    await loadSupport({ silent: true });
  } catch (error) {
    toast(error.message || 'Não foi possível atualizar chamado.');
  }
}

async function quickUpdateSupportTicket(ticketId, status) {
  if (!ticketId || !status) return;
  const ticket = (state.supportTickets || []).find((item) => item.id === ticketId);
  const payload = {
    status,
    priority: ticket?.priority || 'medium',
    assigned_to_admin_id: ticket?.assigned_to_admin_id || state.admin?.id || ''
  };
  try {
    await request(`/api/platform/support/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    state.selectedSupportTicketId = ticketId;
    toast(status === 'closed' ? 'Atendimento encerrado.' : status === 'resolved' ? 'Chamado resolvido.' : 'Chamado atualizado.');
    await loadSupport({ silent: true });
  } catch (error) {
    toast(error.message || 'Não foi possível atualizar o chamado.');
  }
}

async function submitSupportTicketMessage(event) {
  event.preventDefault();
  const form = event.target?.closest?.('.platform-support-message-form') || event.currentTarget;
  if (!form || !form.matches?.('.platform-support-message-form')) return;
  if (form.dataset.submitting === 'true') return;
  const data = Object.fromEntries(new FormData(form));
  data.is_internal = form.elements.is_internal?.type === 'checkbox'
    ? form.elements.is_internal.checked
    : data.is_internal === 'true';
  const submitButton = form.querySelector('button[type="submit"], button:not([type])');
  const previousText = submitButton?.textContent || '';
  try {
    state.selectedSupportTicketId = form.dataset.ticketId || state.selectedSupportTicketId;
    form.dataset.submitting = 'true';
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Enviando...';
    }
    await request(`/api/platform/support/tickets/${form.dataset.ticketId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    form.reset();
    toast(data.is_internal ? 'Nota interna registrada.' : 'Resposta enviada.');
    await loadSupport({ silent: true });
  } catch (error) {
    toast(error.message || 'Não foi possível enviar mensagem.');
  } finally {
    form.dataset.submitting = 'false';
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = previousText;
    }
  }
}

async function submitStoreStatus(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  await request(`/api/platform/stores/${form.dataset.storeId}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_active: data.is_active === 'true' })
  });
  await loadPlatform();
  toast('Loja atualizada.');
}

async function submitOverride(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  await request(`/api/platform/companies/${form.dataset.companyId}/overrides`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  await loadPlatform();
  toast('Exceção adicionada.');
}

async function deleteOverride(event) {
  const id = event.currentTarget.dataset.deleteOverride;
  await request(`/api/platform/overrides/${id}`, { method: 'DELETE' });
  await loadPlatform();
  toast('Exceção removida.');
}

async function logout() {
  await request('/api/admin/logout', { method: 'POST' }).catch(() => {});
  state.admin = null;
  showPlatformLogin('Sessão encerrada com segurança.');
}

function hasPermission(permission) {
  return (state.admin?.permissions || []).includes(permission);
}

async function request(url, options = {}) {
  const { timeoutMs = 20000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: 'no-store', ...fetchOptions, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.detail || data.error || 'Falha na requisição.');
      error.status = response.status;
      if ((response.status === 401 || response.status === 403) && !String(url).includes('/api/admin/login')) {
        showPlatformLogin(error.message || 'Faça login para acessar a Central.');
      }
      throw error;
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Tempo esgotado ao carregar dados da plataforma.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function statusOptions(selected) {
  return [
    ['trial', 'Teste'],
    ['active', 'Ativa'],
    ['payment_pending', 'Pagamento pendente'],
    ['grace_period', 'Prazo de regularização'],
    ['past_due', 'Pendente'],
    ['suspended', 'Suspensa'],
    ['cancelled', 'Cancelada'],
    ['archived', 'Arquivada']
  ].map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}

function statusLabel(status) {
  return ({
    trial: 'Teste',
    active: 'Ativa',
    payment_pending: 'Pagamento pendente',
    grace_period: 'Prazo de regularização',
    past_due: 'Pendente',
    suspended: 'Suspensa',
    blocked: 'Bloqueada',
    cancelled: 'Cancelada',
    archived: 'Arquivada'
  })[status] || status || 'Indefinida';
}

function subscriptionStatusLabel(status) {
  return ({
    trial: 'Trial',
    active: 'Ativo',
    payment_pending: 'Pagamento pendente',
    grace_period: 'Grace period',
    past_due: 'Vencido',
    blocked: 'Bloqueado',
    suspended: 'Bloqueado',
    cancelled: 'Cancelado',
    expired: 'Expirado',
    archived: 'Arquivado',
    unknown: 'Sem status'
  })[status] || statusLabel(status);
}

function billingStatusPill(status) {
  if (status === 'active') return 'pill-ok';
  if (status === 'trial' || status === 'grace_period') return 'pill-muted';
  return 'pill-danger';
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR');
}

function formatDateShort(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
}

function initials(value = '') {
  const parts = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  const text = parts.map((part) => part[0]).join('').toUpperCase();
  return text || 'AD';
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

function supportStatusOptions(selected) {
  return [
    ['open', 'Aberto'],
    ['waiting_customer', 'Aguardando cliente'],
    ['in_review', 'Em análise'],
    ['resolved', 'Resolvido'],
    ['closed', 'Fechado']
  ].map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}

function supportPriorityOptions(selected) {
  return [
    ['low', 'Baixa'],
    ['medium', 'Média'],
    ['high', 'Alta'],
    ['critical', 'Crítica']
  ].map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}

function adminRoleLabel(role) {
  return ({
    superadmin: 'Superadmin',
    owner: 'Proprietário',
    manager: 'Gerente',
    admin: 'Administrador',
    waiter: 'Garçom',
    attendant: 'Atendimento',
    delivery: 'Entrega',
    kitchen: 'Cozinha'
  })[role] || 'Administrador';
}

function overrideTypeLabel(type) {
  return ({
    allow: 'Liberado manualmente',
    block: 'Bloqueado manualmente',
    limit: 'Limite manual'
  })[type] || type;
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function moneyCents(cents, fallbackValue = 0) {
  const value = cents !== undefined && cents !== null
    ? Number(cents || 0) / 100
    : Number(fallbackValue || 0);
  return money(value);
}

function centsInput(cents) {
  const numeric = Number(cents || 0) / 100;
  return numeric.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
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

