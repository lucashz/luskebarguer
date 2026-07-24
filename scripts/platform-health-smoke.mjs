import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

loadEnv(new URL('../.env', import.meta.url));

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL ausente.');
  process.exit(1);
}

const port = Number(process.env.PLATFORM_HEALTH_SMOKE_PORT || 3207 + Math.floor(Math.random() * 500));
const baseUrl = `http://127.0.0.1:${port}`;
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = '12345678';
const backupDir = new URL(`../.tmp/platform-health-${suffix}/backups/`, import.meta.url);
const uploadDir = new URL(`../.tmp/platform-health-${suffix}/uploads/`, import.meta.url);
const backupDirPath = fileURLToPath(backupDir);
const uploadDirPath = fileURLToPath(uploadDir);
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: shouldUseSsl(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : false
});

let serverProcess = null;
let companyId = null;
let fixtureEmails = [];
let smtpSettingsSnapshot = null;

try {
  await client.connect();
  await applyCommunicationMigrationForSmoke();
  await prepareDelayedBackup();
  const fixture = await createFixture();
  companyId = fixture.companyId;
  fixtureEmails = [fixture.superEmail, fixture.adminEmail];

  serverProcess = await startServer();

  await fetch(`${baseUrl}/api/health`);
  await fetch(`${baseUrl}/api/health`);

  const superLogin = await request('/api/admin/login', {
    method: 'POST',
    body: { email: fixture.superEmail, password }
  });
  assert(superLogin.cookie, 'Login do Admin Master nao retornou cookie.');

  const page = await fetch(`${baseUrl}/plataform`, { headers: { Cookie: superLogin.cookie } });
  assert(page.ok, '/plataform nao carregou o HTML da plataforma.');

  const health = await request('/api/platform/health?period=24h', { cookie: superLogin.cookie });
  assert(Array.isArray(health.data.statuses) && health.data.statuses.length >= 10, 'Status operacional incompleto.');
  assert(health.data.statuses.some((item) => item.key === 'smtp'), 'Status SMTP nao foi retornado.');
  assert(health.data.statuses.some((item) => item.key === 'ssl'), 'Status SSL/dominio nao foi retornado.');
  assert(health.data.metrics?.api && health.data.metrics?.database && health.data.metrics?.checkout && health.data.metrics?.order_mutations && health.data.metrics?.system, 'Metricas operacionais incompletas.');
  assert(typeof health.data.metrics.api.requests_per_minute === 'number', 'Metricas nao retornaram requisicoes por minuto.');
  assert(health.data.metrics.system.memory && health.data.metrics.system.disk, 'Metricas de memoria/disco nao retornaram.');
  assert(Array.isArray(health.data.config?.items) && health.data.config.items.length >= 8, 'Checklist operacional incompleto.');
  assert(health.data.backup?.status, 'Monitoramento de backup nao retornou status.');
  assert(health.data.alerts?.some((alert) => alert.key === 'backup_delayed'), 'Backup atrasado nao gerou alerta.');

  const rawHealth = JSON.stringify(health.data);
  assert(!rawHealth.includes(process.env.DATABASE_URL), 'DATABASE_URL vazou na resposta de saude operacional.');
  assert(!rawHealth.includes('password_hash'), 'Campo sensivel password_hash vazou na resposta.');
  assert(!rawHealth.includes(password), 'Senha de teste vazou na resposta.');
  assert(!rawHealth.includes('Ã'), 'Resposta de saude operacional contem acentuacao quebrada.');

  const [platformLogs, platformMetrics, platformOperationalAlerts] = await Promise.all([
    request('/api/platform/logs?period=24h&type=backup', { cookie: superLogin.cookie }),
    request('/api/platform/metrics?period=24h', { cookie: superLogin.cookie }),
    request('/api/platform/alerts/operational?period=24h', { cookie: superLogin.cookie })
  ]);
  assert(Array.isArray(platformLogs.data.logs), 'Endpoint de logs operacionais nao retornou lista.');
  assert(platformLogs.data.logs.every((log) => log.type === 'backup'), 'Filtro de tipo em logs operacionais falhou.');
  assert(platformMetrics.data.metrics?.system, 'Endpoint de metricas nao retornou metricas de sistema.');
  assert(Array.isArray(platformOperationalAlerts.data.alerts), 'Endpoint de alertas operacionais nao retornou lista.');
  assert(!JSON.stringify(platformLogs.data).includes(process.env.DATABASE_URL), 'Logs operacionais vazaram DATABASE_URL.');

  const services = await request('/api/platform/services/status', { cookie: superLogin.cookie });
  assert(services.data.application?.uptime_seconds >= 0, 'Status de aplicacao nao retornou uptime.');
  assert(services.data.database?.status, 'Status do banco nao retornou estado.');
  assert(services.data.deploy?.commit, 'Status de deploy nao retornou commit.');
  assert(services.data.storage_usage?.database, 'Status de servicos nao retornou uso do banco.');
  assert(services.data.storage_usage?.backups, 'Status de servicos nao retornou uso de backups.');
  assert(services.data.storage_usage?.uploads, 'Status de servicos nao retornou uso de uploads.');
  assert(typeof services.data.retention?.audit_log_days === 'number', 'Status de servicos nao retornou retencao de auditoria.');
  const rawServices = JSON.stringify(services.data);
  assert(!rawServices.includes(process.env.DATABASE_URL), 'DATABASE_URL vazou na resposta de servicos.');
  assert(!rawServices.includes(password), 'Senha de teste vazou na resposta de servicos.');

  const cleanupPreview = await request('/api/platform/services/log-cleanup/preview', {
    method: 'POST',
    cookie: superLogin.cookie,
    body: {}
  });
  assert(cleanupPreview.data.mode === 'dry_run', 'Simulacao de limpeza nao retornou modo dry_run.');
  assert(Array.isArray(cleanupPreview.data.result?.database), 'Simulacao de limpeza nao retornou tabelas analisadas.');
  assert(typeof cleanupPreview.data.result?.totals?.database_rows === 'number', 'Simulacao de limpeza nao retornou totais numericos.');
  assert(!JSON.stringify(cleanupPreview.data).includes(process.env.DATABASE_URL), 'Cleanup preview vazou DATABASE_URL.');

  const backupNoPassword = await request('/api/platform/services/backup', {
    method: 'POST',
    cookie: superLogin.cookie,
    body: { confirmation: 'CONFIRMAR' },
    allowFailure: true
  });
  assert(backupNoPassword.status === 401, 'Acao critica sem senha nao falhou.');

  const backupBadConfirmation = await request('/api/platform/services/backup', {
    method: 'POST',
    cookie: superLogin.cookie,
    body: { confirmation: 'ERRADO', password },
    allowFailure: true
  });
  assert(backupBadConfirmation.status === 422, 'Acao critica com confirmacao invalida nao falhou.');

  const restoreBadConfirmation = await request('/api/platform/services/backup/restore', {
    method: 'POST',
    cookie: superLogin.cookie,
    body: { confirmation: 'ERRADO', password, file: 'postgres-smoke.dump' },
    allowFailure: true
  });
  assert(restoreBadConfirmation.status === 422, 'Restore com confirmacao invalida nao falhou.');

  const cleanupNoPassword = await request('/api/platform/services/log-cleanup', {
    method: 'POST',
    cookie: superLogin.cookie,
    body: { confirmation: 'CONFIRMAR' },
    allowFailure: true
  });
  assert(cleanupNoPassword.status === 401, 'Limpeza de logs sem senha nao falhou.');

  await client.query(`
    insert into audit_logs (action, entity_type, severity, after_data, created_at)
    values ('platform.service.backup', 'platform_service', 'warning', '{"message":"log antigo smoke"}'::jsonb, now() - interval '2 days')
  `);
  const serviceLogs = await request('/api/platform/services/logs', { cookie: superLogin.cookie });
  assert(Array.isArray(serviceLogs.data.logs), 'Logs de servicos nao retornaram lista.');
  assert(!serviceLogs.data.logs.some((log) => log.message === 'log antigo smoke'), 'Logs de servicos retornaram evento com mais de 24h.');
  assert(serviceLogs.data.logs.some((log) => /confirmation|password/.test(log.action || '')), 'Auditoria de acao critica falha nao foi registrada.');

  const summary = await request('/api/platform/summary', { cookie: superLogin.cookie });
  assert(summary.data.cards && typeof summary.data.cards.active_clients === 'number', 'Resumo executivo nao retornou cards.');
  assert('revenue_today_cents' in summary.data.cards, 'Resumo executivo nao retornou valores em centavos.');
  assert(!hasBrokenMetric(summary.data), 'Resumo executivo contem NaN, undefined ou null textual.');

  for (const period of ['7d', '15d', '30d']) {
    const analytics = await request(`/api/platform/analytics?period=${period}`, { cookie: superLogin.cookie });
    assert(analytics.data.period === period, `Analytics nao respeitou periodo ${period}.`);
    assert(Array.isArray(analytics.data.daily) && analytics.data.daily.length > 0, `Analytics ${period} nao retornou serie diaria.`);
    assert(analytics.data.revenue && analytics.data.conversion, `Analytics ${period} nao retornou receita/conversao.`);
    assert(!hasBrokenMetric(analytics.data), `Analytics ${period} contem NaN, undefined ou null textual.`);
  }

  const [alerts, revenue, conversion] = await Promise.all([
    request('/api/platform/alerts?period=30d', { cookie: superLogin.cookie }),
    request('/api/platform/revenue?period=30d', { cookie: superLogin.cookie }),
    request('/api/platform/conversion?period=30d', { cookie: superLogin.cookie })
  ]);
  assert(Array.isArray(alerts.data.alerts), 'Endpoint de alertas nao retornou lista.');
  assert(typeof revenue.data.mrr_cents === 'number', 'Endpoint de receita nao retornou MRR em centavos.');
  assert(typeof conversion.data.conversion_rate === 'number', 'Endpoint de conversao nao retornou taxa numerica.');

  const [billingSummary, billingPlans, billingSubscriptions, billingEvents] = await Promise.all([
    request('/api/platform/billing/summary?period=30d', { cookie: superLogin.cookie }),
    request('/api/platform/billing/plans', { cookie: superLogin.cookie }),
    request('/api/platform/billing/subscriptions?period=30d', { cookie: superLogin.cookie }),
    request('/api/platform/billing/events?period=30d', { cookie: superLogin.cookie })
  ]);
  assert(typeof billingSummary.data.mrr_total_cents === 'number', 'Resumo de billing nao retornou MRR total em centavos.');
  assert(typeof billingSummary.data.pending_revenue_cents === 'number', 'Resumo de billing nao retornou receita pendente em centavos.');
  assert(Array.isArray(billingPlans.data.plans), 'Billing plans nao retornou lista.');
  assert(Array.isArray(billingSubscriptions.data.subscriptions), 'Billing subscriptions nao retornou lista.');
  assert(billingSubscriptions.data.subscriptions.some((row) => row.company_id === fixture.companyId), 'Assinatura fixture nao apareceu no billing.');
  assert(Array.isArray(billingEvents.data.events), 'Billing events nao retornou lista.');
  assert(!JSON.stringify(billingSummary.data).includes(process.env.DATABASE_URL), 'Billing summary vazou DATABASE_URL.');

  const smtpSettings = await request('/api/platform/smtp', { cookie: superLogin.cookie });
  assert(smtpSettings.data.smtp && smtpSettings.data.smtp.password_token === undefined, 'SMTP expos senha/token.');
  smtpSettingsSnapshot = await snapshotSmtpSettings();
  const savedSmtp = await request('/api/platform/smtp', {
    method: 'PUT',
    cookie: superLogin.cookie,
    body: {
      host: 'smtp.invalid.local',
      port: 2525,
      username: 'suporte@cardapio.local',
      password: 'segredo-smoke',
      from_email: 'suporte@cardapio.local',
      from_name: 'Suporte TáPronto',
      reply_to: 'responder@cardapio.local',
      use_tls: false,
      is_active: false
    }
  });
  assert(savedSmtp.data.smtp.has_password === true, 'SMTP salvo nao informou senha configurada.');
  assert(savedSmtp.data.smtp.password_token === undefined, 'SMTP salvo expos senha/token.');
  const smtpTest = await request('/api/platform/smtp/test', {
    method: 'POST',
    cookie: superLogin.cookie,
    body: { email: fixture.superEmail },
    allowFailure: true
  });
  assert(smtpTest.status === 502, 'Teste SMTP sem configuracao ativa nao retornou erro tratado.');
  await restoreSmtpSettings(smtpSettingsSnapshot);
  smtpSettingsSnapshot = null;

  const templates = await request('/api/platform/email-templates', { cookie: superLogin.cookie });
  assert(templates.data.templates?.some((template) => template.template_key === 'welcome'), 'Templates de e-mail nao carregaram.');
  const templateSave = await request('/api/platform/email-templates', {
    method: 'PUT',
    cookie: superLogin.cookie,
    body: { template_key: 'welcome', subject: 'Bem-vindo {{store_name}}', body: 'Ola {{customer_name}}' }
  });
  assert(templateSave.data.templates?.[0]?.template_key === 'welcome', 'Template de e-mail nao foi salvo.');

  const adminTicket = await request('/api/admin/support/tickets', {
    method: 'POST',
    cookie: superLogin.cookie,
    body: { subject: 'Chamado smoke', category: 'teste', priority: 'medium', message: 'Mensagem smoke' }
  });
  assert(adminTicket.data.ticket?.id, 'Admin comum nao conseguiu abrir chamado.');
  const supportTickets = await request('/api/platform/support/tickets', { cookie: superLogin.cookie });
  assert(supportTickets.data.tickets?.some((ticket) => ticket.id === adminTicket.data.ticket.id), 'Platform nao listou chamado criado.');
  const supportReply = await request(`/api/platform/support/tickets/${adminTicket.data.ticket.id}/messages`, {
    method: 'POST',
    cookie: superLogin.cookie,
    body: { message: 'Resposta smoke', is_internal: false }
  });
  assert(supportReply.data.message?.id, 'Superadmin nao respondeu chamado.');
  const supportUpdate = await request(`/api/platform/support/tickets/${adminTicket.data.ticket.id}`, {
    method: 'PATCH',
    cookie: superLogin.cookie,
    body: { status: 'resolved', priority: 'high' }
  });
  assert(supportUpdate.data.ticket?.status === 'resolved', 'Status do chamado nao foi atualizado.');

  const companies = await request('/api/platform/companies', { cookie: superLogin.cookie });
  assert(Array.isArray(companies.data.companies), 'Listagem de clientes nao retornou lista.');
  assert(companies.data.pagination, 'Listagem de clientes nao retornou paginacao.');
  assert(companies.data.companies.some((company) => company.id === fixture.companyId), 'Cliente fixture nao apareceu na listagem.');

  const detail = await request(`/api/platform/companies/${fixture.companyId}/detail`, { cookie: superLogin.cookie });
  assert(detail.data.company?.id === fixture.companyId, 'Detalhe do cliente nao carregou a empresa correta.');
  assert(Array.isArray(detail.data.stores), 'Detalhe do cliente nao retornou lojas.');
  assert(Array.isArray(detail.data.admins), 'Detalhe do cliente nao retornou admins.');

  const note = await request(`/api/platform/companies/${fixture.companyId}/notes`, {
    method: 'POST',
    cookie: superLogin.cookie,
    body: { note: 'Nota smoke do platform', status: 'em acompanhamento' }
  });
  assert(note.data.note?.note, 'Nota interna nao foi salva.');

  const internalStatus = await request(`/api/platform/companies/${fixture.companyId}/internal-status`, {
    method: 'PATCH',
    cookie: superLogin.cookie,
    body: { status: 'em acompanhamento', responsible: 'Equipe smoke', priority: 'high', tags: 'onboarding,teste', note: 'Acompanhamento smoke' }
  });
  assert(internalStatus.data.status?.support_status === 'em acompanhamento', 'Status interno avancado nao foi salvo.');

  const score = await request(`/api/platform/companies/${fixture.companyId}/score`, { cookie: superLogin.cookie });
  assert(score.data.company_id === fixture.companyId, 'Score retornou empresa errada.');
  assert(score.data.label && Array.isArray(score.data.recommendations), 'Score nao retornou classificacao e recomendacoes.');

  const timeline = await request(`/api/platform/companies/${fixture.companyId}/timeline`, { cookie: superLogin.cookie });
  assert(Array.isArray(timeline.data.timeline), 'Timeline avancada nao retornou lista.');
  assert(timeline.data.timeline.some((entry) => /Conta criada|Acompanhamento|Nota|Chamado/.test(entry.title || '')), 'Timeline avancada nao trouxe eventos esperados.');

  const supportNoPassword = await request('/api/platform/support/impersonate', {
    method: 'POST',
    cookie: superLogin.cookie,
    body: { store_id: fixture.storeId, confirmation: 'CONFIRMAR' },
    allowFailure: true
  });
  assert(supportNoPassword.status === 401, 'Modo suporte sem senha nao falhou.');

  const supportBadConfirmation = await request('/api/platform/support/impersonate', {
    method: 'POST',
    cookie: superLogin.cookie,
    body: { store_id: fixture.storeId, confirmation: 'ERRADO', password },
    allowFailure: true
  });
  assert(supportBadConfirmation.status === 422, 'Modo suporte com confirmacao invalida nao falhou.');

  const supportStart = await request('/api/platform/support/impersonate', {
    method: 'POST',
    cookie: superLogin.cookie,
    body: { store_id: fixture.storeId, confirmation: 'CONFIRMAR', password, ttl_seconds: 60 }
  });
  assert(supportStart.data.admin?.support_mode?.active === true, 'Modo suporte nao retornou sessao ativa.');
  assert(!JSON.stringify(supportStart.data).includes('original_session_token'), 'Token original vazou no modo suporte.');
  const supportMe = await request('/api/admin/me', { cookie: supportStart.cookie });
  assert(supportMe.data.admin?.support_mode?.active === true, 'Admin nao exibiu banner/dados do modo suporte.');
  assert(supportMe.data.admin.store_id === fixture.storeId, 'Modo suporte nao fixou a loja alvo.');
  const supportSensitive = await request('/api/admin/users', { cookie: supportStart.cookie, allowFailure: true });
  assert(supportSensitive.status === 403, 'Modo suporte acessou area sensivel de usuarios.');
  const supportEnd = await request('/api/platform/support/impersonate/end', {
    method: 'POST',
    cookie: supportStart.cookie
  });
  assert(supportEnd.data.ok === true && supportEnd.data.restored === true, 'Encerrar modo suporte nao restaurou a sessao original.');
  const restoredPlatform = await request('/api/platform/health', { cookie: supportEnd.cookie });
  assert(Array.isArray(restoredPlatform.data.statuses), 'Sessao original nao voltou ao platform apos encerrar suporte.');

  const supportShort = await request('/api/platform/support/impersonate', {
    method: 'POST',
    cookie: superLogin.cookie,
    body: { store_id: fixture.storeId, confirmation: 'CONFIRMAR', password, ttl_seconds: 1 }
  });
  await delay(1200);
  const expiredSupport = await request('/api/admin/me', { cookie: supportShort.cookie, allowFailure: true });
  assert(expiredSupport.status === 401, 'Sessao de suporte expirada continuou valida.');

  const suspendNoPassword = await request(`/api/platform/companies/${fixture.companyId}/suspend`, {
    method: 'POST',
    cookie: superLogin.cookie,
    body: { confirmation: 'CONFIRMAR' },
    allowFailure: true
  });
  assert(suspendNoPassword.status === 401, 'Suspensao critica sem senha nao falhou.');

  const suspend = await request(`/api/platform/companies/${fixture.companyId}/suspend`, {
    method: 'POST',
    cookie: superLogin.cookie,
    body: { confirmation: 'CONFIRMAR', password, reason: 'smoke' }
  });
  assert(suspend.data.company?.status === 'suspended', 'Cliente nao foi suspenso pelo platform.');

  const activate = await request(`/api/platform/companies/${fixture.companyId}/activate`, {
    method: 'POST',
    cookie: superLogin.cookie,
    body: { reason: 'smoke' }
  });
  assert(activate.data.company?.status === 'active', 'Cliente nao foi liberado pelo platform.');

  const reopen = await request(`/api/platform/companies/${fixture.companyId}/reopen-onboarding`, {
    method: 'POST',
    cookie: superLogin.cookie,
    body: { confirmation: 'CONFIRMAR', password, reason: 'smoke' }
  });
  assert(reopen.data.ok === true, 'Reabrir onboarding nao retornou sucesso.');

  const resendBilling = await request(`/api/platform/companies/${fixture.companyId}/resend-billing`, {
    method: 'POST',
    cookie: superLogin.cookie,
    body: { note: 'smoke' }
  });
  assert(resendBilling.data.ok === true, 'Reenvio de cobranca nao retornou sucesso.');

  const targetPlan = billingPlans.data.plans.find((plan) => plan.code) || { code: fixture.planCode };
  const changePlan = await request(`/api/platform/companies/${fixture.companyId}/change-plan`, {
    method: 'POST',
    cookie: superLogin.cookie,
    body: { plan_code: targetPlan.code, status: 'active' }
  });
  assert(changePlan.data.subscription?.plan, 'Alteracao de plano nao retornou plano.');

  const cancelNoPassword = await request(`/api/platform/companies/${fixture.companyId}/cancel-subscription`, {
    method: 'POST',
    cookie: superLogin.cookie,
    body: { confirmation: 'CONFIRMAR' },
    allowFailure: true
  });
  assert(cancelNoPassword.status === 401, 'Cancelamento sem senha nao falhou.');

  const cancelSubscription = await request(`/api/platform/companies/${fixture.companyId}/cancel-subscription`, {
    method: 'POST',
    cookie: superLogin.cookie,
    body: { confirmation: 'CONFIRMAR', password, reason: 'smoke' }
  });
  assert(cancelSubscription.data.ok === true, 'Cancelamento de assinatura nao retornou sucesso.');

  const reactivateSubscription = await request(`/api/platform/companies/${fixture.companyId}/reactivate-subscription`, {
    method: 'POST',
    cookie: superLogin.cookie,
    body: { plan_code: targetPlan.code }
  });
  assert(reactivateSubscription.data.ok === true, 'Reativacao de assinatura nao retornou sucesso.');

  const audit = await request('/api/platform/audit?action=platform.client.note', { cookie: superLogin.cookie });
  assert(audit.data.logs?.some((log) => log.action === 'platform.client.note'), 'Auditoria da nota interna nao foi registrada.');
  const supportAuditStart = await request('/api/platform/audit?action=platform.support.impersonate.start', { cookie: superLogin.cookie });
  assert(supportAuditStart.data.logs?.some((log) => log.action === 'platform.support.impersonate.start'), 'Auditoria de inicio do modo suporte nao foi registrada.');
  const supportAuditEnd = await request('/api/platform/audit?action=platform.support.impersonate.end', { cookie: superLogin.cookie });
  assert(supportAuditEnd.data.logs?.some((log) => log.action === 'platform.support.impersonate.end'), 'Auditoria de fim do modo suporte nao foi registrada.');

  const tenantLogin = await request('/api/admin/login', {
    method: 'POST',
    body: { email: fixture.adminEmail, password }
  });
  const denied = await request('/api/platform/health', {
    cookie: tenantLogin.cookie,
    allowFailure: true
  });
  assert(denied.status === 403, 'Admin comum acessou a saude operacional da plataforma.');
  const deniedServices = await request('/api/platform/services/status', {
    cookie: tenantLogin.cookie,
    allowFailure: true
  });
  assert(deniedServices.status === 403, 'Admin comum acessou os servicos da plataforma.');
  const deniedOperationalLogs = await request('/api/platform/logs', {
    cookie: tenantLogin.cookie,
    allowFailure: true
  });
  assert(deniedOperationalLogs.status === 403, 'Admin comum acessou logs operacionais da plataforma.');
  const deniedOperationalMetrics = await request('/api/platform/metrics', {
    cookie: tenantLogin.cookie,
    allowFailure: true
  });
  assert(deniedOperationalMetrics.status === 403, 'Admin comum acessou metricas operacionais da plataforma.');
  const deniedSummary = await request('/api/platform/summary', {
    cookie: tenantLogin.cookie,
    allowFailure: true
  });
  assert(deniedSummary.status === 403, 'Admin comum acessou o dashboard executivo da plataforma.');
  const deniedBilling = await request('/api/platform/billing/summary', {
    cookie: tenantLogin.cookie,
    allowFailure: true
  });
  assert(deniedBilling.status === 403, 'Admin comum acessou billing da plataforma.');
  const deniedSmtp = await request('/api/platform/smtp', {
    cookie: tenantLogin.cookie,
    allowFailure: true
  });
  assert(deniedSmtp.status === 403, 'Admin comum acessou SMTP global da plataforma.');
  const deniedImpersonate = await request('/api/platform/support/impersonate', {
    method: 'POST',
    cookie: tenantLogin.cookie,
    body: { store_id: fixture.storeId, confirmation: 'CONFIRMAR', password },
    allowFailure: true
  });
  assert(deniedImpersonate.status === 403, 'Admin comum iniciou modo suporte.');
  const deniedClientAction = await request(`/api/platform/companies/${fixture.companyId}/suspend`, {
    method: 'POST',
    cookie: tenantLogin.cookie,
    body: { confirmation: 'CONFIRMAR', password },
    allowFailure: true
  });
  assert(deniedClientAction.status === 403, 'Admin comum executou acao critica de cliente.');

  console.log('Saude operacional da plataforma validada com sucesso.');
} finally {
  if (smtpSettingsSnapshot) {
    await restoreSmtpSettings(smtpSettingsSnapshot).catch(() => {});
  }
  if (fixtureEmails.length) {
    await cleanupAdminsByEmail(fixtureEmails).catch(() => {});
  }
  if (companyId) {
    await client.query('delete from public.companies where id = $1', [companyId]).catch(() => {});
  }
  if (fixtureEmails.length) {
    await cleanupAdminsByEmail(fixtureEmails).catch(() => {});
  }
  await client.end().catch(() => {});
  if (serverProcess) {
    serverProcess.kill();
    await new Promise((resolve) => serverProcess.once('exit', resolve));
  }
  await rm(new URL(`../.tmp/platform-health-${suffix}/`, import.meta.url), { recursive: true, force: true }).catch(() => {});
}

