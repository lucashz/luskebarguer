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
  companyDetails: {},
  commercialLoading: false,
  commercialLoaded: false,
  commercialError: '',
  activeView: 'overview'
};

const els = {
  platformUser: document.querySelector('#platformUser'),
  platformBlocked: document.querySelector('#platformBlocked'),
  platformContent: document.querySelector('#platformContent'),
  platformTabs: [...document.querySelectorAll('[data-platform-view]')],
  platformSections: [...document.querySelectorAll('[data-platform-section]')],
  platformLogoutButton: document.querySelector('#platformLogoutButton'),
  refreshPlatformButton: document.querySelector('#refreshPlatformButton'),
  companyForm: document.querySelector('#companyForm'),
  storeForm: document.querySelector('#storeForm'),
  companyPlanSelect: document.querySelector('#companyPlanSelect'),
  storeCompanySelect: document.querySelector('#storeCompanySelect'),
  analyticsPeriodSelect: document.querySelector('#analyticsPeriodSelect'),
  refreshAnalyticsButton: document.querySelector('#refreshAnalyticsButton'),
  platformKpiGrid: document.querySelector('#platformKpiGrid'),
  platformDailyChart: document.querySelector('#platformDailyChart'),
  platformStoreRanking: document.querySelector('#platformStoreRanking'),
  platformBillingMetrics: document.querySelector('#platformBillingMetrics'),
  platformCommercialAlerts: document.querySelector('#platformCommercialAlerts'),
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
  platformOperationalLogs: document.querySelector('#platformOperationalLogs'),
  toast: document.querySelector('#toast')
};

els.platformLogoutButton.addEventListener('click', logout);
els.refreshPlatformButton.addEventListener('click', loadPlatform);
els.companyForm.addEventListener('submit', submitCompany);
els.storeForm.addEventListener('submit', submitStore);
els.auditFilterForm?.addEventListener('submit', submitAuditFilters);
els.refreshHealthButton?.addEventListener('click', loadHealth);
els.healthPeriodSelect?.addEventListener('change', loadHealth);
els.refreshAnalyticsButton?.addEventListener('click', loadCommercialAnalytics);
els.analyticsPeriodSelect?.addEventListener('change', loadCommercialAnalytics);
els.clientFilterForm?.addEventListener('input', renderCompanies);
els.clientFilterForm?.addEventListener('change', renderCompanies);
els.operationalLogTypeFilter?.addEventListener('change', renderOperationalLogs);
els.operationalLogStatusFilter?.addEventListener('change', renderOperationalLogs);
els.platformTabs.forEach((button) => {
  button.addEventListener('click', () => activatePlatformView(button.dataset.platformView));
});

init().catch((error) => {
  toast(error.message || 'Não foi possível carregar a plataforma.');
});

async function init() {
  const { admin } = await request('/api/admin/me');
  state.admin = admin;
  els.platformUser.textContent = `${admin.name} - ${admin.email}`;
  if (!hasPermission('platform')) {
    els.platformBlocked.hidden = false;
    return;
  }
  els.platformContent.hidden = false;
  await loadPlatform();
}

async function loadPlatform() {
  state.commercialLoading = true;
  state.commercialError = '';
  renderCommercialDashboard();
  try {
    const [companies, plans, audit, backup, health, commercial] = await Promise.all([
      request('/api/platform/companies'),
      request('/api/platform/plans'),
      request(`/api/platform/audit${auditQueryString()}`),
      request('/api/platform/backups').catch(() => ({ status: 'unknown', recent: [] })),
      request(healthUrl()).catch((error) => ({ error: error.message || 'Não foi possível carregar saúde operacional.' })),
      loadCommercialSnapshot()
    ]);
    state.companies = companies.companies || [];
    state.features = companies.features || [];
    state.plans = plans.plans || [];
    state.logs = audit.logs || [];
    state.backup = backup;
    state.health = health;
    state.summary = commercial.summary || null;
    state.analytics = commercial.analytics || null;
    state.commercialLoaded = !commercial.error;
    state.commercialError = commercial.error || '';
  } catch (error) {
    state.commercialLoaded = false;
    state.commercialError = error.message || 'Não foi possível carregar a plataforma.';
    toast(state.commercialError);
  } finally {
    state.commercialLoading = false;
    render();
  }
}

