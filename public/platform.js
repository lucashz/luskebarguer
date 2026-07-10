const state = {
  admin: null,
  companies: [],
  plans: [],
  features: [],
  logs: [],
  backup: null,
  health: null
};

const els = {
  platformUser: document.querySelector('#platformUser'),
  platformBlocked: document.querySelector('#platformBlocked'),
  platformContent: document.querySelector('#platformContent'),
  platformLogoutButton: document.querySelector('#platformLogoutButton'),
  refreshPlatformButton: document.querySelector('#refreshPlatformButton'),
  companyForm: document.querySelector('#companyForm'),
  storeForm: document.querySelector('#storeForm'),
  companyPlanSelect: document.querySelector('#companyPlanSelect'),
  storeCompanySelect: document.querySelector('#storeCompanySelect'),
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
els.operationalLogTypeFilter?.addEventListener('change', renderOperationalLogs);
els.operationalLogStatusFilter?.addEventListener('change', renderOperationalLogs);

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
  const [companies, plans, audit, backup, health] = await Promise.all([
    request('/api/platform/companies'),
    request('/api/platform/plans'),
    request(`/api/platform/audit${auditQueryString()}`),
    request('/api/platform/backups').catch(() => ({ status: 'unknown', recent: [] })),
    request(healthUrl()).catch((error) => ({ error: error.message || 'Não foi possível carregar saúde operacional.' }))
  ]);
  state.companies = companies.companies || [];
  state.features = companies.features || [];
  state.plans = plans.plans || [];
  state.logs = audit.logs || [];
  state.backup = backup;
  state.health = health;
  render();
}

async function loadHealth() {
  if (els.refreshHealthButton) els.refreshHealthButton.disabled = true;
  try {
    state.health = await request(healthUrl());
    renderHealth();
  } catch (error) {
    state.health = { error: error.message || 'Não foi possível carregar saúde operacional.' };
    renderHealth();
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
  renderCompanies();
  renderAudit();
  renderBackupStatus();
  renderHealth();
}

function renderSelects() {
  const planOptions = state.plans.map((plan) => `<option value="${escapeAttribute(plan.code)}">${escapeHtml(plan.name)}</option>`).join('');
  els.companyPlanSelect.innerHTML = `<option value="">Selecione o plano inicial</option>${planOptions || '<option value="essential">Essencial</option>'}`;
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

function renderCompanies() {
  if (!state.companies.length) {
    els.companyList.innerHTML = '<p class="empty-state">Nenhuma empresa cadastrada.</p>';
    return;
  }
  els.companyList.innerHTML = state.companies.map((company) => {
    const subscription = company.subscription || {};
    const plan = state.plans.find((item) => item.id === subscription.plan_id);
    const stores = company.stores || [];
    return `
      <article class="platform-company-card">
        <div class="platform-company-head">
          <div>
            <strong>${escapeHtml(company.name)}</strong>
            <small>${escapeHtml(company.billing_email || company.phone || 'Sem contato financeiro')}</small>
          </div>
          <span class="pill ${company.status === 'active' ? 'pill-ok' : 'pill-muted'}">${escapeHtml(statusLabel(company.status))}</span>
        </div>
        <form class="platform-company-actions" data-company-id="${escapeAttribute(company.id)}">
          <select name="status">
            ${statusOptions(company.status)}
          </select>
          <select name="plan_code">
            ${state.plans.map((item) => `<option value="${escapeAttribute(item.code)}" ${plan?.id === item.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}
          </select>
          <button class="ghost-button compact" data-action="save-status" type="submit">Salvar</button>
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
              <button class="ghost-button compact">Salvar loja</button>
            </form>
          `).join('') : '<p class="empty-state">Nenhuma loja cadastrada para esta empresa.</p>'}
        </div>
        <div class="platform-overrides">
          <strong>Excecoes de recursos</strong>
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
        </div>
      </article>
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
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || data.error || 'Falha na requisicao.');
  return data;
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

function overrideTypeLabel(type) {
  return ({
    allow: 'Liberado manualmente',
    block: 'Bloqueado manualmente',
    limit: 'Limite manual'
  })[type] || type;
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