async function snapshotSmtpSettings() {
  const rows = await client.query(`
    select * from public.platform_smtp_settings
    order by created_at asc
  `).catch(() => ({ rows: [] }));
  return rows.rows;
}

async function restoreSmtpSettings(snapshot = []) {
  await client.query('delete from public.platform_smtp_settings').catch(() => {});
  for (const row of snapshot) {
    const columns = Object.keys(row);
    const values = columns.map((key) => row[key]);
    const placeholders = columns.map((_, index) => `$${index + 1}`);
    await client.query(`
      insert into public.platform_smtp_settings (${columns.map((column) => `"${column}"`).join(', ')})
      values (${placeholders.join(', ')})
    `, values);
  }
}

async function cleanupAdminsByEmail(emails) {
  await client.query(`
    delete from public.admin_users
    where email = any($1::text[])
  `, [emails]);
}

async function applyCommunicationMigrationForSmoke() {
  const exists = await client.query(`
    select to_regclass('public.platform_smtp_settings') as smtp_table
  `);
  if (exists.rows[0]?.smtp_table) return;
  const migration = await readFile(new URL('../prisma/migrations/20260712180000_platform_smtp_support/migration.sql', import.meta.url), 'utf8');
  await client.query(migration);
}

async function createFixture() {
  const superEmail = `platform-super-${suffix}@cardapio.local`;
  const adminEmail = `platform-admin-${suffix}@cardapio.local`;
  const company = await client.query(`
    insert into public.companies (name, status, billing_email)
    values ($1, 'trial', $2)
    returning id
  `, [`Smoke Plataforma ${suffix}`, superEmail]);
  const createdCompanyId = company.rows[0].id;
  const store = await client.query(`
    insert into public.stores (company_id, name, slug, public_url, is_active)
    values ($1, $2, $3, $4, true)
    returning id
  `, [createdCompanyId, `Smoke Plataforma ${suffix}`, `platform-health-${suffix}`, `/platform-health-${suffix}`]);
  const storeId = store.rows[0].id;
  const superAdmin = await insertAdmin(createdCompanyId, superEmail, 'Admin Master Smoke', 'superadmin');
  const tenantAdmin = await insertAdmin(createdCompanyId, adminEmail, 'Admin Loja Smoke', 'admin');
  await linkAccess(superAdmin.id, createdCompanyId, storeId, 'superadmin');
  await linkAccess(tenantAdmin.id, createdCompanyId, storeId, 'admin');
  const plan = await ensureBillingPlan();
  await client.query(`
    insert into public.company_subscriptions (
      company_id, plan_id, status, current_period_starts_at, current_period_ends_at, next_renewal_at, billing_provider, metadata
    )
    values ($1, $2, 'trial', now(), now() + interval '14 days', now() + interval '14 days', 'manual', $3::jsonb)
  `, [createdCompanyId, plan.id, JSON.stringify({ source: 'platform_health_smoke' })]);
  return { companyId: createdCompanyId, storeId, superEmail, adminEmail, planCode: plan.code };
}