async function loadCommercialAnalytics(options = {}) {
  state.commercialLoading = true;
  if (options.renderBefore !== false) renderCommercialDashboard();
  if (els.refreshAnalyticsButton) els.refreshAnalyticsButton.disabled = true;
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

function analyticsUrl() {
  const period = els.analyticsPeriodSelect?.value || '30d';
  return `/api/platform/analytics?period=${encodeURIComponent(period)}`;
}

async function loadHealth(options = {}) {
  if (els.refreshHealthButton) els.refreshHealthButton.disabled = true;
  try {
    state.health = await request(healthUrl());
    renderHealth();
  } catch (error) {
    state.health = { error: error.message || 'Não foi possível carregar saúde operacional.' };
    renderHealth();
    if (!options.silent) toast(error.message || 'Não foi possível carregar saúde operacional.');
  } finally {
    if (els.refreshHealthButton) els.refreshHealthButton.disabled = false;
  }
}

function healthUrl() {
  const period = els.healthPeriodSelect?.value || '24h';
  return `/api/platform/health?period=${encodeURIComponent(period)}`;
}

function render() {
  renderSelects();
  renderCommercialDashboard();
  renderAttentionPanel();
  renderCompanies();
  renderAudit();
  renderBackupStatus();
  renderHealth();
  activatePlatformView(state.activeView);
}

function activatePlatformView(view = 'overview') {
  state.activeView = view || 'overview';
  els.platformTabs.forEach((button) => {
    button.classList.toggle('active', button.dataset.platformView === state.activeView);
    button.setAttribute('aria-current', button.dataset.platformView === state.activeView ? 'page' : 'false');
  });
  els.platformSections.forEach((section) => {
    section.hidden = section.dataset.platformSection !== state.activeView;
  });
}

function renderSelects() {
  const planOptions = state.plans.map((plan) => `<option value="${escapeAttribute(plan.code)}">${escapeHtml(plan.name)}</option>`).join('');
  els.companyPlanSelect.innerHTML = `<option value="">Selecione o plano inicial</option>${planOptions || '<option value="essential">Essencial</option>'}`;
  if (els.clientPlanFilter) {
    const selected = els.clientPlanFilter.value;
    els.clientPlanFilter.innerHTML = `<option value="">Todos planos</option>${planOptions}`;
    els.clientPlanFilter.value = selected;
  }
  const companyOptions = state.companies
    .map((company) => `<option value="${escapeAttribute(company.id)}">${escapeHtml(company.name)}</option>`)
    .join('');
  els.storeCompanySelect.innerHTML = `<option value="">Selecione a empresa</option>${companyOptions}`;
  els.storeCompanySelect.disabled = !state.companies.length;
  els.auditCompanySelect.innerHTML = `<option value="">Todas empresas</option>${companyOptions}`;
  const stores = state.companies.flatMap((company) => (company.stores || []).map((store) => ({ ...store, company_name: company.name })));
  els.auditStoreSelect.innerHTML = '<option value="">Todas lojas</option>' + stores
    .map((store) => `<option value="${escapeAttribute(store.id)}">${escapeHtml(store.name)} - ${escapeHtml(store.company_name)}</option>`)
    .join('');
}

function renderCommercialDashboard() {
  renderKpis();
  renderDailyChart();
  renderStoreRanking();
  renderBillingMetrics();
  renderCommercialAlerts();
}

function renderKpis() {
  if (!els.platformKpiGrid) return;
  if (state.commercialLoading && !state.commercialLoaded) {
    els.platformKpiGrid.innerHTML = Array.from({ length: 8 }).map(() => `
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
    ['Clientes ativos', cards.active_clients, 'Empresas em status ativo'],
    ['Clientes em teste', cards.trial_clients, 'Trials em andamento'],
    ['Inadimplentes', cards.delinquent_clients, 'Pendente, vencido ou suspenso'],
    ['Lojas publicadas', cards.published_stores, 'Cardápios ativos'],
    ['Pedidos hoje', cards.orders_today, 'Pedidos recebidos hoje'],
    ['Faturamento hoje', money(cards.revenue_today), 'Receita bruta de pedidos'],
    ['MRR estimado', money(cards.mrr_estimated), 'Com base nos planos atuais'],
    ['Churn/cancelados', cards.churn_clients, 'Cancelados ou arquivados']
  ];
  els.platformKpiGrid.innerHTML = items.map(([label, value, hint]) => `
    <article class="platform-kpi-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value ?? 0)}</strong>
      <p>${escapeHtml(hint)}</p>
    </article>
  `).join('');
}

function renderDailyChart() {
  if (!els.platformDailyChart) return;
  if (state.commercialLoading && !state.commercialLoaded) {
    els.platformDailyChart.innerHTML = '<p class="empty-state">Carregando pedidos e faturamento...</p>';
    return;
  }
  if (state.commercialError && !state.commercialLoaded) {
    els.platformDailyChart.innerHTML = `<p class="empty-state">${escapeHtml(state.commercialError)}</p>`;
    return;
  }
  const rows = state.analytics?.daily || [];
  if (!rows.length) {
    els.platformDailyChart.innerHTML = '<p class="empty-state">Sem dados de pedidos no período.</p>';
    return;
  }
  const maxOrders = Math.max(1, ...rows.map((row) => Number(row.orders || 0)));
  const maxRevenue = Math.max(1, ...rows.map((row) => Number(row.revenue || 0)));
  els.platformDailyChart.innerHTML = rows.map((row) => {
    const orderHeight = Math.max(5, Math.round((Number(row.orders || 0) / maxOrders) * 92));
    const revenueHeight = Math.max(5, Math.round((Number(row.revenue || 0) / maxRevenue) * 92));
    const label = row.date.slice(5).split('-').reverse().join('/');
    return `
      <button class="platform-day-bar" type="button" title="${escapeAttribute(label)}: ${Number(row.orders || 0)} pedido(s), ${money(row.revenue)}">
        <span class="orders" style="height:${orderHeight}%"></span>
        <span class="revenue" style="height:${revenueHeight}%"></span>
        <small>${escapeHtml(label)}</small>
      </button>
    `;
  }).join('');
}

function renderStoreRanking() {
  if (!els.platformStoreRanking) return;
  if (state.commercialLoading && !state.commercialLoaded) {
    els.platformStoreRanking.innerHTML = '<p class="empty-state">Carregando ranking de lojas...</p>';
    return;
  }
  if (state.commercialError && !state.commercialLoaded) {
    els.platformStoreRanking.innerHTML = `<p class="empty-state">${escapeHtml(state.commercialError)}</p>`;
    return;
  }
  const rows = state.analytics?.ranking || [];
  const max = Math.max(1, ...rows.map((row) => Number(row.orders || 0)));
  els.platformStoreRanking.innerHTML = rows.length ? rows.map((row, index) => `
    <article class="platform-ranking-row">
      <div>
        <strong>${index + 1}. ${escapeHtml(row.store_name)}</strong>
        <small>/${escapeHtml(row.slug || '')}</small>
      </div>
      <span>${Number(row.orders || 0)} pedido(s)</span>
      <em>${money(row.revenue)}</em>
      <i style="width:${Math.max(8, (Number(row.orders || 0) / max) * 100)}%"></i>
    </article>
  `).join('') : '<p class="empty-state">Nenhuma loja com pedidos no período.</p>';
}

function renderBillingMetrics() {
  if (!els.platformBillingMetrics) return;
  if (state.commercialLoading && !state.commercialLoaded) {
    els.platformBillingMetrics.innerHTML = '<p class="empty-state">Carregando métricas comerciais...</p>';
    return;
  }
  if (state.commercialError && !state.commercialLoaded) {
    els.platformBillingMetrics.innerHTML = `<p class="empty-state">${escapeHtml(state.commercialError)}</p>`;
    return;
  }
  const billing = state.summary?.billing || {};
  const rows = [
    ['MRR', money(billing.mrr)],
    ['Receita pedidos/mês', money(billing.monthly_order_revenue)],
    ['Trials iniciados', billing.trials_started || 0],
    ['Upgrades', billing.upgrades || 0],
    ['Downgrades', billing.downgrades || 0],
    ['Cancelamentos', billing.cancellations || 0],
    ['Pagamentos aprovados', billing.paid_events || 0],
    ['Pagamentos recusados', billing.refused_events || 0]
  ];
  const revenueByPlan = billing.revenue_by_plan || [];
  els.platformBillingMetrics.innerHTML = `
    ${rows.map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join('')}
    <div class="platform-plan-revenue">
      ${revenueByPlan.map((entry) => `<span>${escapeHtml(entry.plan)} <strong>${money(entry.revenue)}</strong></span>`).join('') || '<span>Sem receita por plano.</span>'}
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
  els.platformCommercialAlerts.innerHTML = alerts.length ? alerts.map((alert) => `
    <article class="platform-commercial-alert severity-${escapeAttribute(alert.severity)}">
      <strong>${escapeHtml(alert.title)}</strong>
      <small>${escapeHtml(alert.action || '')}</small>
    </article>
  `).join('') : '<p class="empty-state">Nenhum alerta comercial no momento.</p>';
}

function renderAttentionPanel() {
  if (!els.platformAttentionPanel) return;
  const alerts = platformClientAlerts();
  els.platformAttentionPanel.innerHTML = `
    <div class="section-actions compact-section-actions">
      <div>
        <p class="eyebrow">Clientes com atenção</p>
        <h3>Prioridades de suporte e receita</h3>
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
    </div>` : '<p class="empty-state">Nenhum cliente exige atenção imediata.</p>'}
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
    els.companyList.innerHTML = '<p class="empty-state">Nenhuma empresa cadastrada.</p>';
    return;
  }
  if (!companies.length) {
    els.companyList.innerHTML = '<p class="empty-state">Nenhum cliente encontrado para os filtros.</p>';
    return;
  }
  els.companyList.innerHTML = companies.map((company) => {
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
            <span>${money(metrics.revenue_month)}</span>
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
            <article><span>Faturamento/mês</span><strong>${money(metrics.revenue_month)}</strong></article>
            <article><span>MRR</span><strong>${money(metrics.mrr)}</strong></article>
            <article><span>Último pedido</span><strong>${metrics.last_order_at ? new Date(metrics.last_order_at).toLocaleDateString('pt-BR') : 'Sem pedidos'}</strong></article>
            <article><span>Responsável</span><strong>${escapeHtml(responsible?.name || 'Sem responsável')}</strong></article>
            <article><span>Cadastro</span><strong>${company.created_at ? new Date(company.created_at).toLocaleDateString('pt-BR') : '-'}</strong></article>
          </section>

          <section class="platform-client-block">
            <div class="section-actions compact-section-actions">
              <div>
                <p class="eyebrow">Ações rápidas</p>
                <h3>Plano, status e lojas</h3>
              </div>
              <button class="ghost-button compact" data-load-company-detail="${escapeAttribute(company.id)}" type="button">Atualizar detalhe</button>
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
              ${detail ? renderCompanyDetail(detail) : '<p class="empty-state">Abra o cliente para carregar admins, cobrança, uso, timeline e notas internas.</p>'}
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
  const delinquent = new Set(['payment_pending', 'grace_period', 'past_due', 'suspended']);
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
    if (activity === 'unpublished_store' && !stores.some((store) => store.is_active === false)) return false;
    if (activity === 'no_whatsapp' && !clientAlertsForCompany(company, metrics).some((alert) => alert.type === 'setup')) return false;
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
  const delinquent = new Set(['payment_pending', 'grace_period', 'past_due', 'suspended']);
  if (trialEndingSoon(subscription)) alerts.push({ type: 'trial', severity: 'warning', title: 'Trial perto do fim', action: 'Entrar em contato e orientar upgrade.' });
  if (delinquent.has(metrics.subscription_status || subscription.status || company.status)) alerts.push({ type: 'billing', severity: 'critical', title: 'Cobrança pendente', action: 'Verificar pagamento e webhook.' });
  if (!stores.length) alerts.push({ type: 'setup', severity: 'critical', title: 'Sem loja criada', action: 'Criar cardápio ou unidade.' });
  if (stores.some((store) => store.is_active === false)) alerts.push({ type: 'store', severity: 'attention', title: 'Loja não publicada ou suspensa', action: 'Validar status da loja.' });
  if (!metrics.has_orders && stores.length) alerts.push({ type: 'sales', severity: 'attention', title: 'Sem pedidos no período', action: 'Acompanhar ativação do cliente.' });
  return alerts;
}

function severityWeight(value) {
  return ({ critical: 3, warning: 2, attention: 1 })[value] || 0;
}

function companyMetrics(companyId) {
  return (state.analytics?.company_metrics || []).find((entry) => entry.company_id === companyId) || {};
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
    const detail = await request(`/api/platform/companies/${companyId}/detail`);
    state.companyDetails[companyId] = detail;
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
  return `
    <section class="platform-detail-section">
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
        <h4>Nota interna</h4>
        <textarea name="note" rows="3" placeholder="Registre comentário, combinado ou pendência comercial"></textarea>
        <div class="platform-note-grid">
          <input name="status" placeholder="Status. Ex: Aguardando retorno">
          <input name="responsible" placeholder="Responsável interno">
          <input name="next_contact_at" type="date">
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
  await request(`/api/platform/companies/${companyId}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  toast('Nota interna registrada.');
  await loadCompanyDetail(companyId);
}

function renderAudit() {
  els.auditList.innerHTML = state.logs.length ? state.logs.map((log) => `
    <article class="audit-row">
      <div>
        <strong>${escapeHtml(log.action)}</strong>
        <small>${new Date(log.created_at).toLocaleString('pt-BR')} ${log.severity ? `- ${escapeHtml(log.severity)}` : ''}</small>
      </div>
      <span>${escapeHtml(log.entity_type || 'plataforma')}</span>
    </article>
  `).join('') : '<p class="empty-state">Nenhum evento recente.</p>';
}

function renderHealth() {
  const health = state.health || {};
  if (health.error) {
    if (els.healthMeta) els.healthMeta.textContent = health.error;
    if (els.platformStatusGrid) els.platformStatusGrid.innerHTML = '<p class="empty-state">Não foi possível carregar os checks operacionais.</p>';
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
}

function renderPlatformStatuses(statuses) {
  if (!els.platformStatusGrid) return;
  els.platformStatusGrid.innerHTML = statuses.length ? statuses.map((item) => `
    <article class="platform-status-card status-${escapeAttribute(item.status)}">
      <span>${escapeHtml(statusLabelHealth(item.status))}</span>
      <strong>${escapeHtml(item.label)}</strong>
      <p>${escapeHtml(item.message || '-')}</p>
      ${item.latency_ms !== null && item.latency_ms !== undefined ? `<small>${Number(item.latency_ms)} ms</small>` : ''}
    </article>
  `).join('') : '<p class="empty-state">Nenhum status disponível.</p>';
}

function renderPlatformMetrics(metrics) {
  if (!els.platformMetrics) return;
  const rows = [
    ['API', metrics.api],
    ['Banco', metrics.database],
    ['Checkout', metrics.checkout],
    ['Pedidos', metrics.order_mutations]
  ];
  els.platformMetrics.innerHTML = rows.map(([label, data = {}]) => `
    <div class="platform-metric-row">
      <strong>${escapeHtml(label)}</strong>
      <span>Média: ${metricMs(data.average_ms)}</span>
      <span>P95: ${metricMs(data.p95_ms)}</span>
      <span>P99: ${metricMs(data.p99_ms)}</span>
      ${data.requests !== undefined ? `<small>${Number(data.requests || 0)} req.</small>` : ''}
    </div>
  `).join('');
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
  els.platformAlerts.innerHTML = alerts.length ? alerts.map((alert) => `
    <article class="platform-alert-row severity-${escapeAttribute(alert.severity)}">
      <strong>${escapeHtml(alert.title)}</strong>
      <p>${escapeHtml(alert.message || '')}</p>
      <small>${escapeHtml(alert.action || '')}</small>
    </article>
  `).join('') : '<p class="empty-state">Nenhum alerta operacional no momento.</p>';
}

function renderOperationalLogs() {
  if (!els.platformOperationalLogs) return;
  const type = els.operationalLogTypeFilter?.value || '';
  const status = els.operationalLogStatusFilter?.value || '';
  const logs = (state.health?.logs || [])
    .filter((entry) => !type || entry.type === type)
    .filter((entry) => !status || entry.status === status);
  els.platformOperationalLogs.innerHTML = logs.length ? logs.map((entry) => `
    <article class="platform-log-row status-${escapeAttribute(entry.status)}">
      <div>
        <strong>${escapeHtml(entry.action || entry.type)}</strong>
        <small>${entry.created_at ? new Date(entry.created_at).toLocaleString('pt-BR') : '-'} - ${escapeHtml(entry.type || 'system')}</small>
      </div>
      <p>${escapeHtml(entry.message || '')}</p>
    </article>
  `).join('') : '<p class="empty-state">Nenhum log operacional para os filtros.</p>';
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

function renderBackupStatus() {
  if (!els.backupStatus) return;
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
      <p>Retenção configurada: ${Number(backup.retention_days || 14)} dia(s).</p>
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
  const audit = await request(`/api/platform/audit${auditQueryString()}`);
  state.logs = audit.logs || [];
  renderAudit();
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

async function submitCompany(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(els.companyForm));
  await request('/api/platform/companies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  els.companyForm.reset();
  await loadPlatform();
  toast('Cliente cadastrado na plataforma.');
}

async function submitStore(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(els.storeForm));
  await request('/api/platform/stores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  els.storeForm.reset();
  await loadPlatform();
  toast('Cardápio criado para o cliente.');
}

async function submitCompanyManagement(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  await request(`/api/platform/companies/${form.dataset.companyId}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: data.status })
  });
  await request(`/api/platform/companies/${form.dataset.companyId}/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan_code: data.plan_code, status: data.status === 'trial' ? 'trial' : 'active' })
  });
  await loadPlatform();
  toast('Empresa atualizada.');
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
  window.location.href = '/admin';
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
    if (!response.ok) throw new Error(data.detail || data.error || 'Falha na requisicao.');
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
    cancelled: 'Cancelada',
    archived: 'Arquivada'
  })[status] || status || 'Indefinida';
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