async function ensureBillingPlan() {
  const existing = await client.query(`
    select id, code from public.subscription_plans
    where is_active = true
    order by sort_order asc, created_at asc
    limit 1
  `);
  if (existing.rows[0]) return existing.rows[0];
  const inserted = await client.query(`
    insert into public.subscription_plans (code, name, description, monthly_price, annual_price, sort_order, is_active, settings)
    values ('smoke-platform', 'Smoke Platform', 'Plano temporario para smoke test', 39.90, 0, 999, true, '{}'::jsonb)
    on conflict (code) do update set is_active = true
    returning id, code
  `);
  return inserted.rows[0];
}

async function insertAdmin(targetCompanyId, email, name, role) {
  const result = await client.query(`
    insert into public.admin_users (company_id, name, email, password_hash, role, is_active)
    values ($1, $2, $3, $4, $5, true)
    returning id
  `, [targetCompanyId, name, email, hashPassword(password), role]);
  return result.rows[0];
}

async function linkAccess(adminUserId, targetCompanyId, storeId, role) {
  await client.query(`
    insert into public.admin_user_store_access (admin_user_id, company_id, store_id, role, permissions, is_active)
    values ($1, $2, $3, $4, array[]::text[], true)
  `, [adminUserId, targetCompanyId, storeId, role]);
}

async function prepareDelayedBackup() {
  await mkdir(backupDir, { recursive: true });
  await mkdir(uploadDir, { recursive: true });
  const backupFile = new URL('postgres-old.dump', backupDir);
  await writeFile(backupFile, 'old backup');
  const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
  await utimes(backupFile, oldDate, oldDate);
  await writeFile(new URL('backup-status.json', backupDir), JSON.stringify({
    status: 'success',
    finished_at: oldDate.toISOString(),
    updated_at: oldDate.toISOString(),
    output: 'postgres-old.dump',
    size_bytes: 10
  }));
}

async function startServer() {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      COOKIE_SECURE: 'false',
      PLATFORM_BILLING_PROVIDER: 'mock',
      PLATFORM_BILLING_API_KEY: 'test-platform-key',
      PLATFORM_BILLING_WEBHOOK_SECRET: 'test-platform-secret',
      APP_URL: baseUrl,
      PUBLIC_APP_URL: baseUrl,
      BACKUP_DIR: backupDirPath,
      UPLOAD_DIR: uploadDirPath
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Servidor encerrou durante o boot.\n${logs}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return child;
    } catch {
      // Aguarda o servidor subir.
    }
    await delay(250);
  }
  child.kill();
  throw new Error(`Servidor nao respondeu em ${baseUrl}.\n${logs}`);
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  if (options.cookie) headers.Cookie = options.cookie;
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  const cookie = response.headers.get('set-cookie')?.split(';')[0] || options.cookie || '';
  if (!response.ok && !options.allowFailure) {
    throw new Error(`${options.method || 'GET'} ${path}: ${data.error || response.statusText}`);
  }
  return { status: response.status, data, cookie };
}

function hashPassword(value) {
  const salt = randomBytes(16).toString('hex');
  const iterations = 310000;
  const digest = pbkdf2Sync(value, salt, iterations, 32, 'sha256').toString('hex');
  return `pbkdf2_sha256$${iterations}$${salt}$${digest}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hasBrokenMetric(value) {
  const text = JSON.stringify(value);
  return /\bNaN\b|\bundefined\b/.test(text);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadEnv(url) {
  if (!existsSync(url)) return;
  const content = readFileSync(url, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    process.env[key.trim()] ||= rest.join('=').trim().replace(/^["']|["']$/g, '');
  }
}

function shouldUseSsl(value) {
  return process.env.DB_SSL === 'true' || /sslmode=require/i.test(String(value || ''));
}
