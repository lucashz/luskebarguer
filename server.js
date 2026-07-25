import { createServer } from 'node:http';
import { mkdir, readFile, readdir, stat, statfs, unlink, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import v8 from 'node:v8';
import net from 'node:net';
import tls from 'node:tls';
import pg from 'pg';
import { localPostgrestRequest } from './src/lib/local-postgrest-adapter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');

loadEnv(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const DATABASE_URL = process.env.DATABASE_URL || '';
const UPLOAD_DIR = path.resolve(__dirname, process.env.UPLOAD_DIR || 'uploads');
const BACKUP_DIR = path.resolve(__dirname, process.env.BACKUP_DIR || 'backups');
const STORE_WHATSAPP_NUMBER = onlyDigits(process.env.STORE_WHATSAPP_NUMBER || '');
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const ADMIN_COOKIE = 'admin_session';
const CUSTOMER_COOKIE = 'customer_session';
const SESSION_MAX_AGE_DAYS = clampNumber(Number(process.env.SESSION_MAX_AGE_DAYS || 180), 1, 365);
const SESSION_MAX_AGE = 60 * 60 * 24 * SESSION_MAX_AGE_DAYS;
const SESSION_RENEW_MS = 1000 * 60 * 60 * 24 * 30;
const COOKIE_SECURE = parseBoolean(process.env.COOKIE_SECURE, false);
const PASSWORD_MIN_LENGTH = clampNumber(Number(process.env.PASSWORD_MIN_LENGTH || 8), 8, 72);
const ADMIN_SETUP_ENABLED = parseBoolean(process.env.ADMIN_SETUP_ENABLED, false);
const EXPOSE_ERROR_DETAIL = parseBoolean(process.env.EXPOSE_ERROR_DETAIL, false);
const PLATFORM_BILLING_PROVIDER = cleanText(process.env.PLATFORM_BILLING_PROVIDER || 'abacatepay').toLowerCase();
const PLATFORM_BILLING_API_KEY = process.env.PLATFORM_BILLING_API_KEY || process.env.ABACATEPAY_API_KEY || '';
const PLATFORM_BILLING_WEBHOOK_SECRET = process.env.PLATFORM_BILLING_WEBHOOK_SECRET || process.env.ABACATEPAY_WEBHOOK_SECRET || '';
const ABACATEPAY_API_BASE = 'https://api.abacatepay.com/v2';
const BILLING_GRACE_DAYS = clampNumber(Number(process.env.BILLING_GRACE_DAYS || 7), 1, 30);
const PUBLIC_BOOTSTRAP_CACHE_MS = 1000 * 20;
const STORE_SETTINGS_CACHE_MS = 1000 * 10;
const MENU_CACHE_MS = 1000 * 15;
const SESSION_CACHE_MS = 1000 * 30;
const ADMIN_LIST_CACHE_MS = 1000 * 8;
const ADMIN_ACCESS_CACHE_MS = 1000 * 15;
const ADMIN_ORDERS_CACHE_MS = 1000 * 3;
const DEFAULT_STORE_SLUG = 'luske-burguer';
const publicBootstrapCache = new Map();
const storeSettingsCache = new Map();
const menuCache = new Map();
const sessionCache = new Map();
const adminStoreAccessCache = new Map();
const adminOrdersCache = new Map();
let adminCustomersCache = null;
let adminPromotionsCache = null;
let adminTablesCache = null;
let adminUsersCache = null;
const rateLimitBuckets = new Map();
const requestMetrics = [];
const MAX_REQUEST_METRICS = 5000;
const allowedUploadTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

const orderStatuses = new Set([
  'new',
  'accepted',
  'preparing',
  'ready',
  'out_for_delivery',
  'completed',
  'cancelled'
]);

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon']
]);

const server = createServer(async (req, res) => {
  const startedAt = performance.now();
  let pathname = '/';
  res.on('finish', () => {
    recordRequestMetric({
      method: req.method || 'GET',
      pathname,
      status: res.statusCode,
      duration_ms: Math.round(performance.now() - startedAt)
    });
  });
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || HOST}`);
    pathname = url.pathname;

    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }

    await serveStatic(res, url.pathname, req.headers.host);
  } catch (error) {
    logServerError(error, req);
    const detail = error.detail && typeof error.detail === 'object' ? error.detail : null;
    json(res, error.status || 500, {
      error: error.message || 'Erro interno do servidor.',
      ...(detail?.code ? { code: detail.code, error_code: detail.error_code || detail.code } : {}),
      ...(detail && error.status === 403 ? {
        feature: detail.feature,
        usage_key: detail.usage_key,
        used: detail.used,
        limit: detail.limit
      } : {}),
      detail: EXPOSE_ERROR_DETAIL ? error.detail || undefined : undefined
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Servidor Node iniciado em http://${HOST}:${PORT}`);
});

setInterval(cleanExpiredSessions, 1000 * 60 * 60 * 6).unref?.();
setTimeout(cleanExpiredSessions, 1000 * 20).unref?.();

async function handleApi(req, res, url) {
  const method = req.method || 'GET';

  if (method === 'GET' && url.pathname === '/api/health') {
    json(res, 200, { ok: true });
    return;
  }

  if (!DATABASE_URL) {
    json(res, 500, {
      error: 'Banco local não configurado.',
      detail: 'Preencha DATABASE_URL no arquivo .env.'
    });
    return;
  }

  enforceRateLimit(req, method, url.pathname);

  if (method === 'GET' && url.pathname === '/api/portal/plans') {
    json(res, 200, await listPortalPlans());
    return;
  }

  if (method === 'GET' && url.pathname === '/api/portal/slug') {
    json(res, 200, await checkPortalSlug(url.searchParams.get('slug') || ''));
    return;
  }

  if (method === 'POST' && url.pathname === '/api/portal/signup') {
    const result = await createPortalSignup(req, await readJson(req));
    const headers = result.sessionId ? { 'Set-Cookie': sessionCookie(ADMIN_COOKIE, result.sessionId) } : {};
    json(res, 201, result.body, headers);
    return;
  }

  const portalActivationMatch = url.pathname.match(/^\/api\/portal\/activate\/([a-f0-9]{32,128})$/i);
  if (portalActivationMatch) {
    if (method === 'GET') {
      json(res, 200, { activation: await getPublicAdminActivation(portalActivationMatch[1]) });
      return;
    }
    if (method === 'POST') {
      const result = await activateAdminAccount(req, portalActivationMatch[1]);
      json(res, 200, result.body, { 'Set-Cookie': sessionCookie(ADMIN_COOKIE, result.sessionId) });
      return;
    }
  }

  if (method === 'GET' && url.pathname === '/api/bootstrap') {
    const context = await resolveTenant(req, url);
    json(res, 200, await getPublicBootstrap(context.store.id, { db: context.db, tenant: context.tenant }), {
      'Cache-Control': 'public, max-age=15, stale-while-revalidate=45'
    });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/coupons/preview') {
    const context = await resolveTenant(req, url);
    json(res, 200, { coupon: await previewCoupon(req, await readJson(req), context.store.id, { db: context.db, tenant: context.tenant }) });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/menu') {
    const context = await resolveTenant(req, url);
    json(res, 200, { categories: await getMenu(false, context.store.id, { db: context.db, tenant: context.tenant }) });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/store') {
    const context = await resolveTenant(req, url);
    json(res, 200, { store: publicStore(await getStoreSettings(context.store.id, { db: context.db, tenant: context.tenant })) });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/tables/resolve') {
    const context = await resolveTenant(req, url);
    json(res, 200, { table: await resolveDiningTable(url.searchParams.get('table') || url.searchParams.get('mesa'), context.store.id, { db: context.db, tenant: context.tenant }) });
    return;
  }

  if (method === 'POST' && (url.pathname === '/api/orders' || url.pathname === '/api/orders/checkout')) {
    const context = await resolveTenant(req, url);
    json(res, 201, await createOrder(req, await readJson(req), { storeId: context.store.id, db: context.db, tenant: context.tenant }));
    return;
  }

  if (method === 'GET' && url.pathname === '/api/payments/order') {
    const context = await resolveTenant(req, url).catch(() => ({ db: dbRequest, tenant: null }));
    json(res, 200, await publicPaymentStatus(url.searchParams.get('code') || url.searchParams.get('order'), { db: context.db, tenant: context.tenant }));
    return;
  }

  if (method === 'POST' && url.pathname === '/api/payments/regenerate-pix') {
    const context = await resolveTenant(req, url).catch(() => ({ db: dbRequest, tenant: null }));
    json(res, 200, await regeneratePixPayment(await readJson(req), { db: context.db, tenant: context.tenant }));
    return;
  }

  if (method === 'POST' && url.pathname === '/api/payments/webhook') {
    const payload = await readJson(req);
    json(res, 200, await receivePaymentWebhook(payload, {
      provider: url.searchParams.get('provider') || '',
      webhookSecret: req.headers['x-webhook-secret'] || req.headers['x-abacatepay-secret'] || url.searchParams.get('webhookSecret') || ''
    }));
    return;
  }

  if (method === 'POST' && url.pathname === '/api/customer/register') {
    const context = await resolveTenant(req, url);
    const result = await registerCustomer(await readJson(req), context.store.id, { db: context.db, tenant: context.tenant });
    json(res, 201, result.body, { 'Set-Cookie': sessionCookie(CUSTOMER_COOKIE, result.sessionId) });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/customer/login') {
    const context = await resolveTenant(req, url);
    const result = await loginCustomer(await readJson(req), context.store.id, { db: context.db, tenant: context.tenant });
    json(res, 200, result.body, { 'Set-Cookie': sessionCookie(CUSTOMER_COOKIE, result.sessionId) });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/customer/reset-password') {
    const context = await resolveTenant(req, url);
    await resetCustomerPassword(await readJson(req), context.store.id, { db: context.db, tenant: context.tenant });
    json(res, 200, { ok: true });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/customer/logout') {
    const cookies = parseCookies(req);
    await deleteSession(cookies[CUSTOMER_COOKIE]);
    json(res, 200, { ok: true }, { 'Set-Cookie': clearCookie(CUSTOMER_COOKIE) });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/customer/me') {
    const customer = await requireCustomer(req, res);
    if (!customer) return;
    const context = await resolveTenant(req, url);
    json(res, 200, { customer: await getCustomerProfile(customer.id, context.store.id, { db: context.db, tenant: context.tenant }) });
    return;
  }

  if (method === 'PUT' && url.pathname === '/api/customer/me') {
    const customer = await requireCustomer(req, res);
    if (!customer) return;
    const context = await resolveTenant(req, url);
    json(res, 200, { customer: await updateCustomerProfile(customer.id, await readJson(req), context.store.id, { db: context.db, tenant: context.tenant }) });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/customer/orders') {
    const customer = await requireCustomer(req, res);
    if (!customer) return;
    const context = await resolveTenant(req, url);
    json(res, 200, { orders: await listCustomerOrders(customer.id, context.store.id, { db: context.db, tenant: context.tenant }) });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/customer/addresses') {
    const customer = await requireCustomer(req, res);
    if (!customer) return;
    const context = await resolveTenant(req, url);
    json(res, 201, { customer: await createCustomerAddressByOwner(customer.id, await readJson(req), context.store.id, { db: context.db, tenant: context.tenant }) });
    return;
  }

  const customerAddressMatch = url.pathname.match(/^\/api\/customer\/addresses\/([a-f0-9-]+)$/i);
  if (customerAddressMatch) {
    const customer = await requireCustomer(req, res);
    if (!customer) return;
    const context = await resolveTenant(req, url);
    if (method === 'PUT' || method === 'PATCH') {
      json(res, 200, { customer: await updateCustomerAddressByOwner(customer.id, customerAddressMatch[1], await readJson(req), context.store.id, { db: context.db, tenant: context.tenant }) });
      return;
    }
    if (method === 'DELETE') {
      json(res, 200, { customer: await deleteCustomerAddressByOwner(customer.id, customerAddressMatch[1], context.store.id, { db: context.db, tenant: context.tenant }) });
      return;
    }
  }

  if (method === 'GET' && url.pathname === '/api/admin/setup-status') {
    const hasAdmin = await hasAdminUser();
    json(res, 200, { has_admin: hasAdmin || !ADMIN_SETUP_ENABLED, setup_enabled: ADMIN_SETUP_ENABLED });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/admin/setup') {
    if (!ADMIN_SETUP_ENABLED) throw httpError(403, 'Criação pública de admin desativada neste ambiente.');
    const result = await setupFirstAdmin(await readJson(req));
    await audit('admin.setup.create', {
      req,
      actor_admin_id: result.body?.admin?.id || null,
      company_id: result.body?.admin?.company_id || null,
      store_id: result.body?.admin?.store_id || null,
      entity_type: 'admin_user',
      entity_id: result.body?.admin?.id || null,
      severity: 'warning',
      after_data: { email: result.body?.admin?.email || null }
    });
    json(res, 201, result.body, { 'Set-Cookie': sessionCookie(ADMIN_COOKIE, result.sessionId) });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/admin/login') {
    const result = await loginAdmin(await readJson(req));
    await audit('admin.login.success', {
      req,
      actor_admin_id: result.body?.admin?.id || null,
      company_id: result.body?.admin?.company_id || null,
      store_id: result.body?.admin?.store_id || null,
      entity_type: 'admin_user',
      entity_id: result.body?.admin?.id || null,
      after_data: { email: result.body?.admin?.email || null }
    });
    json(res, 200, result.body, { 'Set-Cookie': sessionCookie(ADMIN_COOKIE, result.sessionId) });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/portal/recover-password') {
    const body = await readJson(req);
    await requestAdminPasswordRecovery(req, body);
    json(res, 200, { ok: true, message: 'Se o e-mail existir, enviaremos as instruções de recuperação.' });
    return;
  }

  const portalPasswordResetMatch = url.pathname.match(/^\/api\/portal\/password-reset\/([a-f0-9]{32,128})$/i);
  if (portalPasswordResetMatch && method === 'GET') {
    json(res, 200, { reset: await getPublicAdminPasswordReset(portalPasswordResetMatch[1]) });
    return;
  }

  if (portalPasswordResetMatch && method === 'POST') {
    const result = await resetAdminPassword(req, portalPasswordResetMatch[1], await readJson(req));
    json(res, 200, { ok: true, message: 'Senha redefinida com sucesso.', admin: result.body?.admin || null }, {
      'Set-Cookie': sessionCookie(ADMIN_COOKIE, result.sessionId)
    });
    return;
  }

  const portalInviteMatch = url.pathname.match(/^\/api\/portal\/invitations\/([a-f0-9]{32,128})$/i);
  if (portalInviteMatch && method === 'GET') {
    json(res, 200, { invitation: await getPublicInvitation(portalInviteMatch[1]) });
    return;
  }

  if (portalInviteMatch && method === 'POST') {
    const result = await acceptAdminInvitation(req, portalInviteMatch[1], await readJson(req));
    json(res, 201, result.body, { 'Set-Cookie': sessionCookie(ADMIN_COOKIE, result.sessionId) });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/admin/logout') {
    const cookies = parseCookies(req);
    await deleteSession(cookies[ADMIN_COOKIE]);
    json(res, 200, { ok: true }, { 'Set-Cookie': clearCookie(ADMIN_COOKIE) });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/admin/me') {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    json(res, 200, { admin: publicAdmin(await enrichAdminSessionData(admin)) });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/admin/stores') {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    json(res, 200, { stores: await listAdminStores(admin), active_store: admin.active_store || null });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/admin/stores/switch') {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const nextAdmin = await switchAdminStore(req, await readJson(req), admin);
    await audit('admin.store.switch', {
      req,
      company_id: nextAdmin.company_id,
      store_id: nextAdmin.store_id,
      actor_admin_id: admin.id,
      entity_type: 'store',
      entity_id: nextAdmin.store_id,
      before_data: { store_id: admin.store_id },
      after_data: { store_id: nextAdmin.store_id }
    });
    json(res, 200, { admin: nextAdmin });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/admin/support/tickets') {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    json(res, 200, await listAdminSupportTickets(admin));
    return;
  }

  if (method === 'POST' && url.pathname === '/api/admin/support/tickets') {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    json(res, 201, { ticket: await createAdminSupportTicket(req, admin, await readJson(req)) });
    return;
  }

  const adminSupportMessageMatch = url.pathname.match(/^\/api\/admin\/support\/tickets\/([a-f0-9-]+)\/messages$/i);
  if (adminSupportMessageMatch && method === 'POST') {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    json(res, 201, { message: await createAdminSupportMessage(req, admin, adminSupportMessageMatch[1], await readJson(req)) });
    return;
  }

  const adminSupportCloseMatch = url.pathname.match(/^\/api\/admin\/support\/tickets\/([a-f0-9-]+)\/close$/i);
  if (adminSupportCloseMatch && method === 'POST') {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    json(res, 200, { ticket: await closeAdminSupportTicket(req, admin, adminSupportCloseMatch[1]) });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/admin/plan') {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    json(res, 200, await getCompanyPlanOverview(admin.company_id, admin.store_id));
    return;
  }

  if (method === 'POST' && url.pathname === '/api/admin/billing/checkout') {
    const admin = await requireAdminPermission(req, res, 'plan');
    if (!admin) return;
    json(res, 200, await createBillingCheckout(req, admin, await readJson(req)));
    return;
  }

  if (method === 'POST' && url.pathname === '/api/billing/webhook') {
    const payload = await readJson(req);
    const provider = url.searchParams.get('provider') || '';
    const webhookSecret = req.headers['x-webhook-secret'] || req.headers['x-abacatepay-secret'] || url.searchParams.get('webhookSecret') || '';
    try {
      json(res, 200, await receiveBillingWebhook(payload, { provider, webhookSecret }));
    } catch (error) {
      await recordBillingWebhookFailure(payload, { provider, error }).catch((logError) => {
        console.error('Falha ao registrar erro de webhook de assinatura:', logError.message || logError);
      });
      throw error;
    }
    return;
  }

  if (method === 'GET' && url.pathname === '/api/admin/onboarding') {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    json(res, 200, await getAdminOnboarding(admin));
    return;
  }

  if ((method === 'PUT' || method === 'PATCH') && url.pathname === '/api/admin/onboarding') {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    json(res, 200, await updateAdminOnboarding(admin, await readJson(req)));
    return;
  }

  if (method === 'POST' && url.pathname === '/api/admin/onboarding/publish') {
    const admin = await requireAdminPermission(req, res, 'store');
    if (!admin) return;
    json(res, 200, await publishAdminOnboarding(req, admin));
    return;
  }

  if (method === 'POST' && url.pathname === '/api/admin/onboarding/reopen') {
    const admin = await requireAdminPermission(req, res, 'store');
    if (!admin) return;
    json(res, 200, await reopenAdminOnboarding(req, admin));
    return;
  }

  if (method === 'GET' && url.pathname === '/api/admin/tours') {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    json(res, 200, await listAdminGuidedTours(admin));
    return;
  }

  const adminTourMatch = url.pathname.match(/^\/api\/admin\/tours\/([a-z0-9-]+)$/i);
  if (adminTourMatch && (method === 'PUT' || method === 'PATCH')) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    json(res, 200, { tour: await upsertAdminGuidedTour(admin, adminTourMatch[1], await readJson(req)) });
    return;
  }

  const adminTourActionMatch = url.pathname.match(/^\/api\/admin\/tours\/([a-z0-9-]+)\/(complete|skip)$/i);
  if (adminTourActionMatch && method === 'POST') {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const tour = adminTourActionMatch[2] === 'complete'
      ? await completeAdminGuidedTour(req, admin, adminTourActionMatch[1])
      : await skipAdminGuidedTour(req, admin, adminTourActionMatch[1]);
    json(res, 200, { tour });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/platform/plans') {
    const admin = await requirePlatformAdmin(req, res, 'platform.view');
    if (!admin) return;
    json(res, 200, await listPlatformPlans());
    return;
  }

  if (method === 'GET' && url.pathname === '/api/platform/companies') {
    const admin = await requirePlatformAdmin(req, res, 'platform.view');
    if (!admin) return;
    json(res, 200, await listPlatformCompanies(url.searchParams));
    return;
  }

  if (method === 'GET' && url.pathname === '/api/platform/summary') {
    const admin = await requirePlatformAdmin(req, res, 'platform.view');
    if (!admin) return;
    json(res, 200, await platformCommercialSummary());
    return;
  }

  if (method === 'GET' && url.pathname === '/api/platform/analytics') {
    const admin = await requirePlatformAdmin(req, res, 'platform.view');
    if (!admin) return;
    json(res, 200, await platformCommercialAnalytics(url.searchParams));
    return;
  }

  if (method === 'GET' && url.pathname === '/api/platform/alerts') {
    const admin = await requirePlatformAdmin(req, res, 'platform.view');
    if (!admin) return;
    json(res, 200, await platformExecutiveAlerts(url.searchParams));
    return;
  }

  if (method === 'GET' && url.pathname === '/api/platform/revenue') {
    const admin = await requirePlatformAdmin(req, res, 'platform.view');
    if (!admin) return;
    json(res, 200, await platformExecutiveRevenue(url.searchParams));
    return;
  }

  if (method === 'GET' && url.pathname === '/api/platform/conversion') {
    const admin = await requirePlatformAdmin(req, res, 'platform.view');
    if (!admin) return;
    json(res, 200, await platformExecutiveConversion(url.searchParams));
    return;
  }

  if (method === 'GET' && url.pathname === '/api/platform/billing/summary') {
    const admin = await requirePlatformAdmin(req, res, 'platform.billing.manage');
    if (!admin) return;
    json(res, 200, await platformBillingSummary(url.searchParams));
    return;
  }

  if (method === 'GET' && url.pathname === '/api/platform/billing/plans') {
    const admin = await requirePlatformAdmin(req, res, 'platform.billing.manage');
    if (!admin) return;
    json(res, 200, await platformBillingPlans());
    return;
  }

  if (method === 'GET' && url.pathname === '/api/platform/billing/events') {
    const admin = await requirePlatformAdmin(req, res, 'platform.billing.manage');
    if (!admin) return;
    json(res, 200, await platformBillingEvents(url.searchParams));
    return;
  }

  if (method === 'GET' && url.pathname === '/api/platform/billing/subscriptions') {
    const admin = await requirePlatformAdmin(req, res, 'platform.billing.manage');
    if (!admin) return;
    json(res, 200, await platformBillingSubscriptions(url.searchParams));
    return;
  }

  const platformCompanyDetailMatch = url.pathname.match(/^\/api\/platform\/companies\/([a-f0-9-]+)\/detail$/i);
  if (platformCompanyDetailMatch && method === 'GET') {
    const admin = await requirePlatformAdmin(req, res, 'platform.view');
    if (!admin) return;
    json(res, 200, await getPlatformCompanyDetail(platformCompanyDetailMatch[1]));
    return;
  }

  const platformCompanyScoreMatch = url.pathname.match(/^\/api\/platform\/companies\/([a-f0-9-]+)\/score$/i);
  if (platformCompanyScoreMatch && method === 'GET') {
    const admin = await requirePlatformAdmin(req, res, 'platform.view');
    if (!admin) return;
    json(res, 200, await getPlatformCompanyScore(platformCompanyScoreMatch[1]));
    return;
  }

  const platformCompanyTimelineMatch = url.pathname.match(/^\/api\/platform\/companies\/([a-f0-9-]+)\/timeline$/i);
  if (platformCompanyTimelineMatch && method === 'GET') {
    const admin = await requirePlatformAdmin(req, res, 'platform.view');
    if (!admin) return;
    json(res, 200, await getPlatformCompanyTimelineAdvanced(platformCompanyTimelineMatch[1]));
    return;
  }

  const platformCompanyInternalStatusMatch = url.pathname.match(/^\/api\/platform\/companies\/([a-f0-9-]+)\/internal-status$/i);
  if (platformCompanyInternalStatusMatch && method === 'PATCH') {
    const admin = await requirePlatformAdmin(req, res, 'platform.view');
    if (!admin) return;
    json(res, 200, { status: await updatePlatformCompanyInternalStatus(req, platformCompanyInternalStatusMatch[1], await readJson(req), admin) });
    return;
  }

  const platformCompanyNoteMatch = url.pathname.match(/^\/api\/platform\/companies\/([a-f0-9-]+)\/notes$/i);
  if (platformCompanyNoteMatch && method === 'POST') {
    const admin = await requirePlatformAdmin(req, res, 'platform.view');
    if (!admin) return;
    json(res, 201, { note: await createPlatformCompanyNote(platformCompanyNoteMatch[1], await readJson(req), admin, req) });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/platform/companies') {
    const admin = await requirePlatformAdmin(req, res, 'platform.view');
    if (!admin) return;
    json(res, 201, { company: await createPlatformCompany(await readJson(req), admin) });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/platform/stores') {
    const admin = await requirePlatformAdmin(req, res, 'platform.view');
    if (!admin) return;
    json(res, 201, { store: await createPlatformStore(await readJson(req), admin) });
    return;
  }

  const platformCompanyMatch = url.pathname.match(/^\/api\/platform\/companies\/([a-f0-9-]+)$/i);
  if (platformCompanyMatch && (method === 'PUT' || method === 'PATCH')) {
    const admin = await requirePlatformAdmin(req, res, 'platform.view');
    if (!admin) return;
    json(res, 200, { company: await updatePlatformCompany(platformCompanyMatch[1], await readJson(req), admin) });
    return;
  }

  const platformCompanyStatusMatch = url.pathname.match(/^\/api\/platform\/companies\/([a-f0-9-]+)\/status$/i);
  if (platformCompanyStatusMatch && method === 'POST') {
    const admin = await requirePlatformAdmin(req, res, 'platform.customer.suspend');
    if (!admin) return;
    json(res, 200, { company: await setPlatformCompanyStatus(req, platformCompanyStatusMatch[1], await readJson(req), admin) });
    return;
  }

  const platformCompanySuspendMatch = url.pathname.match(/^\/api\/platform\/companies\/([a-f0-9-]+)\/suspend$/i);
  if (platformCompanySuspendMatch && method === 'POST') {
    const admin = await requirePlatformAdmin(req, res, 'platform.customer.suspend');
    if (!admin) return;
    json(res, 200, { company: await suspendPlatformCompany(req, platformCompanySuspendMatch[1], await readJson(req), admin) });
    return;
  }

  const platformCompanyActivateMatch = url.pathname.match(/^\/api\/platform\/companies\/([a-f0-9-]+)\/activate$/i);
  if (platformCompanyActivateMatch && method === 'POST') {
    const admin = await requirePlatformAdmin(req, res, 'platform.customer.suspend');
    if (!admin) return;
    json(res, 200, { company: await activatePlatformCompany(req, platformCompanyActivateMatch[1], await readJson(req), admin) });
    return;
  }

  const platformCompanyReopenOnboardingMatch = url.pathname.match(/^\/api\/platform\/companies\/([a-f0-9-]+)\/reopen-onboarding$/i);
  if (platformCompanyReopenOnboardingMatch && method === 'POST') {
    const admin = await requirePlatformAdmin(req, res, 'platform.customer.suspend');
    if (!admin) return;
    json(res, 200, await reopenPlatformCompanyOnboarding(req, platformCompanyReopenOnboardingMatch[1], await readJson(req), admin));
    return;
  }

  const platformCompanyResendBillingMatch = url.pathname.match(/^\/api\/platform\/companies\/([a-f0-9-]+)\/resend-billing$/i);
  if (platformCompanyResendBillingMatch && method === 'POST') {
    const admin = await requirePlatformAdmin(req, res, 'platform.billing.manage');
    if (!admin) return;
    json(res, 200, await resendPlatformCompanyBilling(req, platformCompanyResendBillingMatch[1], await readJson(req), admin));
    return;
  }

  const platformCompanyPlanMatch = url.pathname.match(/^\/api\/platform\/companies\/([a-f0-9-]+)\/plan$/i);
  if (platformCompanyPlanMatch && method === 'POST') {
    const admin = await requirePlatformAdmin(req, res, 'platform.billing.manage');
    if (!admin) return;
    json(res, 200, { subscription: await changePlatformCompanyPlan(platformCompanyPlanMatch[1], await readJson(req), admin) });
    return;
  }

  const platformCompanyChangePlanMatch = url.pathname.match(/^\/api\/platform\/companies\/([a-f0-9-]+)\/change-plan$/i);
  if (platformCompanyChangePlanMatch && method === 'POST') {
    const admin = await requirePlatformAdmin(req, res, 'platform.billing.manage');
    if (!admin) return;
    json(res, 200, { subscription: await changePlatformCompanyPlanSecure(req, platformCompanyChangePlanMatch[1], await readJson(req), admin) });
    return;
  }

  const platformCompanyCancelSubscriptionMatch = url.pathname.match(/^\/api\/platform\/companies\/([a-f0-9-]+)\/cancel-subscription$/i);
  if (platformCompanyCancelSubscriptionMatch && method === 'POST') {
    const admin = await requirePlatformAdmin(req, res, 'platform.billing.manage');
    if (!admin) return;
    json(res, 200, await cancelPlatformCompanySubscription(req, platformCompanyCancelSubscriptionMatch[1], await readJson(req), admin));
    return;
  }

  const platformCompanyReactivateSubscriptionMatch = url.pathname.match(/^\/api\/platform\/companies\/([a-f0-9-]+)\/reactivate-subscription$/i);
  if (platformCompanyReactivateSubscriptionMatch && method === 'POST') {
    const admin = await requirePlatformAdmin(req, res, 'platform.billing.manage');
    if (!admin) return;
    json(res, 200, await reactivatePlatformCompanySubscription(req, platformCompanyReactivateSubscriptionMatch[1], await readJson(req), admin));
    return;
  }

  const platformCompanyOverrideMatch = url.pathname.match(/^\/api\/platform\/companies\/([a-f0-9-]+)\/overrides$/i);
  if (platformCompanyOverrideMatch && method === 'POST') {
    const admin = await requirePlatformAdmin(req, res, 'platform.view');
    if (!admin) return;
    json(res, 201, { override: await createCompanyFeatureOverride(platformCompanyOverrideMatch[1], await readJson(req), admin) });
    return;
  }

  const platformOverrideMatch = url.pathname.match(/^\/api\/platform\/overrides\/([a-f0-9-]+)$/i);
  if (platformOverrideMatch && method === 'DELETE') {
    const admin = await requirePlatformAdmin(req, res, 'platform.view');
    if (!admin) return;
    await deleteCompanyFeatureOverride(platformOverrideMatch[1], admin);
    json(res, 200, { ok: true });
    return;
  }

  const platformStoreMatch = url.pathname.match(/^\/api\/platform\/stores\/([a-f0-9-]+)$/i);
  if (platformStoreMatch && (method === 'PUT' || method === 'PATCH')) {
    const admin = await requirePlatformAdmin(req, res, 'platform.view');
    if (!admin) return;
    json(res, 200, { store: await updatePlatformStore(platformStoreMatch[1], await readJson(req), admin) });
    return;
  }

  const platformStoreStatusMatch = url.pathname.match(/^\/api\/platform\/stores\/([a-f0-9-]+)\/status$/i);
  if (platformStoreStatusMatch && method === 'POST') {
    const admin = await requirePlatformAdmin(req, res, 'platform.view');
    if (!admin) return;
    json(res, 200, { store: await setPlatformStoreStatus(platformStoreStatusMatch[1], await readJson(req), admin) });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/platform/audit') {
    const admin = await requirePlatformAdmin(req, res, 'platform.audit.view');
    if (!admin) return;
    json(res, 200, await listAuditLogs(url.searchParams));
    return;
  }

  if (method === 'GET' && url.pathname === '/api/platform/health') {
    const admin = await requirePlatformAdmin(req, res, 'platform.view');
    if (!admin) return;
    json(res, 200, await platformOperationalHealth(url.searchParams));
    return;
  }

  if (method === 'GET' && url.pathname === '/api/platform/logs') {
    const admin = await requirePlatformAdmin(req, res, 'platform.audit.view');
    if (!admin) return;
    json(res, 200, await platformOperationalLogs(url.searchParams));
    return;
  }

  if (method === 'GET' && url.pathname === '/api/platform/metrics') {
    const admin = await requirePlatformAdmin(req, res, 'platform.view');
    if (!admin) return;
    json(res, 200, await platformOperationalMetrics(url.searchParams));
    return;
  }

  if (method === 'GET' && url.pathname === '/api/platform/alerts/operational') {
    const admin = await requirePlatformAdmin(req, res, 'platform.view');
    if (!admin) return;
    json(res, 200, await platformOperationalAlertsEndpoint(url.searchParams));
    return;
  }

  if (method === 'GET' && url.pathname === '/api/platform/smtp') {
    const admin = await requirePlatformAdmin(req, res, 'platform.services.view');
    if (!admin) return;
    json(res, 200, { smtp: await getPlatformSmtpSettings() });
    return;
  }

  if (method === 'PUT' && url.pathname === '/api/platform/smtp') {
    const admin = await requirePlatformAdmin(req, res, 'platform.services.manage');
    if (!admin) return;
    json(res, 200, { smtp: await updatePlatformSmtpSettings(req, admin, await readJson(req)) });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/platform/smtp/test') {
    const admin = await requirePlatformAdmin(req, res, 'platform.services.manage');
    if (!admin) return;
    json(res, 200, await sendPlatformSmtpTest(req, admin, await readJson(req)));
    return;
  }

  if (method === 'GET' && url.pathname === '/api/platform/billing/config') {
    const admin = await requirePlatformAdmin(req, res, 'platform.billing.manage');
    if (!admin) return;
    json(res, 200, { billing: await getPlatformBillingSettings() });
    return;
  }

  if (method === 'PUT' && url.pathname === '/api/platform/billing/config') {
    const admin = await requirePlatformAdmin(req, res, 'platform.billing.manage');
    if (!admin) return;
    json(res, 200, { billing: await updatePlatformBillingSettings(req, admin, await readJson(req)) });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/platform/billing/config/test') {
    const admin = await requirePlatformAdmin(req, res, 'platform.billing.manage');
    if (!admin) return;
    json(res, 200, await testPlatformBillingSettings(req, admin));
    return;
  }

  if (method === 'GET' && url.pathname === '/api/platform/email-templates') {
    const admin = await requirePlatformAdmin(req, res, 'platform.services.view');
    if (!admin) return;
    json(res, 200, await listPlatformEmailTemplates());
    return;
  }

  if (method === 'PUT' && url.pathname === '/api/platform/email-templates') {
    const admin = await requirePlatformAdmin(req, res, 'platform.services.manage');
    if (!admin) return;
    json(res, 200, await updatePlatformEmailTemplates(req, admin, await readJson(req)));
    return;
  }

  if (method === 'GET' && url.pathname === '/api/platform/support/tickets') {
    const admin = await requirePlatformAdmin(req, res, 'platform.view');
    if (!admin) return;
    json(res, 200, await listPlatformSupportTickets(url.searchParams));
    return;
  }

  if (method === 'POST' && url.pathname === '/api/platform/support/tickets') {
    const admin = await requirePlatformAdmin(req, res, 'platform.view');
    if (!admin) return;
    json(res, 201, { ticket: await createPlatformSupportTicket(req, admin, await readJson(req)) });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/platform/support/impersonate') {
    const admin = await requirePlatformAdmin(req, res, 'platform.services.manage');
    if (!admin) return;
    const result = await startPlatformSupportImpersonation(req, admin, await readJson(req));
    json(res, 200, { ok: true, admin: publicAdmin(result.admin), expires_at: result.expires_at }, { 'Set-Cookie': sessionCookie(ADMIN_COOKIE, result.token) });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/platform/support/impersonate/end') {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const result = await endPlatformSupportImpersonation(req, admin);
    const headers = { 'Set-Cookie': result.restore_token ? sessionCookie(ADMIN_COOKIE, result.restore_token) : clearCookie(ADMIN_COOKIE) };
    json(res, 200, { ok: true, restored: Boolean(result.restore_token) }, headers);
    return;
  }

  const platformSupportMessageMatch = url.pathname.match(/^\/api\/platform\/support\/tickets\/([a-f0-9-]+)\/messages$/i);
  if (platformSupportMessageMatch && method === 'POST') {
    const admin = await requirePlatformAdmin(req, res, 'platform.view');
    if (!admin) return;
    json(res, 201, { message: await createPlatformSupportMessage(req, admin, platformSupportMessageMatch[1], await readJson(req)) });
    return;
  }

  const platformSupportTicketMatch = url.pathname.match(/^\/api\/platform\/support\/tickets\/([a-f0-9-]+)$/i);
  if (platformSupportTicketMatch && method === 'PATCH') {
    const admin = await requirePlatformAdmin(req, res, 'platform.view');
    if (!admin) return;
    json(res, 200, { ticket: await updatePlatformSupportTicket(req, admin, platformSupportTicketMatch[1], await readJson(req)) });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/platform/backups') {
    const admin = await requirePlatformAdmin(req, res, 'platform.services.view');
    if (!admin) return;
    json(res, 200, await platformBackupStatus());
    return;
  }

  if (method === 'GET' && url.pathname === '/api/platform/services/status') {
    const admin = await requirePlatformAdmin(req, res, 'platform.services.view');
    if (!admin) return;
    json(res, 200, await platformServicesStatus());
    return;
  }

  if (method === 'GET' && url.pathname === '/api/platform/services/logs') {
    const admin = await requirePlatformAdmin(req, res, 'platform.services.view');
    if (!admin) return;
    json(res, 200, await platformServicesLogs(url.searchParams));
    return;
  }

  if (method === 'POST' && url.pathname === '/api/platform/services/backup') {
    const admin = await requirePlatformAdmin(req, res, 'platform.services.manage');
    if (!admin) return;
    json(res, 200, await runPlatformBackup(req, admin, await readJson(req)));
    return;
  }

  if (method === 'POST' && url.pathname === '/api/platform/services/backup/restore') {
    const admin = await requirePlatformAdmin(req, res, 'platform.services.manage');
    if (!admin) return;
    json(res, 200, await restorePlatformBackup(req, admin, await readJson(req)));
    return;
  }

  if (method === 'POST' && url.pathname === '/api/platform/services/jobs/trial-cleanup') {
    const admin = await requirePlatformAdmin(req, res, 'platform.services.manage');
    if (!admin) return;
    json(res, 200, await runPlatformTrialCleanup(req, admin, await readJson(req)));
    return;
  }

  if (method === 'POST' && url.pathname === '/api/platform/services/log-cleanup/preview') {
    const admin = await requirePlatformAdmin(req, res, 'platform.services.view');
    if (!admin) return;
    json(res, 200, await runPlatformLogCleanup(req, admin, { apply: false }));
    return;
  }

  if (method === 'POST' && url.pathname === '/api/platform/services/log-cleanup') {
    const admin = await requirePlatformAdmin(req, res, 'platform.services.manage');
    if (!admin) return;
    json(res, 200, await runPlatformLogCleanup(req, admin, { ...(await readJson(req)), apply: true }));
    return;
  }

  if (method === 'POST' && url.pathname === '/api/platform/services/app/restart') {
    const admin = await requirePlatformAdmin(req, res, 'platform.services.manage');
    if (!admin) return;
    json(res, 202, await restartPlatformApplication(req, admin, await readJson(req)));
    return;
  }

  if (method === 'PUT' && url.pathname === '/api/admin/me') {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    json(res, 200, { admin: await updateAdminAccount(admin, await readJson(req)) });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/admin/change-password') {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    await changeAdminPassword(admin, await readJson(req));
    json(res, 200, { ok: true });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/admin/account/delete') {
    const admin = await requireAdminPermission(req, res, 'account');
    if (!admin) return;
    const result = await deleteCurrentCompanyAccount(req, admin, await readJson(req));
    json(res, 200, result, { 'Set-Cookie': clearCookie(ADMIN_COOKIE) });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/admin/users') {
    const session = await requireAdminPermission(req, res, 'admin_users');
    if (!session) return;
    json(res, 200, { admins: await listAdminUsers(session) });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/admin/users') {
    const session = await requireAdminPermission(req, res, 'admin_users');
    if (!session) return;
    const created = await createAdminUser(await readJson(req), session);
    await audit('admin_user.create', {
      req,
      company_id: session.company_id,
      store_id: session.store_id,
      actor_admin_id: session.id,
      entity_type: 'admin_user',
      entity_id: created.id,
      after_data: created
    });
    json(res, 201, { admin: created });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/admin/invitations') {
    const session = await requireAdminPermission(req, res, 'admin_users');
    if (!session) return;
    json(res, 201, { invitation: await createAdminInvitation(req, await readJson(req), session) });
    return;
  }

  const adminUserMatch = url.pathname.match(/^\/api\/admin\/users\/([a-f0-9-]+)$/i);
  if (adminUserMatch && (method === 'PUT' || method === 'PATCH')) {
    const session = await requireAdminPermission(req, res, 'admin_users');
    if (!session) return;
    const updated = await updateAdminUser(adminUserMatch[1], await readJson(req), session);
    await audit('admin_user.update', {
      req,
      company_id: session.company_id,
      store_id: session.store_id,
      actor_admin_id: session.id,
      entity_type: 'admin_user',
      entity_id: updated.id,
      after_data: updated
    });
    json(res, 200, { admin: updated });
    return;
  }

  if (adminUserMatch && method === 'DELETE') {
    const session = await requireAdminPermission(req, res, 'admin_users');
    if (!session) return;
    const deleted = await deleteAdminUser(adminUserMatch[1], session);
    await audit('admin_user.delete', {
      req,
      company_id: session.company_id,
      store_id: session.store_id,
      actor_admin_id: session.id,
      entity_type: 'admin_user',
      entity_id: deleted.id,
      before_data: deleted
    });
    json(res, 200, { ok: true });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/admin/summary') {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const startedAt = Date.now();
    const permissions = adminPermissions(admin);
    const op = await adminOperationalOptions(admin);
    const [store, orders] = await Promise.all([
      getStoreSettings(admin.store_id, op),
      permissions.includes('orders') ? listOrders(admin.store_id, op) : Promise.resolve([])
    ]);
    const elapsed = Date.now() - startedAt;
    if (elapsed > 1200) {
      console.warn(`Resumo admin lento: ${elapsed}ms`);
    }
    json(res, 200, {
      store,
      orders,
      permissions,
      plan_access: admin.company_id ? await getCompanyPlanAccess(admin.company_id) : {}
    });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/admin/menu-data') {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const permissions = adminPermissions(admin);
    if (!permissions.includes('menu') && !permissions.includes('tables') && !permissions.includes('promotions')) {
      throw httpError(403, 'Sem permissão para acessar o cardápio.');
    }
    const op = await adminOperationalOptions(admin);
    json(res, 200, { categories: await getMenu(true, admin.store_id, op) });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/admin/customers') {
    const admin = await requireAdminPermission(req, res, 'customers');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    json(res, 200, { customers: await listCustomers(admin.store_id, op) });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/admin/promotions') {
    const admin = await requireAdminPermission(req, res, 'promotions');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    json(res, 200, { promotions: await listPromotions(admin.store_id, op) });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/admin/store') {
    const admin = await requireAdminPermission(req, res, 'store');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    json(res, 200, { store: adminStore(await getStoreSettings(admin.store_id, op)) });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/admin/tables') {
    const admin = await requireAdminPermission(req, res, 'tables');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    json(res, 200, await listAdminTablesData(admin.store_id, op));
    return;
  }

  if (method === 'POST' && url.pathname === '/api/admin/tables') {
    const admin = await requireAdminPermission(req, res, 'tables');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    await assertCompanyUsageLimit(admin, 'tables', 'dining_tables');
    const table = await createDiningTable(await readJson(req), admin.store_id, op);
    await recordCompanyUsage(admin, 'tables', 'dining_tables');
    clearAdminTablesCache();
    json(res, 201, { table });
    return;
  }

  const tableMatch = url.pathname.match(/^\/api\/admin\/tables\/([a-f0-9-]+)$/i);
  if (tableMatch) {
    const admin = await requireAdminPermission(req, res, 'tables');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    if (method === 'PATCH' || method === 'PUT') {
      const table = await updateDiningTable(tableMatch[1], await readJson(req), admin.store_id, op);
      clearAdminTablesCache();
      json(res, 200, { table });
      return;
    }
    if (method === 'DELETE') {
      await deleteDiningTable(tableMatch[1], admin.store_id, op);
      clearAdminTablesCache();
      json(res, 200, { ok: true });
      return;
    }
  }

  if (method === 'POST' && url.pathname === '/api/admin/tabs') {
    const admin = await requireAdminPermission(req, res, 'tables');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    const tab = await openCustomerTab(await readJson(req), admin.store_id, op);
    clearAdminTablesCache();
    json(res, 201, { tab });
    return;
  }

  const tabItemMatch = url.pathname.match(/^\/api\/admin\/tabs\/([a-f0-9-]+)\/items$/i);
  if (tabItemMatch && method === 'POST') {
    const admin = await requireAdminPermission(req, res, 'tables');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    const result = await addItemToCustomerTab(req, tabItemMatch[1], await readJson(req), admin.store_id, op);
    clearAdminTablesCache();
    json(res, 201, result);
    return;
  }

  const tabMatch = url.pathname.match(/^\/api\/admin\/tabs\/([a-f0-9-]+)\/(close|transfer)$/i);
  if (tabMatch) {
    const admin = await requireAdminPermission(req, res, 'tables');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    const body = await readJson(req);
    const tab = tabMatch[2] === 'close'
      ? await closeCustomerTab(tabMatch[1], body, admin.store_id, op)
      : await transferCustomerTab(tabMatch[1], body, admin.store_id, op);
    clearAdminTablesCache();
    json(res, 200, { tab });
    return;
  }

  if (method === 'PUT' && url.pathname === '/api/admin/store') {
    const admin = await requireAdminPermission(req, res, 'store');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    const result = await updateStoreSettings(await readJson(req), admin.store_id, op);
    await audit('store_settings.update', {
      req,
      company_id: admin.company_id,
      store_id: admin.store_id,
      actor_admin_id: admin.id,
      entity_type: 'store_settings',
      entity_id: admin.store_id,
      after_data: Array.isArray(result) ? result[0] : result
    });
    clearStoreSettingsCache();
    json(res, 200, { store: adminStore(Array.isArray(result) ? result[0] : result) });
    return;
  }

  if (method === 'PUT' && url.pathname === '/api/admin/loyalty') {
    const admin = await requireAdminPermission(req, res, 'promotions');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    const store = await updateLoyaltyProgram(await readJson(req), admin.store_id, op);
    await audit('loyalty.update', {
      req,
      company_id: admin.company_id,
      store_id: admin.store_id,
      actor_admin_id: admin.id,
      entity_type: 'store_settings',
      entity_id: admin.store_id,
      after_data: { loyalty_program: store.loyalty_program || null }
    });
    clearStoreSettingsCache();
    json(res, 200, { store: adminStore(store) });
    return;
  }

  if (method === 'PUT' && url.pathname === '/api/admin/print-settings') {
    const admin = await requireAdminPermission(req, res, 'store');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    const store = await updatePrintSettings(await readJson(req), admin.store_id, op);
    await audit('print_settings.update', {
      req,
      company_id: admin.company_id,
      store_id: admin.store_id,
      actor_admin_id: admin.id,
      entity_type: 'store_settings',
      entity_id: admin.store_id,
      after_data: { print_settings: store.print_settings || null }
    });
    clearStoreSettingsCache();
    json(res, 200, { store: adminStore(store) });
    return;
  }

  if (method === 'PUT' && url.pathname === '/api/admin/integrations') {
    const admin = await requireAdminPermission(req, res, 'store');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    const store = await updateIntegrationSettings(await readJson(req), admin.store_id, op);
    await audit('integrations.update', {
      req,
      company_id: admin.company_id,
      store_id: admin.store_id,
      actor_admin_id: admin.id,
      entity_type: 'store_settings',
      entity_id: admin.store_id,
      severity: 'warning',
      after_data: { integration_settings: store.integration_settings || null }
    });
    clearStoreSettingsCache();
    json(res, 200, { store: adminStore(store) });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/admin/integrations/test') {
    const admin = await requireAdminPermission(req, res, 'store');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    json(res, 200, { result: await testIntegrations(await readJson(req), admin.store_id, op) });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/admin/domains') {
    const admin = await requireAdminPermission(req, res, 'store');
    if (!admin) return;
    json(res, 200, { domains: await listStoreDomains(admin.store_id) });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/admin/domains') {
    const admin = await requireAdminPermission(req, res, 'store');
    if (!admin) return;
    const domain = await createStoreDomain(await readJson(req), admin);
    json(res, 201, { domain });
    return;
  }

  const adminDomainMatch = url.pathname.match(/^\/api\/admin\/domains\/([a-f0-9-]+)$/i);
  if (adminDomainMatch && method === 'DELETE') {
    const admin = await requireAdminPermission(req, res, 'store');
    if (!admin) return;
    await deleteStoreDomain(adminDomainMatch[1], admin);
    json(res, 200, { ok: true });
    return;
  }

  const adminDomainVerifyMatch = url.pathname.match(/^\/api\/admin\/domains\/([a-f0-9-]+)\/verify$/i);
  if (adminDomainVerifyMatch && method === 'POST') {
    const admin = await requireAdminPermission(req, res, 'store');
    if (!admin) return;
    json(res, 200, { domain: await verifyStoreDomain(adminDomainVerifyMatch[1], admin) });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/admin/operation/start') {
    const admin = await requireAdminPermission(req, res, 'operation');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    const queue = await clearOrderQueue({ mode: 'close_open', storeId: admin.store_id }, op);
    const store = await setStoreOpen(true, admin.store_id, op);
    await audit('operation.start', {
      req,
      company_id: admin.company_id,
      store_id: admin.store_id,
      actor_admin_id: admin.id,
      entity_type: 'store',
      entity_id: admin.store_id,
      after_data: { queue }
    });
    clearStoreSettingsCache();
    json(res, 200, { store, queue });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/admin/operation/stop') {
    const admin = await requireAdminPermission(req, res, 'operation');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    const store = await setStoreOpen(false, admin.store_id, op);
    await audit('operation.stop', {
      req,
      company_id: admin.company_id,
      store_id: admin.store_id,
      actor_admin_id: admin.id,
      entity_type: 'store',
      entity_id: admin.store_id
    });
    clearStoreSettingsCache();
    json(res, 200, { store });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/admin/orders') {
    const admin = await requireAdminPermission(req, res, 'orders');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    json(res, 200, { orders: await listOrders(admin.store_id, op) });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/admin/print-logs') {
    const admin = await requireAdminPermission(req, res, 'orders');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    const body = await readJson(req);
    if (body.order_id) await assertOrderBelongsToStore(body.order_id, admin.store_id, op);
    await assertPlanLimit(admin, 'print_kitchen', 'print_jobs');
    const log = await createPrintLog({ ...body, store_id: admin.store_id }, op);
    await recordCompanyUsage({ ...admin, entity_type: 'order', entity_id: body.order_id || null }, 'print_kitchen', 'print_jobs');
    await audit('order.print', {
      req,
      company_id: admin.company_id,
      store_id: admin.store_id,
      actor_admin_id: admin.id,
      entity_type: 'order',
      entity_id: body.order_id || null,
      after_data: { print_log_id: log?.id || null, print_type: body.print_type || body.type || null }
    });
    json(res, 201, { log });
    return;
  }

  const orderStatusMatch = url.pathname.match(/^\/api\/admin\/orders\/([a-f0-9-]+)\/status$/i);
  if (orderStatusMatch && method === 'PATCH') {
    const admin = await requireAdminPermission(req, res, 'orders');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    const body = await readJson(req);
    if (!orderStatuses.has(body.status)) {
      throw httpError(422, 'Status de pedido inválido.');
    }
    const patch = { status: body.status };
    if (body.status === 'cancelled') patch.financial_status = 'cancelled';
    const updated = await op.db('PATCH', 'orders', {
      id: `eq.${orderStatusMatch[1]}`,
      ...(admin.store_id ? { store_id: `eq.${admin.store_id}` } : {})
    }, patch, ['Prefer: return=representation']);
    if (!updated[0]) throw httpError(404, 'Pedido não encontrado nesta loja.');
    clearAdminOrdersCache(admin.store_id);
    sendOrderStatusWhatsapp(orderStatusMatch[1], body.status, { manual: false, ...op }).catch((error) => {
      console.error('Falha ao enviar WhatsApp de status:', error.message || error);
    });
    await audit('order.status.update', {
      req,
      company_id: admin.company_id,
      store_id: admin.store_id,
      actor_admin_id: admin.id,
      entity_type: 'order',
      entity_id: updated[0].id,
      after_data: { status: body.status, financial_status: patch.financial_status || updated[0].financial_status }
    });
    json(res, 200, { order: updated[0] || null, whatsapp_log: null });
    return;
  }

  const orderWhatsappMatch = url.pathname.match(/^\/api\/admin\/orders\/([a-f0-9-]+)\/whatsapp$/i);
  if (orderWhatsappMatch && method === 'POST') {
    const admin = await requireAdminPermission(req, res, 'orders');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    await assertOrderBelongsToStore(orderWhatsappMatch[1], admin.store_id, op);
    const body = await readJson(req);
    const log = await sendOrderStatusWhatsapp(orderWhatsappMatch[1], body.status, { manual: true, ...op });
    await audit('order.whatsapp.resend', {
      req,
      company_id: admin.company_id,
      store_id: admin.store_id,
      actor_admin_id: admin.id,
      entity_type: 'order',
      entity_id: orderWhatsappMatch[1],
      after_data: { status: body.status, log_id: log?.id || null }
    });
    json(res, 200, { log });
    return;
  }

  const orderRefundMatch = url.pathname.match(/^\/api\/admin\/orders\/([a-f0-9-]+)\/refund$/i);
  if (orderRefundMatch && method === 'POST') {
    const admin = await requireAdminPermission(req, res, 'orders');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    await assertOrderBelongsToStore(orderRefundMatch[1], admin.store_id, op);
    const order = await refundOrderPayment(orderRefundMatch[1], await readJson(req), op);
    await audit('order.payment.refund', {
      req,
      company_id: admin.company_id,
      store_id: admin.store_id,
      actor_admin_id: admin.id,
      entity_type: 'order',
      entity_id: orderRefundMatch[1],
      severity: 'warning',
      after_data: { financial_status: order.financial_status, total: order.total }
    });
    json(res, 200, { order });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/admin/payments/reconcile') {
    const admin = await requireAdminPermission(req, res, 'reports');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    json(res, 200, await reconcileOnlinePayments({ ...(await readJson(req)), storeId: admin.store_id }, op));
    return;
  }

  if (method === 'POST' && url.pathname === '/api/admin/orders/clear-queue') {
    const admin = await requireAdminPermission(req, res, 'operation');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    const result = await clearOrderQueue({ ...(await readJson(req)), storeId: admin.store_id }, op);
    await audit('orders.clear_queue', {
      req,
      company_id: admin.company_id,
      store_id: admin.store_id,
      actor_admin_id: admin.id,
      entity_type: 'orders',
      severity: 'warning',
      after_data: result
    });
    json(res, 200, result);
    return;
  }

  if (method === 'GET' && url.pathname === '/api/admin/reports/daily') {
    const admin = await requireAdminPermission(req, res, 'reports');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    const date = cleanText(url.searchParams.get('date') || '');
    json(res, 200, { report: await dailyOrderReport(date, admin.store_id, op) });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/admin/reports/range') {
    const admin = await requireAdminPermission(req, res, 'reports');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    json(res, 200, {
      report: await rangeOrderReport({
        days: url.searchParams.get('days'),
        start: url.searchParams.get('start'),
        end: url.searchParams.get('end'),
        storeId: admin.store_id,
        ...op
      })
    });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/admin/customers') {
    const admin = await requireAdminPermission(req, res, 'customers');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    json(res, 200, { customers: await listCustomers(admin.store_id, op) });
    return;
  }

  const adminCustomerMatch = url.pathname.match(/^\/api\/admin\/customers\/([a-f0-9-]+)$/i);
  if (adminCustomerMatch && (method === 'PUT' || method === 'PATCH')) {
    const admin = await requireAdminPermission(req, res, 'customers');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    const customer = await updateCustomerByAdmin(adminCustomerMatch[1], await readJson(req), admin.store_id, op);
    await audit('customer.update', {
      req,
      company_id: admin.company_id,
      store_id: admin.store_id,
      actor_admin_id: admin.id,
      entity_type: 'customer',
      entity_id: adminCustomerMatch[1],
      after_data: { id: customer.id, phone: customer.phone, email: customer.email || null }
    });
    clearAdminCustomersCache();
    json(res, 200, { customer });
    return;
  }

  if (adminCustomerMatch && method === 'DELETE') {
    const admin = await requireAdminPermission(req, res, 'customers');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    await deleteCustomerByAdmin(adminCustomerMatch[1], admin.store_id, op);
    await audit('customer.delete', {
      req,
      company_id: admin.company_id,
      store_id: admin.store_id,
      actor_admin_id: admin.id,
      entity_type: 'customer',
      entity_id: adminCustomerMatch[1],
      severity: 'warning'
    });
    clearAdminCustomersCache();
    json(res, 200, { ok: true });
    return;
  }

  const adminCustomerAddressCreateMatch = url.pathname.match(/^\/api\/admin\/customers\/([a-f0-9-]+)\/addresses$/i);
  if (adminCustomerAddressCreateMatch && method === 'POST') {
    const admin = await requireAdminPermission(req, res, 'customers');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    const customer = await createCustomerAddressByAdmin(adminCustomerAddressCreateMatch[1], await readJson(req), admin.store_id, op);
    clearAdminCustomersCache();
    json(res, 201, { customer });
    return;
  }

  const adminCustomerAddressMatch = url.pathname.match(/^\/api\/admin\/customers\/([a-f0-9-]+)\/addresses\/([a-f0-9-]+)$/i);
  if (adminCustomerAddressMatch) {
    const admin = await requireAdminPermission(req, res, 'customers');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    if (method === 'PUT' || method === 'PATCH') {
      const customer = await updateCustomerAddressByAdmin(adminCustomerAddressMatch[1], adminCustomerAddressMatch[2], await readJson(req), admin.store_id, op);
      clearAdminCustomersCache();
      json(res, 200, { customer });
      return;
    }
    if (method === 'DELETE') {
      const customer = await deleteCustomerAddressByAdmin(adminCustomerAddressMatch[1], adminCustomerAddressMatch[2], admin.store_id, op);
      clearAdminCustomersCache();
      json(res, 200, { customer });
      return;
    }
  }

  if (method === 'GET' && url.pathname === '/api/admin/promotions') {
    const admin = await requireAdminPermission(req, res, 'promotions');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    json(res, 200, { promotions: await listPromotions(admin.store_id, op) });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/admin/promotions') {
    const admin = await requireAdminPermission(req, res, 'promotions');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    await assertCompanyUsageLimit(admin, 'promotions', 'promotions');
    const [promotion] = await op.db('POST', 'promotions', {}, {
      ...sanitizePromotion(await readJson(req), true),
      store_id: admin.store_id || null
    }, ['Prefer: return=representation']);
    await recordCompanyUsage(admin, 'promotions', 'promotions');
    await audit('promotion.create', {
      req,
      company_id: admin.company_id,
      store_id: admin.store_id,
      actor_admin_id: admin.id,
      entity_type: 'promotion',
      entity_id: promotion.id,
      after_data: promotion
    });
    clearAdminPromotionsCache();
    json(res, 201, { promotion });
    return;
  }

  const promotionMatch = url.pathname.match(/^\/api\/admin\/promotions\/([a-f0-9-]+)$/i);
  if (promotionMatch) {
    const admin = await requireAdminPermission(req, res, 'promotions');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    if (method === 'PUT' || method === 'PATCH') {
      const [promotion] = await op.db('PATCH', 'promotions', {
        id: `eq.${promotionMatch[1]}`,
        ...(admin.store_id ? { store_id: `eq.${admin.store_id}` } : {})
      }, sanitizePromotion(await readJson(req), false), ['Prefer: return=representation']);
      if (!promotion) throw httpError(404, 'Promoção não encontrada nesta loja.');
      clearAdminPromotionsCache();
      json(res, 200, { promotion });
      return;
    }
    if (method === 'DELETE') {
      await op.db('DELETE', 'promotions', {
        id: `eq.${promotionMatch[1]}`,
        ...(admin.store_id ? { store_id: `eq.${admin.store_id}` } : {})
      }, undefined, ['Prefer: return=minimal']);
      clearAdminPromotionsCache();
      json(res, 200, { ok: true });
      return;
    }
  }

  if (method === 'POST' && url.pathname === '/api/admin/uploads') {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    if (!adminCan(admin, 'menu') && !adminCan(admin, 'store')) {
      json(res, 403, { error: 'Sua conta não tem permissão para enviar imagens.' });
      return;
    }
    json(res, 201, await uploadImage(await readJson(req)));
    return;
  }

  if (url.pathname === '/api/categories' && method === 'POST') {
    const admin = await requireAdminPermission(req, res, 'menu');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    await assertPlanLimit(admin, 'menu_categories', 'menu_categories');
    const result = await op.db('POST', 'menu_categories', {}, {
      ...sanitizeCategory(await readJson(req), true),
      store_id: admin.store_id || null
    }, ['Prefer: return=representation']);
    await audit('menu_category.create', {
      req,
      company_id: admin.company_id,
      store_id: admin.store_id,
      actor_admin_id: admin.id,
      entity_type: 'menu_category',
      entity_id: result[0]?.id || null,
      after_data: result[0] || null
    });
    await recordCompanyUsage(admin, 'menu_categories', 'menu_categories');
    clearMenuCache();
    json(res, 201, result);
    return;
  }

  const categoryMatch = url.pathname.match(/^\/api\/categories\/([a-f0-9-]+)$/i);
  if (categoryMatch) {
    const admin = await requireAdminPermission(req, res, 'menu');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    if (method === 'PUT' || method === 'PATCH') {
      const result = await op.db('PATCH', 'menu_categories', {
        id: `eq.${categoryMatch[1]}`,
        ...(admin.store_id ? { store_id: `eq.${admin.store_id}` } : {})
      }, sanitizeCategory(await readJson(req), false), ['Prefer: return=representation']);
      clearMenuCache();
      json(res, 200, result);
      return;
    }
    if (method === 'DELETE') {
      const result = await op.db('DELETE', 'menu_categories', {
        id: `eq.${categoryMatch[1]}`,
        ...(admin.store_id ? { store_id: `eq.${admin.store_id}` } : {})
      }, undefined, ['Prefer: return=representation']);
      clearMenuCache();
      json(res, 200, result);
      return;
    }
  }

  if (url.pathname === '/api/items' && method === 'POST') {
    const admin = await requireAdminPermission(req, res, 'menu');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    await assertCompanyUsageLimit(admin, 'digital_menu', 'menu_items');
    const result = await op.db('POST', 'menu_items', {}, {
      ...sanitizeItem(await readJson(req), true),
      store_id: admin.store_id || null
    }, ['Prefer: return=representation']);
    await recordCompanyUsage(admin, 'digital_menu', 'menu_items');
    await audit('menu_item.create', {
      req,
      company_id: admin.company_id,
      store_id: admin.store_id,
      actor_admin_id: admin.id,
      entity_type: 'menu_item',
      entity_id: result[0]?.id || null,
      after_data: result[0] || null
    });
    clearMenuCache();
    json(res, 201, result);
    return;
  }

  const itemMatch = url.pathname.match(/^\/api\/items\/([a-f0-9-]+)$/i);
  if (itemMatch) {
    const admin = await requireAdminPermission(req, res, 'menu');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    if (method === 'PUT' || method === 'PATCH') {
      const result = await op.db('PATCH', 'menu_items', {
        id: `eq.${itemMatch[1]}`,
        ...(admin.store_id ? { store_id: `eq.${admin.store_id}` } : {})
      }, sanitizeItem(await readJson(req), false), ['Prefer: return=representation']);
      clearMenuCache();
      json(res, 200, result);
      return;
    }
    if (method === 'DELETE') {
      const result = await op.db('DELETE', 'menu_items', {
        id: `eq.${itemMatch[1]}`,
        ...(admin.store_id ? { store_id: `eq.${admin.store_id}` } : {})
      }, undefined, ['Prefer: return=representation']);
      clearMenuCache();
      json(res, 200, result);
      return;
    }
  }

  const modifierGroupMatch = url.pathname.match(/^\/api\/items\/([a-f0-9-]+)\/modifier-groups$/i);
  if (modifierGroupMatch && method === 'POST') {
    const admin = await requireAdminPermission(req, res, 'menu');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    const payload = sanitizeModifierGroup(await readJson(req), true);
    await ensureUniqueModifierGroupName(modifierGroupMatch[1], payload.name, op);
    const result = await op.db('POST', 'menu_modifier_groups', {}, {
      ...payload,
      store_id: admin.store_id || null,
      menu_item_id: modifierGroupMatch[1]
    }, ['Prefer: return=representation']);
    clearMenuCache();
    json(res, 201, result);
    return;
  }

  const modifierGroupIdMatch = url.pathname.match(/^\/api\/modifier-groups\/([a-f0-9-]+)$/i);
  if (modifierGroupIdMatch) {
    const admin = await requireAdminPermission(req, res, 'menu');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    if (method === 'PUT' || method === 'PATCH') {
      const result = await op.db('PATCH', 'menu_modifier_groups', {
        id: `eq.${modifierGroupIdMatch[1]}`,
        ...(admin.store_id ? { store_id: `eq.${admin.store_id}` } : {})
      }, sanitizeModifierGroup(await readJson(req), false), ['Prefer: return=representation']);
      clearMenuCache();
      json(res, 200, result);
      return;
    }
    if (method === 'DELETE') {
      const result = await op.db('DELETE', 'menu_modifier_groups', {
        id: `eq.${modifierGroupIdMatch[1]}`,
        ...(admin.store_id ? { store_id: `eq.${admin.store_id}` } : {})
      }, undefined, ['Prefer: return=representation']);
      clearMenuCache();
      json(res, 200, result);
      return;
    }
  }

  const modifierCreateMatch = url.pathname.match(/^\/api\/modifier-groups\/([a-f0-9-]+)\/modifiers$/i);
  if (modifierCreateMatch && method === 'POST') {
    const admin = await requireAdminPermission(req, res, 'menu');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    const payload = sanitizeModifier(await readJson(req), true);
    await ensureUniqueModifierName(modifierCreateMatch[1], payload.name, op);
    const result = await op.db('POST', 'menu_modifiers', {}, {
      ...payload,
      store_id: admin.store_id || null,
      group_id: modifierCreateMatch[1]
    }, ['Prefer: return=representation']);
    clearMenuCache();
    json(res, 201, result);
    return;
  }

  const modifierMatch = url.pathname.match(/^\/api\/modifiers\/([a-f0-9-]+)$/i);
  if (modifierMatch) {
    const admin = await requireAdminPermission(req, res, 'menu');
    if (!admin) return;
    const op = await adminOperationalOptions(admin);
    if (method === 'PUT' || method === 'PATCH') {
      const result = await op.db('PATCH', 'menu_modifiers', {
        id: `eq.${modifierMatch[1]}`,
        ...(admin.store_id ? { store_id: `eq.${admin.store_id}` } : {})
      }, sanitizeModifier(await readJson(req), false), ['Prefer: return=representation']);
      clearMenuCache();
      json(res, 200, result);
      return;
    }
    if (method === 'DELETE') {
      const result = await op.db('DELETE', 'menu_modifiers', {
        id: `eq.${modifierMatch[1]}`,
        ...(admin.store_id ? { store_id: `eq.${admin.store_id}` } : {})
      }, undefined, ['Prefer: return=representation']);
      clearMenuCache();
      json(res, 200, result);
      return;
    }
  }

  json(res, 404, { error: 'Rota não encontrada.' });
}

async function hasAdminUser() {
  const rows = await dbRequest('GET', 'admin_users', {
    select: 'id',
    limit: '1'
  });
  return rows.length > 0;
}

async function setupFirstAdmin(data) {
  if (await hasAdminUser()) {
    throw httpError(409, 'A primeira conta admin já foi criada.');
  }

  const admin = sanitizeAdminUser(data);
  const password = validatePassword(data.password);
  const [created] = await dbRequest('POST', 'admin_users', {}, {
    ...admin,
    password_hash: hashPassword(password),
    role: 'owner',
    is_active: true
  }, ['Prefer: return=representation']);
  await ensureAdminDefaultStoreAccess(created);
  clearAdminUsersCache();

  return createAdminSession(created);
}

async function ensureAdminDefaultStoreAccess(admin) {
  const store = await getDefaultStore();
  if (!store?.id) return;
  const access = await getAdminStoreAccess(admin);
  if (!access.length && normalizeAdminRole(admin.role) !== 'superadmin') {
    await ensureAdminDefaultStoreAccess(admin);
    clearAdminStoreAccessCache(admin.id);
  }

  await dbRequest('PATCH', 'admin_users', { id: `eq.${admin.id}` }, {
    company_id: store.company_id
  }, ['Prefer: return=minimal']).catch(() => {});
  await dbRequest('POST', 'admin_user_store_access', {}, {
    admin_user_id: admin.id,
    company_id: store.company_id,
    store_id: store.id,
    role: normalizeAdminRole(admin.role),
    permissions: [],
    is_active: true
  }, ['Prefer: return=minimal']).catch(() => {});
}

async function loginAdmin(data) {
  const email = cleanEmail(data.email);
  const password = String(data.password || '');

  if (!email || !password) throw httpError(422, 'Informe e-mail e senha.');

  const rows = await dbRequest('GET', 'admin_users', {
    select: '*',
    email: `eq.${email}`,
    limit: '1'
  });

  const admin = rows[0];
  if (!admin) {
    throw httpError(404, 'Não existe uma conta administrativa com este e-mail.');
  }
  if (admin.is_active === false) {
    const pendingActivation = await hasPendingAdminActivation(admin.id).catch(() => false);
    throw httpError(403, pendingActivation
      ? 'Sua conta ainda não foi ativada. Confira seu e-mail e clique no link de ativação.'
      : 'Esta conta administrativa está desativada.');
  }
  if (!verifyPassword(password, admin.password_hash)) {
    throw httpError(401, 'Senha incorreta.');
  }

  await dbRequest('PATCH', 'admin_users', { id: `eq.${admin.id}` }, {
    last_login_at: new Date().toISOString()
  }, ['Prefer: return=representation']);

  return createAdminSession(admin);
}

async function hasPendingAdminActivation(adminId) {
  const [token] = await dbRequest('GET', 'admin_activation_tokens', {
    select: 'id,expires_at',
    admin_user_id: `eq.${cleanUuid(adminId, 'admin')}`,
    status: 'eq.pending',
    order: 'created_at.desc',
    limit: '1'
  });
  return Boolean(token && new Date(token.expires_at).getTime() > Date.now());
}

async function requestAdminPasswordRecovery(req, data = {}) {
  const email = cleanEmail(data.email || '');
  if (!email) throw httpError(422, 'Informe um e-mail válido.');
  const [admin] = await dbRequest('GET', 'admin_users', {
    select: 'id,company_id,name,email,is_active',
    email: `eq.${email}`,
    limit: '1'
  });
  if (admin?.id && admin.is_active !== false) {
    const token = randomBytes(24).toString('hex');
    const tokenHash = hashPasswordResetToken(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await dbRequest('PATCH', 'admin_password_reset_tokens', {
      admin_user_id: `eq.${admin.id}`,
      status: 'eq.pending'
    }, {
      status: 'cancelled'
    }, ['Prefer: return=minimal']).catch(() => {});
    await dbRequest('POST', 'admin_password_reset_tokens', {}, {
      admin_user_id: admin.id,
      token_hash: tokenHash,
      status: 'pending',
      expires_at: expiresAt
    }, ['Prefer: return=minimal']);
    await sendAdminPasswordRecoveryEmail(req, admin, token, expiresAt).catch(async (error) => {
      await audit('admin.password_recovery.email_failed', {
        req,
        actor_admin_id: admin.id,
        company_id: admin.company_id || null,
        entity_type: 'admin_user',
        entity_id: admin.id,
        severity: 'warning',
        after_data: { email: maskEmailOrToken(email), message: error.message || 'Falha ao enviar recuperação.' }
      });
      throw httpError(502, 'Não foi possível enviar o e-mail de recuperação. Verifique a configuração SMTP.');
    });
    await audit('admin.password_recovery.request', {
      req,
      actor_admin_id: admin.id,
      company_id: admin.company_id || null,
      entity_type: 'admin_user',
      entity_id: admin.id,
      severity: 'info',
      after_data: { email }
    });
  }
  return { ok: true };
}

async function sendAdminPasswordRecoveryEmail(req, admin, token, expiresAt) {
  const template = (await listPlatformEmailTemplates()).templates.find((entry) => entry.template_key === 'password_recovery');
  if (!template?.is_active) throw new Error('Template de recuperação desativado.');
  const resetUrl = absoluteAppUrl(req, `/redefinir-senha?token=${token}`);
  const variables = {
    customer_name: admin.name || admin.email,
    company_name: '',
    store_name: '',
    due_date: formatDateTimePt(expiresAt),
    dashboard_url: resetUrl,
    reset_url: resetUrl,
    support_url: absolutePublicUrl('/painel?tab=support'),
    payment_url: absolutePublicUrl('/painel?tab=plan'),
    platform_url: absolutePublicUrl('/platform')
  };
  await sendPlatformEmail({
    to: admin.email,
    templateKey: 'password_recovery',
    subject: renderEmailTemplate(template.subject, variables),
    body: renderEmailTemplate(template.body, variables)
  });
}

async function getPublicAdminPasswordReset(token) {
  const reset = await findAdminPasswordResetByToken(token);
  const [admin] = await dbRequest('GET', 'admin_users', {
    select: 'email,name',
    id: `eq.${reset.admin_user_id}`,
    limit: '1'
  });
  if (!admin) throw httpError(404, 'Link de recuperação inválido.');
  return {
    email: admin.email,
    name: admin.name || '',
    expires_at: reset.expires_at
  };
}

async function resetAdminPassword(req, token, data = {}) {
  const reset = await findAdminPasswordResetByToken(token);
  const password = validatePassword(data.password);
  const confirmPassword = String(data.confirm_password || data.confirmPassword || '');
  if (confirmPassword && confirmPassword !== password) throw httpError(422, 'A confirmação de senha não confere.');
  const [admin] = await dbRequest('PATCH', 'admin_users', { id: `eq.${reset.admin_user_id}` }, {
    password_hash: hashPassword(password),
    updated_at: new Date().toISOString()
  }, ['Prefer: return=representation']);
  if (!admin) throw httpError(404, 'Conta administrativa não encontrada.');
  await dbRequest('PATCH', 'admin_password_reset_tokens', { id: `eq.${reset.id}` }, {
    status: 'used',
    used_at: new Date().toISOString()
  }, ['Prefer: return=minimal']);
  await dbRequest('PATCH', 'admin_password_reset_tokens', {
    admin_user_id: `eq.${admin.id}`,
    status: 'eq.pending'
  }, {
    status: 'cancelled'
  }, ['Prefer: return=minimal']).catch(() => {});
  clearSessionCacheByOwner('admin', admin.id);
  await audit('admin.password_recovery.reset', {
    req,
    actor_admin_id: admin.id,
    company_id: admin.company_id || null,
    entity_type: 'admin_user',
    entity_id: admin.id,
    severity: 'info',
    after_data: { email: maskEmailOrToken(admin.email) }
  });
  const session = await createAdminSession(admin);
  return {
    sessionId: session.sessionId,
    body: {
      ...session.body,
      message: 'Conta ativada com sucesso.',
      redirect: '/painel'
    }
  };
}

async function findAdminPasswordResetByToken(token) {
  const value = String(token || '').trim();
  if (!/^[a-f0-9]{32,128}$/i.test(value)) throw httpError(404, 'Link de recuperação inválido.');
  const tokenHash = hashPasswordResetToken(value);
  const [reset] = await dbRequest('GET', 'admin_password_reset_tokens', {
    select: '*',
    token_hash: `eq.${tokenHash}`,
    status: 'eq.pending',
    limit: '1'
  });
  if (!reset) throw httpError(404, 'Link de recuperação inválido ou já utilizado.');
  if (new Date(reset.expires_at).getTime() < Date.now()) {
    await dbRequest('PATCH', 'admin_password_reset_tokens', { id: `eq.${reset.id}` }, {
      status: 'expired'
    }, ['Prefer: return=minimal']).catch(() => {});
    throw httpError(410, 'Este link de recuperação expirou.');
  }
  return reset;
}

async function getAdminById(adminId) {
  const rows = await dbRequest('GET', 'admin_users', {
    select: '*',
    id: `eq.${adminId}`,
    limit: '1'
  });

  if (!rows[0]) throw httpError(404, 'Admin não encontrado.');
  return rows[0];
}

async function listAdminUsers(session = null) {
  const now = Date.now();
  const companyId = cleanUuid(session?.company_id);
  const cacheKey = companyId ? `company:${companyId}` : `admin:${cleanUuid(session?.id) || 'default'}`;
  if (adminUsersCache?.[cacheKey]?.expiresAt > now) return adminUsersCache[cacheKey].data;
  const rows = await dbRequest('GET', 'admin_users', {
    select: 'id,name,email,role,is_active,last_login_at,created_at',
    ...(companyId ? { company_id: `eq.${companyId}` } : { id: `eq.${cleanUuid(session?.id)}` }),
    order: 'name.asc',
    limit: '200'
  });
  const data = rows.map(publicAdmin);
  adminUsersCache = adminUsersCache && typeof adminUsersCache === 'object' ? adminUsersCache : {};
  adminUsersCache[cacheKey] = {
    data,
    expiresAt: now + ADMIN_LIST_CACHE_MS
  };
  return data;
}

async function createAdminUser(data, session = null) {
  await assertCompanyUsageLimit(session, 'admin_users', 'admin_users');
  const admin = sanitizeAdminUser(data);
  const role = sanitizeAdminRole(data.role);
  if (role === 'superadmin') {
    throw httpError(403, 'Contas superadmin não podem ser criadas pelo painel da loja.');
  }
  const password = validatePassword(data.password);
  const [created] = await dbRequest('POST', 'admin_users', {}, {
    ...admin,
    company_id: session?.company_id || admin.company_id || null,
    password_hash: hashPassword(password),
    role,
    is_active: data.is_active === undefined ? true : Boolean(data.is_active)
  }, ['Prefer: return=representation']);
  if (session?.company_id && session?.store_id) {
    await dbRequest('POST', 'admin_user_store_access', {}, {
      admin_user_id: created.id,
      company_id: session.company_id,
      store_id: session.store_id,
      role,
      permissions: [],
      is_active: true
    }, ['Prefer: return=minimal']).catch((error) => {
      console.warn('Falha ao vincular usuário admin à loja:', error.message || error);
    });
  }
  await recordCompanyUsage(session, 'admin_users', 'admin_users');
  clearAdminStoreAccessCache(created.id);
  clearAdminUsersCache();
  return publicAdmin(created);
}

async function createAdminInvitation(req, data = {}, session = null) {
  await assertCompanyUsageLimit(session, 'admin_users', 'admin_users');
  const email = cleanEmail(data.email || '');
  const phone = onlyDigits(data.phone || '');
  const name = cleanText(data.name || '');
  const role = sanitizeInviteRole(data.role || 'attendant');
  if (!email) throw httpError(422, 'Informe o e-mail do funcionario.');
  if (!session?.company_id || !session?.store_id) throw httpError(422, 'Loja ativa não encontrada.');
  const existing = await dbRequest('GET', 'admin_users', {
    select: 'id',
    email: `eq.${email}`,
    limit: '1'
  });
  if (existing[0]) throw httpError(409, 'Este e-mail já possui conta administrativa.');
  const token = randomBytes(24).toString('hex');
  const tokenHash = hashInviteToken(token);
  const [created] = await dbRequest('POST', 'admin_invitations', {}, {
    company_id: session.company_id,
    store_id: session.store_id,
    email,
    phone: phone || null,
    name: name || null,
    role,
    token_hash: tokenHash,
    status: 'pending',
    invited_by: session.id,
    expires_at: new Date(Date.now() + 7 * 86400000).toISOString()
  }, ['Prefer: return=representation']);
  await audit('admin.invitation.create', {
    req,
    actor_admin_id: session.id,
    company_id: session.company_id,
    store_id: session.store_id,
    entity_type: 'admin_invitation',
    entity_id: created.id,
    after_data: { email, role }
  });
  const inviteLink = `/convite?token=${token}`;
  const whatsapp = await sendAdminInvitationWhatsapp(session.store_id, phone, {
    name,
    role,
    inviteLink: absoluteUrl(req, inviteLink)
  });
  return {
    id: created.id,
    email,
    phone,
    name,
    role,
    status: created.status,
    expires_at: created.expires_at,
    invite_link: inviteLink,
    whatsapp_status: whatsapp.status,
    whatsapp_error: whatsapp.error || null
  };
}

async function sendAdminInvitationWhatsapp(storeId, phone, invitation) {
  const recipient = whatsappRecipientPhone(phone || '');
  if (!recipient) return { status: 'skipped', error: 'Telefone não informado.' };
  const store = await getStoreSettings(storeId);
  const integrations = sanitizeIntegrationSettings(store.integration_settings || {});
  if (!integrations.whatsapp.enabled) return { status: 'skipped', error: 'WhatsApp automático desativado.' };
  const role = adminRoleLabel(invitation.role).toLowerCase();
  const message = [
    `Olá${invitation.name ? `, ${invitation.name}` : ''}!`,
    `Você recebeu um convite para acessar o painel de ${store.name || 'sua loja'} como ${role}.`,
    `Crie sua senha aqui: ${invitation.inviteLink}`
  ].join('\n');
  try {
    await sendWhatsappViaProvider(integrations.whatsapp, recipient, message);
    return { status: 'sent' };
  } catch (error) {
    return { status: 'failed', error: error.message || 'Falha ao enviar WhatsApp.' };
  }
}

async function getPublicInvitation(token) {
  const invitation = await findInvitationByToken(token);
  return {
    email: invitation.email,
    name: invitation.name || '',
    role: invitation.role,
    expires_at: invitation.expires_at
  };
}

async function acceptAdminInvitation(req, token, data = {}) {
  const invitation = await findInvitationByToken(token);
  const password = validatePassword(data.password);
  const confirmPassword = String(data.confirm_password || data.confirmPassword || '');
  if (confirmPassword && confirmPassword !== password) throw httpError(422, 'A confirmação de senha não confere.');
  const name = cleanText(data.name || invitation.name || invitation.email.split('@')[0]);
  const [admin] = await dbRequest('POST', 'admin_users', {}, {
    company_id: invitation.company_id,
    name,
    email: invitation.email,
    password_hash: hashPassword(password),
    role: invitation.role,
    is_active: true
  }, ['Prefer: return=representation']);
  await dbRequest('POST', 'admin_user_store_access', {}, {
    admin_user_id: admin.id,
    company_id: invitation.company_id,
    store_id: invitation.store_id,
    role: invitation.role,
    permissions: [],
    is_active: true
  }, ['Prefer: return=minimal']);
  await dbRequest('PATCH', 'admin_invitations', { id: `eq.${invitation.id}` }, {
    status: 'accepted',
    accepted_by: admin.id,
    accepted_at: new Date().toISOString()
  }, ['Prefer: return=minimal']);
  await recordCompanyUsage({ company_id: invitation.company_id, store_id: invitation.store_id, id: admin.id }, 'admin_users', 'admin_users');
  await audit('admin.invitation.accept', {
    req,
    actor_admin_id: admin.id,
    company_id: invitation.company_id,
    store_id: invitation.store_id,
    entity_type: 'admin_invitation',
    entity_id: invitation.id,
    after_data: { email: invitation.email, role: invitation.role }
  });
  clearAdminStoreAccessCache(admin.id);
  clearAdminUsersCache();
  return createAdminSession(admin);
}

async function findInvitationByToken(token) {
  const value = String(token || '').trim();
  if (!/^[a-f0-9]{32,128}$/i.test(value)) throw httpError(404, 'Convite inválido.');
  const tokenHash = hashInviteToken(value);
  const [invitation] = await dbRequest('GET', 'admin_invitations', {
    select: '*',
    token_hash: `eq.${tokenHash}`,
    status: 'eq.pending',
    limit: '1'
  });
  if (!invitation) throw httpError(404, 'Convite inválido ou já utilizado.');
  if (new Date(invitation.expires_at).getTime() < Date.now()) {
    await dbRequest('PATCH', 'admin_invitations', { id: `eq.${invitation.id}` }, { status: 'expired' }, ['Prefer: return=minimal']).catch(() => {});
    throw httpError(410, 'Este convite expirou.');
  }
  return invitation;
}

function sanitizeInviteRole(role) {
  const value = cleanSlug(role || 'attendant');
  if (['admin', 'waiter', 'attendant', 'delivery', 'kitchen'].includes(value)) return value;
  return 'attendant';
}

function hashInviteToken(token) {
  return pbkdf2Sync(String(token || ''), 'admin_invitation', 120000, 32, 'sha256').toString('hex');
}

function hashPasswordResetToken(token) {
  return pbkdf2Sync(String(token || ''), 'admin_password_reset', 120000, 32, 'sha256').toString('hex');
}

function hashAdminActivationToken(token) {
  return pbkdf2Sync(String(token || ''), 'admin_account_activation', 120000, 32, 'sha256').toString('hex');
}

async function updateAdminUser(id, data, session) {
  const target = await getAdminById(id);
  if (target.company_id !== session.company_id) {
    throw httpError(403, 'Você não pode editar uma conta de outra empresa.');
  }
  const payload = {};
  if ('name' in data) payload.name = cleanText(data.name);
  if ('email' in data) payload.email = cleanEmail(data.email);
  if ('role' in data) {
    payload.role = sanitizeAdminRole(data.role);
    if (payload.role === 'superadmin' && normalizeAdminRole(target.role) !== 'superadmin') {
      throw httpError(403, 'Contas da loja não podem ser promovidas para superadmin.');
    }
  }
  if ('is_active' in data) payload.is_active = Boolean(data.is_active);
  if ('password' in data && String(data.password || '').trim()) {
    payload.password_hash = hashPassword(validatePassword(data.password));
  }
  if (!Object.keys(payload).length) throw httpError(422, 'Informe algum dado para atualizar.');

  if (target.id === session.id && payload.is_active === false) {
    throw httpError(422, 'Você não pode desativar sua própria conta.');
  }
  if (target.id === session.id && payload.role && !isFullAdminRole(payload.role)) {
    throw httpError(422, 'Você não pode remover seu próprio acesso de administrador.');
  }

  const [updated] = await dbRequest('PATCH', 'admin_users', { id: `eq.${id}` }, payload, ['Prefer: return=representation']);
  if (!updated) throw httpError(404, 'Conta admin não encontrada.');
  clearSessionCacheByOwner('admin', id);
  clearAdminStoreAccessCache(id);
  clearAdminUsersCache();
  return publicAdmin(updated);
}

async function deleteAdminUser(id, session) {
  const target = await getAdminById(id);
  if (target.company_id !== session.company_id) {
    throw httpError(403, 'Você não pode excluir uma conta de outra empresa.');
  }
  if (target.id === session.id) {
    throw httpError(422, 'Você não pode excluir sua própria conta.');
  }

  if (isFullAdminRole(target.role)) {
    const activeAdmins = await dbRequest('GET', 'admin_users', {
      select: 'id,role,is_active',
      ...(target.company_id ? { company_id: `eq.${target.company_id}` } : { company_id: 'is.null' }),
      is_active: 'eq.true',
      limit: '200'
    });
    const otherFullAdmins = activeAdmins.filter((admin) => admin.id !== target.id && isFullAdminRole(admin.role));
    if (!otherFullAdmins.length) {
      throw httpError(422, 'Mantenha pelo menos uma conta administradora ativa.');
    }
  }

  await dbRequest('DELETE', 'app_sessions', {
    type: 'eq.admin',
    owner_id: `eq.${id}`
  }, undefined, ['Prefer: return=minimal']).catch(() => {});
  await dbRequest('DELETE', 'admin_user_store_access', {
    admin_user_id: `eq.${id}`
  }, undefined, ['Prefer: return=minimal']).catch(() => {});
  await dbRequest('DELETE', 'admin_users', {
    id: `eq.${id}`
  }, undefined, ['Prefer: return=minimal']);

  clearSessionCacheByOwner('admin', id);
  clearAdminStoreAccessCache(id);
  clearAdminUsersCache();
  return publicAdmin(target);
}

async function updateAdminAccount(session, data) {
  const payload = {};
  if ('name' in data) payload.name = cleanText(data.name);
  if ('email' in data) payload.email = cleanEmail(data.email);

  if (!payload.name && !payload.email) {
    throw httpError(422, 'Informe nome ou e-mail para atualizar.');
  }

  const [updated] = await dbRequest('PATCH', 'admin_users', { id: `eq.${session.id}` }, payload, ['Prefer: return=representation']);
  session.name = updated.name;
  session.email = updated.email;
  session.role = updated.role;
  clearSessionCacheByOwner('admin', session.id);
  clearAdminUsersCache();
  return publicAdmin(updated);
}

async function changeAdminPassword(session, data) {
  const currentPassword = String(data.current_password || '');
  const newPassword = validatePassword(data.new_password);
  const admin = await getAdminById(session.id);

  if (!verifyPassword(currentPassword, admin.password_hash)) {
    throw httpError(401, 'Senha atual inválida.');
  }

  await dbRequest('PATCH', 'admin_users', { id: `eq.${session.id}` }, {
    password_hash: hashPassword(newPassword)
  }, ['Prefer: return=representation']);
  clearSessionCacheByOwner('admin', session.id);
  clearAdminUsersCache();
}

async function deleteCurrentCompanyAccount(req, session, data = {}) {
  if (!isFullAdminRole(session.role)) {
    throw httpError(403, 'Apenas uma conta administradora pode excluir a empresa.');
  }
  if (String(data.confirmation || '').trim() !== 'EXCLUIR CONTA') {
    throw httpError(422, 'Digite EXCLUIR CONTA para confirmar.');
  }
  const admin = await getAdminById(session.id);
  if (!verifyPassword(String(data.password || ''), admin.password_hash)) {
    throw httpError(401, 'Senha atual inválida.');
  }
  const companyId = session.company_id ? cleanUuid(session.company_id, 'empresa') : null;
  if (!companyId) throw httpError(422, 'Empresa ativa não encontrada.');
  const stores = await dbRequest('GET', 'stores', {
    select: 'id',
    company_id: `eq.${companyId}`,
    limit: '1000'
  }).catch(() => []);
  const storeIds = cleanUuidArray(stores.map((store) => store.id), 'loja');
  for (const storeId of storeIds) {
    await deleteStoreOperationalData(dbRequest, storeId);
  }
  await audit('company.delete_account', {
    req,
    company_id: companyId,
    store_id: session.store_id || null,
    actor_admin_id: session.id,
    entity_type: 'company',
    entity_id: companyId,
    severity: 'critical',
    before_data: { stores: storeIds.length }
  });
  await dbRequest('DELETE', 'app_sessions', { company_id: `eq.${companyId}` }, undefined, ['Prefer: return=minimal']).catch(() => {});
  await dbRequest('DELETE', 'admin_user_store_access', { company_id: `eq.${companyId}` }, undefined, ['Prefer: return=minimal']).catch(() => {});
  await dbRequest('DELETE', 'admin_users', { company_id: `eq.${companyId}` }, undefined, ['Prefer: return=minimal']).catch(() => {});
  await dbRequest('DELETE', 'stores', { company_id: `eq.${companyId}` }, undefined, ['Prefer: return=minimal']).catch(() => {});
  await dbRequest('DELETE', 'companies', { id: `eq.${companyId}` }, undefined, ['Prefer: return=minimal']);
  clearAdminUsersCache();
  sessionCache.clear();
  clearStoreSettingsCache();
  clearMenuCache();
  adminOrdersCache.clear();
  adminCustomersCache = null;
  adminPromotionsCache = null;
  adminTablesCache = null;
  return { ok: true, deleted_stores: storeIds.length };
}

async function deleteStoreOperationalData(db, storeId) {
  const resolvedStoreId = cleanUuid(storeId, 'loja');
  const tables = [
    'order_payment_events',
    'order_whatsapp_logs',
    'order_print_logs',
    'order_items',
    'orders',
    'customer_addresses',
    'customers',
    'menu_modifiers',
    'menu_modifier_groups',
    'menu_items',
    'menu_categories',
    'customer_tabs',
    'dining_tables',
    'promotions',
    'store_settings',
    'payment_transaction_index'
  ];
  for (const table of tables) {
    await db('DELETE', table, { store_id: `eq.${resolvedStoreId}` }, undefined, ['Prefer: return=minimal']).catch(() => {});
  }
}

async function createAdminSession(admin) {
  const access = await getAdminStoreAccess(admin);
  const activeStore = access[0]?.store || null;
  const sessionAdmin = {
    session_version: 2,
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: normalizeAdminRole(admin.role),
    company_id: activeStore?.company_id || admin.company_id || access[0]?.company_id || null,
    store_id: activeStore?.id || null,
    active_store: activeStore ? publicStoreRef(activeStore) : null,
    stores: access.map((entry) => publicStoreRef(entry.store)).filter(Boolean)
  };
  const sessionId = await createPersistentSession('admin', admin.id, sessionAdmin);
  return { sessionId, body: { admin: publicAdmin(sessionAdmin) } };
}

async function getAdminStoreAccess(adminId) {
  const admin = typeof adminId === 'object' && adminId ? adminId : null;
  const cleanAdminId = cleanUuid(admin?.id || adminId);
  if (!cleanAdminId) return [];
  const role = admin ? normalizeAdminRole(admin.role) : '';
  const companyId = admin?.company_id ? cleanUuid(admin.company_id) : '';
  const cacheKey = `${cleanAdminId}:${role || 'any'}:${companyId || 'any'}`;
  const cached = adminStoreAccessCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  let access = await dbRequest('GET', 'admin_user_store_access', {
    select: '*',
    admin_user_id: `eq.${cleanAdminId}`,
    is_active: 'eq.true',
    order: 'created_at.asc'
  });
  if (admin) {
    access = access.filter((entry) => {
      if (role === 'superadmin') return true;
      return !companyId || entry.company_id === companyId;
    });
  }
  const storeIds = cleanUuidArray(access.map((entry) => entry.store_id));
  if (!storeIds.length) return [];
  const stores = await dbRequest('GET', 'stores', {
    select: '*',
    id: uuidInFilter(storeIds),
    is_active: 'eq.true',
    order: 'name.asc'
  });
  const storesById = new Map(stores.map((store) => [store.id, store]));
  const data = access
    .map((entry) => ({ ...entry, store: storesById.get(entry.store_id) || null }))
    .filter((entry) => entry.store);
  adminStoreAccessCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + ADMIN_ACCESS_CACHE_MS
  });
  return data;
}

async function listAdminStores(admin) {
  const access = await getAdminStoreAccess(admin);
  return access.map((entry) => ({
    ...publicStoreRef(entry.store),
    role: normalizeAdminRole(entry.role),
    permissions: Array.isArray(entry.permissions) ? entry.permissions : []
  }));
}

async function switchAdminStore(req, data, admin) {
  const storeId = cleanUuid(data.store_id || data.id, 'loja');
  const access = await getAdminStoreAccess(admin);
  const selected = access.find((entry) => entry.store_id === storeId);
  if (!selected) throw httpError(403, 'Sua conta não possui acesso a esta loja.');

  const nextAdmin = {
    ...admin,
    session_version: 2,
    company_id: selected.company_id,
    store_id: selected.store_id,
    role: normalizeAdminRole(selected.role || admin.role),
    active_store: publicStoreRef(selected.store),
    stores: access.map((entry) => publicStoreRef(entry.store)).filter(Boolean)
  };

  const cookies = parseCookies(req);
  const token = cookies[ADMIN_COOKIE];
  if (token) {
    await dbRequest('PATCH', 'app_sessions', { token: `eq.${token}`, type: 'eq.admin' }, {
      company_id: selected.company_id,
      store_id: selected.store_id,
      data: nextAdmin
    }, ['Prefer: return=minimal']);
    clearSessionCacheToken(token);
  }

  return publicAdmin(nextAdmin);
}

async function listPlatformCompanies(params = new URLSearchParams()) {
  const page = Math.max(1, Number.parseInt(params.get?.('page') || '1', 10) || 1);
  const perPage = clampNumber(Number(params.get?.('per_page') || 200), 25, 300);
  const offset = (page - 1) * perPage;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [companies, stores, domains, admins, subscriptions, features, overrides, orders, products, settings] = await Promise.all([
    dbRequest('GET', 'companies', {
      select: '*',
      order: 'created_at.desc',
      limit: String(perPage),
      offset: String(offset)
    }),
    dbRequest('GET', 'stores', {
      select: '*',
      order: 'name.asc',
      limit: '500'
    }),
    dbRequest('GET', 'store_domains', {
      select: 'id,store_id,domain,status,verified_at',
      order: 'created_at.desc',
      limit: '1000'
    }).catch(() => []),
    dbRequest('GET', 'admin_users', {
      select: 'id,company_id,name,email,role,is_active,last_login_at,created_at',
      order: 'created_at.asc',
      limit: '1000'
    }).catch(() => []),
    dbRequest('GET', 'company_subscriptions', {
      select: '*',
      order: 'created_at.desc',
      limit: '500'
    }),
    dbRequest('GET', 'platform_features', {
      select: '*',
      order: 'sort_order.asc',
      limit: '300'
    }),
    dbRequest('GET', 'company_feature_overrides', {
      select: '*',
      order: 'created_at.desc',
      limit: '1000'
    }),
    dbRequest('GET', 'orders', {
      select: 'id,store_id,total,status,created_at',
      created_at: `gte.${monthStart.toISOString()}`,
      order: 'created_at.desc',
      limit: '10000'
    }).catch(() => []),
    dbRequest('GET', 'menu_items', {
      select: 'id,store_id,is_active',
      limit: '10000'
    }).catch(() => []),
    dbRequest('GET', 'store_settings', {
      select: 'store_id,whatsapp_number,onboarding_completed,is_open',
      limit: '2000'
    }).catch(() => [])
  ]);
  const featureById = new Map(features.map((feature) => [feature.id, feature]));
  const domainsByStore = new Map();
  for (const domain of domains) {
    if (!domainsByStore.has(domain.store_id)) domainsByStore.set(domain.store_id, []);
    domainsByStore.get(domain.store_id).push(domain);
  }
  const storesByCompany = new Map();
  const storeCompanyById = new Map();
  for (const store of stores) {
    storeCompanyById.set(store.id, store.company_id);
    if (!storesByCompany.has(store.company_id)) storesByCompany.set(store.company_id, []);
    storesByCompany.get(store.company_id).push({
      ...publicStoreRef(store),
      domains: domainsByStore.get(store.id) || []
    });
  }
  const subscriptionByCompany = new Map();
  for (const subscription of subscriptions) {
    if (!subscriptionByCompany.has(subscription.company_id)) subscriptionByCompany.set(subscription.company_id, subscription);
  }
  const overridesByCompany = new Map();
  for (const override of overrides) {
    if (!overridesByCompany.has(override.company_id)) overridesByCompany.set(override.company_id, []);
    overridesByCompany.get(override.company_id).push({
      ...override,
      feature: featureById.get(override.feature_id) || null
    });
  }
  const adminsByCompany = new Map();
  for (const admin of admins) {
    if (!admin.company_id) continue;
    if (!adminsByCompany.has(admin.company_id)) adminsByCompany.set(admin.company_id, []);
    adminsByCompany.get(admin.company_id).push({
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: normalizeAdminRole(admin.role),
      is_active: admin.is_active !== false,
      last_login_at: admin.last_login_at || null,
      created_at: admin.created_at
    });
  }
  const ordersByCompany = new Map();
  for (const order of orders) {
    const companyId = storeCompanyById.get(order.store_id);
    if (!companyId) continue;
    if (!ordersByCompany.has(companyId)) ordersByCompany.set(companyId, []);
    ordersByCompany.get(companyId).push(order);
  }
  const productsByCompany = new Map();
  for (const product of products) {
    const companyId = storeCompanyById.get(product.store_id);
    if (!companyId) continue;
    if (!productsByCompany.has(companyId)) productsByCompany.set(companyId, []);
    productsByCompany.get(companyId).push(product);
  }
  const settingsByStore = new Map(settings.map((setting) => [setting.store_id, setting]));
  return {
    pagination: {
      page,
      per_page: perPage,
      returned: companies.length,
      has_more: companies.length === perPage
    },
    features,
    companies: companies.map((company) => {
      const companyStores = storesByCompany.get(company.id) || [];
      const companyAdmins = adminsByCompany.get(company.id) || [];
      const companyOrders = ordersByCompany.get(company.id) || [];
      const billableOrders = companyOrders.filter((order) => order.status !== 'cancelled');
      const companyProducts = productsByCompany.get(company.id) || [];
      const lastOrder = companyOrders[0] || null;
      const lastAccessAt = companyAdmins
        .map((admin) => admin.last_login_at)
        .filter(Boolean)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;
      return {
        ...company,
        stores: companyStores,
        admins: companyAdmins,
        subscription: subscriptionByCompany.get(company.id) || null,
        overrides: overridesByCompany.get(company.id) || [],
        metrics: {
          stores_count: companyStores.length,
          unpublished_stores_count: companyStores.filter((store) => store.is_active === false).length,
          orders_month: billableOrders.length,
          revenue_month: roundMoney(billableOrders.reduce((sum, order) => sum + moneyNumber(order.total), 0)),
          revenue_month_cents: moneyToCents(billableOrders.reduce((sum, order) => sum + moneyNumber(order.total), 0)),
          last_order_at: lastOrder?.created_at || null,
          last_access_at: lastAccessAt,
          products_count: companyProducts.length,
          active_products_count: companyProducts.filter((item) => item.is_active !== false).length,
          stores_without_whatsapp_count: companyStores.filter((store) => !settingsByStore.get(store.id)?.whatsapp_number).length,
          incomplete_onboarding_count: companyStores.filter((store) => settingsByStore.get(store.id)?.onboarding_completed === false).length
        }
      };
    })
  };
}

async function getPlatformCompanyDetail(companyId) {
  const resolvedCompanyId = cleanUuid(companyId, 'empresa');
  const [company] = await dbRequest('GET', 'companies', {
    select: '*',
    id: `eq.${resolvedCompanyId}`,
    limit: '1'
  });
  if (!company) throw httpError(404, 'Cliente não encontrado.');

  const [stores, admins, subscriptions, plans, billingHistory, auditLogs, usageCounters] = await Promise.all([
    dbRequest('GET', 'stores', {
      select: 'id,company_id,name,slug,public_url,is_active,created_at,updated_at',
      company_id: `eq.${resolvedCompanyId}`,
      order: 'name.asc',
      limit: '200'
    }).catch(() => []),
    dbRequest('GET', 'admin_users', {
      select: 'id,name,email,role,is_active,last_login_at,created_at',
      company_id: `eq.${resolvedCompanyId}`,
      order: 'created_at.asc',
      limit: '200'
    }).catch(() => []),
    listCompanySubscriptions(resolvedCompanyId, 50),
    dbRequest('GET', 'subscription_plans', { select: '*', limit: '100' }).catch(() => []),
    listBillingHistory(resolvedCompanyId),
    dbRequest('GET', 'audit_logs', {
      select: 'id,action,severity,entity_type,entity_id,store_id,actor_admin_id,after_data,created_at',
      company_id: `eq.${resolvedCompanyId}`,
      order: 'created_at.desc',
      limit: '80'
    }).catch(() => []),
    dbRequest('GET', 'company_usage_counters', {
      select: '*',
      company_id: `eq.${resolvedCompanyId}`,
      order: 'updated_at.desc',
      limit: '100'
    }).catch(() => [])
  ]);

  const storeIds = cleanUuidArray(stores.map((store) => store.id));
  const [orders, settings, domains, products, customers] = storeIds.length ? await Promise.all([
    dbRequest('GET', 'orders', {
      select: 'id,store_id,total,status,financial_status,payment_method,fulfillment_method,created_at',
      store_id: uuidInFilter(storeIds),
      order: 'created_at.desc',
      limit: '2000'
    }).catch(() => []),
    dbRequest('GET', 'store_settings', {
      select: 'store_id,whatsapp_number,onboarding_completed,is_open,updated_at',
      store_id: uuidInFilter(storeIds),
      limit: '200'
    }).catch(() => []),
    dbRequest('GET', 'store_domains', {
      select: 'id,store_id,domain,status,verified_at',
      store_id: uuidInFilter(storeIds),
      limit: '200'
    }).catch(() => []),
    dbRequest('GET', 'menu_items', {
      select: 'id,store_id,is_active,created_at',
      store_id: uuidInFilter(storeIds),
      limit: '5000'
    }).catch(() => []),
    dbRequest('GET', 'customers', {
      select: 'id,store_id,created_at,last_login_at',
      store_id: uuidInFilter(storeIds),
      limit: '5000'
    }).catch(() => [])
  ]) : [[], [], [], [], []];

  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const subscription = pickCurrentCompanySubscription(subscriptions);
  const plan = subscription?.plan_id ? planById.get(subscription.plan_id) || null : null;
  const settingsByStore = new Map(settings.map((row) => [row.store_id, row]));
  const domainsByStore = new Map();
  for (const domain of domains) {
    if (!domainsByStore.has(domain.store_id)) domainsByStore.set(domain.store_id, []);
    domainsByStore.get(domain.store_id).push(domain);
  }
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
  const billableOrders = orders.filter((order) => order.status !== 'cancelled');
  const orders30 = billableOrders.filter((order) => new Date(order.created_at) >= thirtyDaysAgo);
  const orders7 = billableOrders.filter((order) => new Date(order.created_at) >= sevenDaysAgo);
  const lastOrder = orders[0] || null;
  const timeline = buildPlatformCompanyTimeline({ company, stores, orders, billingHistory, auditLogs, subscription });
  const attention = platformCompanyAttention({ company, stores, settingsByStore, orders, subscription, products });

  return {
    company,
    stores: stores.map((store) => ({
      ...publicStoreRef(store),
      domains: domainsByStore.get(store.id) || [],
      settings: settingsByStore.get(store.id) || null,
      products_count: products.filter((item) => item.store_id === store.id).length,
      active_products_count: products.filter((item) => item.store_id === store.id && item.is_active !== false).length,
      customers_count: customers.filter((customer) => customer.store_id === store.id).length
    })),
    admins: admins.map((admin) => ({
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: normalizeAdminRole(admin.role),
      is_active: admin.is_active !== false,
      last_login_at: admin.last_login_at || null,
      created_at: admin.created_at
    })),
    subscription,
    plan,
    billing_history: billingHistory,
    usage_counters: usageCounters,
    metrics: {
      stores_count: stores.length,
      products_count: products.length,
      active_products_count: products.filter((item) => item.is_active !== false).length,
      customers_count: customers.length,
      orders_7d: orders7.length,
      revenue_7d: roundMoney(orders7.reduce((sum, order) => sum + moneyNumber(order.total), 0)),
      orders_30d: orders30.length,
      revenue_30d: roundMoney(orders30.reduce((sum, order) => sum + moneyNumber(order.total), 0)),
      average_ticket_30d: orders30.length ? roundMoney(orders30.reduce((sum, order) => sum + moneyNumber(order.total), 0) / orders30.length) : 0,
      last_order_at: lastOrder?.created_at || null,
      last_access_at: admins.map((admin) => admin.last_login_at).filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0] || null,
      mrr: moneyNumber(plan?.monthly_price || 0),
      mrr_cents: moneyToCents(plan?.monthly_price || 0)
    },
    recent_orders: orders.slice(0, 8).map((order) => ({
      id: order.id,
      store_id: order.store_id,
      total: moneyNumber(order.total),
      total_cents: moneyToCents(order.total),
      status: order.status,
      financial_status: order.financial_status,
      payment_method: order.payment_method,
      fulfillment_method: order.fulfillment_method,
      created_at: order.created_at
    })),
    attention,
    score: await getPlatformCompanyScore(resolvedCompanyId),
    internal_status: latestPlatformInternalStatus(auditLogs),
    timeline,
    audit_logs: auditLogs.slice(0, 30)
  };
}

async function createPlatformCompanyNote(companyId, data, admin, req) {
  const resolvedCompanyId = cleanUuid(companyId, 'empresa');
  const text = cleanText(data.note || data.text || '');
  if (!text || text.length < 3) throw httpError(422, 'Informe uma nota interna com pelo menos 3 caracteres.');
  const status = cleanText(data.status || '').slice(0, 80);
  const nextContactAt = data.next_contact_at ? new Date(data.next_contact_at) : null;
  const payload = {
    note: text.slice(0, 1000),
    support_status: status || null,
    next_contact_at: nextContactAt && !Number.isNaN(nextContactAt.getTime()) ? nextContactAt.toISOString() : null,
    responsible: cleanText(data.responsible || admin?.name || '').slice(0, 120) || null,
    priority: supportPriority(data.priority || 'medium'),
    tags: cleanSupportTags(data.tags || data.tag || '')
  };
  await audit('platform.client.note', {
    req,
    company_id: resolvedCompanyId,
    actor_admin_id: admin.id,
    entity_type: 'company',
    entity_id: resolvedCompanyId,
    severity: 'info',
    after_data: payload
  });
  return {
    ...payload,
    created_at: new Date().toISOString(),
    actor_admin_id: admin.id
  };
}

async function updatePlatformCompanyInternalStatus(req, companyId, data, admin) {
  const resolvedCompanyId = cleanUuid(companyId, 'empresa');
  await getCompanyById(resolvedCompanyId);
  const note = cleanText(data.note || data.text || '').slice(0, 1000);
  const nextContactAt = data.next_contact_at ? new Date(data.next_contact_at) : null;
  const payload = {
    support_status: cleanText(data.status || data.support_status || '').slice(0, 80) || null,
    responsible: cleanText(data.responsible || admin?.name || '').slice(0, 120) || null,
    next_contact_at: nextContactAt && !Number.isNaN(nextContactAt.getTime()) ? nextContactAt.toISOString() : null,
    priority: supportPriority(data.priority || 'medium'),
    tags: cleanSupportTags(data.tags || data.tag || ''),
    note: note || null
  };
  await audit('platform.client.internal_status', {
    req,
    company_id: resolvedCompanyId,
    actor_admin_id: admin.id,
    entity_type: 'company',
    entity_id: resolvedCompanyId,
    severity: payload.priority === 'critical' || payload.priority === 'critica' ? 'warning' : 'info',
    after_data: payload
  });
  return {
    ...payload,
    created_at: new Date().toISOString(),
    actor_admin_id: admin.id
  };
}

function latestPlatformInternalStatus(auditLogs = []) {
  const log = auditLogs.find((entry) => ['platform.client.internal_status', 'platform.client.note'].includes(entry.action));
  if (!log) return null;
  return {
    ...(log.after_data || {}),
    action: log.action,
    created_at: log.created_at,
    actor_admin_id: log.actor_admin_id || null
  };
}

function cleanSupportTags(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  return source
    .map((item) => cleanSlug(item).slice(0, 40))
    .filter(Boolean)
    .slice(0, 8);
}

async function getPlatformCompanyScore(companyId) {
  const detail = await getPlatformCompanyScoreContext(companyId);
  const { company, stores, settings, products, orders, admins, subscription, plan, tickets } = detail;
  const billableOrders = orders.filter((order) => order.status !== 'cancelled');
  const now = Date.now();
  const orders7 = billableOrders.filter((order) => now - new Date(order.created_at).getTime() <= 7 * 86400000);
  const orders30 = billableOrders.filter((order) => now - new Date(order.created_at).getTime() <= 30 * 86400000);
  const revenue30 = roundMoney(orders30.reduce((sum, order) => sum + moneyNumber(order.total), 0));
  const lastAccessAt = admins.map((admin) => admin.last_login_at).filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0] || null;
  const lastOrderAt = orders[0]?.created_at || null;
  const incompleteOnboarding = stores.some((store) => settings.get(store.id)?.onboarding_completed === false);
  const hasWhatsapp = stores.some((store) => settings.get(store.id)?.whatsapp_number);
  const openTickets = tickets.filter((ticket) => !['resolved', 'closed'].includes(ticket.status));
  const subscriptionStatus = subscription?.status || company.status || '';
  const planCode = plan?.code || '';
  const reasons = [];
  const recommendations = [];
  let points = 55;

  if (['past_due', 'payment_pending', 'grace_period', 'blocked', 'suspended'].includes(subscriptionStatus)) {
    points -= 30;
    reasons.push('Pagamento ou assinatura exige atenção.');
    recommendations.push(platformRecommendation('cobrar_pendencia', 'Cobrar pendência', 'Validar pagamento, webhook e orientar regularização.'));
  }
  if (!stores.length || incompleteOnboarding || !products.length) {
    points -= 25;
    reasons.push('Ativação inicial incompleta.');
    recommendations.push(platformRecommendation('ajudar_onboarding', 'Ajudar onboarding', 'Guiar o cliente até loja, WhatsApp e primeiro produto.'));
  }
  if (!hasWhatsapp && stores.length) {
    points -= 10;
    reasons.push('WhatsApp da loja não configurado.');
    recommendations.push(platformRecommendation('ativar_whatsapp', 'Ativar WhatsApp', 'Completar o WhatsApp para reduzir abandono de pedidos.'));
  }
  if (!orders30.length && stores.length) {
    points -= 20;
    reasons.push('Sem pedidos nos últimos 30 dias.');
    recommendations.push(platformRecommendation('verificar_sem_pedidos', 'Verificar loja sem pedidos', 'Conferir loja aberta, cardápio publicado e divulgação.'));
  } else {
    points += Math.min(25, orders30.length);
  }
  if (lastAccessAt && now - new Date(lastAccessAt).getTime() > 5 * 86400000) {
    points -= 12;
    reasons.push('Admin sem acesso recente.');
    recommendations.push(platformRecommendation('ligar_cliente', 'Ligar para cliente', 'Entender bloqueios e oferecer ajuda prática.'));
  }
  if (openTickets.length) {
    points -= Math.min(18, openTickets.length * 6);
    reasons.push(`${openTickets.length} chamado(s) aberto(s).`);
  }
  if (revenue30 >= 3000 || orders30.length >= 60) {
    points += 18;
    reasons.push('Uso forte nos últimos 30 dias.');
    if (['trial', 'free', 'essential'].includes(planCode)) {
      recommendations.push(platformRecommendation('oferecer_upgrade', 'Oferecer upgrade', 'Cliente tem volume para recursos de planos superiores.'));
    }
  }
  if (products.length && orders30.length) {
    recommendations.push(platformRecommendation('revisar_cardapio', 'Revisar cardápio', 'Sugerir fotos, combos, adicionais e produtos campeões.'));
  }

  points = Math.max(0, Math.min(100, Math.round(points)));
  const score = platformScoreBucket({ points, subscriptionStatus, stores, products, orders30, revenue30, planCode, incompleteOnboarding });
  return {
    company_id: company.id,
    score: score.key,
    label: score.label,
    tone: score.tone,
    points,
    reasons: reasons.length ? reasons : ['Cliente sem sinais críticos no momento.'],
    recommendations: dedupeRecommendations(recommendations),
    metrics: {
      plan_name: plan?.name || 'Sem plano',
      plan_code: planCode || null,
      subscription_status: subscriptionStatus || null,
      orders_7d: orders7.length,
      orders_30d: orders30.length,
      revenue_30d: revenue30,
      revenue_30d_cents: moneyToCents(revenue30),
      last_access_at: lastAccessAt,
      last_order_at: lastOrderAt,
      stores_count: stores.length,
      products_count: products.length,
      open_tickets: openTickets.length,
      onboarding_completed: stores.length ? !incompleteOnboarding : false
    }
  };
}

async function getPlatformCompanyScoreContext(companyId) {
  const resolvedCompanyId = cleanUuid(companyId, 'empresa');
  const [company] = await dbRequest('GET', 'companies', { select: '*', id: `eq.${resolvedCompanyId}`, limit: '1' });
  if (!company) throw httpError(404, 'Cliente não encontrado.');
  const [stores, admins, subscriptions, plans, tickets] = await Promise.all([
    dbRequest('GET', 'stores', { select: 'id,company_id,name,slug,is_active,created_at', company_id: `eq.${resolvedCompanyId}`, limit: '200' }).catch(() => []),
    dbRequest('GET', 'admin_users', { select: 'id,name,email,role,is_active,last_login_at,created_at', company_id: `eq.${resolvedCompanyId}`, limit: '200' }).catch(() => []),
    listCompanySubscriptions(resolvedCompanyId, 50),
    dbRequest('GET', 'subscription_plans', { select: '*', limit: '100' }).catch(() => []),
    dbRequest('GET', 'support_tickets', { select: 'id,status,priority,created_at,updated_at', company_id: `eq.${resolvedCompanyId}`, limit: '500' }).catch(() => [])
  ]);
  const storeIds = cleanUuidArray(stores.map((store) => store.id));
  const [orders, settingsRows, products] = storeIds.length ? await Promise.all([
    dbRequest('GET', 'orders', { select: 'id,store_id,total,status,created_at', store_id: uuidInFilter(storeIds), order: 'created_at.desc', limit: '5000' }).catch(() => []),
    dbRequest('GET', 'store_settings', { select: 'store_id,whatsapp_number,onboarding_completed,is_open', store_id: uuidInFilter(storeIds), limit: '200' }).catch(() => []),
    dbRequest('GET', 'menu_items', { select: 'id,store_id,is_active,created_at', store_id: uuidInFilter(storeIds), limit: '5000' }).catch(() => [])
  ]) : [[], [], []];
  const subscription = pickCurrentCompanySubscription(subscriptions);
  const plan = subscription?.plan_id ? plans.find((entry) => entry.id === subscription.plan_id) || null : null;
  return {
    company,
    stores,
    admins,
    subscription,
    plan,
    tickets,
    orders,
    products,
    settings: new Map(settingsRows.map((row) => [row.store_id, row]))
  };
}

function platformScoreBucket(context) {
  if (['past_due', 'payment_pending', 'grace_period', 'blocked', 'suspended'].includes(context.subscriptionStatus)) {
    return { key: 'inadimplente', label: 'Inadimplente', tone: 'danger' };
  }
  if (!context.stores.length || !context.products.length || context.incompleteOnboarding) {
    return { key: 'sem_ativacao', label: 'Sem ativação', tone: 'warning' };
  }
  if (context.orders30.length >= 80 || context.revenue30 >= 5000) {
    return { key: 'cliente_campeao', label: 'Cliente campeão', tone: 'success' };
  }
  if (['trial', 'free', 'essential'].includes(context.planCode) && (context.orders30.length >= 30 || context.revenue30 >= 2000)) {
    return { key: 'potencial_upgrade', label: 'Potencial upgrade', tone: 'info' };
  }
  if (context.points < 55 || !context.orders30.length) {
    return { key: 'em_risco', label: 'Em risco', tone: 'warning' };
  }
  return { key: 'saudavel', label: 'Saudável', tone: 'success' };
}

function platformRecommendation(key, title, action) {
  return { key, title, action };
}

function dedupeRecommendations(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.key || seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  }).slice(0, 6);
}

async function getPlatformCompanyTimelineAdvanced(companyId) {
  const resolvedCompanyId = cleanUuid(companyId, 'empresa');
  const detail = await getPlatformCompanyDetail(resolvedCompanyId);
  const storeIds = cleanUuidArray((detail.stores || []).map((store) => store.id));
  const [products, tickets, ticketMessages, auditLogs] = await Promise.all([
    storeIds.length ? dbRequest('GET', 'menu_items', {
      select: 'id,store_id,name,created_at',
      store_id: uuidInFilter(storeIds),
      order: 'created_at.asc',
      limit: '50'
    }).catch(() => []) : Promise.resolve([]),
    dbRequest('GET', 'support_tickets', {
      select: 'id,subject,status,priority,created_at,updated_at',
      company_id: `eq.${resolvedCompanyId}`,
      order: 'created_at.desc',
      limit: '100'
    }).catch(() => []),
    dbRequest('GET', 'support_ticket_messages', {
      select: 'id,ticket_id,author_type,created_at',
      order: 'created_at.desc',
      limit: '200'
    }).catch(() => []),
    dbRequest('GET', 'audit_logs', {
      select: 'id,action,severity,entity_type,entity_id,store_id,actor_admin_id,after_data,created_at',
      company_id: `eq.${resolvedCompanyId}`,
      order: 'created_at.desc',
      limit: '120'
    }).catch(() => [])
  ]);
  const events = [...(detail.timeline || [])];
  const firstProduct = products[0];
  if (firstProduct?.created_at) {
    events.push({
      type: 'menu',
      title: 'Primeiro produto',
      description: firstProduct.name || 'Produto cadastrado',
      created_at: firstProduct.created_at
    });
  }
  for (const store of detail.stores || []) {
    if (store.settings?.onboarding_completed) {
      events.push({
        type: 'onboarding',
        title: 'Onboarding concluído',
        description: store.name,
        created_at: store.settings.updated_at || store.created_at || new Date().toISOString()
      });
    }
  }
  for (const ticket of tickets) {
    events.push({
      type: 'support',
      title: `Chamado ${subscriptionEventLabel(ticket.status)}`,
      description: ticket.subject || 'Chamado de suporte',
      created_at: ['resolved', 'closed'].includes(ticket.status) ? ticket.updated_at || ticket.created_at : ticket.created_at
    });
  }
  const ticketIds = new Set(tickets.map((ticket) => ticket.id));
  for (const message of ticketMessages.filter((entry) => ticketIds.has(entry.ticket_id)).slice(0, 30)) {
    events.push({
      type: 'support',
      title: message.author_type === 'platform' ? 'Suporte respondeu' : 'Cliente respondeu',
      description: 'Mensagem registrada no chamado.',
      created_at: message.created_at
    });
  }
  for (const log of auditLogs) {
    if (!/support|impersonate|suspend|activate|billing|subscription|onboarding|note|internal_status/i.test(log.action || '')) continue;
    events.push({
      type: String(log.action || '').includes('support') ? 'support' : 'audit',
      title: auditActionLabel(log.action),
      description: platformTimelineDescription(log),
      created_at: log.created_at
    });
  }
  return {
    company_id: resolvedCompanyId,
    timeline: uniqueTimelineEvents(events)
  };
}

function uniqueTimelineEvents(events = []) {
  const seen = new Set();
  return events
    .filter((event) => event.created_at)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .filter((event) => {
      const key = `${event.type}:${event.title}:${event.created_at}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 60);
}

async function platformCommercialSummary() {
  const now = new Date();
  const todayStart = startOfLocalDay(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const [companies, stores, subscriptions, plans, orders, settings, subscriptionEvents, products, backup, operationalLogs] = await Promise.all([
    dbRequest('GET', 'companies', { select: '*', limit: '1000' }),
    dbRequest('GET', 'stores', { select: 'id,company_id,name,slug,is_active,created_at', limit: '2000' }),
    dbRequest('GET', 'company_subscriptions', { select: '*', order: 'created_at.desc', limit: '1000' }),
    dbRequest('GET', 'subscription_plans', { select: '*', limit: '100' }),
    dbRequest('GET', 'orders', {
      select: 'id,store_id,total,status,financial_status,payment_method,fulfillment_method,created_at',
      created_at: `gte.${thirtyDaysAgo.toISOString()}`,
      limit: '5000'
    }).catch(() => []),
    dbRequest('GET', 'store_settings', {
      select: 'store_id,whatsapp_number,onboarding_completed,is_open',
      limit: '2000'
    }).catch(() => []),
    dbRequest('GET', 'subscription_events', {
      select: 'id,company_id,event_type,created_at,metadata',
      created_at: `gte.${thirtyDaysAgo.toISOString()}`,
      limit: '1000'
    }).catch(() => []),
    dbRequest('GET', 'menu_items', {
      select: 'id,store_id,is_active',
      limit: '10000'
    }).catch(() => []),
    platformBackupStatus().catch(() => ({ status: 'unknown' })),
    listOperationalLogs(thirtyDaysAgo).catch(() => [])
  ]);
  const context = platformAnalyticsContext({ companies, stores, subscriptions, plans, orders, settings, products });
  const todayOrders = orders.filter((order) => new Date(order.created_at) >= todayStart && order.status !== 'cancelled');
  const monthOrders = orders.filter((order) => new Date(order.created_at) >= monthStart && order.status !== 'cancelled');
  const activeStatuses = new Set(['active']);
  const trialStatuses = new Set(['trial']);
  const delinquentStatuses = new Set(['payment_pending', 'grace_period', 'past_due']);
  const churnStatuses = new Set(['cancelled', 'archived']);
  const suspendedStatuses = new Set(['suspended']);
  const alerts = platformCommercialAlerts(companies, stores, context, { backup, operationalLogs });
  const delayedBackups = alerts.filter((alert) => alert.type === 'backup').length;
  const webhookErrors = alerts.filter((alert) => alert.type === 'webhook').length;
  const trialsEnding = alerts.filter((alert) => alert.type === 'trial').length;
  const revenueToday = roundMoney(todayOrders.reduce((sum, order) => sum + moneyNumber(order.total), 0));
  const mrrEstimated = platformEstimatedMrr(companies, context.subscriptionByCompany, context.planById);
  const cards = {
    active_clients: companies.filter((company) => activeStatuses.has(company.status)).length,
    trial_clients: companies.filter((company) => trialStatuses.has(company.status)).length,
    delinquent_clients: companies.filter((company) => delinquentStatuses.has(company.status)).length,
    suspended_clients: companies.filter((company) => suspendedStatuses.has(company.status)).length,
    published_stores: stores.filter((store) => store.is_active !== false).length,
    unpublished_stores: stores.filter((store) => store.is_active === false).length,
    orders_today: todayOrders.length,
    revenue_today: revenueToday,
    revenue_today_cents: moneyToCents(revenueToday),
    mrr_estimated: mrrEstimated,
    mrr_estimated_cents: moneyToCents(mrrEstimated),
    trials_ending: trialsEnding,
    webhook_errors: webhookErrors,
    delayed_backups: delayedBackups,
    churn_clients: companies.filter((company) => churnStatuses.has(company.status)).length,
    generated_without_nan: true
  };
  return {
    generated_at: new Date().toISOString(),
    cards,
    billing: platformBillingMetrics({ companies, subscriptions, plans, subscriptionEvents, monthOrders }),
    alerts
  };
}

async function platformCommercialAnalytics(params = new URLSearchParams()) {
  const period = platformAnalyticsPeriod(params.get?.('period') || '30d');
  const [companies, stores, subscriptions, plans, orders, settings, subscriptionEvents, products] = await Promise.all([
    dbRequest('GET', 'companies', { select: '*', limit: '1000' }),
    dbRequest('GET', 'stores', { select: 'id,company_id,name,slug,is_active,created_at', limit: '2000' }),
    dbRequest('GET', 'company_subscriptions', { select: '*', order: 'created_at.desc', limit: '1000' }),
    dbRequest('GET', 'subscription_plans', { select: '*', limit: '100' }),
    dbRequest('GET', 'orders', {
      select: 'id,store_id,total,status,financial_status,payment_method,fulfillment_method,created_at',
      created_at: `gte.${period.since.toISOString()}`,
      limit: '8000'
    }).catch(() => []),
    dbRequest('GET', 'store_settings', {
      select: 'store_id,whatsapp_number,onboarding_completed,is_open',
      limit: '2000'
    }).catch(() => []),
    dbRequest('GET', 'subscription_events', {
      select: 'id,company_id,event_type,created_at,metadata',
      created_at: `gte.${period.since.toISOString()}`,
      limit: '2000'
    }).catch(() => []),
    dbRequest('GET', 'menu_items', {
      select: 'id,store_id,is_active',
      limit: '10000'
    }).catch(() => [])
  ]);
  const context = platformAnalyticsContext({ companies, stores, subscriptions, plans, orders, settings, products });
  const revenue = platformRevenueSnapshot({ companies, subscriptions, plans, orders, period });
  const conversion = platformConversionSnapshot({ companies, subscriptions, subscriptionEvents, period });
  return {
    period: period.label,
    generated_at: new Date().toISOString(),
    daily: platformDailySeries(orders, period),
    ranking: platformStoreRanking(orders, context.storeById).slice(0, 8),
    by_payment: platformGroupOrders(orders.filter((order) => order.status !== 'cancelled'), 'payment_method'),
    by_status: platformGroupOrders(orders, 'status'),
    company_metrics: platformCompanyMetrics(companies, context),
    comparison: platformAnalyticsComparison(orders, period),
    revenue,
    conversion,
    new_clients_daily: platformNewClientsDaily(companies, period),
    mrr_by_plan: revenue.mrr_by_plan
  };
}

function platformAnalyticsContext({ companies, stores, subscriptions, plans, orders, settings, products = [] }) {
  const storeById = new Map(stores.map((store) => [store.id, store]));
  const settingsByStore = new Map(settings.map((row) => [row.store_id, row]));
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const productsByStore = new Map();
  for (const product of products || []) {
    if (!productsByStore.has(product.store_id)) productsByStore.set(product.store_id, []);
    productsByStore.get(product.store_id).push(product);
  }
  const subscriptionByCompany = new Map();
  for (const subscription of subscriptions) {
    if (!subscriptionByCompany.has(subscription.company_id)) subscriptionByCompany.set(subscription.company_id, subscription);
  }
  const storesByCompany = new Map();
  for (const store of stores) {
    if (!storesByCompany.has(store.company_id)) storesByCompany.set(store.company_id, []);
    storesByCompany.get(store.company_id).push(store);
  }
  const ordersByCompany = new Map();
  for (const order of orders) {
    const store = storeById.get(order.store_id);
    if (!store?.company_id) continue;
    if (!ordersByCompany.has(store.company_id)) ordersByCompany.set(store.company_id, []);
    ordersByCompany.get(store.company_id).push(order);
  }
  return { storeById, settingsByStore, productsByStore, planById, subscriptionByCompany, storesByCompany, ordersByCompany };
}

async function platformExecutiveAlerts(params = new URLSearchParams()) {
  const period = platformAnalyticsPeriod(params.get?.('period') || '30d');
  const [companies, stores, subscriptions, plans, orders, settings, products, backup, operationalLogs] = await Promise.all([
    dbRequest('GET', 'companies', { select: '*', limit: '1000' }),
    dbRequest('GET', 'stores', { select: 'id,company_id,name,slug,is_active,created_at', limit: '2000' }),
    dbRequest('GET', 'company_subscriptions', { select: '*', order: 'created_at.desc', limit: '1000' }),
    dbRequest('GET', 'subscription_plans', { select: '*', limit: '100' }),
    dbRequest('GET', 'orders', {
      select: 'id,store_id,total,status,created_at',
      created_at: `gte.${period.since.toISOString()}`,
      limit: '8000'
    }).catch(() => []),
    dbRequest('GET', 'store_settings', { select: 'store_id,whatsapp_number,onboarding_completed,is_open', limit: '2000' }).catch(() => []),
    dbRequest('GET', 'menu_items', { select: 'id,store_id,is_active', limit: '10000' }).catch(() => []),
    platformBackupStatus().catch(() => ({ status: 'unknown' })),
    listOperationalLogs(period.since).catch(() => [])
  ]);
  const context = platformAnalyticsContext({ companies, stores, subscriptions, plans, orders, settings, products });
  return {
    period: period.label,
    generated_at: new Date().toISOString(),
    alerts: platformCommercialAlerts(companies, stores, context, { backup, operationalLogs })
  };
}

async function platformExecutiveRevenue(params = new URLSearchParams()) {
  const period = platformAnalyticsPeriod(params.get?.('period') || '30d');
  const [companies, subscriptions, plans, orders] = await Promise.all([
    dbRequest('GET', 'companies', { select: '*', limit: '1000' }),
    dbRequest('GET', 'company_subscriptions', { select: '*', order: 'created_at.desc', limit: '1000' }),
    dbRequest('GET', 'subscription_plans', { select: '*', limit: '100' }),
    dbRequest('GET', 'orders', {
      select: 'id,store_id,total,status,created_at',
      created_at: `gte.${period.since.toISOString()}`,
      limit: '8000'
    }).catch(() => [])
  ]);
  return {
    period: period.label,
    generated_at: new Date().toISOString(),
    ...platformRevenueSnapshot({ companies, subscriptions, plans, orders, period })
  };
}

async function platformExecutiveConversion(params = new URLSearchParams()) {
  const period = platformAnalyticsPeriod(params.get?.('period') || '30d');
  const [companies, subscriptions, subscriptionEvents] = await Promise.all([
    dbRequest('GET', 'companies', { select: '*', limit: '1000' }),
    dbRequest('GET', 'company_subscriptions', { select: '*', order: 'created_at.desc', limit: '1000' }),
    dbRequest('GET', 'subscription_events', {
      select: 'id,company_id,event_type,created_at,metadata',
      created_at: `gte.${period.since.toISOString()}`,
      limit: '2000'
    }).catch(() => [])
  ]);
  return {
    period: period.label,
    generated_at: new Date().toISOString(),
    ...platformConversionSnapshot({ companies, subscriptions, subscriptionEvents, period })
  };
}

async function platformBillingDataset(params = new URLSearchParams()) {
  const period = platformAnalyticsPeriod(params.get?.('period') || '30d');
  const since = period.since.toISOString();
  const [companies, subscriptions, plans, events, stores, orders] = await Promise.all([
    dbRequest('GET', 'companies', { select: '*', limit: '1500' }),
    dbRequest('GET', 'company_subscriptions', { select: '*', order: 'created_at.desc', limit: '2000' }).catch(() => []),
    dbRequest('GET', 'subscription_plans', { select: '*', order: 'sort_order.asc', limit: '200' }).catch(() => []),
    dbRequest('GET', 'subscription_events', {
      select: '*',
      created_at: `gte.${since}`,
      order: 'created_at.desc',
      limit: '2000'
    }).catch(() => []),
    dbRequest('GET', 'stores', { select: 'id,company_id', limit: '3000' }).catch(() => []),
    dbRequest('GET', 'orders', {
      select: 'id,store_id,total,status,created_at',
      created_at: `gte.${since}`,
      limit: '10000'
    }).catch(() => [])
  ]);
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const companyById = new Map(companies.map((company) => [company.id, company]));
  const subscriptionsByCompany = new Map();
  for (const subscription of subscriptions) {
    if (!subscriptionsByCompany.has(subscription.company_id)) subscriptionsByCompany.set(subscription.company_id, []);
    subscriptionsByCompany.get(subscription.company_id).push(subscription);
  }
  const subscriptionById = new Map(subscriptions.map((subscription) => [subscription.id, subscription]));
  const storeCompanyById = new Map(stores.map((store) => [store.id, store.company_id]));
  const billableOrders = orders.filter((order) => order.status !== 'cancelled');
  return {
    period,
    companies,
    subscriptions,
    plans,
    events,
    stores,
    orders,
    billableOrders,
    planById,
    companyById,
    subscriptionsByCompany,
    subscriptionById,
    storeCompanyById
  };
}

async function platformBillingSummary(params = new URLSearchParams()) {
  const data = await platformBillingDataset(params);
  const rows = data.companies.map((company) => {
    const subscription = pickCurrentCompanySubscription(data.subscriptionsByCompany.get(company.id) || []);
    const plan = subscription?.plan_id ? data.planById.get(subscription.plan_id) || null : null;
    return { company, subscription, plan, status: platformSubscriptionStatus(subscription, company), price_cents: moneyToCents(plan?.monthly_price || 0) };
  });
  const activeRows = rows.filter((row) => ['active', 'trial', 'grace_period', 'payment_pending', 'past_due'].includes(row.status));
  const riskRows = rows.filter((row) => ['trial', 'grace_period', 'payment_pending', 'past_due'].includes(row.status));
  const lostRows = rows.filter((row) => ['cancelled', 'expired', 'suspended', 'blocked', 'archived'].includes(row.status));
  const pendingRows = rows.filter((row) => ['payment_pending', 'grace_period', 'past_due'].includes(row.status));
  const orderRevenueCents = data.billableOrders.reduce((sum, order) => sum + moneyToCents(order.total), 0);
  const payingClients = rows.filter((row) => ['active', 'grace_period', 'payment_pending', 'past_due'].includes(row.status) && row.price_cents > 0);
  const eventCounts = billingEventCounts(data.events);
  const statusCounts = rows.reduce((acc, row) => {
    const key = billingDisplayStatus(row.status);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return {
    period: data.period.label,
    generated_at: new Date().toISOString(),
    mrr_total_cents: activeRows.reduce((sum, row) => sum + row.price_cents, 0),
    mrr_active_cents: rows.filter((row) => row.status === 'active').reduce((sum, row) => sum + row.price_cents, 0),
    mrr_at_risk_cents: riskRows.reduce((sum, row) => sum + row.price_cents, 0),
    pending_revenue_cents: pendingRows.reduce((sum, row) => sum + row.price_cents, 0),
    lost_revenue_cents: lostRows.reduce((sum, row) => sum + row.price_cents, 0),
    delinquency: {
      clients: pendingRows.length,
      rate: rows.length ? Number(((pendingRows.length / rows.length) * 100).toFixed(1)) : 0
    },
    average_ticket_per_client_cents: payingClients.length ? Math.round(orderRevenueCents / payingClients.length) : 0,
    order_revenue_cents: orderRevenueCents,
    subscriptions_by_status: statusCounts,
    events: eventCounts,
    alerts: platformBillingAlerts(rows)
  };
}

async function platformBillingPlans() {
  const data = await platformBillingDataset(new URLSearchParams('period=30d'));
  const rows = data.plans.map((plan) => {
    const subscriptions = data.subscriptions.filter((subscription) => subscription.plan_id === plan.id);
    const current = subscriptions.filter((subscription) => ['active', 'trial', 'grace_period', 'payment_pending', 'past_due'].includes(subscription.status));
    return {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      description: plan.description,
      monthly_price: moneyNumber(plan.monthly_price || 0),
      monthly_price_cents: moneyToCents(plan.monthly_price || 0),
      is_active: plan.is_active !== false,
      sort_order: Number(plan.sort_order || 0),
      active_subscriptions: current.length,
      mrr_cents: current.length * moneyToCents(plan.monthly_price || 0)
    };
  });
  return { plans: rows };
}

async function platformBillingEvents(params = new URLSearchParams()) {
  const data = await platformBillingDataset(params);
  const statusFilter = cleanSlug(params.get?.('status') || '');
  const planFilter = cleanSlug(params.get?.('plan') || '');
  const events = data.events.map((event) => {
    const subscription = event.subscription_id ? data.subscriptionById.get(event.subscription_id) || null : null;
    const company = data.companyById.get(event.company_id) || null;
    const plan = subscription?.plan_id ? data.planById.get(subscription.plan_id) || null : null;
    const metadata = event.metadata || {};
    return {
      id: event.id,
      company_id: event.company_id,
      company_name: company?.name || 'Cliente',
      subscription_id: event.subscription_id,
      event_type: event.event_type,
      label: billingEventLabel(event.event_type),
      status: cleanSlug(metadata.status || event.event_type || ''),
      amount_cents: Number(metadata.amount_cents || metadata.price_cents || 0),
      provider: metadata.provider || subscription?.billing_provider || 'manual',
      external_reference: metadata.provider_event_id || metadata.external_reference || subscription?.external_subscription_id || null,
      plan_code: metadata.plan_code || plan?.code || null,
      plan_name: metadata.plan_name || plan?.name || null,
      description: event.description || '',
      created_at: event.created_at
    };
  }).filter((event) => {
    if (statusFilter && !String(event.status || event.event_type || '').includes(statusFilter)) return false;
    if (planFilter && event.plan_code !== planFilter) return false;
    return true;
  });
  return { events };
}

async function platformBillingSubscriptions(params = new URLSearchParams()) {
  const data = await platformBillingDataset(params);
  const statusFilter = cleanSlug(params.get?.('status') || '');
  const planFilter = cleanSlug(params.get?.('plan') || '');
  const rows = data.companies.map((company) => {
    const subscription = pickCurrentCompanySubscription(data.subscriptionsByCompany.get(company.id) || []);
    const plan = subscription?.plan_id ? data.planById.get(subscription.plan_id) || null : null;
    const status = platformSubscriptionStatus(subscription, company);
    return {
      company_id: company.id,
      company_name: company.name,
      company_status: company.status,
      billing_email: company.billing_email || null,
      phone: company.phone || null,
      subscription_id: subscription?.id || null,
      status,
      display_status: billingDisplayStatus(status),
      plan_id: plan?.id || null,
      plan_code: plan?.code || null,
      plan_name: plan?.name || 'Sem plano',
      started_at: subscription?.current_period_starts_at || subscription?.created_at || company.created_at || null,
      trial_ends_at: subscription?.trial_ends_at || null,
      current_period_ends_at: subscription?.current_period_ends_at || null,
      next_renewal_at: subscription?.next_renewal_at || null,
      payment_due_at: subscription?.payment_due_at || null,
      cancelled_at: subscription?.cancelled_at || null,
      value_cents: moneyToCents(plan?.monthly_price || 0),
      provider: subscription?.billing_provider || 'manual',
      external_reference: subscription?.external_subscription_id || null,
      metadata: sanitizeBillingMetadata(subscription?.metadata || {})
    };
  }).filter((row) => {
    if (statusFilter && row.status !== statusFilter && row.display_status !== statusFilter) return false;
    if (planFilter && row.plan_code !== planFilter) return false;
    return true;
  });
  return { subscriptions: rows };
}

function platformSubscriptionStatus(subscription, company) {
  const raw = cleanSlug(subscription?.status || company?.status || 'unknown');
  if (raw === 'suspended') return 'blocked';
  if (raw === 'payment_pending') return 'past_due';
  return raw || 'unknown';
}

function billingDisplayStatus(status) {
  const value = cleanSlug(status || '');
  if (value === 'suspended') return 'blocked';
  return value;
}

function billingEventCounts(events = []) {
  const count = (patterns) => events.filter((event) => patterns.some((pattern) => pattern.test(String(event.event_type || '')))).length;
  return {
    payment_approved: count([/paid/i, /payment_approved/i, /billing\.active/i, /subscription_reactivated/i]),
    payment_refused: count([/refused/i, /rejected/i, /failed/i, /webhook_failed/i]),
    webhook_received: count([/billing\./i, /webhook/i]),
    webhook_error: count([/webhook_failed/i, /failed/i]),
    plan_changed: count([/plan/i, /change/i]),
    upgrades: count([/upgrade/i]),
    downgrades: count([/downgrade/i]),
    cancellations: count([/cancel/i]),
    reactivations: count([/reactivat/i])
  };
}

function platformBillingAlerts(rows = []) {
  const alerts = [];
  const now = Date.now();
  const graceExpired = rows.filter((row) => {
    const due = row.subscription?.payment_due_at || row.subscription?.current_period_ends_at;
    return row.status === 'grace_period' && due && new Date(due).getTime() < now;
  });
  const pastDue = rows.filter((row) => ['past_due', 'payment_pending'].includes(row.status));
  const trialsEnding = rows.filter((row) => {
    if (row.status !== 'trial' || !row.subscription?.trial_ends_at) return false;
    const days = Math.ceil((new Date(row.subscription.trial_ends_at).getTime() - now) / 86400000);
    return days >= 0 && days <= 3;
  });
  if (graceExpired.length) alerts.push({ type: 'grace_period', severity: 'critical', title: `${graceExpired.length} cliente(s) passaram do grace period`, action: 'Bloquear recursos pagos ou reativar após pagamento.' });
  if (pastDue.length) alerts.push({ type: 'past_due', severity: 'warning', title: `${pastDue.length} cobrança(s) pendente(s)`, action: 'Conferir Abacate Pay e reenviar cobrança.' });
  if (trialsEnding.length) alerts.push({ type: 'trial', severity: 'attention', title: `${trialsEnding.length} trial(s) perto do fim`, action: 'Acionar comercial para conversão.' });
  return alerts;
}

function billingEventLabel(type) {
  const value = String(type || '');
  const labels = {
    'checkout_created': 'Checkout criado',
    'billing.active': 'Pagamento aprovado',
    'billing.past_due': 'Pagamento vencido',
    'billing.payment_pending': 'Pagamento pendente',
    'billing.webhook_failed': 'Webhook com erro',
    'platform.upgrade': 'Upgrade',
    'platform.downgrade': 'Downgrade',
    'platform.same_plan': 'Plano mantido',
    'platform.subscription_cancelled': 'Cancelamento',
    'platform.subscription_reactivated': 'Reativação',
    'billing.resend_requested': 'Reenvio solicitado'
  };
  return labels[value] || subscriptionEventLabel(value || 'Evento financeiro');
}

function sanitizeBillingMetadata(metadata = {}) {
  const allowed = {};
  for (const key of ['source', 'plan_code', 'plan_name', 'change_type', 'amount_cents', 'status', 'provider']) {
    if (metadata[key] !== undefined) allowed[key] = metadata[key];
  }
  if (Array.isArray(metadata.downgrade_warnings)) allowed.downgrade_warnings = metadata.downgrade_warnings;
  return allowed;
}

function platformCompanyMetrics(companies, context) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return companies.map((company) => {
    const subscription = context.subscriptionByCompany.get(company.id) || null;
    const plan = subscription?.plan_id ? context.planById.get(subscription.plan_id) : null;
    const stores = context.storesByCompany.get(company.id) || [];
    const orders = context.ordersByCompany.get(company.id) || [];
    const products = stores.flatMap((store) => context.productsByStore?.get(store.id) || []);
    const settings = stores.map((store) => context.settingsByStore?.get(store.id)).filter(Boolean);
    const monthOrders = orders.filter((order) => new Date(order.created_at) >= monthStart && order.status !== 'cancelled');
    const lastOrder = orders.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
    const lastAccessAt = company.last_login_at || null;
    return {
      company_id: company.id,
      stores_count: stores.length,
      active_stores_count: stores.filter((store) => store.is_active !== false).length,
      unpublished_stores_count: stores.filter((store) => store.is_active === false).length,
      plan_name: plan?.name || 'Sem plano',
      plan_code: plan?.code || '',
      subscription_status: subscription?.status || company.status || 'unknown',
      mrr: moneyNumber(plan?.monthly_price || 0),
      mrr_cents: moneyToCents(plan?.monthly_price || 0),
      orders_month: monthOrders.length,
      revenue_month: roundMoney(monthOrders.reduce((sum, order) => sum + moneyNumber(order.total), 0)),
      revenue_month_cents: moneyToCents(monthOrders.reduce((sum, order) => sum + moneyNumber(order.total), 0)),
      last_order_at: lastOrder?.created_at || null,
      last_access_at: lastAccessAt,
      products_count: products.length,
      active_products_count: products.filter((item) => item.is_active !== false).length,
      stores_without_whatsapp_count: stores.length - settings.filter((setting) => setting.whatsapp_number).length,
      incomplete_onboarding_count: settings.filter((setting) => setting.onboarding_completed === false).length,
      has_orders: orders.length > 0
    };
  });
}

function platformDailySeries(orders, period) {
  const days = [];
  for (let cursor = new Date(period.start); cursor <= period.end; cursor.setDate(cursor.getDate() + 1)) {
    days.push({ date: cursor.toISOString().slice(0, 10), orders: 0, revenue: 0, revenue_cents: 0 });
  }
  const byDate = new Map(days.map((day) => [day.date, day]));
  for (const order of orders) {
    const key = new Date(order.created_at).toISOString().slice(0, 10);
    const row = byDate.get(key);
    if (!row) continue;
    row.orders += 1;
    if (order.status !== 'cancelled') {
      row.revenue = roundMoney(row.revenue + moneyNumber(order.total));
      row.revenue_cents = moneyToCents(row.revenue);
    }
  }
  return days;
}

function platformStoreRanking(orders, storeById) {
  const grouped = new Map();
  for (const order of orders) {
    const store = storeById.get(order.store_id);
    if (!store) continue;
    const current = grouped.get(order.store_id) || {
      store_id: order.store_id,
      store_name: store.name || store.slug || 'Loja',
      slug: store.slug || '',
      orders: 0,
      revenue: 0,
      revenue_cents: 0
    };
    current.orders += 1;
    if (order.status !== 'cancelled') {
      current.revenue = roundMoney(current.revenue + moneyNumber(order.total));
      current.revenue_cents = moneyToCents(current.revenue);
    }
    grouped.set(order.store_id, current);
  }
  return [...grouped.values()].sort((a, b) => b.orders - a.orders || b.revenue - a.revenue);
}

function platformGroupOrders(orders, field) {
  const grouped = new Map();
  for (const order of orders) {
    const key = order[field] || 'Não informado';
    const current = grouped.get(key) || { key, count: 0, revenue: 0, revenue_cents: 0 };
    current.count += 1;
    current.revenue = roundMoney(current.revenue + moneyNumber(order.total));
    current.revenue_cents = moneyToCents(current.revenue);
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((a, b) => b.count - a.count || b.revenue - a.revenue);
}

function platformAnalyticsComparison(orders, period) {
  const midpoint = new Date(period.end.getTime() - Math.floor((period.end - period.start) / 2));
  const previous = orders.filter((order) => new Date(order.created_at) < midpoint);
  const current = orders.filter((order) => new Date(order.created_at) >= midpoint);
  const totals = (rows) => ({
    orders: rows.length,
    revenue: roundMoney(rows.filter((order) => order.status !== 'cancelled').reduce((sum, order) => sum + moneyNumber(order.total), 0)),
    revenue_cents: moneyToCents(rows.filter((order) => order.status !== 'cancelled').reduce((sum, order) => sum + moneyNumber(order.total), 0))
  });
  return { previous: totals(previous), current: totals(current) };
}

function platformBillingMetrics({ companies, subscriptions, plans, subscriptionEvents, monthOrders }) {
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const subscriptionByCompany = new Map();
  for (const subscription of subscriptions) {
    if (!subscriptionByCompany.has(subscription.company_id)) subscriptionByCompany.set(subscription.company_id, subscription);
  }
  const revenueByPlan = new Map();
  let mrr = 0;
  for (const company of companies) {
    const subscription = subscriptionByCompany.get(company.id);
    const plan = subscription?.plan_id ? planById.get(subscription.plan_id) : null;
    const price = moneyNumber(plan?.monthly_price || 0);
    if (['active', 'trial', 'grace_period', 'payment_pending'].includes(subscription?.status || company.status)) mrr += price;
    const key = plan?.name || 'Sem plano';
    revenueByPlan.set(key, roundMoney((revenueByPlan.get(key) || 0) + price));
  }
  const eventCount = (patterns) => subscriptionEvents.filter((event) => patterns.some((pattern) => String(event.event_type || '').includes(pattern))).length;
  return {
    mrr: roundMoney(mrr),
    mrr_cents: moneyToCents(mrr),
    monthly_order_revenue: roundMoney(monthOrders.reduce((sum, order) => sum + moneyNumber(order.total), 0)),
    monthly_order_revenue_cents: moneyToCents(monthOrders.reduce((sum, order) => sum + moneyNumber(order.total), 0)),
    trials_started: eventCount(['trial']),
    upgrades: eventCount(['upgrade']),
    downgrades: eventCount(['downgrade']),
    cancellations: eventCount(['cancel']),
    paid_events: eventCount(['paid', 'payment_approved']),
    refused_events: eventCount(['failed', 'refused', 'rejected']),
    revenue_by_plan: [...revenueByPlan.entries()].map(([plan, revenue]) => ({ plan, revenue, revenue_cents: moneyToCents(revenue) }))
  };
}

function platformRevenueSnapshot({ companies, subscriptions, plans, orders, period }) {
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const subscriptionByCompany = new Map();
  for (const subscription of subscriptions) {
    if (!subscriptionByCompany.has(subscription.company_id)) subscriptionByCompany.set(subscription.company_id, subscription);
  }
  const mrrByPlan = new Map();
  let mrr = 0;
  for (const company of companies) {
    const subscription = subscriptionByCompany.get(company.id);
    const plan = subscription?.plan_id ? planById.get(subscription.plan_id) : null;
    const status = subscription?.status || company.status || '';
    if (!['active', 'trial', 'grace_period', 'payment_pending'].includes(status)) continue;
    const price = moneyNumber(plan?.monthly_price || 0);
    mrr += price;
    const key = plan?.name || 'Sem plano';
    const current = mrrByPlan.get(key) || { plan: key, clients: 0, mrr: 0, mrr_cents: 0 };
    current.clients += 1;
    current.mrr = roundMoney(current.mrr + price);
    current.mrr_cents = moneyToCents(current.mrr);
    mrrByPlan.set(key, current);
  }
  const billableOrders = orders.filter((order) => order.status !== 'cancelled');
  const orderRevenue = roundMoney(billableOrders.reduce((sum, order) => sum + moneyNumber(order.total), 0));
  return {
    mrr: roundMoney(mrr),
    mrr_cents: moneyToCents(mrr),
    order_revenue: orderRevenue,
    order_revenue_cents: moneyToCents(orderRevenue),
    average_daily_revenue_cents: moneyToCents(orderRevenue / Math.max(1, period.days || 1)),
    mrr_by_plan: [...mrrByPlan.values()].sort((a, b) => b.mrr_cents - a.mrr_cents)
  };
}

function platformConversionSnapshot({ companies, subscriptions, subscriptionEvents, period }) {
  const subscriptionByCompany = new Map();
  for (const subscription of subscriptions) {
    if (!subscriptionByCompany.has(subscription.company_id)) subscriptionByCompany.set(subscription.company_id, subscription);
  }
  const since = period.since.getTime();
  const companiesInPeriod = companies.filter((company) => new Date(company.created_at || 0).getTime() >= since);
  const trialsStarted = companiesInPeriod.filter((company) => (subscriptionByCompany.get(company.id)?.status || company.status) === 'trial').length
    + subscriptionEvents.filter((event) => /trial/i.test(event.event_type || '')).length;
  const converted = subscriptionEvents.filter((event) => /(paid|payment_approved|upgrade|activate|active)/i.test(event.event_type || '')).length;
  const churn = companies.filter((company) => ['cancelled', 'archived'].includes(company.status)).length
    + subscriptionEvents.filter((event) => /(cancel|churn)/i.test(event.event_type || '')).length;
  const upgrades = subscriptionEvents.filter((event) => /upgrade/i.test(event.event_type || '')).length;
  const downgrades = subscriptionEvents.filter((event) => /downgrade/i.test(event.event_type || '')).length;
  return {
    new_clients: companiesInPeriod.length,
    trials_started: trialsStarted,
    trials_converted: converted,
    conversion_rate: trialsStarted ? Number(((converted / trialsStarted) * 100).toFixed(1)) : 0,
    churn,
    upgrades,
    downgrades
  };
}

function platformNewClientsDaily(companies, period) {
  const days = [];
  for (let cursor = new Date(period.start); cursor <= period.end; cursor.setDate(cursor.getDate() + 1)) {
    days.push({ date: cursor.toISOString().slice(0, 10), clients: 0 });
  }
  const byDate = new Map(days.map((day) => [day.date, day]));
  for (const company of companies) {
    const key = new Date(company.created_at || 0).toISOString().slice(0, 10);
    const row = byDate.get(key);
    if (row) row.clients += 1;
  }
  return days;
}

function platformEstimatedMrr(companies, subscriptionByCompany, planById) {
  return roundMoney(companies.reduce((sum, company) => {
    const subscription = subscriptionByCompany.get(company.id);
    if (!['active', 'trial', 'grace_period', 'payment_pending'].includes(subscription?.status || company.status)) return sum;
    const plan = subscription?.plan_id ? planById.get(subscription.plan_id) : null;
    return sum + moneyNumber(plan?.monthly_price || 0);
  }, 0));
}

function platformCommercialAlerts(companies, stores, context, options = {}) {
  const alerts = [];
  const now = Date.now();
  const backup = options.backup || {};
  const operationalLogs = options.operationalLogs || [];
  if (backup.latest?.created_at && (now - new Date(backup.latest.created_at).getTime()) > 86400000) {
    alerts.push({ type: 'backup', severity: 'critical', title: 'Backup atrasado', action: 'Executar backup manual e conferir agendamento.' });
  } else if (!backup.latest?.created_at) {
    alerts.push({ type: 'backup', severity: 'warning', title: 'Backup sem registro recente', action: 'Validar diretório e rotina de backup.' });
  }
  const webhookFailures = operationalLogs.filter((log) => log.type === 'webhook' && ['failed', 'attention'].includes(log.status));
  if (webhookFailures.length) {
    alerts.push({ type: 'webhook', severity: 'critical', title: `${webhookFailures.length} falha(s) recente(s) de webhook`, action: 'Conferir provedor, assinatura e logs.' });
  }
  const apiMetric = platformMetricsSnapshot(platformHealthPeriod('24h')).api;
  if (Number(apiMetric?.p95_ms || 0) > 1200) {
    alerts.push({ type: 'performance', severity: 'warning', title: 'API com latência alta', action: 'Verificar banco, logs e tráfego recente.' });
  }
  for (const company of companies) {
    const subscription = context.subscriptionByCompany.get(company.id);
    const companyStores = context.storesByCompany.get(company.id) || [];
    const orders = context.ordersByCompany.get(company.id) || [];
    if (subscription?.trial_ends_at) {
      const daysLeft = Math.ceil((new Date(subscription.trial_ends_at).getTime() - now) / 86400000);
      if (daysLeft >= 0 && daysLeft <= 3) alerts.push({ type: 'trial', severity: 'warning', company_id: company.id, title: `${company.name}: trial acaba em ${daysLeft} dia(s)`, action: 'Entrar em contato ou orientar upgrade.' });
    }
    if (['payment_pending', 'past_due', 'grace_period'].includes(subscription?.status || company.status)) {
      alerts.push({ type: 'billing', severity: 'critical', company_id: company.id, title: `${company.name}: cobrança pendente`, action: 'Verificar pagamento e webhook.' });
    }
    if (!orders.length && companyStores.length) alerts.push({ type: 'sales', severity: 'attention', company_id: company.id, title: `${company.name}: sem pedidos recentes`, action: 'Acompanhar onboarding e divulgação.' });
    for (const store of companyStores) {
      const setting = context.settingsByStore.get(store.id);
      const products = context.productsByStore?.get(store.id) || [];
      if (setting && !setting.whatsapp_number) alerts.push({ type: 'setup', severity: 'warning', company_id: company.id, store_id: store.id, title: `${store.name}: WhatsApp não configurado`, action: 'Completar configurações da loja.' });
      if (setting && setting.onboarding_completed === false) alerts.push({ type: 'setup', severity: 'attention', company_id: company.id, store_id: store.id, title: `${store.name}: onboarding incompleto`, action: 'Reabrir onboarding ou orientar cliente.' });
      if (!products.length) alerts.push({ type: 'menu', severity: 'critical', company_id: company.id, store_id: store.id, title: `${store.name}: sem produtos`, action: 'Ajudar o cliente a cadastrar o cardápio.' });
      if (store.is_active === false) alerts.push({ type: 'store', severity: 'attention', company_id: company.id, store_id: store.id, title: `${store.name}: loja suspensa/inativa`, action: 'Validar se foi bloqueio comercial.' });
    }
  }
  return alerts.slice(0, 12);
}

function platformCompanyAttention({ company, stores, settingsByStore, orders, subscription, products }) {
  const alerts = [];
  const now = Date.now();
  const lastOrder = orders[0] || null;
  const subscriptionStatus = subscription?.status || company.status || '';
  if (subscription?.trial_ends_at) {
    const daysLeft = Math.ceil((new Date(subscription.trial_ends_at).getTime() - now) / 86400000);
    if (daysLeft >= 0 && daysLeft <= 3) {
      alerts.push({ type: 'trial', severity: 'warning', title: `Trial acaba em ${daysLeft} dia(s)`, action: 'Entrar em contato e orientar upgrade.' });
    }
  }
  if (['payment_pending', 'past_due', 'grace_period', 'suspended'].includes(subscriptionStatus)) {
    alerts.push({ type: 'billing', severity: 'critical', title: 'Pagamento pendente ou cliente suspenso', action: 'Verificar cobrança, webhook e status comercial.' });
  }
  if (!stores.length) {
    alerts.push({ type: 'setup', severity: 'critical', title: 'Cliente sem loja/cardápio', action: 'Criar uma loja para o cliente.' });
  }
  if (stores.some((store) => store.is_active === false)) {
    alerts.push({ type: 'store', severity: 'attention', title: 'Existe loja inativa', action: 'Confirmar se a suspensão foi intencional.' });
  }
  const storesWithoutWhatsapp = stores.filter((store) => !settingsByStore.get(store.id)?.whatsapp_number);
  if (storesWithoutWhatsapp.length) {
    alerts.push({ type: 'setup', severity: 'warning', title: `${storesWithoutWhatsapp.length} loja(s) sem WhatsApp`, action: 'Completar configuração da loja.' });
  }
  const incompleteStores = stores.filter((store) => settingsByStore.get(store.id)?.onboarding_completed === false);
  if (incompleteStores.length) {
    alerts.push({ type: 'onboarding', severity: 'attention', title: 'Onboarding incompleto', action: 'Reabrir onboarding ou orientar o cliente.' });
  }
  const closedStores = stores.filter((store) => settingsByStore.get(store.id)?.is_open === false);
  if (closedStores.length) {
    alerts.push({ type: 'operation', severity: 'attention', title: `${closedStores.length} loja(s) fechada(s)`, action: 'Validar horário/status de operação.' });
  }
  if (!products.length && stores.length) {
    alerts.push({ type: 'menu', severity: 'critical', title: 'Cliente sem produtos cadastrados', action: 'Ajudar a criar o cardápio inicial.' });
  }
  if (!lastOrder && stores.length) {
    alerts.push({ type: 'sales', severity: 'attention', title: 'Nenhum pedido registrado', action: 'Acompanhar ativação comercial.' });
  } else if (lastOrder && Date.now() - new Date(lastOrder.created_at).getTime() > 7 * 86400000) {
    alerts.push({ type: 'sales', severity: 'warning', title: 'Mais de 7 dias sem pedidos', action: 'Verificar divulgação, loja aberta e cardápio.' });
  }
  return alerts;
}

function buildPlatformCompanyTimeline({ company, stores, orders, billingHistory, auditLogs, subscription }) {
  const events = [];
  if (company?.created_at) {
    events.push({
      type: 'company',
      title: 'Conta criada',
      description: company.name,
      created_at: company.created_at
    });
  }
  for (const store of stores || []) {
    if (store.created_at) {
      events.push({
        type: 'store',
        title: 'Loja criada',
        description: `${store.name} /${store.slug}`,
        created_at: store.created_at
      });
    }
  }
  if (subscription?.created_at) {
    events.push({
      type: 'billing',
      title: 'Assinatura iniciada',
      description: subscription.status || 'assinatura',
      created_at: subscription.created_at
    });
  }
  const firstOrder = (orders || []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0];
  if (firstOrder?.created_at) {
    events.push({
      type: 'order',
      title: 'Primeiro pedido',
      description: `${moneyNumber(firstOrder.total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
      created_at: firstOrder.created_at
    });
  }
  for (const event of billingHistory || []) {
    events.push({
      type: 'billing',
      title: subscriptionEventLabel(event.event_type),
      description: event.status || event.provider || 'billing',
      created_at: event.created_at
    });
  }
  for (const log of auditLogs || []) {
    events.push({
      type: String(log.action || '').includes('note') ? 'note' : 'audit',
      title: auditActionLabel(log.action),
      description: platformTimelineDescription(log),
      created_at: log.created_at
    });
  }
  return events
    .filter((event) => event.created_at)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 30);
}

function subscriptionEventLabel(type) {
  const value = String(type || '').replaceAll('_', ' ');
  if (!value) return 'Evento de cobrança';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function auditActionLabel(action) {
  const labels = {
    'platform.client.note': 'Nota interna',
    'platform.client.internal_status': 'Acompanhamento atualizado',
    'platform.support.impersonate.start': 'Acesso suporte iniciado',
    'platform.support.impersonate.end': 'Acesso suporte encerrado',
    'platform.support.impersonate.expired': 'Acesso suporte expirou',
    'platform.company.update': 'Cliente atualizado',
    'platform.company.status': 'Status alterado',
    'platform.company.plan': 'Plano alterado',
    'platform.store.update': 'Loja atualizada',
    'platform.store.status': 'Status da loja alterado',
    'admin.setup.create': 'Conta criada',
    'admin.login.success': 'Login no admin',
    'order.status.update': 'Pedido atualizado'
  };
  return labels[action] || subscriptionEventLabel(action || 'Evento');
}

function platformTimelineDescription(log) {
  if (log?.action === 'platform.client.note') {
    return cleanText(log.after_data?.note || 'Nota registrada.');
  }
  return cleanText(log.after_data?.status || log.after_data?.reason || log.entity_type || '').slice(0, 180) || 'Evento registrado.';
}

function platformAnalyticsPeriod(value) {
  const days = ({ '7d': 7, '15d': 15, '30d': 30 })[value] || 30;
  const end = startOfLocalDay(new Date());
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);
  end.setHours(23, 59, 59, 999);
  return { label: `${days}d`, days, start, end, since: start };
}

function startOfLocalDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

async function createPlatformCompany(data, admin) {
  const name = cleanText(data.name || data.company?.name || '');
  if (!name) throw httpError(422, 'Informe o nome da empresa.');
  const payload = {
    name,
    document: cleanText(data.document || '') || null,
    billing_email: cleanEmail(data.billing_email || data.email || '') || null,
    phone: onlyDigits(data.phone || ''),
    status: ['active', 'trial', 'past_due', 'suspended', 'cancelled', 'archived'].includes(data.status) ? data.status : 'trial'
  };
  const [company] = await dbRequest('POST', 'companies', {}, payload, ['Prefer: return=representation']);
  await createDefaultSubscription(company.id, data.plan_code || 'essential');
  await audit('platform.company.create', { company_id: company.id, actor_admin_id: admin.id, after_data: payload });
  return company;
}

async function createPlatformStore(data, admin) {
  const companyId = cleanUuid(data.company_id, 'empresa');
  const name = cleanText(data.name || '');
  const slug = cleanSlug(data.slug || name);
  if (!name) throw httpError(422, 'Informe o nome da loja.');
  if (!slug) throw httpError(422, 'Informe um endereço público válido para a loja.');
  const [company] = await dbRequest('GET', 'companies', { select: 'id', id: `eq.${companyId}`, limit: '1' });
  if (!company) throw httpError(404, 'Empresa não encontrada.');
  const storeCount = await currentUsageForKey({ company_id: companyId }, 'stores');
  if (storeCount >= 1) {
    await assertCompanyUsageLimit({ company_id: companyId }, 'multi_store', 'stores');
  }
  const [store] = await dbRequest('POST', 'stores', {}, {
    company_id: companyId,
    name,
    slug,
    description: cleanText(data.description || '') || null,
    public_url: `/${slug}`,
    is_active: data.is_active !== false
  }, ['Prefer: return=representation']);
  await dbRequest('POST', 'store_settings', {}, {
    store_id: store.id,
    name,
    slug,
    description: cleanText(data.description || 'Pedido rápido pelo TáPronto.'),
    whatsapp_number: onlyDigits(data.whatsapp_number || ''),
    address: cleanText(data.address || ''),
    payment_methods: ['Pix', 'Cartao na entrega', 'Dinheiro'],
    theme_settings: defaultThemeSettings(),
    business_hours: defaultBusinessHours()
  }, ['Prefer: return=minimal']);
  if (admin?.id && cleanUuid(admin.company_id) === companyId) {
    await dbRequest('POST', 'admin_user_store_access', {}, {
      admin_user_id: admin.id,
      company_id: companyId,
      store_id: store.id,
      role: normalizeAdminRole(admin.role),
      permissions: [],
      is_active: true
    }, ['Prefer: return=minimal']);
    clearAdminStoreAccessCache(admin.id);
  }
  await audit('platform.store.create', { company_id: companyId, store_id: store.id, actor_admin_id: admin.id, after_data: { name, slug } });
  await recordCompanyUsage({ ...admin, company_id: companyId }, 'multi_store', 'stores');
  return publicStoreRef(store);
}

async function listPlatformPlans() {
  const [plans, features, planFeatures] = await Promise.all([
    dbRequest('GET', 'subscription_plans', {
      select: '*',
      order: 'sort_order.asc',
      limit: '100'
    }),
    listPlatformFeaturesSafe(),
    dbRequest('GET', 'plan_features', {
      select: '*',
      limit: '1000'
    })
  ]);
  const featuresById = new Map(features.map((feature) => [feature.id, feature]));
  const planFeaturesByPlan = new Map();
  for (const entry of planFeatures) {
    if (!planFeaturesByPlan.has(entry.plan_id)) planFeaturesByPlan.set(entry.plan_id, []);
    planFeaturesByPlan.get(entry.plan_id).push({
      ...entry,
      feature: featuresById.get(entry.feature_id) || null
    });
  }
  return {
    plans: plans.map((plan) => ({
      ...plan,
      features: planFeaturesByPlan.get(plan.id) || []
    })),
    features
  };
}

async function listPlatformFeaturesSafe() {
  return dbRequest('GET', 'platform_features', {
    select: '*',
    order: 'sort_order.asc',
    limit: '200'
  }).catch(() => dbRequest('GET', 'platform_features', {
    select: '*',
    order: 'name.asc',
    limit: '200'
  }).catch(() => []));
}

async function listPortalPlans() {
  const data = await listPlatformPlans();
  return {
    plans: data.plans
      .filter((plan) => plan.is_active !== false)
      .map((plan) => ({
        code: plan.code,
        name: plan.name,
        description: plan.description,
        monthly_price: plan.monthly_price,
        annual_price: plan.annual_price,
        sort_order: plan.sort_order,
        features: plan.features
          .filter((entry) => entry.is_enabled !== false && entry.feature)
          .map((entry) => ({
            code: entry.feature.code,
            name: entry.feature.name,
            description: entry.feature.description,
            limit_value: entry.limit_value
          }))
      }))
  };
}

async function checkPortalSlug(value) {
  const slug = cleanSlug(value || '');
  const reserved = reservedPublicSlugs();
  if (!slug || slug.length < 3) {
    return { slug, available: false, reason: 'Use pelo menos 3 caracteres.' };
  }
  if (reserved.has(slug)) {
    return { slug, available: false, reason: 'Este endereço é reservado.' };
  }
  const rows = await dbRequest('GET', 'stores', {
    select: 'id',
    slug: `eq.${slug}`,
    limit: '1'
  });
  return {
    slug,
    available: rows.length === 0,
    reason: rows.length ? 'Este endereço já está em uso.' : ''
  };
}

async function createPortalSignup(req, data = {}) {
  const parsed = sanitizePortalSignup(data);
  const slugStatus = await checkPortalSlug(parsed.store.slug);
  if (!slugStatus.available) throw httpError(409, slugStatus.reason || 'Endereço público indisponível.');

  const existingAdmin = await dbRequest('GET', 'admin_users', {
    select: 'id',
    email: `eq.${parsed.owner.email}`,
    limit: '1'
  });
  if (existingAdmin[0]) throw httpError(409, 'Este e-mail já possui uma conta. Use a tela de entrar.');

  const created = { company: null, admin: null, store: null };
  try {
    const [company] = await dbRequest('POST', 'companies', {}, {
      name: parsed.company.name,
      document: parsed.company.document || null,
      billing_email: parsed.owner.email,
      phone: parsed.owner.phone,
      status: 'trial'
    }, ['Prefer: return=representation']);
    created.company = company;

    const [admin] = await dbRequest('POST', 'admin_users', {}, {
      company_id: company.id,
      name: parsed.owner.name,
      email: parsed.owner.email,
      password_hash: hashPassword(parsed.owner.password),
      role: 'owner',
      is_active: false
    }, ['Prefer: return=representation']);
    created.admin = admin;

    const [store] = await dbRequest('POST', 'stores', {}, {
      company_id: company.id,
      name: parsed.store.name,
      slug: parsed.store.slug,
      description: parsed.store.description,
      public_url: `/${parsed.store.slug}`,
      is_active: false
    }, ['Prefer: return=representation']);
    created.store = store;

    await dbRequest('POST', 'admin_user_store_access', {}, {
      admin_user_id: admin.id,
      company_id: company.id,
      store_id: store.id,
      role: 'owner',
      permissions: [],
      is_active: true
    }, ['Prefer: return=minimal']);

    await createDefaultSubscription(company.id, parsed.planCode);
    await createPortalStoreSettings(store.id, parsed);
    await createStarterMenu(store.id, parsed.businessType);
    await createOnboardingProgress(company.id, store.id, parsed);

    await audit('portal.signup.create', {
      req,
      actor_admin_id: admin.id,
      company_id: company.id,
      store_id: store.id,
      entity_type: 'company',
      entity_id: company.id,
      severity: 'info',
      after_data: {
        plan_code: parsed.planCode,
        business_type: parsed.businessType,
        slug: parsed.store.slug,
        marketing_opt_in: parsed.marketingOptIn
      }
    });

    clearAdminUsersCache();
    const activation = await createAdminActivationToken(admin.id);
    if (shouldSendSignupActivationEmail()) {
      await sendAdminActivationEmail(req, { admin, company, store, token: activation.token, expiresAt: activation.expiresAt }).catch(async (error) => {
        await audit('portal.signup.activation_email_failed', {
          req,
          actor_admin_id: admin.id,
          company_id: company.id,
          store_id: store.id,
          entity_type: 'admin_user',
          entity_id: admin.id,
          severity: 'warning',
          after_data: { email: maskEmailOrToken(admin.email), message: error.message || 'Falha ao enviar ativação.' }
        });
        throw httpError(502, 'Não foi possível enviar o e-mail de ativação. Verifique a configuração SMTP.');
      });
    }
    return {
      body: {
        ok: true,
        needs_activation: true,
        message: 'Conta criada. Enviamos um link de ativação para o e-mail informado.',
        admin: {
          id: admin.id,
          company_id: company.id,
          store_id: store.id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
          is_active: false
        },
        company: { id: company.id, name: company.name, status: company.status },
        store: publicStoreRef(store),
        redirect: '/entrar'
      }
    };
  } catch (error) {
    await rollbackPortalSignup(created).catch(() => {});
    throw error;
  }
}

async function createAdminActivationToken(adminId) {
  const token = randomBytes(24).toString('hex');
  const tokenHash = hashAdminActivationToken(token);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await dbRequest('PATCH', 'admin_activation_tokens', {
    admin_user_id: `eq.${cleanUuid(adminId, 'admin')}`,
    status: 'eq.pending'
  }, {
    status: 'cancelled'
  }, ['Prefer: return=minimal']).catch(() => {});
  await dbRequest('POST', 'admin_activation_tokens', {}, {
    admin_user_id: cleanUuid(adminId, 'admin'),
    token_hash: tokenHash,
    status: 'pending',
    expires_at: expiresAt
  }, ['Prefer: return=minimal']);
  return { token, expiresAt };
}

function shouldSendSignupActivationEmail() {
  return process.env.NODE_ENV !== 'test' && process.env.SKIP_SIGNUP_ACTIVATION_EMAIL !== 'true';
}

async function sendAdminActivationEmail(req, { admin, company, store, token, expiresAt }) {
  const template = (await listPlatformEmailTemplates()).templates.find((entry) => entry.template_key === 'account_activation');
  if (!template?.is_active) throw new Error('Template de ativação desativado.');
  const activationUrl = absoluteAppUrl(req, `/ativar-conta?token=${token}`);
  const variables = {
    customer_name: admin.name || admin.email,
    company_name: company.name || '',
    store_name: store.name || '',
    due_date: formatDateTimePt(expiresAt),
    dashboard_url: activationUrl,
    activation_url: activationUrl,
    support_url: absolutePublicUrl('/entrar'),
    payment_url: absolutePublicUrl('/planos'),
    platform_url: absolutePublicUrl('/central')
  };
  await sendPlatformEmail({
    to: admin.email,
    templateKey: 'account_activation',
    subject: renderEmailTemplate(template.subject, variables),
    body: renderEmailTemplate(template.body, variables)
  });
}

async function getPublicAdminActivation(token) {
  const activation = await findAdminActivationByToken(token);
  const [admin] = await dbRequest('GET', 'admin_users', {
    select: 'email,name,is_active',
    id: `eq.${activation.admin_user_id}`,
    limit: '1'
  });
  if (!admin) throw httpError(404, 'Link de ativação inválido.');
  return {
    email: admin.email,
    name: admin.name || '',
    is_active: admin.is_active === true,
    expires_at: activation.expires_at
  };
}

async function activateAdminAccount(req, token) {
  const activation = await findAdminActivationByToken(token);
  const [admin] = await dbRequest('PATCH', 'admin_users', { id: `eq.${activation.admin_user_id}` }, {
    is_active: true,
    updated_at: new Date().toISOString()
  }, ['Prefer: return=representation']);
  if (!admin) throw httpError(404, 'Conta administrativa não encontrada.');
  await dbRequest('PATCH', 'admin_activation_tokens', { id: `eq.${activation.id}` }, {
    status: 'used',
    used_at: new Date().toISOString()
  }, ['Prefer: return=minimal']);
  await dbRequest('PATCH', 'admin_activation_tokens', {
    admin_user_id: `eq.${admin.id}`,
    status: 'eq.pending'
  }, {
    status: 'cancelled'
  }, ['Prefer: return=minimal']).catch(() => {});
  if (admin.company_id) {
    await dbRequest('PATCH', 'stores', { company_id: `eq.${admin.company_id}` }, {
      is_active: true,
      updated_at: new Date().toISOString()
    }, ['Prefer: return=minimal']).catch(() => {});
  }
  clearAdminUsersCache();
  await audit('portal.signup.activate', {
    req,
    actor_admin_id: admin.id,
    company_id: admin.company_id || null,
    entity_type: 'admin_user',
    entity_id: admin.id,
    severity: 'info',
    after_data: { email: maskEmailOrToken(admin.email) }
  });
  return createAdminSession(admin);
}

async function findAdminActivationByToken(token) {
  const value = String(token || '').trim();
  if (!/^[a-f0-9]{32,128}$/i.test(value)) throw httpError(404, 'Link de ativação inválido.');
  const tokenHash = hashAdminActivationToken(value);
  const [activation] = await dbRequest('GET', 'admin_activation_tokens', {
    select: '*',
    token_hash: `eq.${tokenHash}`,
    status: 'eq.pending',
    limit: '1'
  });
  if (!activation) throw httpError(404, 'Link de ativação inválido ou já utilizado.');
  if (new Date(activation.expires_at).getTime() < Date.now()) {
    await dbRequest('PATCH', 'admin_activation_tokens', { id: `eq.${activation.id}` }, {
      status: 'expired'
    }, ['Prefer: return=minimal']).catch(() => {});
    throw httpError(410, 'Este link de ativação expirou.');
  }
  return activation;
}

function sanitizePortalSignup(data = {}) {
  const owner = data.owner || {};
  const business = data.business || {};
  const planCode = 'trial';
  const ownerName = cleanText(owner.name || data.name || '');
  const ownerEmail = cleanEmail(owner.email || data.email || '');
  const ownerPhone = onlyDigits(owner.phone || data.phone || '');
  const password = validatePassword(owner.password || data.password);
  const confirmPassword = String(owner.confirm_password || owner.confirmPassword || data.confirm_password || data.confirmPassword || '');
  if (confirmPassword && confirmPassword !== password) throw httpError(422, 'A confirmação de senha não confere.');
  if (!ownerName) throw httpError(422, 'Informe seu nome completo.');
  if (!ownerEmail) throw httpError(422, 'Informe um e-mail válido.');
  if (ownerPhone.length < 10) throw httpError(422, 'Informe um WhatsApp válido.');
  if (data.accept_terms !== true && data.acceptTerms !== true) throw httpError(422, 'Aceite o EULA, os Termos de Uso e a Política de Privacidade para continuar.');

  const displayName = cleanText(business.display_name || business.displayName || business.name || '');
  const companyName = cleanText(business.company_name || business.companyName || business.name || displayName);
  const slug = cleanSlug(business.slug || displayName || companyName);
  if (!companyName || !displayName) throw httpError(422, 'Informe o nome do estabelecimento.');
  if (!slug) throw httpError(422, 'Informe o endereço público do cardápio.');

  return {
    planCode,
    businessType: cleanSlug(business.type || 'outro') || 'outro',
    marketingOptIn: Boolean(data.marketing_opt_in || data.marketingOptIn),
    owner: {
      name: ownerName,
      email: ownerEmail,
      phone: ownerPhone,
      password
    },
    company: {
      name: companyName,
      document: cleanText(business.document || '')
    },
    store: {
      name: displayName,
      slug,
      description: cleanText(business.description || `Loja online de ${displayName} no TáPronto.`)
    },
    business: {
      city: cleanText(business.city || ''),
      state: cleanText(business.state || '').slice(0, 2).toUpperCase(),
      address: cleanText(business.address || ''),
      phone: onlyDigits(business.phone || ownerPhone),
      document: cleanText(business.document || '')
    }
  };
}

async function createPortalStoreSettings(storeId, parsed) {
  await dbRequest('POST', 'store_settings', {}, {
    store_id: storeId,
    name: parsed.store.name,
    slug: parsed.store.slug,
    description: parsed.store.description,
    whatsapp_number: normalizeBrazilLocalPhone(parsed.business.phone || parsed.owner.phone),
    address: parsed.business.address,
    payment_methods: ['Pix', 'Cartao na entrega', 'Dinheiro'],
    business_hours: defaultBusinessHours(),
    theme_settings: defaultThemeSettings(),
    onboarding_completed: false,
    is_open: false
  }, ['Prefer: return=minimal']);
}

async function getAdminOnboarding(admin) {
  const storeId = cleanUuid(admin.store_id);
  const companyId = cleanUuid(admin.company_id);
  if (!storeId || !companyId) throw httpError(422, 'Loja ativa não encontrada.');

  const [progressRows, store, categories, items] = await Promise.all([
    dbRequest('GET', 'onboarding_progress', {
      select: '*',
      company_id: `eq.${companyId}`,
      store_id: `eq.${storeId}`,
      limit: '1'
    }).catch(() => []),
    getStoreSettings(storeId),
    getMenu(true, storeId),
    dbRequest('GET', 'menu_items', {
      select: 'id,is_available',
      store_id: `eq.${storeId}`,
      limit: '1'
    }).catch(() => [])
  ]);

  const progress = progressRows[0] || await ensureOnboardingProgress(companyId, storeId);
  const computed = computeOnboardingSteps({ store, categories, items });
  const savedCompleted = new Set(Array.isArray(progress.completed_steps) ? progress.completed_steps : []);
  for (const step of computed.steps) {
    if (step.auto_completed) savedCompleted.add(step.key);
  }
  const completedSteps = [...savedCompleted];
  const total = computed.steps.length;
  const completedCount = computed.steps.filter((step) => completedSteps.includes(step.key)).length;
  const percent = total ? Math.round((completedCount / total) * 100) : 0;
  const blockers = computed.steps
    .filter((step) => !['appearance', 'publish'].includes(step.key) && !completedSteps.includes(step.key))
    .map((step) => step.title);

  return {
    progress: {
      ...progress,
      completed_steps: completedSteps,
      is_completed: progress.is_completed === true,
      store_published: store.onboarding_completed === true
    },
    store: publicStore(store),
    steps: computed.steps.map((step) => ({
      ...step,
      completed: completedSteps.includes(step.key)
    })),
    percent,
    can_publish: blockers.length === 0,
    blockers,
    public_url: `/${admin.active_store?.slug || store.slug || ''}`
  };
}

async function updateAdminOnboarding(admin, data = {}) {
  const storeId = cleanUuid(admin.store_id);
  const companyId = cleanUuid(admin.company_id);
  if (!storeId || !companyId) throw httpError(422, 'Loja ativa não encontrada.');
  const progress = await ensureOnboardingProgress(companyId, storeId);
  const requested = Array.isArray(data.completed_steps) ? data.completed_steps : [];
  const nextCompleted = [...new Set([
    ...(Array.isArray(progress.completed_steps) ? progress.completed_steps : []),
    ...requested.map((step) => cleanSlug(step)).filter(Boolean)
  ])];
  const currentStep = cleanSlug(data.current_step || progress.current_step || 'welcome');
  await dbRequest('PATCH', 'onboarding_progress', { id: `eq.${progress.id}` }, {
    current_step: currentStep,
    completed_steps: nextCompleted,
    metadata: isPlainObject(data.metadata) ? data.metadata : progress.metadata || {}
  }, ['Prefer: return=minimal']);
  return getAdminOnboarding(admin);
}

async function publishAdminOnboarding(req, admin) {
  const overview = await getAdminOnboarding(admin);
  if (!overview.can_publish) {
    throw httpError(422, `Antes de publicar: ${overview.blockers.join(', ')}.`);
  }
  const current = await getStoreSettings(admin.store_id);
  await dbRequest('PATCH', 'store_settings', { id: `eq.${current.id}` }, {
    onboarding_completed: true,
    is_open: true
  }, ['Prefer: return=minimal']);
  await ensureOnboardingProgress(admin.company_id, admin.store_id);
  await dbRequest('PATCH', 'onboarding_progress', {
    company_id: `eq.${admin.company_id}`,
    store_id: `eq.${admin.store_id}`
  }, {
    is_completed: false,
    current_step: 'tour',
    completed_steps: overview.steps.map((step) => step.key)
  }, ['Prefer: return=minimal']);
  clearStoreSettingsCache();
  await audit('onboarding.publish', {
    req,
    actor_admin_id: admin.id,
    company_id: admin.company_id,
    store_id: admin.store_id,
    entity_type: 'store_settings',
    entity_id: current.id,
    after_data: { onboarding_completed: true, is_open: true }
  });
  return getAdminOnboarding(admin);
}

async function reopenAdminOnboarding(req, admin) {
  const storeId = cleanUuid(admin.store_id);
  const companyId = cleanUuid(admin.company_id);
  if (!storeId || !companyId) throw httpError(422, 'Loja ativa não encontrada.');
  const current = await getStoreSettings(storeId);
  const now = new Date().toISOString();
  await dbRequest('PATCH', 'store_settings', { id: `eq.${current.id}` }, {
    onboarding_completed: false,
    is_open: false
  }, ['Prefer: return=minimal']);
  const progress = await ensureOnboardingProgress(companyId, storeId);
  await dbRequest('PATCH', 'onboarding_progress', { id: `eq.${progress.id}` }, {
    is_completed: false,
    current_step: 'welcome',
    completed_steps: [],
    metadata: {
      ...(isPlainObject(progress.metadata) ? progress.metadata : {}),
      reopened_at: now,
      reopened_by: admin.id
    }
  }, ['Prefer: return=minimal']);
  await dbRequest('DELETE', 'admin_tour_progress', {
    admin_user_id: `eq.${admin.id}`,
    store_id: `eq.${storeId}`,
    tour_key: 'eq.admin-panel'
  }, null, ['Prefer: return=minimal']).catch(() => {});
  clearStoreSettingsCache(storeId);
  clearPublicBootstrapCache(storeId);
  await audit('admin.onboarding.reopen', {
    req,
    actor_admin_id: admin.id,
    company_id: companyId,
    store_id: storeId,
    entity_type: 'store_settings',
    entity_id: current.id,
    severity: 'warning',
    before_data: { onboarding_completed: current.onboarding_completed, is_open: current.is_open },
    after_data: { onboarding_completed: false, is_open: false }
  });
  return getAdminOnboarding(admin);
}

async function listAdminGuidedTours(admin) {
  const adminUserId = cleanUuid(admin.id, 'admin_user_id');
  const storeId = cleanUuid(admin.store_id, 'store_id');
  try {
    const tours = await dbRequest('GET', 'admin_tour_progress', {
      select: '*',
      admin_user_id: `eq.${adminUserId}`,
      store_id: `eq.${storeId}`,
      order: 'updated_at.desc'
    });
    return { tours: tours.map(publicAdminGuidedTour) };
  } catch (error) {
    if (isMissingTableError(error)) return { tours: [] };
    throw error;
  }
}

async function upsertAdminGuidedTour(admin, tourKey, data = {}) {
  const parsedTourKey = cleanAdminTourKey(tourKey);
  const adminUserId = cleanUuid(admin.id, 'admin_user_id');
  const storeId = cleanUuid(admin.store_id, 'store_id');
  const currentStep = cleanAdminTourStep(data.current_step || 'operation');
  const metadata = isPlainObject(data.metadata) ? data.metadata : {};
  const existing = await findAdminGuidedTour(adminUserId, storeId, parsedTourKey);
  const now = new Date().toISOString();
  const payload = {
    admin_user_id: adminUserId,
    store_id: storeId,
    tour_key: parsedTourKey,
    current_step: currentStep,
    completed_at: null,
    skipped_at: null,
    metadata,
    updated_at: now
  };
  try {
    if (existing) {
      const [updated] = await dbRequest('PATCH', 'admin_tour_progress', { id: `eq.${existing.id}` }, payload, ['Prefer: return=representation']);
      return publicAdminGuidedTour(updated || { ...existing, ...payload });
    }
    const [created] = await dbRequest('POST', 'admin_tour_progress', {}, {
      ...payload,
      created_at: now
    }, ['Prefer: return=representation']);
    return publicAdminGuidedTour(created);
  } catch (error) {
    if (isMissingTableError(error)) return publicAdminGuidedTour({ ...payload, created_at: now, updated_at: now });
    throw error;
  }
}

async function completeAdminGuidedTour(req, admin, tourKey) {
  const tour = await updateAdminGuidedTourAction(admin, tourKey, {
    completed_at: new Date().toISOString(),
    skipped_at: null
  });
  await markAdminOnboardingTourFinished(admin, 'tour_completed').catch(() => {});
  await audit('admin.tour.complete', {
    req,
    actor_admin_id: admin.id,
    company_id: admin.company_id,
    store_id: admin.store_id,
    entity_type: 'admin_tour_progress',
    entity_id: tour.id,
    after_data: { tour_key: tour.tour_key, current_step: tour.current_step }
  }).catch(() => {});
  return tour;
}

async function skipAdminGuidedTour(req, admin, tourKey) {
  const tour = await updateAdminGuidedTourAction(admin, tourKey, {
    skipped_at: new Date().toISOString()
  });
  await markAdminOnboardingTourFinished(admin, 'tour_skipped').catch(() => {});
  await audit('admin.tour.skip', {
    req,
    actor_admin_id: admin.id,
    company_id: admin.company_id,
    store_id: admin.store_id,
    entity_type: 'admin_tour_progress',
    entity_id: tour.id,
    after_data: { tour_key: tour.tour_key, current_step: tour.current_step }
  }).catch(() => {});
  return tour;
}

async function markAdminOnboardingTourFinished(admin, currentStep) {
  const companyId = cleanUuid(admin.company_id, 'company_id');
  const storeId = cleanUuid(admin.store_id, 'store_id');
  const progress = await ensureOnboardingProgress(companyId, storeId);
  const completedSteps = [...new Set([
    ...(Array.isArray(progress.completed_steps) ? progress.completed_steps : []),
    'training',
    'publish',
    'tour'
  ])];
  await dbRequest('PATCH', 'onboarding_progress', {
    company_id: `eq.${companyId}`,
    store_id: `eq.${storeId}`
  }, {
    is_completed: true,
    current_step: currentStep,
    completed_steps: completedSteps
  }, ['Prefer: return=minimal']);
}

async function updateAdminGuidedTourAction(admin, tourKey, payload = {}) {
  const parsedTourKey = cleanAdminTourKey(tourKey);
  const adminUserId = cleanUuid(admin.id, 'admin_user_id');
  const storeId = cleanUuid(admin.store_id, 'store_id');
  const existing = await findAdminGuidedTour(adminUserId, storeId, parsedTourKey);
  const now = new Date().toISOString();
  try {
    if (existing) {
      const [updated] = await dbRequest('PATCH', 'admin_tour_progress', { id: `eq.${existing.id}` }, {
        ...payload,
        updated_at: now
      }, ['Prefer: return=representation']);
      return publicAdminGuidedTour(updated || { ...existing, ...payload, updated_at: now });
    }
    const [created] = await dbRequest('POST', 'admin_tour_progress', {}, {
      admin_user_id: adminUserId,
      store_id: storeId,
      tour_key: parsedTourKey,
      current_step: 'operation',
      metadata: {},
      ...payload,
      created_at: now,
      updated_at: now
    }, ['Prefer: return=representation']);
    return publicAdminGuidedTour(created);
  } catch (error) {
    if (isMissingTableError(error)) {
      return publicAdminGuidedTour({
        admin_user_id: adminUserId,
        store_id: storeId,
        tour_key: parsedTourKey,
        current_step: 'operation',
        metadata: {},
        ...payload,
        created_at: now,
        updated_at: now
      });
    }
    throw error;
  }
}

async function findAdminGuidedTour(adminUserId, storeId, tourKey) {
  try {
    const [existing] = await dbRequest('GET', 'admin_tour_progress', {
      select: '*',
      admin_user_id: `eq.${adminUserId}`,
      store_id: `eq.${storeId}`,
      tour_key: `eq.${tourKey}`,
      limit: '1'
    });
    return existing || null;
  } catch (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
}

function cleanAdminTourKey(value) {
  const tourKey = cleanSlug(value || '');
  if (tourKey !== 'admin-panel') throw httpError(422, 'Tour inválido.');
  return tourKey;
}

function cleanAdminTourStep(value) {
  const step = cleanSlug(value || 'operation');
  const allowed = new Set(['operation', 'orders', 'menu', 'tables', 'reports', 'store', 'plan', 'support']);
  if (!allowed.has(step)) throw httpError(422, 'Etapa do tour inválida.');
  return step;
}

function publicAdminGuidedTour(row = {}) {
  return {
    id: row.id,
    tour_key: row.tour_key,
    current_step: row.current_step,
    completed_at: row.completed_at || null,
    skipped_at: row.skipped_at || null,
    updated_at: row.updated_at || null
  };
}

function isMissingTableError(error) {
  const text = `${error?.message || ''} ${error?.detail || ''} ${JSON.stringify(error?.cause || {})}`;
  return /relation .* does not exist|schema cache|PGRST205|42P01|not found in the schema/i.test(text);
}

async function ensureOnboardingProgress(companyId, storeId) {
  const [existing] = await dbRequest('GET', 'onboarding_progress', {
    select: '*',
    company_id: `eq.${companyId}`,
    store_id: `eq.${storeId}`,
    limit: '1'
  }).catch(() => []);
  if (existing) return existing;
  const [created] = await dbRequest('POST', 'onboarding_progress', {}, {
    company_id: companyId,
    store_id: storeId,
    current_step: 'welcome',
    completed_steps: ['welcome'],
    is_completed: false,
    metadata: {}
  }, ['Prefer: return=representation']);
  return created;
}

function computeOnboardingSteps({ store, categories, items }) {
  const steps = [
    {
      key: 'welcome',
      title: 'Boas-vindas',
      description: 'Entenda o que será configurado antes de publicar.',
      auto_completed: true
    },
    {
      key: 'store',
      title: 'Dados da loja',
      description: 'Nome, endereço público e WhatsApp de pedidos.',
      auto_completed: Boolean(store.name && store.slug && store.whatsapp_number)
    },
    {
      key: 'operation',
      title: 'Operação',
      description: 'Defina atendimento, horários e canais de pedido.',
      auto_completed: Boolean(store.business_hours && Object.keys(store.business_hours).length)
    },
    {
      key: 'payments',
      title: 'Pagamentos',
      description: 'Adicione Pix, cartão, dinheiro ou pagamento online.',
      auto_completed: Array.isArray(store.payment_methods) && store.payment_methods.length > 0
    },
    {
      key: 'delivery',
      title: 'Entrega',
      description: 'Defina taxa, pedido mínimo e bairros atendidos.',
      auto_completed: store.delivery_fee !== undefined && store.minimum_order !== undefined
    },
    {
      key: 'category',
      title: 'Primeira categoria',
      description: 'Crie pelo menos uma categoria do cardápio.',
      auto_completed: Array.isArray(categories) && categories.length > 0
    },
    {
      key: 'product',
      title: 'Primeiro produto',
      description: 'Cadastre pelo menos um produto ativo.',
      auto_completed: Array.isArray(items) && items.length > 0
    },
    {
      key: 'appearance',
      title: 'Aparência',
      description: 'Adicione logo, capa ou cores para personalizar a loja.',
      auto_completed: Boolean(store.logo_url || store.cover_url || Object.keys(store.theme_settings || {}).length)
    },
    {
      key: 'training',
      title: 'Treinamento rápido',
      description: 'Conheça as áreas principais do painel administrativo.',
      auto_completed: false
    },
    {
      key: 'publish',
      title: 'Publicar cardápio',
      description: 'Libere a loja para receber pedidos.',
      auto_completed: store.onboarding_completed === true
    }
  ];
  const blockers = steps
    .filter((step) => !['appearance', 'publish'].includes(step.key) && !step.auto_completed)
    .map((step) => step.title);
  return {
    steps,
    blockers,
    canPublish: blockers.length === 0
  };
}

async function createOnboardingProgress(companyId, storeId, parsed) {
  await dbRequest('POST', 'onboarding_progress', {}, {
    company_id: companyId,
    store_id: storeId,
    current_step: 'welcome',
    completed_steps: ['welcome'],
    is_completed: false,
    metadata: {
      business_type: parsed.businessType,
      selected_plan: parsed.planCode,
      marketing_opt_in: parsed.marketingOptIn
    }
  }, ['Prefer: return=minimal']).catch(() => null);
}

async function createStarterMenu(storeId, businessType) {
  const names = starterCategoriesForBusiness(businessType).slice(0, 1);
  let sort = 1;
  for (const name of names) {
    await dbRequest('POST', 'menu_categories', {}, {
      store_id: storeId,
      name,
      sort_order: sort,
      is_active: true
    }, ['Prefer: return=minimal']).catch(() => null);
    sort += 1;
  }
}

function starterCategoriesForBusiness(type) {
  return ({
    hamburgueria: ['Hambúrgueres', 'Combos', 'Porções', 'Bebidas', 'Sobremesas'],
    pizzaria: ['Pizzas', 'Bordas', 'Combos', 'Bebidas', 'Sobremesas'],
    restaurante: ['Pratos', 'Entradas', 'Bebidas', 'Sobremesas'],
    lancheria: ['Lanches', 'Porções', 'Bebidas', 'Sobremesas'],
    cafeteria: ['Cafés', 'Salgados', 'Doces', 'Bebidas'],
    marmitaria: ['Marmitas', 'Guarnições', 'Bebidas', 'Sobremesas'],
    acai: ['Açaí', 'Complementos', 'Vitaminas', 'Bebidas'],
    confeitaria: ['Bolos', 'Doces', 'Salgados', 'Bebidas']
  })[cleanSlug(type)] || ['Principais', 'Combos', 'Bebidas'];
}

async function rollbackPortalSignup(created) {
  if (created.company?.id) {
    await dbRequest('DELETE', 'companies', { id: `eq.${created.company.id}` }, undefined, ['Prefer: return=minimal']).catch(() => {});
    return;
  }
  if (created.admin?.id) await dbRequest('DELETE', 'admin_users', { id: `eq.${created.admin.id}` }, undefined, ['Prefer: return=minimal']).catch(() => {});
}

function reservedPublicSlugs() {
  return new Set([
    'admin',
    'api',
    'login',
    'entrar',
    'cadastro',
    'criar-conta',
    'onboarding',
    'planos',
    'recursos',
    'demonstracao',
    'demo',
    'suporte',
    'dashboard',
    'platform',
    'plataforma',
    'cardapio',
    'cozinha',
    'pagamento',
    'pedidos',
    'conta',
    'cliente'
  ]);
}

async function updatePlatformCompany(id, data, admin) {
  const companyId = cleanUuid(id, 'empresa');
  const before = await getCompanyById(companyId);
  const payload = {};
  if ('name' in data) payload.name = cleanText(data.name);
  if ('document' in data) payload.document = cleanText(data.document || '') || null;
  if ('billing_email' in data || 'email' in data) payload.billing_email = cleanEmail(data.billing_email || data.email || '') || null;
  if ('phone' in data) payload.phone = onlyDigits(data.phone || '');
  if ('status' in data) payload.status = sanitizeCompanyStatus(data.status);
  if (!Object.keys(payload).length) throw httpError(422, 'Informe algum dado para atualizar.');
  if (!payload.name && 'name' in payload) throw httpError(422, 'Informe o nome da empresa.');
  const [company] = await dbRequest('PATCH', 'companies', { id: `eq.${companyId}` }, payload, ['Prefer: return=representation']);
  if (!company) throw httpError(404, 'Empresa não encontrada.');
  await audit('platform.company.update', {
    company_id: company.id,
    actor_admin_id: admin.id,
    entity_type: 'company',
    entity_id: company.id,
    before_data: before,
    after_data: payload
  });
  return company;
}

async function setPlatformCompanyStatus(req, id, data, admin) {
  const status = sanitizeCompanyStatus(data.status);
  if (['suspended', 'cancelled', 'archived'].includes(status)) {
    await assertPlatformDangerConfirmation(req, admin, data, 'CONFIRMAR');
  }
  return updatePlatformCompany(id, { status }, admin);
}

async function suspendPlatformCompany(req, id, data, admin) {
  await assertPlatformDangerConfirmation(req, admin, data, 'CONFIRMAR');
  const company = await updatePlatformCompany(id, { status: 'suspended' }, admin);
  await audit('platform.company.suspend', {
    req,
    company_id: company.id,
    actor_admin_id: admin.id,
    entity_type: 'company',
    entity_id: company.id,
    severity: 'warning',
    after_data: { status: 'suspended', reason: cleanText(data.reason || '') || null }
  });
  return company;
}

async function activatePlatformCompany(req, id, data, admin) {
  const company = await updatePlatformCompany(id, { status: 'active' }, admin);
  await audit('platform.company.activate', {
    req,
    company_id: company.id,
    actor_admin_id: admin.id,
    entity_type: 'company',
    entity_id: company.id,
    severity: 'info',
    after_data: { status: 'active', reason: cleanText(data.reason || '') || null }
  });
  return company;
}

async function reopenPlatformCompanyOnboarding(req, id, data, admin) {
  const companyId = cleanUuid(id, 'empresa');
  const company = await getCompanyById(companyId);
  const stores = await dbRequest('GET', 'stores', {
    select: 'id,name,slug',
    company_id: `eq.${companyId}`,
    limit: '200'
  }).catch(() => []);
  for (const store of stores) {
    await dbRequest('PATCH', 'store_settings', { store_id: `eq.${store.id}` }, {
      onboarding_completed: false
    }, ['Prefer: return=minimal']).catch(() => {});
    await dbRequest('PATCH', 'onboarding_progress', {
      company_id: `eq.${companyId}`,
      store_id: `eq.${store.id}`
    }, {
      is_completed: false,
      current_step: 'welcome',
      completed_steps: [],
      metadata: {
        reopened_at: new Date().toISOString(),
        reopened_by: admin.id,
        source: 'platform'
      }
    }, ['Prefer: return=minimal']).catch(() => {});
    await dbRequest('DELETE', 'admin_tour_progress', {
      store_id: `eq.${store.id}`,
      tour_key: 'eq.admin-panel'
    }, null, ['Prefer: return=minimal']).catch(() => {});
    clearStoreSettingsCache(store.id);
    clearPublicBootstrapCache(store.id);
  }
  await audit('platform.company.reopen_onboarding', {
    req,
    company_id: company.id,
    actor_admin_id: admin.id,
    entity_type: 'company',
    entity_id: company.id,
    severity: 'warning',
    after_data: {
      stores: stores.map((store) => ({ id: store.id, slug: store.slug })),
      reason: cleanText(data.reason || '') || null
    }
  });
  return { ok: true, stores_updated: stores.length };
}

async function resendPlatformCompanyBilling(req, id, data, admin) {
  const companyId = cleanUuid(id, 'empresa');
  const company = await getCompanyById(companyId);
  const subscriptions = await listCompanySubscriptions(companyId, 10);
  const subscription = pickCurrentCompanySubscription(subscriptions);
  await dbRequest('POST', 'subscription_events', {}, {
    company_id: company.id,
    subscription_id: subscription?.id || null,
    event_type: 'billing.resend_requested',
    description: 'Reenvio de cobrança solicitado pelo Admin Master.',
    created_by: admin.id,
    metadata: {
      status: 'pending',
      provider: PLATFORM_BILLING_PROVIDER || 'manual',
      requested_by: admin.id,
      target_email: company.billing_email || null,
      note: cleanText(data.note || data.reason || '').slice(0, 300) || null
    }
  }, ['Prefer: return=minimal']).catch(() => {});
  await audit('platform.company.resend_billing', {
    req,
    company_id: company.id,
    actor_admin_id: admin.id,
    entity_type: 'company',
    entity_id: company.id,
    severity: 'info',
    after_data: {
      status: 'requested',
      provider: PLATFORM_BILLING_PROVIDER || 'manual',
      target_email: company.billing_email || null
    }
  });
  return {
    ok: true,
    message: 'Solicitação de reenvio de cobrança registrada para o suporte financeiro.'
  };
}

async function changePlatformCompanyPlan(id, data, admin) {
  const companyId = cleanUuid(id, 'empresa');
  const planCode = cleanSlug(data.plan_code || data.code || '');
  if (!planCode) throw httpError(422, 'Informe o plano.');
  const company = await getCompanyById(companyId);
  const [plan] = await dbRequest('GET', 'subscription_plans', {
    select: '*',
    code: `eq.${planCode}`,
    is_active: 'eq.true',
    limit: '1'
  });
  if (!plan) throw httpError(404, 'Plano não encontrado.');
  const startsAt = new Date().toISOString();
  const endsAt = data.current_period_ends_at || new Date(Date.now() + 30 * 86400000).toISOString();
  const payload = {
    company_id: companyId,
    plan_id: plan.id,
    status: sanitizeSubscriptionStatus(data.status || company.status || 'active'),
    current_period_starts_at: startsAt,
    current_period_ends_at: endsAt,
    next_renewal_at: endsAt,
    billing_provider: 'manual',
    metadata: { source: 'platform_plan_change', changed_by: admin.id }
  };
  await dbRequest('PATCH', 'company_subscriptions', {
    company_id: `eq.${companyId}`,
    status: 'in.(active,trial,past_due)'
  }, { status: 'expired' }, ['Prefer: return=minimal']).catch(() => {});
  const [subscription] = await dbRequest('POST', 'company_subscriptions', {}, payload, ['Prefer: return=representation']);
  await audit('platform.subscription.change', {
    company_id: company.id,
    actor_admin_id: admin.id,
    entity_type: 'company_subscription',
    entity_id: subscription.id,
    after_data: { plan_code: plan.code, status: payload.status }
  });
  return { ...subscription, plan };
}

async function changePlatformCompanyPlanSecure(req, id, data, admin) {
  const companyId = cleanUuid(id, 'empresa');
  const planCode = cleanSlug(data.plan_code || data.code || '');
  if (!planCode) throw httpError(422, 'Informe o plano.');
  const company = await getCompanyById(companyId);
  const [plan] = await dbRequest('GET', 'subscription_plans', {
    select: '*',
    code: `eq.${planCode}`,
    is_active: 'eq.true',
    limit: '1'
  });
  if (!plan) throw httpError(404, 'Plano não encontrado.');
  const currentSubscription = pickCurrentCompanySubscription(await listCompanySubscriptions(companyId, 100));
  const currentPlan = currentSubscription?.plan_id
    ? (await dbRequest('GET', 'subscription_plans', { select: '*', id: `eq.${currentSubscription.plan_id}`, limit: '1' }).catch(() => []))[0] || null
    : null;
  const changeType = billingPlanChangeType(currentPlan, plan);
  if (['downgrade'].includes(changeType) || data.require_confirmation === true) {
    await assertPlatformDangerConfirmation(req, admin, data, 'CONFIRMAR');
  }
  const warnings = await planLimitWarnings(companyId, null, plan).catch(() => []);
  const subscription = await changePlatformCompanyPlan(companyId, {
    plan_code: plan.code,
    status: data.status || 'active',
    current_period_ends_at: data.current_period_ends_at
  }, admin);
  await dbRequest('POST', 'subscription_events', {}, {
    company_id: company.id,
    subscription_id: subscription.id,
    event_type: `platform.${changeType}`,
    description: `Plano alterado no Platform para ${plan.name}.`,
    created_by: admin.id,
    metadata: {
      provider: 'manual',
      plan_code: plan.code,
      plan_name: plan.name,
      previous_plan_code: currentPlan?.code || null,
      amount_cents: moneyToCents(plan.monthly_price || 0),
      change_type: changeType,
      downgrade_warnings: warnings
    }
  }, ['Prefer: return=minimal']).catch(() => {});
  await audit('platform.billing.change_plan', {
    req,
    company_id: company.id,
    actor_admin_id: admin.id,
    entity_type: 'company_subscription',
    entity_id: subscription.id,
    severity: changeType === 'downgrade' ? 'warning' : 'info',
    after_data: { plan_code: plan.code, previous_plan_code: currentPlan?.code || null, change_type: changeType, warnings }
  });
  return { ...subscription, plan, change_type: changeType, downgrade_warnings: warnings };
}

async function cancelPlatformCompanySubscription(req, id, data, admin) {
  await assertPlatformDangerConfirmation(req, admin, data, 'CONFIRMAR');
  const companyId = cleanUuid(id, 'empresa');
  const company = await getCompanyById(companyId);
  const current = pickCurrentCompanySubscription(await listCompanySubscriptions(companyId, 100));
  if (!current) throw httpError(404, 'Assinatura não encontrada para este cliente.');
  const now = new Date().toISOString();
  const [subscription] = await dbRequest('PATCH', 'company_subscriptions', { id: `eq.${current.id}` }, {
    status: 'cancelled',
    cancelled_at: now,
    metadata: { ...(current.metadata || {}), cancelled_by: admin.id, cancelled_reason: cleanText(data.reason || '').slice(0, 300) || null }
  }, ['Prefer: return=representation']);
  await dbRequest('PATCH', 'companies', { id: `eq.${companyId}` }, { status: 'cancelled' }, ['Prefer: return=minimal']).catch(() => {});
  await dbRequest('POST', 'subscription_events', {}, {
    company_id: companyId,
    subscription_id: subscription.id,
    event_type: 'platform.subscription_cancelled',
    description: 'Assinatura cancelada manualmente pelo Admin Master.',
    created_by: admin.id,
    metadata: {
      provider: subscription.billing_provider || 'manual',
      status: 'cancelled',
      external_reference: subscription.external_subscription_id || null,
      reason: cleanText(data.reason || '').slice(0, 300) || null
    }
  }, ['Prefer: return=minimal']).catch(() => {});
  await audit('platform.billing.cancel_subscription', {
    req,
    company_id: company.id,
    actor_admin_id: admin.id,
    entity_type: 'company_subscription',
    entity_id: subscription.id,
    severity: 'warning',
    after_data: { status: 'cancelled', reason: cleanText(data.reason || '') || null }
  });
  return { ok: true, subscription };
}

async function reactivatePlatformCompanySubscription(req, id, data, admin) {
  const companyId = cleanUuid(id, 'empresa');
  const company = await getCompanyById(companyId);
  const subscriptions = await listCompanySubscriptions(companyId, 100);
  let current = pickCurrentCompanySubscription(subscriptions);
  let plan = null;
  const planCode = cleanSlug(data.plan_code || data.code || '');
  if (planCode) {
    [plan] = await dbRequest('GET', 'subscription_plans', {
      select: '*',
      code: `eq.${planCode}`,
      is_active: 'eq.true',
      limit: '1'
    });
  } else if (current?.plan_id) {
    [plan] = await dbRequest('GET', 'subscription_plans', {
      select: '*',
      id: `eq.${current.plan_id}`,
      limit: '1'
    }).catch(() => []);
  }
  if (!plan) throw httpError(422, 'Informe um plano ativo para reativar a assinatura.');
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 86400000).toISOString();
  if (!current || current.status === 'expired') {
    const [created] = await dbRequest('POST', 'company_subscriptions', {}, {
      company_id: companyId,
      plan_id: plan.id,
      status: 'active',
      current_period_starts_at: now.toISOString(),
      current_period_ends_at: periodEnd,
      next_renewal_at: periodEnd,
      billing_provider: 'manual',
      last_payment_at: now.toISOString(),
      metadata: { source: 'platform_reactivation', reactivated_by: admin.id, amount_cents: moneyToCents(plan.monthly_price || 0) }
    }, ['Prefer: return=representation']);
    current = created;
  } else {
    [current] = await dbRequest('PATCH', 'company_subscriptions', { id: `eq.${current.id}` }, {
      plan_id: plan.id,
      status: 'active',
      current_period_starts_at: now.toISOString(),
      current_period_ends_at: periodEnd,
      next_renewal_at: periodEnd,
      last_payment_at: now.toISOString(),
      payment_due_at: null,
      cancelled_at: null,
      suspended_at: null,
      metadata: { ...(current.metadata || {}), reactivated_by: admin.id, amount_cents: moneyToCents(plan.monthly_price || 0) }
    }, ['Prefer: return=representation']);
  }
  await dbRequest('PATCH', 'companies', { id: `eq.${companyId}` }, { status: 'active' }, ['Prefer: return=minimal']).catch(() => {});
  await dbRequest('POST', 'subscription_events', {}, {
    company_id: companyId,
    subscription_id: current.id,
    event_type: 'platform.subscription_reactivated',
    description: `Assinatura reativada no plano ${plan.name}.`,
    created_by: admin.id,
    metadata: {
      provider: current.billing_provider || 'manual',
      status: 'active',
      plan_code: plan.code,
      plan_name: plan.name,
      amount_cents: moneyToCents(plan.monthly_price || 0)
    }
  }, ['Prefer: return=minimal']).catch(() => {});
  await audit('platform.billing.reactivate_subscription', {
    req,
    company_id: company.id,
    actor_admin_id: admin.id,
    entity_type: 'company_subscription',
    entity_id: current.id,
    after_data: { status: 'active', plan_code: plan.code }
  });
  return { ok: true, subscription: current, plan };
}

async function updatePlatformStore(id, data, admin) {
  const storeId = cleanUuid(id, 'loja');
  const before = await getStoreById(storeId);
  const payload = {};
  if ('name' in data) payload.name = cleanText(data.name);
  if ('slug' in data) payload.slug = cleanSlug(data.slug);
  if ('description' in data) payload.description = cleanText(data.description || '') || null;
  if ('is_active' in data) payload.is_active = Boolean(data.is_active);
  if (!Object.keys(payload).length) throw httpError(422, 'Informe algum dado para atualizar.');
  if (!payload.name && 'name' in payload) throw httpError(422, 'Informe o nome da loja.');
  if (!payload.slug && 'slug' in payload) throw httpError(422, 'Informe um endereço público válido.');
  if (payload.slug) payload.public_url = `/${payload.slug}`;
  const [store] = await dbRequest('PATCH', 'stores', { id: `eq.${storeId}` }, payload, ['Prefer: return=representation']);
  if (!store) {
    throw httpError(404, 'Loja não encontrada ou indisponível.', { code: 'STORE_NOT_FOUND' });
  }
  if (payload.name || payload.slug || payload.description) {
    await dbRequest('PATCH', 'store_settings', { store_id: `eq.${storeId}` }, {
      ...(payload.name ? { name: payload.name } : {}),
      ...(payload.slug ? { slug: payload.slug } : {}),
      ...(payload.description !== undefined ? { description: payload.description } : {})
    }, ['Prefer: return=minimal']).catch(() => {});
  }
  clearStoreSettingsCache(storeId);
  clearPublicBootstrapCache(storeId);
  await audit('platform.store.update', {
    company_id: store.company_id,
    store_id: store.id,
    actor_admin_id: admin.id,
    entity_type: 'store',
    entity_id: store.id,
    before_data: before,
    after_data: payload
  });
  return publicStoreRef(store);
}

async function setPlatformStoreStatus(id, data, admin) {
  return updatePlatformStore(id, { is_active: data.is_active !== false }, admin);
}

async function createCompanyFeatureOverride(companyId, data, admin) {
  const resolvedCompanyId = cleanUuid(companyId, 'empresa');
  const featureCode = cleanSlug(data.feature_code || data.code || '');
  const overrideType = cleanSlug(data.override_type || data.type || '');
  if (!featureCode) throw httpError(422, 'Informe o recurso.');
  if (!['allow', 'block', 'limit'].includes(overrideType)) throw httpError(422, 'Informe o tipo de exceção.');
  const company = await getCompanyById(resolvedCompanyId);
  const [feature] = await dbRequest('GET', 'platform_features', {
    select: '*',
    code: `eq.${featureCode}`,
    limit: '1'
  });
  if (!feature) throw httpError(404, 'Recurso não encontrado.');
  const payload = {
    company_id: company.id,
    feature_id: feature.id,
    override_type: overrideType,
    limit_value: overrideType === 'limit' ? Math.max(0, Number(data.limit_value || 0)) : null,
    starts_at: data.starts_at || new Date().toISOString(),
    ends_at: data.ends_at || null,
    reason: cleanText(data.reason || '') || null,
    created_by: admin.id
  };
  const [override] = await dbRequest('POST', 'company_feature_overrides', {}, payload, ['Prefer: return=representation']);
  await audit('platform.feature_override.create', {
    company_id: company.id,
    actor_admin_id: admin.id,
    entity_type: 'company_feature_override',
    entity_id: override.id,
    after_data: { feature_code: feature.code, override_type: overrideType, limit_value: payload.limit_value }
  });
  return { ...override, feature };
}

async function deleteCompanyFeatureOverride(id, admin) {
  const overrideId = cleanUuid(id, 'exceção');
  const [before] = await dbRequest('GET', 'company_feature_overrides', {
    select: '*',
    id: `eq.${overrideId}`,
    limit: '1'
  });
  if (!before) throw httpError(404, 'Exceção não encontrada.');
  await dbRequest('DELETE', 'company_feature_overrides', { id: `eq.${overrideId}` }, null, ['Prefer: return=minimal']);
  await audit('platform.feature_override.delete', {
    company_id: before.company_id,
    actor_admin_id: admin.id,
    entity_type: 'company_feature_override',
    entity_id: overrideId,
    before_data: before
  });
}

async function listCompanySubscriptions(companyId, limit = 20) {
  const resolvedCompanyId = cleanUuid(companyId);
  if (!resolvedCompanyId) return [];
  return dbRequest('GET', 'company_subscriptions', {
    select: '*',
    company_id: `eq.${resolvedCompanyId}`,
    order: 'created_at.desc',
    limit: String(limit)
  }).catch(() => []);
}

function pickCurrentCompanySubscription(subscriptions = []) {
  const list = Array.isArray(subscriptions) ? subscriptions : [];
  return list.find((entry) => ['active', 'trial', 'grace_period'].includes(entry.status))
    || list.find((entry) => ['past_due', 'suspended', 'expired'].includes(entry.status))
    || list.find((entry) => entry.status === 'payment_pending')
    || list[0]
    || null;
}

async function getCompanyPlanOverview(companyId, storeId) {
  const resolvedCompanyId = cleanUuid(companyId);
  if (!resolvedCompanyId) {
    return { company: null, subscription: null, pending_subscription: null, plan: null, features: [], available_plans: [], usage: await companyUsageSnapshot(companyId, storeId) };
  }
  const [company, subscriptions, availablePlans, billingHistory] = await Promise.all([
    getCompanyById(resolvedCompanyId).catch(() => null),
    listCompanySubscriptions(resolvedCompanyId),
    listPortalPlans().then((data) => data.plans || []).catch(() => []),
    listBillingHistory(resolvedCompanyId)
  ]);
  const subscription = pickCurrentCompanySubscription(subscriptions);
  const pendingSubscription = subscriptions.find((entry) => entry.status === 'payment_pending') || null;
  let plan = null;
  let features = [];
  if (subscription?.plan_id) {
    plan = (await dbRequest('GET', 'subscription_plans', {
      select: '*',
      id: `eq.${subscription.plan_id}`,
      limit: '1'
    }).catch(() => []))[0] || null;
    features = await listCompanyPlanFeatures(subscription.plan_id);
  }
  return {
    company,
    subscription,
    pending_subscription: pendingSubscription,
    plan,
    features,
    available_plans: availablePlans,
    billing_history: billingHistory,
    usage: await companyUsageSnapshot(resolvedCompanyId, storeId)
  };
}

async function listBillingHistory(companyId) {
  const resolvedCompanyId = cleanUuid(companyId);
  if (!resolvedCompanyId) return [];
  return dbRequest('GET', 'subscription_events', {
    select: '*',
    company_id: `eq.${resolvedCompanyId}`,
    order: 'created_at.desc',
    limit: '20'
  }).catch(() => []);
}

async function assertTrialCanBeActivated(companyId, plan) {
  if (plan?.code !== 'trial' && moneyCents(plan?.monthly_price || 0) > 0) return;
  const subscriptions = await listCompanySubscriptions(companyId, 100);
  const usedTrial = subscriptions.some((entry) => entry.status === 'trial' || entry.trial_ends_at || entry.metadata?.source === 'free_plan');
  if (usedTrial) throw httpError(409, 'Esta empresa já utilizou o período de teste.');
}

function billingPlanChangeType(currentPlan, nextPlan) {
  if (!currentPlan?.code) return 'activation';
  const currentOrder = Number(currentPlan.sort_order || 0);
  const nextOrder = Number(nextPlan.sort_order || 0);
  if (nextOrder > currentOrder) return 'upgrade';
  if (nextOrder < currentOrder) return 'downgrade';
  return 'same_plan';
}

async function planLimitWarnings(companyId, storeId, plan) {
  if (!plan?.id) return [];
  const [features, usage] = await Promise.all([
    listCompanyPlanFeatures(plan.id),
    companyUsageSnapshot(companyId, storeId)
  ]);
  const labels = {
    digital_menu: ['products', 'Produtos'],
    menu_categories: ['categories', 'Categorias'],
    orders: ['orders_month', 'Pedidos no mês'],
    admin_users: ['users', 'Usuários da equipe'],
    tables: ['tables', 'Mesas'],
    customers: ['customers', 'Clientes']
  };
  return features.flatMap((entry) => {
    const code = entry.feature?.code;
    const limit = Number(entry.limit_value || 0);
    const [usageKey, label] = labels[code] || [];
    if (!usageKey || !limit) return [];
    const used = Number(usage[usageKey] ?? usage[usageKey.replace('_month', '')] ?? 0);
    return used > limit ? [{ feature: code, usage_key: usageKey, label, used, limit }] : [];
  });
}

async function createBillingCheckout(req, admin, data = {}) {
  const companyId = cleanUuid(admin.company_id, 'empresa');
  const planCode = cleanSlug(data.plan_code || data.planCode || '');
  if (!planCode) throw httpError(422, 'Informe o plano desejado.');
  const [plan] = await dbRequest('GET', 'subscription_plans', {
    select: '*',
    code: `eq.${planCode}`,
    is_active: 'eq.true',
    limit: '1'
  });
  if (!plan) throw httpError(404, 'Plano não encontrado.');
  const [company] = await dbRequest('GET', 'companies', {
    select: '*',
    id: `eq.${companyId}`,
    limit: '1'
  });
  if (!company) throw httpError(404, 'Empresa não encontrada.');
  await assertTrialCanBeActivated(companyId, plan);
  const currentSubscription = pickCurrentCompanySubscription(await listCompanySubscriptions(companyId, 100));
  const currentPlan = currentSubscription?.plan_id
    ? (await dbRequest('GET', 'subscription_plans', { select: '*', id: `eq.${currentSubscription.plan_id}`, limit: '1' }).catch(() => []))[0] || null
    : null;
  const changeType = billingPlanChangeType(currentPlan, plan);
  const downgradeWarnings = await planLimitWarnings(companyId, admin.store_id, plan);
  const amount = moneyCents(plan.monthly_price || 0);
  const billingConfig = await privatePlatformBillingSettings();
  const reusableCheckout = await findReusablePendingBillingCheckout(companyId, plan.id);
  if (reusableCheckout?.checkout_url) {
    return {
      subscription: reusableCheckout.subscription,
      plan,
      payment_transaction: reusableCheckout.transaction,
      checkout_url: reusableCheckout.checkout_url,
      provider: reusableCheckout.subscription?.billing_provider || billingConfig.provider,
      reused: true,
      change_type: reusableCheckout.subscription?.metadata?.change_type || changeType,
      downgrade_warnings: reusableCheckout.subscription?.metadata?.downgrade_warnings || downgradeWarnings
    };
  }
  if (amount > 0 && billingConfig.provider !== 'mock' && !billingConfig.api_key) {
    throw httpError(503, 'Checkout indisponível: configure ABACATEPAY_API_KEY ou PLATFORM_BILLING_API_KEY no servidor.');
  }
  if (billingConfig.provider === 'mock' || amount <= 0) {
    const activated = await activateCompanyPlan(req, admin, company, plan, {
      source: amount <= 0 ? 'free_plan' : 'manual_activation',
      provider: 'manual',
      currentPlan,
      changeType,
      downgradeWarnings
    });
    return {
      ...activated,
      checkout_url: null,
      provider: 'manual',
      activated: true,
      change_type: changeType,
      downgrade_warnings: downgradeWarnings
    };
  }
  const checkout = await createProviderSubscriptionCheckout({ company, plan, admin, amount, billingConfig });
  if (!checkout.checkoutUrl) {
    throw httpError(502, 'O provedor de pagamento não retornou a URL do checkout. Confira a configuração da Abacate Pay.');
  }
  const [subscription] = await dbRequest('POST', 'company_subscriptions', {}, {
    company_id: companyId,
    plan_id: plan.id,
    status: 'payment_pending',
    billing_provider: billingConfig.provider,
    external_subscription_id: checkout.subscriptionId || checkout.transactionId || null,
    payment_due_at: new Date(Date.now() + 3 * 86400000).toISOString(),
    metadata: {
      source: 'admin_billing_checkout',
      checkout_url: checkout.checkoutUrl || null,
      plan_code: plan.code,
      amount_cents: amount,
      change_type: changeType,
      downgrade_warnings: downgradeWarnings
    }
  }, ['Prefer: return=representation']);
  const transaction = await createSubscriptionPaymentTransaction({
    companyId,
    subscriptionId: subscription.id,
    planId: plan.id,
    provider: billingConfig.provider,
    externalTransactionId: checkout.subscriptionId || checkout.transactionId || null,
    status: 'pending',
    amountCents: amount,
    checkoutUrl: checkout.checkoutUrl || null,
    expiresAt: new Date(Date.now() + 3 * 86400000).toISOString(),
    metadata: {
      source: 'admin_billing_checkout',
      plan_code: plan.code,
      plan_name: plan.name,
      change_type: changeType,
      downgrade_warnings: downgradeWarnings
    }
  });
  await dbRequest('POST', 'subscription_events', {}, {
    company_id: companyId,
    subscription_id: subscription.id,
    event_type: 'checkout_created',
    description: `Cobrança criada para o plano ${plan.name}.`,
    metadata: {
      provider: billingConfig.provider,
      provider_event_id: checkout.subscriptionId || checkout.transactionId || `checkout_${Date.now()}`,
      payment_transaction_id: transaction?.id || null,
      plan_code: plan.code,
      checkout_url: checkout.checkoutUrl || null,
      amount_cents: amount,
      change_type: changeType,
      downgrade_warnings: downgradeWarnings
    },
    created_by: admin.id
  }, ['Prefer: return=minimal']).catch(() => {});
  await audit('billing.checkout.create', {
    req,
    actor_admin_id: admin.id,
    company_id: companyId,
    store_id: admin.store_id,
    entity_type: 'company_subscription',
    entity_id: subscription.id,
    after_data: { plan_code: plan.code, provider: billingConfig.provider }
  });
  return {
    subscription,
    plan,
    payment_transaction: transaction,
    checkout_url: checkout.checkoutUrl || null,
    provider: billingConfig.provider,
    change_type: changeType,
    downgrade_warnings: downgradeWarnings
  };
}

async function findReusablePendingBillingCheckout(companyId, planId) {
  const resolvedCompanyId = cleanUuid(companyId);
  const resolvedPlanId = cleanUuid(planId);
  if (!resolvedCompanyId || !resolvedPlanId) return null;
  const [subscription] = await dbRequest('GET', 'company_subscriptions', {
    select: '*',
    company_id: `eq.${resolvedCompanyId}`,
    plan_id: `eq.${resolvedPlanId}`,
    status: 'eq.payment_pending',
    order: 'created_at.desc',
    limit: '1'
  }).catch(() => []);
  if (!subscription) return null;
  const dueAt = subscription.payment_due_at ? new Date(subscription.payment_due_at).getTime() : 0;
  const checkoutUrl = cleanText(subscription.metadata?.checkout_url || '');
  if (!checkoutUrl || (dueAt && dueAt < Date.now())) return null;
  const [transaction] = await dbRequest('GET', 'subscription_payment_transactions', {
    select: '*',
    subscription_id: `eq.${subscription.id}`,
    status: 'eq.pending',
    order: 'created_at.desc',
    limit: '1'
  }).catch(() => []);
  const expiresAt = transaction?.expires_at ? new Date(transaction.expires_at).getTime() : dueAt;
  if (expiresAt && expiresAt < Date.now()) return null;
  return { subscription, transaction: transaction || null, checkout_url: transaction?.checkout_url || checkoutUrl };
}

async function activateCompanyPlan(req, admin, company, plan, options = {}) {
  const companyId = cleanUuid(company.id || admin.company_id, 'empresa');
  const now = new Date();
  const monthlyPrice = moneyCents(plan.monthly_price || 0);
  const isTrialPlan = plan.code === 'trial' || monthlyPrice <= 0;
  const periodDays = isTrialPlan ? Number(plan.settings?.trial_days || 14) || 14 : 30;
  const periodEnd = new Date(now.getTime() + periodDays * 86400000);
  const status = isTrialPlan ? 'trial' : 'active';
  const previousSubscriptions = await listCompanySubscriptions(companyId, 100);
  const current = previousSubscriptions.find((entry) => ['trial', 'active', 'grace_period'].includes(entry.status));
  const isSamePlan = current?.plan_id && current.plan_id === plan.id && ['trial', 'active'].includes(current.status);
  const changeType = options.changeType || billingPlanChangeType(options.currentPlan || null, plan);
  const downgradeWarnings = Array.isArray(options.downgradeWarnings) ? options.downgradeWarnings : [];

  if (isSamePlan) {
    return { subscription: current, plan, already_current: true };
  }
  if (isTrialPlan && previousSubscriptions.some((entry) => entry.status === 'trial' || entry.trial_ends_at)) {
    throw httpError(409, 'Esta empresa já utilizou o período de teste.');
  }

  await dbRequest('PATCH', 'company_subscriptions', {
    company_id: `eq.${companyId}`,
    status: 'in.(trial,active,payment_pending,grace_period,suspended)'
  }, { status: 'cancelled', cancelled_at: now.toISOString() }, ['Prefer: return=minimal']).catch(() => {});

  const [subscription] = await dbRequest('POST', 'company_subscriptions', {}, {
    company_id: companyId,
    plan_id: plan.id,
    status,
    trial_ends_at: isTrialPlan ? periodEnd.toISOString() : null,
    current_period_starts_at: now.toISOString(),
    current_period_ends_at: periodEnd.toISOString(),
    next_renewal_at: periodEnd.toISOString(),
    billing_provider: options.provider || 'manual',
    last_payment_at: isTrialPlan ? null : now.toISOString(),
    metadata: {
      source: options.source || 'manual_activation',
      activated_by: admin.id,
      amount_cents: monthlyPrice,
      change_type: changeType,
      downgrade_warnings: downgradeWarnings
    }
  }, ['Prefer: return=representation']);

  await dbRequest('PATCH', 'companies', { id: `eq.${companyId}` }, {
    status: isTrialPlan ? 'trial' : 'active'
  }, ['Prefer: return=minimal']).catch(() => {});

  await dbRequest('POST', 'subscription_events', {}, {
    company_id: companyId,
    subscription_id: subscription.id,
    event_type: current ? `plan_${changeType}` : 'plan_activated',
    description: `${current ? 'Plano alterado' : 'Plano ativado'} para ${plan.name}.`,
    metadata: {
      provider: options.provider || 'manual',
      plan_code: plan.code,
      plan_name: plan.name,
      previous_subscription_id: current?.id || null,
      amount_cents: monthlyPrice,
      change_type: changeType,
      downgrade_warnings: downgradeWarnings
    },
    created_by: admin.id
  }, ['Prefer: return=minimal']).catch(() => {});

  await audit('billing.plan.activate', {
    req,
    actor_admin_id: admin.id,
    company_id: companyId,
    store_id: admin.store_id,
    entity_type: 'company_subscription',
    entity_id: subscription.id,
    after_data: { plan_code: plan.code, status, provider: options.provider || 'manual' }
  });

  return { subscription, plan, change_type: changeType, downgrade_warnings: downgradeWarnings };
}

async function createProviderSubscriptionCheckout({ company, plan, admin, amount, billingConfig = null }) {
  const config = billingConfig || await privatePlatformBillingSettings();
  if (config.provider === 'mock') {
    return {
      subscriptionId: `mock_sub_${company.id}_${Date.now()}`,
      checkoutUrl: `/painel?billing=mock&plan=${encodeURIComponent(plan.code)}`
    };
  }
  if (config.provider !== 'abacatepay') throw httpError(422, 'Provedor de assinatura não suportado.');
  const origin = cleanText(config.public_url || process.env.PUBLIC_APP_URL || process.env.APP_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
  const productId = await ensureAbacateSubscriptionProduct({ plan, amount, token: config.api_key });
  const customerId = await createAbacateSubscriptionCustomer({ company, admin, token: config.api_key }).catch(() => '');
  const externalId = cleanExternalId(`tapronto-sub-${company.id}-${plan.code}-${Date.now()}`);
  const body = {
    items: [{ id: productId, quantity: 1 }],
    methods: ['CARD'],
    returnUrl: `${origin}/painel?billing=cancelled`,
    completionUrl: `${origin}/painel?billing=success`,
    externalId,
    metadata: { companyId: company.id, planCode: plan.code, kind: 'platform_subscription' }
  };
  if (customerId) body.customerId = customerId;
  const data = await providerFetch(`${ABACATEPAY_API_BASE}/subscriptions/create`, {
    method: 'POST',
    token: config.api_key,
    body
  });
  const payload = data.data || data;
  const checkoutUrl = payload.url || payload.checkoutUrl || payload.paymentUrl || payload.subscription?.url || '';
  if (!checkoutUrl) {
    throw httpError(502, 'A Abacate Pay criou a assinatura, mas não retornou a URL de checkout.');
  }
  return {
    subscriptionId: String(payload.id || payload.subscriptionId || payload.billingId || ''),
    transactionId: externalId,
    checkoutUrl
  };
}

async function ensureAbacateSubscriptionProduct({ plan, amount, token }) {
  const externalId = cleanExternalId(`tapronto-plan-${plan.code}-${amount}`);
  const existing = await findAbacateProductByExternalId(externalId, token).catch(() => null);
  if (existing?.id) return String(existing.id);
  const data = await providerFetch(`${ABACATEPAY_API_BASE}/products/create`, {
    method: 'POST',
    token,
    body: {
      externalId,
      name: `Assinatura ${plan.name}`,
      description: plan.description || 'Assinatura mensal da plataforma TáPronto',
      price: amount,
      currency: 'BRL',
      cycle: 'MONTHLY'
    }
  });
  const payload = data.data || data;
  const productId = payload.id || payload.product?.id || '';
  if (!productId) throw httpError(502, 'A Abacate Pay não retornou o identificador do produto mensal.');
  return String(productId);
}

async function findAbacateProductByExternalId(externalId, token) {
  const data = await providerFetch(`${ABACATEPAY_API_BASE}/products/list`, { method: 'GET', token });
  const payload = data.data || data;
  const items = Array.isArray(payload)
    ? payload
    : (Array.isArray(payload.items) ? payload.items : (Array.isArray(payload.products) ? payload.products : []));
  return items.find((item) => item?.externalId === externalId || item?.external_id === externalId) || null;
}

async function createAbacateSubscriptionCustomer({ company, admin, token }) {
  const email = cleanText(admin.email || company.billing_email || '');
  if (!email) return '';
  const data = await providerFetch(`${ABACATEPAY_API_BASE}/customers/create`, {
    method: 'POST',
    token,
    body: {
      name: cleanText(admin.name || company.name || 'Cliente TáPronto'),
      email,
      cellphone: onlyDigits(company.phone || admin.phone || ''),
      metadata: { companyId: company.id, kind: 'platform_subscription' }
    }
  });
  const payload = data.data || data;
  return String(payload.id || payload.customer?.id || '');
}

async function createSubscriptionPaymentTransaction(data = {}) {
  const payload = {
    company_id: cleanUuid(data.companyId || data.company_id, 'empresa'),
    subscription_id: data.subscriptionId || data.subscription_id ? cleanUuid(data.subscriptionId || data.subscription_id, 'assinatura') : null,
    plan_id: data.planId || data.plan_id ? cleanUuid(data.planId || data.plan_id, 'plano') : null,
    provider: cleanSlug(data.provider || PLATFORM_BILLING_PROVIDER || 'manual'),
    external_transaction_id: cleanExternalId(data.externalTransactionId || data.external_transaction_id || '') || null,
    external_event_id: cleanExternalId(data.externalEventId || data.external_event_id || '') || null,
    status: cleanSlug(data.status || 'pending') || 'pending',
    amount_cents: Math.max(0, Number(data.amountCents ?? data.amount_cents ?? 0) || 0),
    checkout_url: cleanText(data.checkoutUrl || data.checkout_url || '') || null,
    expires_at: data.expiresAt || data.expires_at || null,
    metadata: sanitizeAuditPayload(data.metadata || {}) || {}
  };
  const [row] = await dbRequest('POST', 'subscription_payment_transactions', {}, payload, ['Prefer: return=representation']);
  return row || null;
}

async function findSubscriptionPaymentTransactionByEvent(provider, eventId) {
  const normalizedProvider = cleanSlug(provider || '');
  const normalizedEventId = cleanExternalId(eventId || '');
  if (!normalizedProvider || !normalizedEventId) return null;
  const [row] = await dbRequest('GET', 'subscription_payment_transactions', {
    select: '*',
    provider: `eq.${normalizedProvider}`,
    external_event_id: `eq.${normalizedEventId}`,
    limit: '1'
  }).catch(() => []);
  return row || null;
}

async function findSubscriptionPaymentTransactionByExternalId(provider, externalId) {
  const normalizedProvider = cleanSlug(provider || '');
  const normalizedExternalId = cleanExternalId(externalId || '');
  if (!normalizedProvider || !normalizedExternalId) return null;
  const [row] = await dbRequest('GET', 'subscription_payment_transactions', {
    select: '*',
    provider: `eq.${normalizedProvider}`,
    external_transaction_id: `eq.${normalizedExternalId}`,
    limit: '1'
  }).catch(() => []);
  return row || null;
}

async function updateSubscriptionPaymentTransaction(id, patch = {}) {
  const transactionId = cleanUuid(id);
  if (!transactionId) return null;
  const payload = {
    ...patch,
    updated_at: new Date().toISOString()
  };
  const [row] = await dbRequest('PATCH', 'subscription_payment_transactions', { id: `eq.${transactionId}` }, payload, ['Prefer: return=representation']);
  return row || null;
}

function billingWebhookAmountCents(payload = {}, data = {}) {
  const raw = payload.amount ?? payload.value ?? payload.totalAmount ?? data.amount ?? data.value ?? null;
  if (raw === null || raw === undefined || raw === '') return 0;
  if (typeof raw === 'string' && /[,.]/.test(raw)) return moneyCents(parseMoneyInput(raw) ?? raw);
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return 0;
  return numeric > 999 ? Math.round(numeric) : moneyCents(numeric);
}

function billingTransactionStatus(subscriptionStatus) {
  return ({
    active: 'paid',
    payment_pending: 'pending',
    grace_period: 'past_due',
    past_due: 'past_due',
    cancelled: 'cancelled',
    suspended: 'failed',
    expired: 'expired'
  })[subscriptionStatus] || 'pending';
}

async function receiveBillingWebhook(data, options = {}) {
  const config = await privatePlatformBillingSettings();
  const provider = cleanSlug(options.provider || inferPaymentProvider(data) || config.provider || PLATFORM_BILLING_PROVIDER);
  if (config.webhook_secret && options.webhookSecret !== config.webhook_secret) {
    throw httpError(401, 'Webhook de assinatura inválido.');
  }
  const payload = data.data || data.billing || data.subscription || data;
  const rawEventId = data.id || data.eventId || data.event_id || (
    (data.event || payload.status) && (payload.id || payload.billingId || payload.subscriptionId)
      ? `${data.event || payload.status}_${payload.id || payload.billingId || payload.subscriptionId}`
      : payload.id
  ) || `billing_${Date.now()}`;
  const eventId = cleanExternalId(rawEventId);
  const externalId = cleanText(payload.id || payload.billingId || payload.subscriptionId || data.billingId || '');
  const metadata = payload.metadata || data.metadata || {};
  const companyId = cleanUuid(metadata.companyId || metadata.company_id || data.companyId || '');
  const planCode = cleanSlug(metadata.planCode || metadata.plan_code || payload.externalId || '');
  const status = billingProviderStatus(payload.status || data.status || data.event);
  const amountCents = billingWebhookAmountCents(payload, data);

  const duplicateTransaction = await findSubscriptionPaymentTransactionByEvent(provider, eventId);
  if (duplicateTransaction) return { ok: true, duplicate: true, transaction: duplicateTransaction };

  let query = {
    select: '*',
    billing_provider: `eq.${provider}`,
    order: 'created_at.desc',
    limit: '1'
  };
  if (externalId) query.external_subscription_id = `eq.${externalId}`;
  else if (companyId) query.company_id = `eq.${companyId}`;
  else throw httpError(422, 'Webhook sem identificador de assinatura.');

  const [subscription] = await dbRequest('GET', 'company_subscriptions', query);
  if (!subscription) throw httpError(404, 'Assinatura não encontrada.');
  let transaction = await findSubscriptionPaymentTransactionByExternalId(provider, externalId);
  if (!transaction && subscription.id) {
    const [latest] = await dbRequest('GET', 'subscription_payment_transactions', {
      select: '*',
      subscription_id: `eq.${subscription.id}`,
      provider: `eq.${provider}`,
      order: 'created_at.desc',
      limit: '1'
    }).catch(() => []);
    transaction = latest || null;
  }
  if (transaction?.amount_cents && amountCents && Number(transaction.amount_cents) !== Number(amountCents)) {
    await updateSubscriptionPaymentTransaction(transaction.id, {
      external_event_id: eventId,
      status: 'amount_mismatch',
      raw_payload: sanitizeAuditPayload(data),
      metadata: {
        ...(transaction.metadata || {}),
        expected_amount_cents: Number(transaction.amount_cents || 0),
        received_amount_cents: amountCents,
        mismatch_at: new Date().toISOString()
      },
      failed_at: new Date().toISOString()
    }).catch(() => {});
    throw httpError(422, 'Valor do pagamento não confere com a cobrança da assinatura.');
  }
  let planId = subscription.plan_id;
  if (planCode) {
    const [plan] = await dbRequest('GET', 'subscription_plans', { select: 'id', code: `eq.${planCode}`, limit: '1' });
    if (plan?.id) planId = plan.id;
  }
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 86400000).toISOString();
  const graceEnd = new Date(now.getTime() + BILLING_GRACE_DAYS * 86400000).toISOString();
  const nextPaymentDue = status === 'grace_period' ? graceEnd : status === 'payment_pending' || status === 'past_due' ? subscription.payment_due_at || periodEnd : null;
  const [updated] = await dbRequest('PATCH', 'company_subscriptions', { id: `eq.${subscription.id}` }, {
    status,
    plan_id: planId,
    external_subscription_id: externalId || subscription.external_subscription_id || null,
    last_payment_at: status === 'active' ? now.toISOString() : subscription.last_payment_at,
    payment_due_at: nextPaymentDue,
    current_period_starts_at: status === 'active' ? now.toISOString() : subscription.current_period_starts_at,
    current_period_ends_at: status === 'active' ? periodEnd : subscription.current_period_ends_at,
    next_renewal_at: status === 'active' ? periodEnd : subscription.next_renewal_at,
    metadata: { ...(subscription.metadata || {}), last_webhook: { eventId, status, received_at: now.toISOString() } }
  }, ['Prefer: return=representation']);
  if (!transaction) {
    transaction = await createSubscriptionPaymentTransaction({
      companyId: subscription.company_id,
      subscriptionId: subscription.id,
      planId,
      provider,
      externalTransactionId: externalId || subscription.external_subscription_id || null,
      status: billingTransactionStatus(status),
      amountCents,
      metadata: {
        source: 'webhook_without_checkout_transaction',
        plan_code: planCode || null
      }
    }).catch(() => null);
  }
  if (transaction?.id) {
    await updateSubscriptionPaymentTransaction(transaction.id, {
      subscription_id: subscription.id,
      plan_id: planId || transaction.plan_id || null,
      external_transaction_id: externalId || transaction.external_transaction_id || subscription.external_subscription_id || null,
      external_event_id: eventId,
      status: billingTransactionStatus(status),
      amount_cents: amountCents || transaction.amount_cents || 0,
      raw_payload: sanitizeAuditPayload(data),
      metadata: {
        ...(transaction.metadata || {}),
        last_status: status,
        last_event_id: eventId,
        received_at: now.toISOString()
      },
      paid_at: status === 'active' ? now.toISOString() : transaction.paid_at || null,
      failed_at: ['past_due', 'cancelled', 'suspended'].includes(status) ? now.toISOString() : transaction.failed_at || null
    }).catch(() => {});
  }
  if (status === 'active') {
    await dbRequest('PATCH', 'company_subscriptions', {
      company_id: `eq.${subscription.company_id}`,
      id: `neq.${subscription.id}`,
      status: 'in.(trial,active,payment_pending,grace_period,past_due,suspended)'
    }, { status: 'cancelled' }, ['Prefer: return=minimal']).catch(() => {});
  }
  const companyStatus = status === 'active' ? 'active' : status === 'cancelled' ? 'cancelled' : status === 'suspended' ? 'suspended' : status === 'past_due' ? 'past_due' : status === 'grace_period' ? 'grace_period' : 'payment_pending';
  await dbRequest('PATCH', 'companies', { id: `eq.${subscription.company_id}` }, { status: companyStatus }, ['Prefer: return=minimal']);
  await dbRequest('POST', 'subscription_events', {}, {
    company_id: subscription.company_id,
    subscription_id: subscription.id,
    event_type: `billing.${status}`,
    description: `Evento de cobrança recebido: ${status}.`,
    metadata: {
      provider,
      provider_event_id: eventId,
      payment_transaction_id: transaction?.id || null,
      plan_code: planCode || null,
      amount_cents: amountCents || transaction?.amount_cents || 0,
      payload: sanitizeAuditPayload(data)
    }
  }, ['Prefer: return=minimal']);
  return { ok: true, subscription: updated, transaction };
}

async function recordBillingWebhookFailure(data, options = {}) {
  const payload = data?.data || data?.billing || data?.subscription || data || {};
  const metadata = payload.metadata || data?.metadata || {};
  const companyId = cleanUuid(metadata.companyId || metadata.company_id || data?.companyId || '');
  if (!companyId) return;
  const error = options.error || {};
  await dbRequest('POST', 'subscription_events', {}, {
    company_id: companyId,
    subscription_id: null,
    event_type: 'billing.webhook_failed',
    description: error.message || 'Falha ao processar webhook de cobrança.',
    metadata: {
      provider: cleanSlug(options.provider || PLATFORM_BILLING_PROVIDER),
      status: error.status || 500,
      code: error.detail?.code || error.code || null,
      payload: sanitizeAuditPayload(data)
    }
  }, ['Prefer: return=minimal']);
}

function billingProviderStatus(value) {
  const status = cleanSlug(value || '');
  if (['paid', 'active', 'completed', 'approved', 'billing-paid', 'payment-paid', 'payment-approved'].includes(status) || status.endsWith('-paid') || status.endsWith('-approved')) return 'active';
  if (['past-due', 'past_due', 'overdue', 'expired', 'billing-expired', 'payment-expired', 'refused', 'rejected', 'failed'].includes(status) || status.endsWith('-failed') || status.endsWith('-refused')) return 'past_due';
  if (['cancelled', 'canceled', 'billing-cancelled', 'billing-canceled'].includes(status) || status.endsWith('-cancelled') || status.endsWith('-canceled')) return 'cancelled';
  if (['suspended', 'blocked', 'billing-blocked'].includes(status)) return 'suspended';
  return 'payment_pending';
}

async function companyCommercialStatus(companyId) {
  const resolvedCompanyId = cleanUuid(companyId);
  if (!resolvedCompanyId) return { canOperate: true, status: 'unknown', message: '' };
  const [company, subscriptions] = await Promise.all([
    getCompanyById(resolvedCompanyId).catch(() => null),
    listCompanySubscriptions(resolvedCompanyId)
  ]);
  const subscription = pickCurrentCompanySubscription(subscriptions);
  const status = subscription?.status || company?.status || 'unknown';
  if (!company || ['suspended', 'blocked', 'cancelled', 'archived'].includes(company.status)) {
    return { canOperate: false, status: company?.status || 'missing', message: 'Empresa sem permissão comercial para operar.' };
  }
  if (['suspended', 'blocked', 'cancelled', 'expired'].includes(status)) {
    return { canOperate: false, status, message: 'Plano indisponível para operação. Regularize ou reative a empresa.' };
  }
  if (status === 'trial' && subscription?.trial_ends_at && new Date(subscription.trial_ends_at).getTime() < Date.now()) {
    return { canOperate: false, status: 'trial_expired', message: 'Período de teste encerrado. Ative um plano para continuar operando.' };
  }
  if (['payment_pending', 'past_due'].includes(status)) {
    return { canOperate: false, status, message: 'Pagamento pendente. A operação está temporariamente bloqueada.' };
  }
  if (status === 'grace_period') {
    const due = subscription?.payment_due_at || subscription?.current_period_ends_at;
    if (due && new Date(due).getTime() < Date.now()) {
      return { canOperate: false, status: 'grace_period_expired', message: 'Prazo de regularização encerrado.' };
    }
  }
  return { canOperate: true, status, message: '' };
}

async function companyCommercialStatusByStore(storeId) {
  const [store] = await dbRequest('GET', 'stores', {
    select: 'id,company_id',
    id: `eq.${cleanUuid(storeId)}`,
    limit: '1'
  }).catch(() => []);
  return companyCommercialStatus(store?.company_id);
}

async function listCompanyPlanFeatures(planId) {
  const entries = await dbRequest('GET', 'plan_features', {
    select: '*',
    plan_id: `eq.${cleanUuid(planId)}`,
    limit: '500'
  }).catch(() => []);
  const featureIds = cleanUuidArray(entries.map((entry) => entry.feature_id));
  if (!featureIds.length) return [];
  const features = await dbRequest('GET', 'platform_features', {
    select: '*',
    id: uuidInFilter(featureIds),
    order: 'sort_order.asc'
  }).catch(() => []);
  const featureById = new Map(features.map((feature) => [feature.id, feature]));
  return entries.map((entry) => ({
    ...entry,
    feature: featureById.get(entry.feature_id) || null
  })).filter((entry) => entry.feature);
}

async function companyUsageSnapshot(companyId, storeId) {
  const resolvedCompanyId = cleanUuid(companyId);
  const resolvedStoreId = cleanOptionalUuid(storeId);
  const stores = resolvedCompanyId ? await dbRequest('GET', 'stores', {
    select: 'id',
    company_id: `eq.${resolvedCompanyId}`,
    limit: '1000'
  }).catch(() => []) : [];
  const storeIds = cleanUuidArray(stores.map((store) => store.id));
  const scopedStoreIds = resolvedStoreId ? [resolvedStoreId] : storeIds;
  const scopedFilter = scopedStoreIds.length ? uuidInFilter(scopedStoreIds) : null;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const countRows = async (table, extra = {}) => {
    const storeScopedTables = ['orders', 'menu_categories', 'menu_items', 'customers', 'dining_tables', 'customer_tabs', 'order_print_logs', 'order_whatsapp_logs', 'order_payment_events'];
    if (!scopedFilter && storeScopedTables.includes(table)) return 0;
    const rows = await dbRequest('GET', table, {
      select: 'id',
      ...(scopedFilter && storeScopedTables.includes(table) ? { store_id: scopedFilter } : {}),
      ...extra,
      limit: '1000'
    }).catch(() => []);
    return rows.length;
  };
  const [users, categories, products, orders, ordersMonth, customers, tables, tabs, whatsappMessages] = await Promise.all([
    resolvedCompanyId ? dbRequest('GET', 'admin_user_store_access', {
      select: 'admin_user_id',
      company_id: `eq.${resolvedCompanyId}`,
      is_active: 'eq.true',
      limit: '1000'
    }).then((rows) => new Set(rows.map((row) => row.admin_user_id)).size).catch(() => 0) : 0,
    countRows('menu_categories'),
    countRows('menu_items'),
    countRows('orders'),
    countRows('orders', { created_at: `gte.${monthStart.toISOString()}` }),
    countRows('customers'),
    countRows('dining_tables'),
    countRows('customer_tabs', { status: 'eq.open' }),
    countRows('order_whatsapp_logs', { created_at: `gte.${monthStart.toISOString()}` })
  ]);
  return {
    stores: stores.length,
    users,
    categories,
    products,
    orders,
    orders_month: ordersMonth,
    customers,
    tables,
    open_tabs: tabs,
    whatsapp_messages: whatsappMessages
  };
}

async function listAuditLogs(params = new URLSearchParams()) {
  const companyId = cleanOptionalUuid(params.get?.('company_id') || '');
  const storeId = cleanOptionalUuid(params.get?.('store_id') || '');
  const action = cleanText(params.get?.('action') || '');
  const from = cleanOptionalDate(params.get?.('from') || '');
  const to = cleanOptionalDate(params.get?.('to') || '');
  const query = {
    select: '*',
    ...(companyId ? { company_id: `eq.${companyId}` } : {}),
    ...(storeId ? { store_id: `eq.${storeId}` } : {}),
    ...(action ? { action: `eq.${action}` } : {}),
    order: 'created_at.desc',
    limit: '100'
  };
  if (from && to) {
    query.created_at = `gte.${from}T00:00:00`;
  } else if (from) {
    query.created_at = `gte.${from}T00:00:00`;
  } else if (to) {
    query.created_at = `lte.${to}T23:59:59`;
  }
  const rows = await dbRequest('GET', 'audit_logs', {
    ...query
  });
  const filtered = from && to
    ? rows.filter((row) => {
      const time = new Date(row.created_at).getTime();
      return time >= new Date(`${from}T00:00:00`).getTime() && time <= new Date(`${to}T23:59:59`).getTime();
    })
    : rows;
  return { logs: filtered };
}

async function platformBackupStatus() {
  const statusPath = path.join(BACKUP_DIR, 'backup-status.json');
  const manifest = await readJsonFile(statusPath).catch(() => null);
  const entries = await readdir(BACKUP_DIR).catch(() => []);
  const dumps = await Promise.all(entries
    .filter((entry) => /^postgres-.+\.(dump|sql)$/.test(entry))
    .map(async (entry) => {
      const info = await stat(path.join(BACKUP_DIR, entry)).catch(() => null);
      return info ? {
        file: entry,
        size_bytes: info.size,
        created_at: info.mtime.toISOString()
      } : null;
    }));
  const recent = dumps
    .filter(Boolean)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10);
  const latest = recent[0] || null;
  const manifestStatus = sanitizeBackupStatus(manifest?.status);
  const status = manifestStatus !== 'unknown' ? manifestStatus : latest ? 'success' : 'unknown';
  return {
    status,
    updated_at: cleanText(manifest?.updated_at || latest?.created_at || ''),
    started_at: cleanText(manifest?.started_at || ''),
    finished_at: cleanText(manifest?.finished_at || latest?.created_at || ''),
    latest,
    last_output: cleanBackupFileName(manifest?.output || latest?.file || ''),
    retention_days: clampNumber(Number(manifest?.retention_days || process.env.BACKUP_RETENTION_DAYS || 7), 1, 365),
    mode: cleanText(manifest?.mode || ''),
    error: manifest?.status === 'failed' ? cleanText(manifest.error || '').slice(0, 240) : '',
    recent
  };
}

async function platformServicesStatus() {
  const [database, backup, git, storageUsage, smtp] = await Promise.all([
    checkDatabaseHealth(),
    platformBackupStatus(),
    getGitRuntimeInfo(),
    platformStorageUsage(),
    smtpServiceStatus()
  ]);
  const serviceName = cleanText(process.env.PLATFORM_SERVICE_NAME || 'cardapio.service');
  return {
    checked_at: new Date().toISOString(),
    permissions: {
      service_control_enabled: parseBoolean(process.env.PLATFORM_ALLOW_SERVICE_CONTROL, false),
      backup_enabled: true,
      jobs_enabled: true
    },
    application: {
      status: 'healthy',
      service_name: serviceName,
      uptime_seconds: Math.floor(process.uptime()),
      started_at: new Date(Date.now() - process.uptime() * 1000).toISOString(),
      memory: process.memoryUsage(),
      pid: process.pid,
      node: process.version
    },
    database: {
      status: database.status,
      message: database.message,
      latency_ms: database.latency_ms
    },
    smtp,
    backups: backup,
    webhooks: await platformWebhookServiceStatus(),
    jobs: {
      trial_cleanup: {
        status: 'ready',
        command: 'maintenance:trial-cleanup:apply',
        description: 'Remove empresas em teste sem acesso recente conforme regra operacional.'
      },
      log_cleanup: {
        status: 'ready',
        command: 'maintenance:logs:apply',
        description: 'Remove auditoria antiga, sessões expiradas, eventos técnicos, temporários e backups fora da retenção.'
      },
      backup: {
        status: backup.status || 'unknown',
        command: 'db:backup'
      }
    },
    deploy: git,
    storage_usage: storageUsage,
    retention: platformRetentionSettings(),
    risk_zone: {
      restart_requires_confirmation: true,
      database_stop_available: false,
      database_stop_reason: 'Parada de banco não foi habilitada nesta fase por segurança.'
    }
  };
}

function platformRetentionSettings() {
  return {
    audit_log_days: envInt('AUDIT_LOG_RETENTION_DAYS', envInt('LOG_RETENTION_DAYS', 180)),
    operational_log_days: envInt('OPERATIONAL_LOG_RETENTION_DAYS', 90),
    session_days: envInt('SESSION_RETENTION_DAYS', 7),
    subscription_event_days: envInt('SUBSCRIPTION_EVENT_RETENTION_DAYS', 365),
    billing_event_days: envInt('BILLING_EVENT_RETENTION_DAYS', 1825),
    support_message_days: envInt('SUPPORT_MESSAGE_RETENTION_DAYS', 730),
    backup_days: envInt('BACKUP_RETENTION_DAYS', 7),
    tmp_days: envInt('TMP_RETENTION_DAYS', 7)
  };
}

async function platformStorageUsage() {
  const [database, backups, uploads, tmp, cleanupRows] = await Promise.all([
    platformDatabaseStorageStats().catch((error) => ({ error: error.message || 'indisponível' })),
    directoryUsage(BACKUP_DIR).catch(() => ({ bytes: 0, files: 0 })),
    directoryUsage(UPLOAD_DIR).catch(() => ({ bytes: 0, files: 0 })),
    directoryUsage(path.resolve(__dirname, process.env.TMP_DIR || '.tmp')).catch(() => ({ bytes: 0, files: 0 })),
    dbRequest('GET', 'audit_logs', {
      select: 'id,after_data,created_at',
      action: 'eq.platform.logs.cleanup',
      order: 'created_at.desc',
      limit: '1'
    }).catch(() => [])
  ]);
  return {
    database,
    backups,
    uploads,
    tmp,
    latest_cleanup: cleanupRows[0] ? {
      created_at: cleanupRows[0].created_at,
      summary: cleanupRows[0].after_data || {}
    } : null
  };
}

async function platformDatabaseStorageStats() {
  if (!DATABASE_URL) return { bytes: 0, pretty: '0 B', tables: [] };
  const client = new pg.Client({
    connectionString: DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' || /sslmode=require/i.test(DATABASE_URL) ? { rejectUnauthorized: false } : false
  });
  await client.connect();
  try {
    const db = await client.query('select pg_database_size(current_database())::bigint as bytes');
    const tables = await client.query(`
      select relname as table_name,
             n_live_tup::bigint as estimated_rows,
             pg_total_relation_size(relid)::bigint as bytes
      from pg_stat_user_tables
      where relname in (
        'audit_logs',
        'app_sessions',
        'subscription_events',
        'support_tickets',
        'support_ticket_messages',
        'orders',
        'order_items',
        'customers',
        'menu_items'
      )
      order by pg_total_relation_size(relid) desc
    `);
    return {
      bytes: Number(db.rows[0]?.bytes || 0),
      tables: tables.rows.map((row) => ({
        table_name: row.table_name,
        estimated_rows: Number(row.estimated_rows || 0),
        bytes: Number(row.bytes || 0)
      }))
    };
  } finally {
    await client.end().catch(() => {});
  }
}

async function directoryUsage(directory) {
  let bytes = 0;
  let files = 0;
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    const info = await stat(fullPath).catch(() => null);
    if (!info) continue;
    if (entry.isDirectory()) {
      const nested = await directoryUsage(fullPath);
      bytes += nested.bytes;
      files += nested.files;
    } else {
      bytes += info.size;
      files += 1;
    }
  }
  return { bytes, files };
}

function envInt(key, fallback) {
  const value = Number.parseInt(process.env[key] || '', 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

async function platformServicesLogs(params = new URLSearchParams()) {
  const limit = clampNumber(Number(params.get?.('limit') || 80), 1, 200);
  const since = new Date(Date.now() - 86400000).toISOString();
  const actions = [
    'platform.service.backup',
    'platform.service.backup.failed',
    'platform.service.backup.restore',
    'platform.service.backup.restore.failed',
    'platform.service.trial_cleanup',
    'platform.service.trial_cleanup.failed',
    'platform.logs.cleanup',
    'platform.logs.cleanup.failed',
    'platform.service.app.restart',
    'platform.service.app.restart.failed',
    'platform.service.confirmation.failed',
    'platform.service.password.failed',
    'platform.subscription.change',
    'platform.company.update',
    'platform.company.status'
  ];
  const rows = await dbRequest('GET', 'audit_logs', {
    select: 'id,action,severity,entity_type,entity_id,actor_admin_id,ip_address,after_data,created_at',
    action: `in.(${actions.join(',')})`,
    created_at: `gte.${since}`,
    order: 'created_at.desc',
    limit: String(limit)
  }).catch(() => []);
  return {
    logs: rows.map((row) => ({
      id: row.id,
      action: row.action,
      severity: row.severity,
      status: row.after_data?.status || (row.severity === 'critical' ? 'failed' : 'info'),
      message: cleanText(row.after_data?.message || row.after_data?.summary || '').slice(0, 500),
      actor_admin_id: row.actor_admin_id || null,
      ip_address: row.ip_address || null,
      created_at: row.created_at
    }))
  };
}

async function runPlatformBackup(req, admin, data = {}) {
  await assertPlatformDangerConfirmation(req, admin, data, 'CONFIRMAR');
  const startedAt = Date.now();
  try {
    await writeBackupStatus({ status: 'running', started_at: new Date().toISOString(), output: 'manual-platform-backup' });
    const result = await runNodeScript('scripts/backup-postgres.mjs', [], { timeoutMs: 120000 });
    const status = await platformBackupStatus();
    await auditPlatformService(req, admin, 'platform.service.backup', 'info', {
      status: 'success',
      duration_ms: Date.now() - startedAt,
      message: safeCommandOutput(result.stdout || 'Backup manual concluído.'),
      backup: status.latest ? { file: status.latest.file, size_bytes: status.latest.size_bytes } : null
    });
    return { ok: true, status, output: safeCommandOutput(result.stdout) };
  } catch (error) {
    await writeBackupStatus({ status: 'failed', finished_at: new Date().toISOString(), output: 'manual-platform-backup', error: error.message || String(error) }).catch(() => {});
    await auditPlatformService(req, admin, 'platform.service.backup.failed', 'critical', {
      status: 'failed',
      duration_ms: Date.now() - startedAt,
      message: safeCommandOutput(error.message || String(error))
    });
    throw httpError(500, 'Não foi possível executar o backup manual.');
  }
}

async function restorePlatformBackup(req, admin, data = {}) {
  await assertPlatformDangerConfirmation(req, admin, data, 'CONFIRMAR');
  const file = cleanBackupFileName(data.file || data.backup_file || '');
  if (!/^postgres-.+\.(dump|sql)$/.test(file)) {
    await auditPlatformService(req, admin, 'platform.service.backup.restore.failed', 'critical', {
      status: 'failed',
      message: 'Arquivo de backup inválido para restauração.',
      file
    });
    throw httpError(422, 'Selecione um backup válido para restaurar.');
  }
  const backupPath = path.resolve(BACKUP_DIR, file);
  if (!backupPath.startsWith(`${path.resolve(BACKUP_DIR)}${path.sep}`)) {
    throw httpError(422, 'Arquivo de backup inválido.');
  }
  const backupInfo = await stat(backupPath).catch(() => null);
  if (!backupInfo || !backupInfo.isFile()) {
    throw httpError(404, 'Backup não encontrado.');
  }
  const startedAt = Date.now();
  try {
    const preRestore = await runNodeScript('scripts/backup-postgres.mjs', [], { timeoutMs: 120000 })
      .then(() => platformBackupStatus())
      .catch((error) => ({ error: error.message || String(error), latest: null }));
    const commandResult = file.endsWith('.sql')
      ? await runCommand('psql', ['--set', 'ON_ERROR_STOP=1', '--file', backupPath, pgToolConnectionString(DATABASE_URL)], { timeoutMs: 180000 })
      : await runCommand('pg_restore', ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--dbname', pgToolConnectionString(DATABASE_URL), backupPath], { timeoutMs: 180000 });
    await writeBackupStatus({
      status: 'success',
      finished_at: new Date().toISOString(),
      output: file,
      restored_from: file,
      restore_finished_at: new Date().toISOString(),
      retention_days: envInt('BACKUP_RETENTION_DAYS', 7),
      mode: file.endsWith('.sql') ? 'psql-restore' : 'pg_restore'
    }).catch(() => {});
    await auditPlatformService(req, admin, 'platform.service.backup.restore', 'critical', {
      status: 'success',
      duration_ms: Date.now() - startedAt,
      file,
      pre_restore_backup: preRestore.latest ? {
        file: preRestore.latest.file,
        size_bytes: preRestore.latest.size_bytes
      } : null,
      pre_restore_warning: preRestore.error ? safeCommandOutput(preRestore.error) : '',
      message: safeCommandOutput(commandResult.stdout || 'Backup restaurado com sucesso.')
    });
    return {
      ok: true,
      restored_from: file,
      pre_restore_backup: preRestore.latest || null,
      output: safeCommandOutput(commandResult.stdout),
      status: await platformBackupStatus()
    };
  } catch (error) {
    await auditPlatformService(req, admin, 'platform.service.backup.restore.failed', 'critical', {
      status: 'failed',
      duration_ms: Date.now() - startedAt,
      file,
      message: safeCommandOutput(error.message || String(error))
    });
    throw httpError(500, 'Não foi possível restaurar o backup. Verifique o arquivo e os logs operacionais.');
  }
}

async function runPlatformTrialCleanup(req, admin, data = {}) {
  await assertPlatformDangerConfirmation(req, admin, data, 'CONFIRMAR');
  const startedAt = Date.now();
  try {
    const result = await runNodeScript('scripts/cleanup-inactive-trials.mjs', ['--apply'], { timeoutMs: 120000 });
    await auditPlatformService(req, admin, 'platform.service.trial_cleanup', 'warning', {
      status: 'success',
      duration_ms: Date.now() - startedAt,
      message: safeCommandOutput(result.stdout || 'Limpeza de trials concluída.')
    });
    return { ok: true, output: safeCommandOutput(result.stdout) };
  } catch (error) {
    await auditPlatformService(req, admin, 'platform.service.trial_cleanup.failed', 'critical', {
      status: 'failed',
      duration_ms: Date.now() - startedAt,
      message: safeCommandOutput(error.message || String(error))
    });
    throw httpError(500, 'Não foi possível executar a limpeza de trials inativos.');
  }
}

async function runPlatformLogCleanup(req, admin, data = {}) {
  const applyCleanup = data.apply === true;
  if (applyCleanup) {
    await assertPlatformDangerConfirmation(req, admin, data, 'CONFIRMAR');
  }
  const startedAt = Date.now();
  try {
    const args = ['--json'];
    if (applyCleanup) args.unshift('--apply');
    const result = await runNodeScript('scripts/cleanup-logs.mjs', args, {
      timeoutMs: 120000,
      env: {
        CLEANUP_ACTOR_ADMIN_ID: admin.id || '',
        CLEANUP_REQUEST_SOURCE: 'platform'
      }
    });
    const parsed = parseJsonOutput(result.stdout);
    return {
      ok: parsed.ok !== false,
      mode: parsed.mode || (applyCleanup ? 'apply' : 'dry_run'),
      duration_ms: parsed.duration_ms ?? Date.now() - startedAt,
      result: parsed
    };
  } catch (error) {
    await auditPlatformService(req, admin, 'platform.logs.cleanup.failed', 'critical', {
      status: 'failed',
      mode: applyCleanup ? 'apply' : 'dry_run',
      duration_ms: Date.now() - startedAt,
      message: safeCommandOutput(error.message || String(error))
    });
    throw httpError(500, 'Não foi possível executar a limpeza de logs.');
  }
}

function parseJsonOutput(output) {
  const lines = String(output || '').trim().split(/\r?\n/).filter(Boolean);
  const jsonLine = [...lines].reverse().find((line) => line.trim().startsWith('{'));
  if (!jsonLine) throw new Error('Comando não retornou JSON válido.');
  return JSON.parse(jsonLine);
}

async function restartPlatformApplication(req, admin, data = {}) {
  await assertPlatformDangerConfirmation(req, admin, data, 'CONFIRMAR');
  const serviceName = cleanText(process.env.PLATFORM_SERVICE_NAME || 'cardapio.service');
  if (!parseBoolean(process.env.PLATFORM_ALLOW_SERVICE_CONTROL, false)) {
    await auditPlatformService(req, admin, 'platform.service.app.restart', 'warning', {
      status: 'blocked',
      message: 'Restart solicitado, mas PLATFORM_ALLOW_SERVICE_CONTROL não está habilitado.',
      service_name: serviceName
    });
    throw httpError(403, 'Controle de serviço não habilitado neste ambiente. Configure PLATFORM_ALLOW_SERVICE_CONTROL=true para liberar.');
  }
  await auditPlatformService(req, admin, 'platform.service.app.restart', 'warning', {
    status: 'scheduled',
    message: 'Restart da aplicação agendado.',
    service_name: serviceName
  });
  setTimeout(() => {
    const child = spawn('systemctl', ['restart', serviceName], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
  }, 500).unref?.();
  return { ok: true, scheduled: true, service_name: serviceName };
}

async function platformWebhookServiceStatus() {
  const rows = await dbRequest('GET', 'audit_logs', {
    select: 'id,action,severity,created_at',
    order: 'created_at.desc',
    limit: '200'
  }).catch(() => []);
  const webhookRows = rows.filter((row) => /webhook/i.test(row.action || '')).slice(0, 50);
  const failures = webhookRows.filter((row) => row.severity === 'critical' || /fail|erro|failed/i.test(row.action || ''));
  return {
    status: failures.length ? 'attention' : 'healthy',
    recent_events: webhookRows.length,
    recent_failures: failures.length,
    last_event_at: webhookRows[0]?.created_at || null
  };
}

async function getGitRuntimeInfo() {
  const [commit, branch] = await Promise.all([
    runCommand('git', ['rev-parse', '--short', 'HEAD'], { timeoutMs: 5000 }).catch(() => ({ stdout: '' })),
    runCommand('git', ['branch', '--show-current'], { timeoutMs: 5000 }).catch(() => ({ stdout: '' }))
  ]);
  return {
    commit: cleanText(commit.stdout || '').slice(0, 40) || 'indisponível',
    branch: cleanText(branch.stdout || '').slice(0, 80) || 'indisponível',
    deployed_at: null
  };
}

async function assertPlatformDangerConfirmation(req, admin, data = {}, expected = 'CONFIRMAR') {
  if (cleanText(data.confirmation || data.confirm || '') !== expected) {
    await auditPlatformService(req, admin, 'platform.service.confirmation.failed', 'warning', {
      status: 'failed',
      message: 'Texto de confirmação inválido.'
    });
    throw httpError(422, `Digite ${expected} para confirmar esta ação.`);
  }
  await assertPlatformAdminPassword(req, admin, data.password || '');
  return true;
}

async function assertPlatformAdminPassword(req, admin, passwordValue) {
  const password = String(passwordValue || '');
  if (!password) {
    await auditPlatformService(req, admin, 'platform.service.password.failed', 'warning', {
      status: 'failed',
      message: 'Senha do superadmin ausente.'
    });
    throw httpError(401, 'Informe sua senha para confirmar esta ação.');
  }
  const [current] = await dbRequest('GET', 'admin_users', {
    select: 'id,password_hash,role,is_active,email',
    id: `eq.${cleanUuid(admin.id)}`,
    limit: '1'
  });
  if (!current || current.is_active === false || normalizeAdminRole(current.role) !== 'superadmin' || !verifyPassword(password, current.password_hash)) {
    await auditPlatformService(req, admin, 'platform.service.password.failed', 'critical', {
      status: 'failed',
      message: 'Senha do superadmin inválida.'
    });
    throw httpError(403, 'Senha inválida para executar esta ação.');
  }
  return true;
}

async function auditPlatformService(req, admin, action, severity, payload = {}) {
  await audit(action, {
    req,
    actor_admin_id: admin?.id || null,
    company_id: admin?.company_id || null,
    entity_type: 'platform_service',
    severity,
    after_data: {
      ...payload,
      actor_email: admin?.email || null
    }
  });
}

function runNodeScript(scriptPath, args = [], options = {}) {
  return runCommand(process.execPath, [path.join(__dirname, scriptPath), ...args], options);
}

function pgToolConnectionString(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    url.searchParams.delete('schema');
    return url.toString();
  } catch {
    return value.replace(/([?&])schema=[^&]*&?/, (match, prefix) => prefix === '?' ? '?' : '').replace(/[?&]$/, '');
  }
}

function runCommand(command, args = [], options = {}) {
  const timeoutMs = options.timeoutMs || 30000;
  return new Promise((resolve, reject) => {
    const child = spawn(resolveExecutable(command), args, {
      cwd: __dirname,
      env: { ...process.env, ...(options.env || {}) },
      shell: false
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Tempo esgotado ao executar comando operacional.'));
    }, timeoutMs);
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > 12000) stdout = stdout.slice(-12000);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 12000) stderr = stderr.slice(-12000);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      const result = { code: code || 0, stdout, stderr };
      if (code && code !== 0) {
        reject(new Error(safeCommandOutput(stderr || stdout || `Comando finalizou com código ${code}.`)));
      } else {
        resolve(result);
      }
    });
  });
}

function resolveExecutable(command) {
  if (process.platform !== 'win32' || path.isAbsolute(command) || command.includes(path.sep)) {
    return command;
  }
  const lookup = spawnSync('where.exe', [command], { encoding: 'utf8', shell: false });
  const first = String(lookup.stdout || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  return first || command;
}

function safeCommandOutput(value) {
  return maskSensitiveText(String(value || '').replace(/\r/g, '').trim()).slice(0, 2000);
}

function maskSensitiveText(value) {
  let output = String(value || '');
  const secrets = [
    DATABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.COOKIE_SECRET,
    PLATFORM_BILLING_API_KEY,
    PLATFORM_BILLING_WEBHOOK_SECRET
  ].filter(Boolean);
  for (const secret of secrets) {
    if (secret && output.includes(secret)) output = output.split(secret).join('[redacted]');
  }
  output = output.replace(/(postgres(?:ql)?:\/\/)[^\s]+/gi, '$1[redacted]');
  output = output.replace(/(password|secret|token|api[_-]?key)=([^\s&]+)/gi, '$1=[redacted]');
  return output;
}

async function writeBackupStatus(data) {
  await mkdir(BACKUP_DIR, { recursive: true });
  await writeFile(path.join(BACKUP_DIR, 'backup-status.json'), JSON.stringify({
    ...data,
    updated_at: new Date().toISOString()
  }, null, 2));
}

async function platformOperationalHealth(params = new URLSearchParams()) {
  const period = platformHealthPeriod(params.get?.('period') || '24h');
  const [database, backup, operationalLogs] = await Promise.all([
    checkDatabaseHealth(),
    platformBackupStatus(),
    listOperationalLogs(period.since, params)
  ]);
  const metrics = await platformTechnicalMetrics(period, database, backup);
  const config = await platformConfigChecklist();
  const statuses = [
    apiHealthStatus(metrics),
    database,
    platformStatus('auth', 'Autenticação', config.items.find((item) => item.key === 'cookie_secret')?.ok === false ? 'attention' : 'healthy', 'Sessões administrativas e cookies operando.', null),
    await billingHealthStatus(),
    webhookHealthStatus(operationalLogs),
    backupHealthStatus(backup),
    jobsHealthStatus(),
    await storageHealthStatus(UPLOAD_DIR, 'storage', 'Storage/uploads'),
    sslDomainHealthStatus(),
    await smtpHealthStatus()
  ];
  const alerts = await platformHealthAlerts({ statuses, metrics, config, backup, operationalLogs });
  return normalizePortuguesePayload({
    checked_at: new Date().toISOString(),
    period: period.label,
    statuses,
    metrics,
    backup,
    config,
    alerts,
    logs: operationalLogs
  });
}

async function platformOperationalMetrics(params = new URLSearchParams()) {
  const period = platformHealthPeriod(params.get?.('period') || '24h');
  const [database, backup] = await Promise.all([
    checkDatabaseHealth(),
    platformBackupStatus()
  ]);
  return normalizePortuguesePayload({
    generated_at: new Date().toISOString(),
    period: period.label,
    metrics: await platformTechnicalMetrics(period, database, backup)
  });
}

async function platformOperationalAlertsEndpoint(params = new URLSearchParams()) {
  const period = platformHealthPeriod(params.get?.('period') || '24h');
  const [database, backup, operationalLogs] = await Promise.all([
    checkDatabaseHealth(),
    platformBackupStatus(),
    listOperationalLogs(period.since, params)
  ]);
  const metrics = await platformTechnicalMetrics(period, database, backup);
  const config = await platformConfigChecklist();
  const statuses = [
    apiHealthStatus(metrics),
    database,
    platformStatus('auth', 'Autenticação', config.items.find((item) => item.key === 'cookie_secret')?.ok === false ? 'attention' : 'healthy', 'Sessões administrativas e cookies operando.', null),
    await billingHealthStatus(),
    webhookHealthStatus(operationalLogs),
    backupHealthStatus(backup),
    jobsHealthStatus(),
    await storageHealthStatus(UPLOAD_DIR, 'storage', 'Storage/uploads'),
    sslDomainHealthStatus(),
    await smtpHealthStatus()
  ];
  return normalizePortuguesePayload({
    generated_at: new Date().toISOString(),
    period: period.label,
    alerts: await platformHealthAlerts({ statuses, metrics, config, backup, operationalLogs })
  });
}

async function platformOperationalLogs(params = new URLSearchParams()) {
  const period = platformHealthPeriod(params.get?.('period') || '24h');
  return normalizePortuguesePayload({
    generated_at: new Date().toISOString(),
    period: period.label,
    logs: await listOperationalLogs(period.since, params)
  });
}

function platformHealthPeriod(value) {
  const key = ['7d', '30d'].includes(String(value)) ? String(value) : '24h';
  const days = key === '30d' ? 30 : key === '7d' ? 7 : 1;
  return {
    key,
    label: key === '24h' ? 'Últimas 24h' : key === '7d' ? 'Últimos 7 dias' : 'Últimos 30 dias',
    since: Date.now() - days * 86400000
  };
}

function recordRequestMetric(entry) {
  if (!entry?.pathname) return;
  requestMetrics.push({
    ...entry,
    created_at: Date.now()
  });
  if (requestMetrics.length > MAX_REQUEST_METRICS) requestMetrics.splice(0, requestMetrics.length - MAX_REQUEST_METRICS);
}

function platformMetricsSnapshot(period) {
  const rows = requestMetrics.filter((entry) => entry.created_at >= period.since);
  const apiRows = rows.filter((entry) => entry.pathname.startsWith('/api/'));
  const checkoutRows = rows.filter((entry) => entry.pathname === '/api/orders');
  const orderMutationRows = rows.filter((entry) => /^\/api\/admin\/orders/.test(entry.pathname) && ['POST', 'PUT', 'PATCH'].includes(entry.method));
  const stats = (entries) => latencyStats(entries.map((entry) => entry.duration_ms));
  return {
    period: period.label,
    api: {
      ...stats(apiRows),
      requests: apiRows.length,
      errors_5xx: apiRows.filter((entry) => entry.status >= 500).length,
      requests_per_minute: requestsPerMinute(apiRows, period)
    },
    database: { average_ms: null, p95_ms: null, p99_ms: null, source: 'verificação atual no card de banco' },
    checkout: { ...stats(checkoutRows), requests: checkoutRows.length },
    order_mutations: { ...stats(orderMutationRows), requests: orderMutationRows.length }
  };
}

async function platformTechnicalMetrics(period, databaseStatus = null, backup = null) {
  const metrics = platformMetricsSnapshot(period);
  const [uploadsDisk, backupsDisk] = await Promise.all([
    diskUsageForPath(UPLOAD_DIR).catch(() => null),
    diskUsageForPath(BACKUP_DIR).catch(() => null)
  ]);
  metrics.database = {
    average_ms: databaseStatus?.latency_ms ?? null,
    p95_ms: databaseStatus?.latency_ms ?? null,
    p99_ms: databaseStatus?.latency_ms ?? null,
    status: databaseStatus?.status || 'unknown',
    source: 'verificação atual'
  };
  metrics.system = {
    memory: await memorySnapshot(),
    cpu: cpuSnapshot(),
    disk: {
      uploads: uploadsDisk,
      backups: backupsDisk,
      lowest_free_percent: lowestFreePercent([uploadsDisk, backupsDisk])
    },
    uptime_seconds: Math.floor(process.uptime()),
    node: process.version
  };
  metrics.storage = {
    uploads_dir: safeDirectoryLabel(UPLOAD_DIR),
    backups_dir: safeDirectoryLabel(BACKUP_DIR),
    backup_latest_size_bytes: backup?.latest?.size_bytes || 0,
    upload_free_bytes: uploadsDisk?.free_bytes ?? null,
    backup_free_bytes: backupsDisk?.free_bytes ?? null
  };
  return metrics;
}

function requestsPerMinute(rows, period) {
  const minutes = Math.max(1, Math.ceil((Date.now() - period.since) / 60000));
  return Number((rows.length / minutes).toFixed(2));
}

async function memorySnapshot() {
  const memory = process.memoryUsage();
  const heap = v8.getHeapStatistics();
  const meminfo = await linuxMeminfo();
  const swapTotal = meminfo.SwapTotal || 0;
  const swapFree = meminfo.SwapFree || 0;
  const swapUsed = Math.max(0, swapTotal - swapFree);
  const heapLimit = Number(heap.heap_size_limit || 0);
  return {
    rss_bytes: memory.rss,
    heap_used_bytes: memory.heapUsed,
    heap_total_bytes: memory.heapTotal,
    heap_limit_bytes: heapLimit,
    heap_used_percent: heapLimit ? Number(((memory.heapUsed / heapLimit) * 100).toFixed(1)) : null,
    external_bytes: memory.external,
    system_total_bytes: os.totalmem(),
    system_free_bytes: os.freemem(),
    system_used_percent: os.totalmem() ? Number((((os.totalmem() - os.freemem()) / os.totalmem()) * 100).toFixed(1)) : null,
    swap_total_bytes: swapTotal,
    swap_free_bytes: swapFree,
    swap_used_bytes: swapUsed,
    swap_used_percent: swapTotal ? Number(((swapUsed / swapTotal) * 100).toFixed(1)) : null
  };
}

async function linuxMeminfo() {
  if (process.platform !== 'linux') return {};
  const content = await readFile('/proc/meminfo', 'utf8').catch(() => '');
  const data = {};
  for (const line of content.split('\n')) {
    const match = line.match(/^([A-Za-z_()]+):\s+(\d+)\s+kB/i);
    if (match) data[match[1]] = Number(match[2]) * 1024;
  }
  return data;
}

function cpuSnapshot() {
  const cpus = os.cpus() || [];
  const load = os.loadavg?.() || [0, 0, 0];
  const cores = cpus.length || 1;
  return {
    cores,
    load_1m: Number(load[0] || 0),
    load_5m: Number(load[1] || 0),
    load_15m: Number(load[2] || 0),
    load_percent: load[0] ? Number(Math.min(100, (load[0] / cores) * 100).toFixed(1)) : null
  };
}

async function diskUsageForPath(directory) {
  await mkdir(directory, { recursive: true });
  const info = await statfs(directory);
  const total = Number(info.blocks || 0) * Number(info.bsize || 0);
  const free = Number(info.bavail || info.bfree || 0) * Number(info.bsize || 0);
  return {
    path: safeDirectoryLabel(directory),
    total_bytes: total || null,
    free_bytes: free || null,
    used_bytes: total && free !== null ? total - free : null,
    free_percent: total ? Number(((free / total) * 100).toFixed(1)) : null
  };
}

function lowestFreePercent(rows = []) {
  const values = rows.map((row) => row?.free_percent).filter((value) => Number.isFinite(value));
  return values.length ? Math.min(...values) : null;
}

function safeDirectoryLabel(directory) {
  return path.basename(directory) ? `.../${path.basename(directory)}` : 'configurado';
}

function latencyStats(values = []) {
  const clean = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!clean.length) return { average_ms: null, p95_ms: null, p99_ms: null };
  const average = Math.round(clean.reduce((sum, value) => sum + value, 0) / clean.length);
  return {
    average_ms: average,
    p95_ms: percentile(clean, 0.95),
    p99_ms: percentile(clean, 0.99)
  };
}

function percentile(values, ratio) {
  if (!values.length) return null;
  const index = Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1);
  return Math.round(values[index]);
}

function apiHealthStatus(metrics) {
  const api = metrics?.api || {};
  if (Number(api.errors_5xx || 0) >= 5) return platformStatus('api', 'Aplicação/API', 'error', `${Number(api.errors_5xx || 0)} erro(s) 5xx no período.`, api.average_ms);
  if (Number(api.p95_ms || 0) > 1500) return platformStatus('api', 'Aplicação/API', 'attention', `P95 alto: ${api.p95_ms} ms.`, api.average_ms);
  return platformStatus('api', 'Aplicação/API', 'healthy', `Servidor ativo desde ${new Date(Date.now() - process.uptime() * 1000).toLocaleString('pt-BR')}.`, api.average_ms);
}

async function checkDatabaseHealth() {
  const startedAt = performance.now();
  try {
    await dbRequest('GET', 'companies', { select: 'id', limit: '1' });
    const duration = Math.round(performance.now() - startedAt);
    return platformStatus('database', 'Banco PostgreSQL', duration > 800 ? 'attention' : 'healthy', `Resposta em ${duration} ms.`, duration);
  } catch (error) {
    return platformStatus('database', 'Banco PostgreSQL', 'error', error.message || 'Banco indisponível.', null);
  }
}

function platformStatus(key, label, status, message, latencyMs = null) {
  return {
    key,
    label,
    status,
    message,
    latency_ms: latencyMs,
    checked_at: new Date().toISOString()
  };
}

async function billingHealthStatus() {
  const billing = await getPlatformBillingSettings().catch(() => null);
  const configured = Boolean(billing?.is_active && billing?.has_api_key);
  return platformStatus(
    'billing',
    'Billing/Abacate Pay',
    configured ? 'healthy' : 'attention',
    configured ? `Provider e API key configurados (${billing.source}).` : 'API key de billing não configurada; configure Billing > Configuração Abacate Pay.',
    null
  );
}

function jobsHealthStatus() {
  const backupScript = existsSync(path.join(__dirname, 'scripts', 'backup-postgres.mjs'));
  const cleanupScript = existsSync(path.join(__dirname, 'scripts', 'cleanup-inactive-trials.mjs'));
  if (!backupScript || !cleanupScript) return platformStatus('jobs', 'Jobs/rotinas', 'attention', 'Alguma rotina operacional não foi encontrada.', null);
  return platformStatus('jobs', 'Jobs/rotinas', 'healthy', 'Rotinas de backup e limpeza de trials disponíveis.', null);
}

function sslDomainHealthStatus() {
  const appUrl = process.env.PUBLIC_APP_URL || process.env.APP_URL || '';
  if (!appUrl) return platformStatus('ssl', 'SSL/domínio', 'unknown', 'APP_URL/PUBLIC_APP_URL não configurada.', null);
  try {
    const parsed = new URL(appUrl);
    if (parsed.protocol !== 'https:') return platformStatus('ssl', 'SSL/domínio', 'attention', 'URL pública não está em HTTPS.', null);
    return platformStatus('ssl', 'SSL/domínio', 'healthy', `HTTPS configurado para ${parsed.hostname}.`, null);
  } catch {
    return platformStatus('ssl', 'SSL/domínio', 'attention', 'URL pública inválida.', null);
  }
}

async function smtpHealthStatus() {
  const smtp = await getPlatformSmtpSettings().catch(() => null);
  const configured = Boolean(smtp?.is_active && smtp?.host && smtp?.from_email && smtp?.has_password);
  const source = smtp?.source === 'env' ? 'ambiente' : 'Platform';
  const lastTest = smtp?.last_test_status
    ? ` Último teste: ${smtp.last_test_status}${smtp.last_test_at ? ` em ${new Date(smtp.last_test_at).toLocaleString('pt-BR')}` : ''}.`
    : '';
  return platformStatus(
    'smtp',
    'SMTP/e-mail',
    configured ? 'healthy' : 'attention',
    configured ? `SMTP ativo via ${source}.${lastTest}` : 'SMTP não está ativo ou está incompleto.',
    null
  );
}

async function smtpServiceStatus() {
  const smtp = await getPlatformSmtpSettings().catch(() => null);
  const configured = Boolean(smtp?.is_active && smtp?.host && smtp?.from_email && smtp?.has_password);
  const missing = [];
  if (!smtp?.is_active) missing.push('ativo');
  if (!smtp?.host) missing.push('host');
  if (!smtp?.from_email) missing.push('remetente');
  if (!smtp?.has_password) missing.push('senha/token');
  return {
    status: configured ? 'healthy' : 'attention',
    source: smtp?.source || 'database',
    host: smtp?.host ? maskConfigValue(`smtp://${smtp.host}`, 'url') : '',
    port: smtp?.port || 587,
    from_email: smtp?.from_email || '',
    has_password: Boolean(smtp?.has_password),
    is_active: Boolean(smtp?.is_active),
    last_test_status: smtp?.last_test_status || null,
    last_test_at: smtp?.last_test_at || null,
    message: configured
      ? `SMTP ativo para ${smtp.from_email}.`
      : `Configuração incompleta: ${missing.join(', ') || 'dados ausentes'}.`
  };
}

async function getPlatformBillingSettings() {
  const rows = await dbRequest('GET', 'platform_billing_settings', {
    select: '*',
    order: 'created_at.desc',
    limit: '1'
  }).catch(() => []);
  const row = rows[0] || null;
  if (!row) {
    return publicPlatformBillingSettings({
      provider: PLATFORM_BILLING_PROVIDER || 'abacatepay',
      api_key: PLATFORM_BILLING_API_KEY,
      webhook_secret: PLATFORM_BILLING_WEBHOOK_SECRET,
      is_active: Boolean(PLATFORM_BILLING_API_KEY),
      source: PLATFORM_BILLING_API_KEY ? 'env' : 'empty',
      metadata: {}
    });
  }
  return publicPlatformBillingSettings(row);
}

async function privatePlatformBillingSettings() {
  const rows = await dbRequest('GET', 'platform_billing_settings', {
    select: '*',
    order: 'created_at.desc',
    limit: '1'
  }).catch(() => []);
  const row = rows[0] || null;
  if (!row) {
    return {
      provider: PLATFORM_BILLING_PROVIDER || 'abacatepay',
      api_key: PLATFORM_BILLING_API_KEY,
      webhook_secret: PLATFORM_BILLING_WEBHOOK_SECRET,
      is_active: Boolean(PLATFORM_BILLING_API_KEY),
      source: PLATFORM_BILLING_API_KEY ? 'env' : 'empty',
      public_url: cleanText(process.env.PUBLIC_APP_URL || process.env.APP_URL || '')
    };
  }
  const provider = cleanSlug(row.provider || PLATFORM_BILLING_PROVIDER || 'abacatepay');
  return {
    id: row.id || null,
    provider,
    api_key: row.is_active === false ? '' : (row.api_key || PLATFORM_BILLING_API_KEY || ''),
    webhook_secret: row.is_active === false ? '' : (row.webhook_secret || PLATFORM_BILLING_WEBHOOK_SECRET || ''),
    is_active: row.is_active === true,
    public_url: cleanText(row.public_url || process.env.PUBLIC_APP_URL || process.env.APP_URL || ''),
    source: 'database'
  };
}

async function updatePlatformBillingSettings(req, admin, data = {}) {
  await assertPlatformAdminPassword(req, admin, data.password || data.superadmin_password || '');
  const currentRows = await dbRequest('GET', 'platform_billing_settings', {
    select: '*',
    order: 'created_at.desc',
    limit: '1'
  }).catch((error) => {
    throw httpError(500, 'Tabela de billing não encontrada. Execute as migrations antes de configurar Abacate Pay.', { cause: error.message });
  });
  const current = currentRows[0] || null;
  const provider = cleanSlug(data.provider || 'abacatepay');
  if (!['abacatepay', 'mock'].includes(provider)) throw httpError(422, 'Provedor de billing não suportado.');
  const apiKey = String(data.api_key || data.apiKey || '').trim();
  const webhookSecret = String(data.webhook_secret || data.webhookSecret || '').trim();
  const publicUrl = cleanText(data.public_url || data.publicUrl || process.env.PUBLIC_APP_URL || process.env.APP_URL || '').slice(0, 500) || null;
  const payload = {
    provider,
    ...(apiKey ? { api_key: apiKey } : {}),
    ...(webhookSecret ? { webhook_secret: webhookSecret } : {}),
    public_url: publicUrl,
    is_active: data.is_active === true || data.is_active === 'true',
    metadata: { updated_by: admin.id },
    updated_at: new Date().toISOString()
  };
  if (payload.is_active && provider === 'abacatepay' && !apiKey && !current?.api_key && !PLATFORM_BILLING_API_KEY) {
    throw httpError(422, 'Informe a API key da Abacate Pay para ativar o checkout.');
  }
  const [saved] = current
    ? await dbRequest('PATCH', 'platform_billing_settings', { id: `eq.${current.id}` }, payload, ['Prefer: return=representation'])
    : await dbRequest('POST', 'platform_billing_settings', {}, { ...payload, created_at: new Date().toISOString() }, ['Prefer: return=representation']);
  await audit('platform.billing.config.update', {
    req,
    actor_admin_id: admin.id,
    entity_type: 'platform_billing_settings',
    entity_id: saved.id,
    severity: 'warning',
    before_data: current ? publicPlatformBillingSettings(current) : null,
    after_data: publicPlatformBillingSettings(saved)
  });
  return publicPlatformBillingSettings(saved);
}

function publicPlatformBillingSettings(row = {}) {
  const origin = cleanText(row.public_url || process.env.PUBLIC_APP_URL || process.env.APP_URL || '').replace(/\/+$/, '');
  const provider = cleanSlug(row.provider || PLATFORM_BILLING_PROVIDER || 'abacatepay') || 'abacatepay';
  const apiKey = row.api_key || PLATFORM_BILLING_API_KEY || '';
  const webhookSecret = row.webhook_secret || PLATFORM_BILLING_WEBHOOK_SECRET || '';
  return {
    id: row.id || null,
    provider,
    is_active: row.is_active === true,
    has_api_key: Boolean(apiKey),
    api_key_masked: apiKey ? maskEmailOrToken(apiKey) : '',
    has_webhook_secret: Boolean(webhookSecret),
    webhook_secret_masked: webhookSecret ? maskEmailOrToken(webhookSecret) : '',
    webhook_url: origin ? `${origin}/api/billing/webhook?provider=${encodeURIComponent(provider)}` : '/api/billing/webhook?provider=abacatepay',
    public_url: origin || '',
    source: row.source || 'database',
    last_test_status: row.last_test_status || null,
    last_test_at: row.last_test_at || null,
    last_test_message: row.last_test_message || '',
    updated_at: row.updated_at || null
  };
}

async function testPlatformBillingSettings(req, admin) {
  const config = await privatePlatformBillingSettings();
  if (!config.is_active || !config.api_key) throw httpError(422, 'Abacate Pay não está ativo ou não possui API key configurada.');
  if (config.provider === 'mock') {
    await markPlatformBillingTest('success', 'Provider mock ativo.');
    return { ok: true, message: 'Provider mock ativo para testes internos.' };
  }
  if (config.provider !== 'abacatepay') throw httpError(422, 'Provedor de billing não suportado.');
  try {
    await providerFetch(`${ABACATEPAY_API_BASE}/store/get`, {
      method: 'GET',
      token: config.api_key
    });
    await markPlatformBillingTest('success', 'Conexão com Abacate Pay validada.');
    await audit('platform.billing.config.test', {
      req,
      actor_admin_id: admin.id,
      entity_type: 'platform_billing_settings',
      severity: 'info',
      after_data: { status: 'success', provider: config.provider }
    });
    return { ok: true, message: 'Conexão com Abacate Pay validada com sucesso.' };
  } catch (error) {
    const message = error.message || 'Falha ao testar Abacate Pay.';
    await markPlatformBillingTest('failed', message).catch(() => {});
    await audit('platform.billing.config.test', {
      req,
      actor_admin_id: admin.id,
      entity_type: 'platform_billing_settings',
      severity: 'warning',
      after_data: { status: 'failed', provider: config.provider, message: safeCommandOutput(message) }
    });
    throw httpError(502, 'Não foi possível conectar na Abacate Pay. Verifique a API key e o ambiente.');
  }
}

async function markPlatformBillingTest(status, message = '') {
  const rows = await dbRequest('GET', 'platform_billing_settings', { select: 'id', order: 'created_at.desc', limit: '1' }).catch(() => []);
  if (!rows[0]) return;
  await dbRequest('PATCH', 'platform_billing_settings', { id: `eq.${rows[0].id}` }, {
    last_test_status: status,
    last_test_at: new Date().toISOString(),
    last_test_message: cleanText(message).slice(0, 500),
    updated_at: new Date().toISOString()
  }).catch(() => {});
}

async function getPlatformSmtpSettings() {
  const rows = await dbRequest('GET', 'platform_smtp_settings', {
    select: '*',
    order: 'created_at.desc',
    limit: '1'
  }).catch(() => []);
  const row = rows[0] || null;
  if (!row) {
    return publicSmtpSettings({
      host: process.env.SMTP_HOST || '',
      port: Number(process.env.SMTP_PORT || 587),
      username: process.env.SMTP_USER || '',
      password_token: process.env.SMTP_PASS || process.env.SMTP_TOKEN || '',
      from_email: process.env.SMTP_FROM_EMAIL || '',
      from_name: process.env.SMTP_FROM_NAME || '',
      reply_to: process.env.SMTP_REPLY_TO || '',
      use_tls: parseBoolean(process.env.SMTP_TLS, true),
      is_active: Boolean(process.env.SMTP_HOST || process.env.SMTP_URL),
      source: process.env.SMTP_HOST || process.env.SMTP_URL ? 'env' : 'empty'
    });
  }
  return publicSmtpSettings(row);
}

async function updatePlatformSmtpSettings(req, admin, data = {}) {
  const currentRows = await dbRequest('GET', 'platform_smtp_settings', {
    select: '*',
    order: 'created_at.desc',
    limit: '1'
  }).catch((error) => {
    throw httpError(500, 'Tabela de SMTP não encontrada. Execute as migrations antes de configurar SMTP.', { cause: error.message });
  });
  const current = currentRows[0] || null;
  const password = String(data.password_token || data.password || '').trim();
  const rawUsername = cleanText(data.username || '').slice(0, 255);
  const username = rawUsername.includes('***') && current?.username ? current.username : rawUsername;
  const payload = {
    host: cleanText(data.host || '').slice(0, 255) || null,
    port: clampNumber(Number(data.port || 587), 1, 65535),
    username: username || null,
    ...(password ? { password_token: password } : {}),
    from_email: cleanEmail(data.from_email || '') || null,
    from_name: cleanText(data.from_name || '').slice(0, 180) || null,
    reply_to: cleanEmail(data.reply_to || '') || null,
    use_tls: data.use_tls !== false,
    is_active: data.is_active === true || data.is_active === 'true',
    metadata: { updated_by: admin.id },
    updated_at: new Date().toISOString()
  };
  if (!payload.host) throw httpError(422, 'Informe o host SMTP.');
  if (!payload.from_email) throw httpError(422, 'Informe o remetente padrão.');
  const [saved] = current
    ? await dbRequest('PATCH', 'platform_smtp_settings', { id: `eq.${current.id}` }, payload, ['Prefer: return=representation'])
    : await dbRequest('POST', 'platform_smtp_settings', {}, { ...payload, created_at: new Date().toISOString() }, ['Prefer: return=representation']);
  await audit('platform.smtp.update', {
    req,
    actor_admin_id: admin.id,
    entity_type: 'platform_smtp_settings',
    entity_id: saved.id,
    severity: 'warning',
    before_data: current ? publicSmtpSettings(current) : null,
    after_data: publicSmtpSettings(saved)
  });
  return publicSmtpSettings(saved);
}

function publicSmtpSettings(row = {}) {
  return {
    id: row.id || null,
    host: row.host || '',
    port: Number(row.port || 587),
    username: row.username ? maskEmailOrToken(row.username) : '',
    has_password: Boolean(row.password_token || process.env.SMTP_PASS || process.env.SMTP_TOKEN),
    from_email: row.from_email || '',
    from_name: row.from_name || '',
    reply_to: row.reply_to || '',
    use_tls: row.use_tls !== false,
    is_active: row.is_active === true,
    last_test_status: row.last_test_status || null,
    last_test_at: row.last_test_at || null,
    source: row.source || 'database',
    updated_at: row.updated_at || null
  };
}

function privateSmtpSettings(row = {}) {
  const rawUsername = String(row.username || process.env.SMTP_USER || '');
  const safeUsername = rawUsername.includes('***') ? (row.from_email || process.env.SMTP_FROM_EMAIL || '') : rawUsername;
  return {
    host: row.host || process.env.SMTP_HOST || '',
    port: Number(row.port || process.env.SMTP_PORT || 587),
    username: safeUsername,
    password: row.password_token || process.env.SMTP_PASS || process.env.SMTP_TOKEN || '',
    from_email: row.from_email || process.env.SMTP_FROM_EMAIL || '',
    from_name: row.from_name || process.env.SMTP_FROM_NAME || '',
    reply_to: row.reply_to || process.env.SMTP_REPLY_TO || '',
    use_tls: row.use_tls !== false,
    is_active: row.is_active === true || Boolean(process.env.SMTP_HOST || process.env.SMTP_URL)
  };
}

function maskEmailOrToken(value = '') {
  const text = String(value || '');
  if (!text) return '';
  if (text.includes('@')) {
    const [name, domain] = text.split('@');
    return `${name.slice(0, 2)}***@${domain}`;
  }
  return text.length <= 4 ? '****' : `${text.slice(0, 2)}***${text.slice(-2)}`;
}

async function sendPlatformSmtpTest(req, admin, data = {}) {
  const target = cleanEmail(data.email || admin.email || '');
  if (!target) throw httpError(422, 'Informe um e-mail válido para teste.');
  try {
    await sendPlatformEmail({
      to: target,
      subject: 'Teste de envio SMTP do TáPronto',
      body: `Olá ${admin.name || 'Admin Master'}, este é um teste de SMTP do Platform.`
    });
    await markSmtpTest('success');
    await audit('platform.smtp.test', {
      req,
      actor_admin_id: admin.id,
      entity_type: 'platform_smtp_settings',
      severity: 'info',
      after_data: { status: 'success', target_email: maskEmailOrToken(target) }
    });
    return { ok: true, message: 'E-mail de teste enviado com sucesso.' };
  } catch (error) {
    await markSmtpTest('failed').catch(() => {});
    await audit('platform.smtp.test', {
      req,
      actor_admin_id: admin.id,
      entity_type: 'platform_smtp_settings',
      severity: 'warning',
      after_data: { status: 'failed', target_email: maskEmailOrToken(target), message: error.message || 'Falha SMTP' }
    });
    throw httpError(502, 'Não foi possível enviar o e-mail de teste. Verifique host, porta, TLS, usuário e senha.');
  }
}

async function markSmtpTest(status) {
  const rows = await dbRequest('GET', 'platform_smtp_settings', { select: 'id', order: 'created_at.desc', limit: '1' }).catch(() => []);
  if (!rows[0]) return;
  await dbRequest('PATCH', 'platform_smtp_settings', { id: `eq.${rows[0].id}` }, {
    last_test_status: status,
    last_test_at: new Date().toISOString()
  }, ['Prefer: return=minimal']).catch(() => {});
}

const PLATFORM_SYSTEM_EMAIL_RECIPIENT = 'lucasbulow@hotmail.com';
const PLATFORM_SYSTEM_EMAIL_TEMPLATE_KEYS = new Set([
  'backup_failed',
  'webhook_failed',
  'smtp_failed',
  'critical_support_ticket',
  'delinquent_support_ticket',
  'cancellation_received',
  'account_created_not_published',
  'store_published_no_orders',
  'internal_payment_refused',
  'internal_account_suspended',
  'internal_trial_expiring',
  'internal_trial_expired',
  'internal_plan_changed'
]);

function platformEmailRecipient(templateKey, fallbackTo) {
  if (PLATFORM_SYSTEM_EMAIL_TEMPLATE_KEYS.has(String(templateKey || ''))) {
    return PLATFORM_SYSTEM_EMAIL_RECIPIENT;
  }
  return cleanEmail(fallbackTo || '');
}

async function sendPlatformEmail({ to, subject, body, templateKey }) {
  const rows = await dbRequest('GET', 'platform_smtp_settings', { select: '*', order: 'created_at.desc', limit: '1' }).catch(() => []);
  const settings = privateSmtpSettings(rows[0] || {});
  if (!settings.is_active || !settings.host || !settings.from_email) throw new Error('SMTP não configurado.');
  const recipient = platformEmailRecipient(templateKey, to);
  if (!recipient) throw new Error('Destinatário de e-mail não informado.');
  const message = buildSmtpMessage({ to: recipient, subject, body, settings });
  await smtpSend(settings, message, recipient);
}

function buildSmtpMessage({ to, subject, body, settings }) {
  const fromName = settings.from_name || 'Suporte TáPronto';
  const ehloDomain = process.env.SMTP_EHLO_DOMAIN || 'cardapio.local';
  const plainBody = String(body || '').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  const headers = [
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@${ehloDomain}>`,
    `From: ${encodeMailAddress(fromName, settings.from_email)}`,
    `To: ${to}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    `Reply-To: ${settings.reply_to || settings.from_email}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    'X-Mailer: TáPronto Platform'
  ];
  return `${headers.join('\r\n')}\r\n\r\n${Buffer.from(plainBody, 'utf8').toString('base64')}\r\n`;
}

function encodeMailAddress(name, email) {
  return `${encodeMimeHeader(name)} <${email}>`;
}

function encodeMimeHeader(value) {
  const text = String(value || '');
  return /[^\x20-\x7E]/.test(text) ? `=?UTF-8?B?${Buffer.from(text).toString('base64')}?=` : text;
}

function smtpSend(settings, message, to) {
  const directTls = Number(settings.port) === 465;
  const useStartTls = settings.use_tls === true && !directTls;
  return new Promise((resolve, reject) => {
    let socket = directTls
      ? tls.connect({ host: settings.host, port: settings.port, servername: settings.host, rejectUnauthorized: false })
      : net.connect({ host: settings.host, port: settings.port });
    let buffer = '';
    let settled = false;
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error('Tempo esgotado no SMTP.'));
    }, 15000);
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.destroy();
      if (error) reject(error);
      else resolve(true);
    };
    const upgradeToTls = () => new Promise((res, rej) => {
      const secureSocket = tls.connect({
        socket,
        servername: settings.host,
        rejectUnauthorized: false
      });
      secureSocket.once('secureConnect', () => {
        socket = secureSocket;
        socket.once('error', finish);
        buffer = '';
        res();
      });
      secureSocket.once('error', rej);
    });
    const read = (expected) => new Promise((res, rej) => {
      const onData = (chunk) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split(/\r?\n/).filter(Boolean);
        const last = lines[lines.length - 1] || '';
        if (/^\d{3} /.test(last)) {
          socket.off('data', onData);
          const code = Number(last.slice(0, 3));
          if (!expected.includes(code)) rej(new Error(`SMTP respondeu ${code}.`));
          else {
            buffer = '';
            res(last);
          }
        }
      };
      socket.on('data', onData);
      socket.once('error', rej);
    });
    const write = (line) => socket.write(`${line}\r\n`);
    socket.once('error', (error) => {
      finish(error);
    });
    socket.once(directTls ? 'secureConnect' : 'connect', async () => {
      try {
        await read([220]);
        write(`EHLO ${process.env.SMTP_EHLO_DOMAIN || 'localhost'}`);
        await read([250]);
        if (useStartTls) {
          write('STARTTLS');
          await read([220]);
          await upgradeToTls();
          write(`EHLO ${process.env.SMTP_EHLO_DOMAIN || 'localhost'}`);
          await read([250]);
        }
        if (settings.username && settings.password) {
          write('AUTH LOGIN');
          await read([334]);
          write(Buffer.from(settings.username).toString('base64'));
          await read([334]);
          write(Buffer.from(settings.password).toString('base64'));
          await read([235]);
        }
        write(`MAIL FROM:<${settings.from_email}>`);
        await read([250]);
        write(`RCPT TO:<${to}>`);
        await read([250, 251]);
        write('DATA');
        await read([354]);
        socket.write(`${message.replace(/\r?\n\./g, '\r\n..')}\r\n.\r\n`);
        await read([250]);
        write('QUIT');
        await read([221, 250]).catch(() => {});
        finish();
      } catch (error) {
        finish(error);
      }
    });
  });
}

const EMAIL_TEMPLATE_DEFINITIONS = [
  { key: 'account_activation', name: 'Ativação de conta', subject: 'Ative sua conta no TáPronto', body: 'Olá {{customer_name}},\n\nSua loja {{store_name}} foi criada no TáPronto.\n\nPara liberar o acesso ao painel, ative sua conta pelo link abaixo:\n{{activation_url}}\n\nEste link expira em {{due_date}}.\n\nSe você não criou essa conta, ignore este e-mail.' },
  { key: 'welcome', name: 'Boas-vindas', subject: 'Bem-vindo ao {{store_name}}', body: 'Olá {{customer_name}},\n\nSua loja {{store_name}} foi criada com sucesso.\n\nAcesse o painel para concluir a configuração, cadastrar produtos e publicar seu cardápio:\n{{dashboard_url}}\n\nConte com o suporte TáPronto sempre que precisar.' },
  { key: 'password_recovery', name: 'Recuperação de senha', subject: 'Recupere sua senha de acesso', body: 'Olá {{customer_name}},\n\nRecebemos uma solicitação para recuperar o acesso ao painel da sua loja.\n\nClique no link abaixo para criar uma nova senha:\n{{reset_url}}\n\nEste link expira em {{due_date}}.\n\nSe você não solicitou isso, ignore este e-mail.' },
  { key: 'onboarding_incomplete', name: 'Onboarding incompleto', subject: 'Finalize a configuração da sua loja', body: 'Olá {{company_name}},\n\nSua loja {{store_name}} ainda não está totalmente configurada.\n\nFinalize o onboarding para ajustar horários, pagamentos, entrega e cardápio inicial:\n{{dashboard_url}}\n\nIsso ajuda sua loja a ficar pronta para receber pedidos sem retrabalho.' },
  { key: 'store_published', name: 'Loja publicada', subject: 'Seu cardápio já está publicado', body: 'Olá {{company_name}},\n\nBoa notícia: o cardápio da {{store_name}} foi publicado com sucesso.\n\nVocê já pode compartilhar o link com seus clientes:\n{{cardapio_url}}\n\nAcompanhe os pedidos pelo painel:\n{{dashboard_url}}' },
  { key: 'first_order_received', name: 'Primeiro pedido recebido', subject: 'Seu primeiro pedido chegou', body: 'Olá {{company_name}},\n\nA loja {{store_name}} recebeu o primeiro pedido pelo cardápio digital.\n\nPedido: {{order_id}}\nValor: {{order_total}}\n\nAcesse o painel para acompanhar o preparo, entrega e conclusão:\n{{dashboard_url}}' },
  { key: 'trial_ending', name: 'Trial acabando', subject: 'Seu teste grátis termina em breve', body: 'Olá {{company_name}},\n\nSeu período de teste do plano {{plan_name}} termina em {{due_date}}.\n\nPara manter o cardápio ativo e continuar recebendo pedidos, escolha um plano no painel:\n{{payment_url}}' },
  { key: 'trial_expired', name: 'Trial encerrado', subject: 'Seu teste grátis terminou', body: 'Olá {{company_name}},\n\nO período de teste da loja {{store_name}} terminou.\n\nPara continuar usando o cardápio, pedidos e recursos do painel, contrate um plano mensal:\n{{payment_url}}\n\nSe precisar de ajuda para escolher o melhor plano, fale com o suporte.' },
  { key: 'payment_pending', name: 'Pagamento pendente', subject: 'Pagamento pendente do plano {{plan_name}}', body: 'Olá {{company_name}},\n\nIdentificamos uma pendência no pagamento do plano {{plan_name}}.\n\nRegularize pelo painel para evitar bloqueios no cardápio e nos recursos da loja:\n{{payment_url}}' },
  { key: 'payment_approved', name: 'Pagamento aprovado', subject: 'Pagamento aprovado', body: 'Olá {{company_name}},\n\nO pagamento do plano {{plan_name}} foi aprovado.\n\nSua assinatura está ativa e os recursos do plano já podem ser usados no painel:\n{{dashboard_url}}' },
  { key: 'payment_refused', name: 'Pagamento recusado', subject: 'Não foi possível aprovar seu pagamento', body: 'Olá {{company_name}},\n\nO pagamento do plano {{plan_name}} não foi aprovado.\n\nConfira os dados de pagamento ou tente novamente pelo painel:\n{{payment_url}}\n\nSua assinatura pode entrar em período de tolerância até a regularização.' },
  { key: 'account_suspended', name: 'Conta suspensa', subject: 'Sua conta foi suspensa', body: 'Olá {{company_name}},\n\nSua conta foi suspensa temporariamente.\n\nAcesse o painel para regularizar a assinatura ou fale com o suporte:\n{{payment_url}}' },
  { key: 'account_reactivated', name: 'Conta reativada', subject: 'Sua conta foi reativada', body: 'Olá {{company_name}},\n\nSua conta foi reativada e a loja {{store_name}} já pode voltar a operar.\n\nAcesse o painel para conferir o status da assinatura e continuar recebendo pedidos:\n{{dashboard_url}}' },
  { key: 'support_replied', name: 'Suporte respondeu', subject: 'O suporte respondeu seu chamado', body: 'Olá {{customer_name}},\n\nA equipe de suporte respondeu seu chamado.\n\nAcompanhe a conversa e envie uma nova mensagem pelo painel:\n{{support_url}}\n\nSe o problema já foi resolvido, você pode encerrar o atendimento por lá.' },
  { key: 'support_ticket_closed', name: 'Chamado encerrado', subject: 'Seu chamado foi encerrado', body: 'Olá {{customer_name}},\n\nO chamado "{{ticket_subject}}" foi encerrado pela equipe de suporte.\n\nSe precisar continuar o atendimento, acesse o histórico e envie uma nova mensagem:\n{{support_url}}\n\nObrigado pelo retorno.' },
  { key: 'account_created_not_published', name: 'Conta sem publicação', subject: 'Sua loja ainda não foi publicada', body: 'Olá {{company_name}},\n\nPercebemos que sua conta foi criada, mas o cardápio da {{store_name}} ainda não está publicado.\n\nPublique sua loja para começar a divulgar o link e receber pedidos:\n{{dashboard_url}}\n\nSe quiser, podemos ajudar nos primeiros ajustes.' },
  { key: 'store_published_no_orders', name: 'Loja publicada sem pedidos', subject: 'Vamos ajudar sua loja a receber pedidos', body: 'Olá {{company_name}},\n\nSeu cardápio já está publicado, mas ainda não encontramos pedidos recentes na {{store_name}}.\n\nConfira produtos, formas de pagamento, WhatsApp e compartilhe o link com seus clientes:\n{{cardapio_url}}\n\nAcesse o painel para revisar tudo:\n{{dashboard_url}}' },
  { key: 'plan_limit_warning', name: 'Limite do plano próximo', subject: 'Sua loja está perto do limite do plano', body: 'Olá {{company_name}},\n\nA loja {{store_name}} está perto do limite de {{limit_name}} do plano {{plan_name}}.\n\nUso atual: {{usage_count}}\nLimite: {{limit_value}}\n\nPara continuar crescendo sem bloqueios, avalie um upgrade:\n{{payment_url}}' },
  { key: 'plan_upgrade_suggestion', name: 'Sugestão de upgrade', subject: 'Existe um plano melhor para sua operação', body: 'Olá {{company_name}},\n\nPelo uso recente da loja {{store_name}}, o plano {{plan_name}} pode estar limitando sua operação.\n\nUm plano superior pode liberar mais produtos, pedidos, mesas, relatórios e recursos avançados.\n\nConfira as opções no painel:\n{{payment_url}}' },
  { key: 'plan_changed', name: 'Plano alterado', subject: 'Seu plano foi alterado para {{plan_name}}', body: 'Olá {{company_name}},\n\nO plano da loja {{store_name}} foi alterado para {{plan_name}}.\n\nOs recursos e limites já foram atualizados no painel:\n{{dashboard_url}}\n\nConsulte o histórico de cobrança para acompanhar os detalhes.' },
  { key: 'cancellation_received', name: 'Cancelamento recebido', subject: 'Recebemos sua solicitação de cancelamento', body: 'Olá {{company_name}},\n\nRecebemos a solicitação de cancelamento da loja {{store_name}}.\n\nNossa equipe vai revisar a assinatura e confirmar os próximos passos.\n\nSe o cancelamento foi um engano ou se podemos ajudar com algum ajuste, responda este e-mail ou abra um chamado:\n{{support_url}}' },
  { key: 'satisfaction_survey', name: 'Pesquisa de satisfação', subject: 'Como foi sua experiência com o suporte?', body: 'Olá {{customer_name}},\n\nQueremos saber como foi sua experiência com o atendimento.\n\nSe puder, avalie rapidamente o suporte recebido:\n{{rating_url}}\n\nSua opinião ajuda a melhorar o sistema e o atendimento.' },
  { key: 'backup_failed', name: 'Backup falhou', subject: 'Alerta: falha no backup da plataforma', body: 'Alerta operacional do TáPronto.\n\nA rotina de backup falhou ou está atrasada.\n\nResumo: {{error_summary}}\nPeríodo: {{period}}\n\nAcesse o Platform para verificar Saúde e Serviços:\n{{platform_url}}' },
  { key: 'webhook_failed', name: 'Webhook falhou', subject: 'Alerta: webhook com falha', body: 'Alerta operacional do TáPronto.\n\nUm webhook apresentou falha de processamento.\n\nProvedor: {{provider}}\nEvento: {{event_id}}\nResumo: {{error_summary}}\n\nVerifique logs, assinatura do webhook e eventos financeiros no Platform:\n{{platform_url}}' },
  { key: 'smtp_failed', name: 'SMTP com erro', subject: 'Alerta: envio de e-mail com falha', body: 'Alerta operacional do TáPronto.\n\nO SMTP apresentou falha no envio ou teste de entrega.\n\nResumo: {{error_summary}}\n\nAcesse Comunicação no Platform para revisar host, porta, TLS, usuário e senha de app:\n{{platform_url}}' },
  { key: 'critical_support_ticket', name: 'Chamado crítico aberto', subject: 'Chamado crítico aberto no suporte', body: 'Um chamado crítico foi aberto no Platform.\n\nCliente: {{company_name}}\nLoja: {{store_name}}\nAssunto: {{ticket_subject}}\n\nAcesse a central de atendimentos para responder com prioridade:\n{{support_url}}' },
  { key: 'delinquent_support_ticket', name: 'Inadimplente abriu chamado', subject: 'Cliente inadimplente abriu chamado', body: 'Um cliente com pendência financeira abriu chamado.\n\nCliente: {{company_name}}\nLoja: {{store_name}}\nPlano: {{plan_name}}\nAssunto: {{ticket_subject}}\n\nVerifique cobrança, assinatura e atendimento:\n{{support_url}}' },
  { key: 'internal_payment_refused', name: 'Interno: pagamento recusado', subject: 'Alerta interno: pagamento recusado', body: 'Alerta comercial do TáPronto.\n\nUm pagamento foi recusado.\n\nCliente: {{company_name}}\nLoja: {{store_name}}\nPlano: {{plan_name}}\nResumo: {{error_summary}}\n\nVerifique a assinatura, cobrança e eventos do provedor no Platform:\n{{platform_url}}' },
  { key: 'internal_account_suspended', name: 'Interno: conta suspensa', subject: 'Alerta interno: conta suspensa', body: 'Alerta comercial do TáPronto.\n\nUma conta foi suspensa.\n\nCliente: {{company_name}}\nLoja: {{store_name}}\nPlano: {{plan_name}}\nResumo: {{error_summary}}\n\nConfira o motivo, cobrança e histórico do cliente no Platform:\n{{platform_url}}' },
  { key: 'internal_trial_expiring', name: 'Interno: trial vencendo', subject: 'Alerta interno: trial perto do fim', body: 'Alerta comercial do TáPronto.\n\nUm trial está perto do fim.\n\nCliente: {{company_name}}\nLoja: {{store_name}}\nPlano: {{plan_name}}\nVencimento: {{due_date}}\n\nEntre em contato para orientar a contratação:\n{{platform_url}}' },
  { key: 'internal_trial_expired', name: 'Interno: trial encerrado', subject: 'Alerta interno: trial encerrado', body: 'Alerta comercial do TáPronto.\n\nUm trial terminou.\n\nCliente: {{company_name}}\nLoja: {{store_name}}\nPlano: {{plan_name}}\nVencimento: {{due_date}}\n\nVerifique se o cliente deve ser acionado, bloqueado ou convertido:\n{{platform_url}}' },
  { key: 'internal_plan_changed', name: 'Interno: plano alterado', subject: 'Alerta interno: plano alterado', body: 'Alerta comercial do TáPronto.\n\nUm plano foi alterado.\n\nCliente: {{company_name}}\nLoja: {{store_name}}\nNovo plano: {{plan_name}}\nResumo: {{error_summary}}\n\nConfira assinatura, MRR e auditoria no Platform:\n{{platform_url}}' }
];

const EMAIL_TEMPLATE_VARIABLES = [
  'store_name',
  'company_name',
  'customer_name',
  'plan_name',
  'due_date',
  'dashboard_url',
  'reset_url',
  'payment_url',
  'support_url',
  'cardapio_url',
  'platform_url',
  'activation_url',
  'order_id',
  'order_total',
  'ticket_subject',
  'rating_url',
  'limit_name',
  'usage_count',
  'limit_value',
  'period',
  'provider',
  'event_id',
  'error_summary'
];

async function listPlatformEmailTemplates() {
  const rows = await dbRequest('GET', 'email_templates', {
    select: '*',
    order: 'template_key.asc',
    limit: '100'
  }).catch(() => []);
  const byKey = new Map(rows.map((row) => [row.template_key, row]));
  return {
    variables: EMAIL_TEMPLATE_VARIABLES,
    templates: EMAIL_TEMPLATE_DEFINITIONS.map((definition) => publicEmailTemplate(byKey.get(definition.key) || {
      template_key: definition.key,
      name: definition.name,
      subject: definition.subject,
      body: definition.body,
      variables: EMAIL_TEMPLATE_VARIABLES,
      is_active: true
    }))
  };
}

async function updatePlatformEmailTemplates(req, admin, data = {}) {
  const templates = Array.isArray(data.templates) ? data.templates : [data];
  const saved = [];
  for (const template of templates) {
    const key = cleanTemplateKey(template.template_key || template.key || '');
    if (!EMAIL_TEMPLATE_DEFINITIONS.some((entry) => entry.key === key)) throw httpError(422, 'Template de e-mail inválido.');
    const definition = EMAIL_TEMPLATE_DEFINITIONS.find((entry) => entry.key === key);
    const payload = {
      template_key: key,
      name: definition.name,
      subject: cleanText(template.subject || '').slice(0, 240) || definition.subject,
      body: cleanText(template.body || '').slice(0, 6000) || definition.body,
      variables: EMAIL_TEMPLATE_VARIABLES,
      is_active: template.is_active !== false,
      updated_by: admin.id,
      updated_at: new Date().toISOString()
    };
    const existing = await dbRequest('GET', 'email_templates', { select: 'id', template_key: `eq.${key}`, limit: '1' }).catch(() => {
      throw httpError(500, 'Tabela de templates não encontrada. Execute as migrations antes de salvar templates.');
    });
    const [row] = existing[0]
      ? await dbRequest('PATCH', 'email_templates', { id: `eq.${existing[0].id}` }, payload, ['Prefer: return=representation'])
      : await dbRequest('POST', 'email_templates', {}, payload, ['Prefer: return=representation']);
    saved.push(publicEmailTemplate(row));
  }
  await audit('platform.email_templates.update', {
    req,
    actor_admin_id: admin.id,
    entity_type: 'email_template',
    severity: 'warning',
    after_data: { templates: saved.map((template) => template.template_key) }
  });
  return { templates: saved };
}

function cleanTemplateKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').replaceAll('-', '_');
}

function publicEmailTemplate(row = {}) {
  return {
    id: row.id || null,
    template_key: row.template_key || row.key || '',
    name: row.name || '',
    subject: row.subject || '',
    body: row.body || '',
    variables: Array.isArray(row.variables) ? row.variables : EMAIL_TEMPLATE_VARIABLES,
    is_active: row.is_active !== false,
    updated_at: row.updated_at || null
  };
}

async function listPlatformSupportTickets(params = new URLSearchParams()) {
  const query = {
    select: '*',
    order: 'updated_at.desc',
    limit: String(clampNumber(Number(params.get?.('limit') || 100), 1, 300))
  };
  const status = cleanSlug(params.get?.('status') || '');
  const priority = cleanSlug(params.get?.('priority') || '');
  const companyId = cleanOptionalUuid(params.get?.('company_id') || '');
  if (status) query.status = `eq.${supportStatus(status)}`;
  if (priority) query.priority = `eq.${supportPriority(priority)}`;
  if (companyId) query.company_id = `eq.${companyId}`;
  const tickets = await dbRequest('GET', 'support_tickets', query).catch(() => []);
  return enrichSupportTickets(tickets, true);
}

async function listAdminSupportTickets(admin) {
  const companyId = cleanUuid(admin.company_id);
  const storeId = cleanUuid(admin.store_id);
  const tickets = companyId ? await dbRequest('GET', 'support_tickets', {
    select: '*',
    company_id: `eq.${companyId}`,
    ...(storeId ? { store_id: `eq.${storeId}` } : {}),
    order: 'updated_at.desc',
    limit: '100'
  }).catch(() => []) : [];
  return enrichSupportTickets(tickets, false);
}

async function enrichSupportTickets(tickets, includeInternal = false) {
  const ids = cleanUuidArray(tickets.map((ticket) => ticket.id));
  const companyIds = cleanUuidArray(tickets.map((ticket) => ticket.company_id));
  const storeIds = cleanUuidArray(tickets.map((ticket) => ticket.store_id));
  const [messages, companies, stores, admins] = await Promise.all([
    ids.length ? dbRequest('GET', 'support_ticket_messages', {
      select: '*',
      ticket_id: uuidInFilter(ids),
      order: 'created_at.asc',
      limit: '1000'
    }).catch(() => []) : [],
    companyIds.length ? dbRequest('GET', 'companies', { select: 'id,name,billing_email,phone', id: uuidInFilter(companyIds), limit: '300' }).catch(() => []) : [],
    storeIds.length ? dbRequest('GET', 'stores', { select: 'id,name,slug', id: uuidInFilter(storeIds), limit: '300' }).catch(() => []) : [],
    dbRequest('GET', 'admin_users', { select: 'id,name,email', limit: '1000' }).catch(() => [])
  ]);
  const messagesByTicket = new Map();
  for (const message of messages) {
    if (!includeInternal && message.is_internal) continue;
    if (!messagesByTicket.has(message.ticket_id)) messagesByTicket.set(message.ticket_id, []);
    messagesByTicket.get(message.ticket_id).push(publicSupportMessage(message, admins));
  }
  const companyById = new Map(companies.map((company) => [company.id, company]));
  const storeById = new Map(stores.map((store) => [store.id, store]));
  const adminById = new Map(admins.map((admin) => [admin.id, admin]));
  return {
    tickets: tickets.map((ticket) => publicSupportTicket(ticket, {
      company: companyById.get(ticket.company_id),
      store: storeById.get(ticket.store_id),
      assignedAdmin: adminById.get(ticket.assigned_to_admin_id),
      messages: messagesByTicket.get(ticket.id) || []
    }))
  };
}

function publicSupportTicket(ticket = {}, extra = {}) {
  return {
    id: ticket.id,
    company_id: ticket.company_id || null,
    company_name: extra.company?.name || null,
    store_id: ticket.store_id || null,
    store_name: extra.store?.name || null,
    admin_user_id: ticket.admin_user_id || null,
    assigned_to_admin_id: ticket.assigned_to_admin_id || null,
    assigned_to_admin_name: extra.assignedAdmin?.name || null,
    assigned_to_admin_email: extra.assignedAdmin?.email || null,
    subject: ticket.subject || '',
    category: ticket.category || '',
    status: ticket.status || 'open',
    priority: ticket.priority || 'medium',
    source: ticket.source || 'admin',
    last_message_at: ticket.last_message_at || null,
    created_at: ticket.created_at,
    updated_at: ticket.updated_at,
    messages: extra.messages || []
  };
}

function publicSupportMessage(message = {}, admins = []) {
  const admin = admins.find((entry) => entry.id === message.author_admin_id);
  const authorType = message.author_type || 'admin';
  const authorName = (() => {
    if (authorType === 'support') return 'Equipe de suporte';
    if (authorType === 'internal') return admin?.name || 'Nota interna';
    return admin?.name || 'Cliente';
  })();
  return {
    id: message.id,
    ticket_id: message.ticket_id,
    author_type: authorType,
    author_name: authorName,
    message: message.message || '',
    is_internal: message.is_internal === true,
    created_at: message.created_at
  };
}

async function createAdminSupportTicket(req, admin, data = {}) {
  const subject = cleanText(data.subject || '').slice(0, 180);
  const message = cleanText(data.message || '').slice(0, 5000);
  const contactName = cleanText(data.contact_name || admin.name || '').slice(0, 120);
  if (!subject) throw httpError(422, 'Informe o assunto do chamado.');
  if (!contactName) throw httpError(422, 'Informe o nome para contato.');
  if (!message) throw httpError(422, 'Informe a mensagem do chamado.');
  const messageWithContact = `Contato: ${contactName}\n\n${message}`;
  const [ticket] = await dbRequest('POST', 'support_tickets', {}, {
    company_id: cleanOptionalUuid(admin.company_id || '') || null,
    store_id: cleanOptionalUuid(admin.store_id || '') || null,
    admin_user_id: admin.id,
    created_by_admin_id: admin.id,
    subject,
    category: cleanText(data.category || '').slice(0, 80) || null,
    priority: supportPriority(data.priority || 'medium'),
    status: 'open',
    source: 'admin',
    last_message_at: new Date().toISOString()
  }, ['Prefer: return=representation']);
  await dbRequest('POST', 'support_ticket_messages', {}, {
    ticket_id: ticket.id,
    author_admin_id: admin.id,
    author_type: 'admin',
    message: messageWithContact,
    is_internal: false
  }, ['Prefer: return=minimal']);
  await audit('admin.support.ticket.create', {
    req,
    actor_admin_id: admin.id,
    company_id: admin.company_id,
    store_id: admin.store_id,
    entity_type: 'support_ticket',
    entity_id: ticket.id,
    after_data: { subject, priority: ticket.priority, contact_name: contactName }
  });
  return publicSupportTicket(ticket, { messages: [{ message: messageWithContact, author_type: 'admin', created_at: new Date().toISOString() }] });
}

async function createAdminSupportMessage(req, admin, ticketId, data = {}) {
  const ticket = await getSupportTicket(ticketId);
  const adminCompanyId = cleanOptionalUuid(admin.company_id || '');
  const adminStoreId = cleanOptionalUuid(admin.store_id || '');
  if ((ticket.company_id && ticket.company_id !== adminCompanyId) || (ticket.store_id && ticket.store_id !== adminStoreId)) {
    throw httpError(403, 'Este chamado não pertence à sua loja.');
  }
  if (['closed'].includes(ticket.status)) throw httpError(422, 'Chamado fechado não aceita novas respostas.');
  const messageText = cleanText(data.message || '').slice(0, 5000);
  if (!messageText) throw httpError(422, 'Informe a mensagem.');
  const duplicateWindow = new Date(Date.now() - 15000).toISOString();
  const [recentDuplicate] = await dbRequest('GET', 'support_ticket_messages', {
    select: '*',
    ticket_id: `eq.${ticket.id}`,
    author_admin_id: `eq.${admin.id}`,
    author_type: 'eq.admin',
    is_internal: 'eq.false',
    message: `eq.${messageText}`,
    created_at: `gte.${duplicateWindow}`,
    order: 'created_at.desc',
    limit: '1'
  }).catch(() => []);
  if (recentDuplicate) return publicSupportMessage(recentDuplicate, [admin]);

  const [message] = await dbRequest('POST', 'support_ticket_messages', {}, {
    ticket_id: ticket.id,
    author_admin_id: admin.id,
    author_type: 'admin',
    message: messageText,
    is_internal: false
  }, ['Prefer: return=representation']);
  await dbRequest('PATCH', 'support_tickets', { id: `eq.${ticket.id}` }, {
    status: 'open',
    last_message_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }, ['Prefer: return=minimal']).catch(() => {});
  await audit('admin.support.ticket.message', {
    req,
    actor_admin_id: admin.id,
    company_id: admin.company_id,
    store_id: admin.store_id,
    entity_type: 'support_ticket',
    entity_id: ticket.id
  });
  return publicSupportMessage(message, [admin]);
}

async function closeAdminSupportTicket(req, admin, ticketId) {
  const ticket = await getSupportTicket(ticketId);
  const adminCompanyId = cleanOptionalUuid(admin.company_id || '');
  const adminStoreId = cleanOptionalUuid(admin.store_id || '');
  if ((ticket.company_id && ticket.company_id !== adminCompanyId) || (ticket.store_id && ticket.store_id !== adminStoreId)) {
    throw httpError(403, 'Este chamado não pertence à sua loja.');
  }
  if (['closed', 'resolved'].includes(ticket.status)) return publicSupportTicket(ticket);
  const now = new Date().toISOString();
  const [updated] = await dbRequest('PATCH', 'support_tickets', { id: `eq.${ticket.id}` }, {
    status: 'closed',
    updated_at: now
  }, ['Prefer: return=representation']);
  await audit('admin.support.ticket.close', {
    req,
    actor_admin_id: admin.id,
    company_id: admin.company_id,
    store_id: admin.store_id,
    entity_type: 'support_ticket',
    entity_id: ticket.id,
    before_data: { status: ticket.status },
    after_data: { status: 'closed' }
  });
  return publicSupportTicket(updated || { ...ticket, status: 'closed', updated_at: now });
}

async function createPlatformSupportTicket(req, admin, data = {}) {
  const subject = cleanText(data.subject || '').slice(0, 180);
  const message = cleanText(data.message || '').slice(0, 5000);
  if (!subject) throw httpError(422, 'Informe o assunto do chamado.');
  const companyId = cleanOptionalUuid(data.company_id || '');
  const storeId = cleanOptionalUuid(data.store_id || '');
  const [ticket] = await dbRequest('POST', 'support_tickets', {}, {
    company_id: companyId || null,
    store_id: storeId || null,
    admin_user_id: cleanOptionalUuid(data.admin_user_id || '') || null,
    created_by_admin_id: admin.id,
    assigned_to_admin_id: admin.id,
    subject,
    category: cleanText(data.category || '').slice(0, 80) || null,
    status: supportStatus(data.status || 'open'),
    priority: supportPriority(data.priority || 'medium'),
    source: 'platform',
    last_message_at: message ? new Date().toISOString() : null
  }, ['Prefer: return=representation']);
  if (message) {
    await dbRequest('POST', 'support_ticket_messages', {}, {
      ticket_id: ticket.id,
      author_admin_id: admin.id,
      author_type: 'support',
      message,
      is_internal: data.is_internal === true
    }, ['Prefer: return=minimal']);
  }
  await audit('platform.support.ticket.create', {
    req,
    actor_admin_id: admin.id,
    company_id: companyId || null,
    store_id: storeId || null,
    entity_type: 'support_ticket',
    entity_id: ticket.id,
    after_data: { subject, priority: ticket.priority, status: ticket.status }
  });
  return publicSupportTicket(ticket);
}

async function createPlatformSupportMessage(req, admin, ticketId, data = {}) {
  const ticket = await getSupportTicket(ticketId);
  const messageText = cleanText(data.message || '').slice(0, 5000);
  if (!messageText) throw httpError(422, 'Informe a mensagem.');
  const isInternal = data.is_internal === true;
  const authorType = isInternal ? 'internal' : 'support';
  const duplicateWindow = new Date(Date.now() - 15000).toISOString();
  const [recentDuplicate] = await dbRequest('GET', 'support_ticket_messages', {
    select: '*',
    ticket_id: `eq.${ticket.id}`,
    author_admin_id: `eq.${admin.id}`,
    author_type: `eq.${authorType}`,
    is_internal: `eq.${isInternal}`,
    message: `eq.${messageText}`,
    created_at: `gte.${duplicateWindow}`,
    order: 'created_at.desc',
    limit: '1'
  }).catch(() => []);
  if (recentDuplicate) return publicSupportMessage(recentDuplicate, [admin]);

  const [message] = await dbRequest('POST', 'support_ticket_messages', {}, {
    ticket_id: ticket.id,
    author_admin_id: admin.id,
    author_type: authorType,
    message: messageText,
    is_internal: isInternal
  }, ['Prefer: return=representation']);
  await dbRequest('PATCH', 'support_tickets', { id: `eq.${ticket.id}` }, {
    status: isInternal ? ticket.status : 'waiting_customer',
    last_message_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }, ['Prefer: return=minimal']).catch(() => {});
  await audit('platform.support.ticket.message', {
    req,
    actor_admin_id: admin.id,
    company_id: ticket.company_id,
    store_id: ticket.store_id,
    entity_type: 'support_ticket',
    entity_id: ticket.id,
    after_data: { is_internal: isInternal }
  });
  if (!isInternal) await notifySupportTicket(ticket, 'support_replied').catch(() => {});
  return publicSupportMessage(message, [admin]);
}

async function updatePlatformSupportTicket(req, admin, ticketId, data = {}) {
  const ticket = await getSupportTicket(ticketId);
  const payload = {};
  if ('status' in data) payload.status = supportStatus(data.status);
  if ('priority' in data) payload.priority = supportPriority(data.priority);
  if ('assigned_to_admin_id' in data) payload.assigned_to_admin_id = cleanOptionalUuid(data.assigned_to_admin_id || '') || null;
  if ('company_id' in data) payload.company_id = cleanOptionalUuid(data.company_id || '') || null;
  if ('store_id' in data) payload.store_id = cleanOptionalUuid(data.store_id || '') || null;
  if (!Object.keys(payload).length) throw httpError(422, 'Informe algum dado para atualizar.');
  payload.updated_at = new Date().toISOString();
  const [updated] = await dbRequest('PATCH', 'support_tickets', { id: `eq.${ticket.id}` }, payload, ['Prefer: return=representation']);
  await audit('platform.support.ticket.update', {
    req,
    actor_admin_id: admin.id,
    company_id: updated.company_id,
    store_id: updated.store_id,
    entity_type: 'support_ticket',
    entity_id: updated.id,
    before_data: { status: ticket.status, priority: ticket.priority },
    after_data: payload
  });
  if (payload.status && payload.status !== ticket.status) await notifySupportTicket(updated, 'support_replied').catch(() => {});
  return publicSupportTicket(updated);
}

async function getSupportTicket(ticketId) {
  const id = cleanUuid(ticketId, 'chamado');
  const [ticket] = await dbRequest('GET', 'support_tickets', { select: '*', id: `eq.${id}`, limit: '1' });
  if (!ticket) throw httpError(404, 'Chamado não encontrado.');
  return ticket;
}

function supportStatus(value) {
  const status = cleanSlug(value || '');
  const map = {
    open: 'open',
    aberto: 'open',
    waiting_customer: 'waiting_customer',
    'waiting-customer': 'waiting_customer',
    aguardando_cliente: 'waiting_customer',
    'aguardando-cliente': 'waiting_customer',
    in_review: 'in_review',
    'in-review': 'in_review',
    em_analise: 'in_review',
    'em-analise': 'in_review',
    resolved: 'resolved',
    resolvido: 'resolved',
    closed: 'closed',
    fechado: 'closed'
  };
  if (map[status]) return map[status];
  throw httpError(422, 'Status de chamado inválido.');
}

function supportPriority(value) {
  const priority = cleanSlug(value || 'medium');
  const map = {
    low: 'low',
    baixa: 'low',
    medium: 'medium',
    media: 'medium',
    high: 'high',
    alta: 'high',
    critical: 'critical',
    critica: 'critical'
  };
  if (map[priority]) return map[priority];
  throw httpError(422, 'Prioridade de chamado inválida.');
}

async function notifySupportTicket(ticket, templateKey) {
  const [company] = ticket.company_id ? await dbRequest('GET', 'companies', { select: 'name,billing_email', id: `eq.${ticket.company_id}`, limit: '1' }).catch(() => []) : [];
  const [admin] = ticket.admin_user_id ? await dbRequest('GET', 'admin_users', { select: 'name,email', id: `eq.${ticket.admin_user_id}`, limit: '1' }).catch(() => []) : [];
  const to = cleanEmail(admin?.email || company?.billing_email || '');
  if (!to) return;
  const template = (await listPlatformEmailTemplates()).templates.find((entry) => entry.template_key === templateKey);
  if (!template?.is_active) return;
  const variables = {
    store_name: '',
    company_name: company?.name || '',
    customer_name: admin?.name || company?.name || 'cliente',
    plan_name: '',
    due_date: '',
    dashboard_url: `${process.env.PUBLIC_APP_URL || process.env.APP_URL || ''}/painel`,
    payment_url: `${process.env.PUBLIC_APP_URL || process.env.APP_URL || ''}/painel?tab=plan`,
    support_url: `${process.env.PUBLIC_APP_URL || process.env.APP_URL || ''}/painel?tab=support`
  };
  await sendPlatformEmail({
    to,
    templateKey,
    subject: renderEmailTemplate(template.subject, variables),
    body: renderEmailTemplate(template.body, variables)
  });
}

function renderEmailTemplate(text, variables = {}) {
  return String(text || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => cleanText(variables[key] ?? ''));
}

function webhookHealthStatus(logs = []) {
  const failed = logs.filter((entry) => entry.type === 'webhook' && entry.status === 'failed').length;
  return platformStatus(
    'webhooks',
    'Webhooks',
    failed ? 'attention' : 'healthy',
    failed ? `${failed} falha(s) recente(s) em webhooks.` : 'Sem falhas recentes registradas.',
    null
  );
}

function backupHealthStatus(backup = {}) {
  if (backup.status === 'running') return platformStatus('backup', 'Backup', 'attention', 'Backup em andamento.', null);
  if (backup.status === 'failed') return platformStatus('backup', 'Backup', 'error', backup.error || 'Último backup falhou.', null);
  if (!backup.latest?.created_at) return platformStatus('backup', 'Backup', 'unknown', 'Nenhum backup local registrado.', null);
  const ageHours = (Date.now() - new Date(backup.latest.created_at).getTime()) / 3600000;
  return platformStatus(
    'backup',
    'Backup',
    backup.status === 'success' && ageHours <= 24 ? 'healthy' : 'attention',
    ageHours <= 24 ? 'Backup gerado nas últimas 24h.' : 'Backup bem-sucedido atrasado há mais de 24h.',
    null
  );
}

async function storageHealthStatus(directory, key, label) {
  try {
    await mkdir(directory, { recursive: true });
    const file = path.join(directory, `.health-${Date.now()}.tmp`);
    await writeFile(file, 'ok');
    await unlink(file).catch(() => {});
    return platformStatus(key, label, 'healthy', 'Diretório configurado e gravável.', null);
  } catch (error) {
    return platformStatus(key, label, 'error', 'Diretório sem permissão de escrita.', null);
  }
}

async function platformConfigChecklist() {
  const uploads = await directoryWritable(UPLOAD_DIR);
  const backups = await directoryWritable(BACKUP_DIR);
  const smtp = await smtpServiceStatus();
  const billing = await getPlatformBillingSettings().catch(() => null);
  const production = process.env.NODE_ENV === 'production';
  const appUrl = process.env.APP_URL || process.env.PUBLIC_APP_URL || '';
  const apiUrl = process.env.API_URL || appUrl || '';
  const items = [
    configItem('database_url', 'DATABASE_URL configurada', Boolean(DATABASE_URL), maskConfigValue(DATABASE_URL, 'url')),
    configItem('app_url', 'APP_URL/PUBLIC_APP_URL configurada', Boolean(appUrl), maskConfigValue(appUrl, 'url')),
    configItem('api_url', 'API_URL configurada', Boolean(apiUrl), maskConfigValue(apiUrl, 'url')),
    configItem('https', 'HTTPS ativo em produção', !production || /^https:\/\//i.test(appUrl), production ? 'Obrigatório em produção' : 'Ambiente não produção'),
    configItem('jwt_secret', 'Secrets de sessão não padrão', hasStrongSessionSecret(), hasStrongSessionSecret() ? 'Configurado' : 'Configure SESSION_SECRET/COOKIE_SECRET'),
    configItem('cookie_secret', 'COOKIE_SECRET/SESSION_SECRET configurado', Boolean(process.env.COOKIE_SECRET || process.env.SESSION_SECRET), 'Não exibe segredo'),
    configItem('cookie_secure', 'COOKIE_SECURE correto para produção', !production || COOKIE_SECURE === true, String(COOKIE_SECURE)),
    configItem('abacate_api', 'Abacate Pay configurado', Boolean(billing?.is_active && billing?.has_api_key), billing?.has_api_key ? `Configurado (${billing.source})` : 'Ausente'),
    configItem('abacate_webhook', 'Webhook Abacate Pay configurado', Boolean(billing?.has_webhook_secret), billing?.has_webhook_secret ? `Configurado (${billing.source})` : 'Ausente'),
    configItem('uploads', 'Upload/storage gravável', uploads, maskConfigValue(UPLOAD_DIR, 'path')),
    configItem('smtp', 'SMTP/e-mail configurado', smtp.status === 'healthy', smtp.status === 'healthy' ? `Configurado (${smtp.source})` : smtp.message, true),
    configItem('proxy', 'Proxy/Nginx compatível', Boolean(process.env.TRUST_PROXY || process.env.PUBLIC_APP_URL || process.env.APP_URL), 'Verifique headers X-Forwarded-* no Nginx'),
    configItem('rate_limit', 'Rate limit ativo', true, 'Ativo em memória por rota sensível'),
    configItem('backup_dir', 'Diretório de backup configurado', Boolean(BACKUP_DIR), maskConfigValue(BACKUP_DIR, 'path')),
    configItem('backup_write', 'Permissão de escrita em backups', backups, maskConfigValue(BACKUP_DIR, 'path'))
  ];
  return {
    ok: items.every((item) => item.ok || item.optional),
    items
  };
}

function configItem(key, label, ok, hint = '', optional = false) {
  return { key, label, ok: Boolean(ok), hint, optional };
}

async function directoryWritable(directory) {
  try {
    await mkdir(directory, { recursive: true });
    const file = path.join(directory, `.health-${Date.now()}-${randomBytes(3).toString('hex')}.tmp`);
    await writeFile(file, 'ok');
    await unlink(file).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

function hasStrongSessionSecret() {
  const value = process.env.COOKIE_SECRET || process.env.SESSION_SECRET || '';
  return value.length >= 24 && !/^(secret|changeme|default|password|dev)$/i.test(value);
}

function maskConfigValue(value, type = 'text') {
  const text = String(value || '');
  if (!text) return 'Não configurado';
  if (type === 'path') return path.basename(text) ? `.../${path.basename(text)}` : 'Configurado';
  if (type === 'url') {
    try {
      const url = new URL(text);
      return `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}`;
    } catch {
      return 'Configurado';
    }
  }
  return 'Configurado';
}

function bytesLabel(value) {
  const bytes = Number(value || 0);
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

async function platformHealthAlerts({ statuses, metrics, config, backup, operationalLogs }) {
  const alerts = [];
  const add = (type, severity, title, message, action) => alerts.push({ key: type, type, severity, title, message, action });
  for (const status of statuses) {
    if (status.status === 'error') add(status.key, 'critical', `${status.label} com erro`, status.message, 'Verifique logs do servidor e configuração.');
    if (status.status === 'attention') add(status.key, 'warning', `${status.label} exige atenção`, status.message, 'Revise a configuração operacional.');
  }
  const missingConfig = (config.items || []).filter((item) => !item.ok && !item.optional);
  if (missingConfig.length) {
    add('config', 'warning', 'Configurações críticas ausentes', `${missingConfig.length} item(ns) precisam de revisão.`, 'Abra o checklist operacional e complete os itens pendentes.');
  }
  if (backup.latest?.created_at && (Date.now() - new Date(backup.latest.created_at).getTime()) > 86400000) {
    add('backup_delayed', 'warning', 'Backup atrasado', 'Não há backup bem-sucedido nas últimas 24h.', 'Execute npm run db:backup e confira o agendamento.');
  }
  if (metrics.api.errors_5xx >= 5) {
    add('api_5xx', 'critical', 'Erros 5xx frequentes', `${metrics.api.errors_5xx} erro(s) 5xx no período em memória.`, 'Verifique logs e rotas com falha.');
  }
  if (Number(metrics.database?.average_ms || 0) > 800) {
    add('database_slow', 'warning', 'Banco lento', `Banco respondeu em ${metrics.database.average_ms} ms.`, 'Verifique carga, índices e conexão PostgreSQL.');
  }
  if (Number(metrics.system?.disk?.lowest_free_percent ?? 100) < 15) {
    add('disk_low', 'critical', 'Espaço em disco baixo', `Menos de ${metrics.system.disk.lowest_free_percent}% livre em uploads/backups.`, 'Limpe arquivos antigos ou aumente o volume.');
  }
  const memory = metrics.system?.memory || {};
  const ramUsed = Number(memory.system_used_percent || 0);
  if (ramUsed >= 90) {
    add('ram_critical', 'critical', 'RAM em uso crítico', `Memória do sistema em ${ramUsed}%.`, 'Reduza carga, verifique processos e planeje upgrade de RAM.');
  } else if (ramUsed >= 75) {
    add('ram_attention', 'warning', 'RAM exige atenção', `Memória do sistema em ${ramUsed}%.`, 'Monitore crescimento, paginação e consumo do Node/PostgreSQL.');
  }
  const swapUsed = Number(memory.swap_used_bytes || 0);
  if (swapUsed >= 1024 * 1024 * 1024) {
    add('swap_critical', 'critical', 'Swap em uso crítico', `Swap usado: ${bytesLabel(swapUsed)}.`, 'Swap não substitui RAM. Considere upgrade e revise processos.');
  } else if (swapUsed >= 512 * 1024 * 1024) {
    add('swap_attention', 'warning', 'Swap em uso elevado', `Swap usado: ${bytesLabel(swapUsed)}.`, 'Monitore lentidão e reduza pressão de memória.');
  }
  const heapUsed = Number(memory.heap_used_percent || 0);
  if (heapUsed >= 90) {
    add('node_heap_critical', 'critical', 'Heap do Node em uso crítico', `Heap usado: ${heapUsed}%.`, 'Reinicie de forma planejada e investigue vazamento de memória.');
  } else if (heapUsed >= 80) {
    add('node_heap_attention', 'warning', 'Heap do Node exige atenção', `Heap usado: ${heapUsed}%.`, 'Monitore crescimento e avalie NODE_OPTIONS/upgrade de RAM.');
  }
  const billing = await getPlatformBillingSettings().catch(() => null);
  if (!billing?.is_active || !billing?.has_api_key) {
    add('abacatepay_missing', 'warning', 'Abacate Pay desconfigurado', 'API key de billing não encontrada.', 'Configure Billing > Configuração Abacate Pay na Central.');
  }
  if (statuses.some((status) => status.key === 'smtp' && status.status !== 'healthy')) {
    add('smtp_missing', 'attention', 'SMTP exige atenção', 'Envio de e-mails operacionais não está totalmente disponível.', 'Revise Comunicação > SMTP no Platform ou as variáveis SMTP do servidor.');
  }
  if (metrics.api.p95_ms && metrics.api.p95_ms > 1500) {
    add('latency', 'warning', 'Latência alta', `P95 da API em ${metrics.api.p95_ms} ms.`, 'Verifique banco, integrações e servidor.');
  }
  const failedWebhooks = operationalLogs.filter((entry) => entry.type === 'webhook' && entry.status === 'failed').length;
  if (failedWebhooks) {
    add('webhook', 'warning', 'Falhas recentes em webhooks', `${failedWebhooks} falha(s) registradas.`, 'Confira segredo do webhook e payloads recebidos.');
  }
  return alerts;
}

async function listOperationalLogs(sinceMs, params = new URLSearchParams()) {
  const last24h = Date.now() - 86400000;
  const since = new Date(Math.max(Number(sinceMs || 0), last24h)).toISOString();
  const companyId = cleanOptionalUuid(params.get?.('company_id') || params.get?.('tenant') || '');
  const storeId = cleanOptionalUuid(params.get?.('store_id') || '');
  const [auditRows, events, companies, stores] = await Promise.all([
    dbRequest('GET', 'audit_logs', {
      select: 'id,company_id,store_id,action,severity,entity_type,actor_admin_id,ip_address,after_data,created_at',
      created_at: `gte.${since}`,
      ...(companyId ? { company_id: `eq.${companyId}` } : {}),
      ...(storeId ? { store_id: `eq.${storeId}` } : {}),
      order: 'created_at.desc',
      limit: '200'
    }).catch(() => []),
    dbRequest('GET', 'subscription_events', {
      select: 'id,company_id,event_type,description,metadata,created_at',
      created_at: `gte.${since}`,
      ...(companyId ? { company_id: `eq.${companyId}` } : {}),
      order: 'created_at.desc',
      limit: '200'
    }).catch(() => []),
    dbRequest('GET', 'companies', { select: 'id,name', limit: '1500' }).catch(() => []),
    dbRequest('GET', 'stores', { select: 'id,name,slug', limit: '3000' }).catch(() => [])
  ]);
  const companyById = new Map(companies.map((company) => [company.id, company]));
  const storeById = new Map(stores.map((store) => [store.id, store]));
  const auditLogs = auditRows
    .filter((row) => ['critical', 'warning'].includes(row.severity) || /(webhook|backup|billing|subscription|migration|deploy|integration|auth|login|platform\.service|superadmin|password)/i.test(row.action || ''))
    .map((row) => ({
      id: row.id,
      type: operationalLogType(row.action),
      status: row.severity === 'critical' ? 'failed' : row.severity === 'warning' ? 'attention' : 'info',
      severity: row.severity || 'info',
      service: operationalLogService(row.action),
      action: row.action,
      company_id: row.company_id || null,
      company_name: companyById.get(row.company_id)?.name || null,
      store_id: row.store_id || null,
      store_name: storeById.get(row.store_id)?.name || null,
      message: maskSensitiveText(cleanText(row.after_data?.message || row.after_data?.summary || row.entity_type || row.action).slice(0, 500)),
      created_at: row.created_at
    }));
  const eventLogs = events.map((event) => ({
    id: event.id,
    type: operationalLogType(event.event_type),
    status: /failed|past_due|suspended|cancelled/i.test(event.event_type || '') ? 'failed' : 'info',
    severity: /failed|past_due|suspended|cancelled/i.test(event.event_type || '') ? 'warning' : 'info',
    service: 'billing',
    action: event.event_type,
    company_id: event.company_id || null,
    company_name: companyById.get(event.company_id)?.name || null,
    store_id: null,
    store_name: null,
    message: maskSensitiveText(cleanText(event.description || event.event_type).slice(0, 500)),
    created_at: event.created_at
  }));
  const type = cleanSlug(params.get?.('type') || '');
  const status = cleanSlug(params.get?.('status') || '');
  const severity = cleanSlug(params.get?.('severity') || '');
  const service = cleanSlug(params.get?.('service') || '');
  const limit = clampNumber(Number(params.get?.('limit') || 100), 1, 300);
  return [...auditLogs, ...eventLogs]
    .filter((entry) => !type || entry.type === type)
    .filter((entry) => !status || entry.status === status)
    .filter((entry) => !severity || entry.severity === severity)
    .filter((entry) => !service || entry.service === service)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}

function operationalLogType(action = '') {
  if (/webhook/i.test(action)) return 'webhook';
  if (/backup/i.test(action)) return 'backup';
  if (/trial_cleanup|job|maintenance/i.test(action)) return 'job';
  if (/billing|subscription|payment/i.test(action)) return 'billing';
  if (/auth|login|password|session/i.test(action)) return 'auth';
  if (/critical|fatal|error|failed/i.test(action)) return 'critical_error';
  if (/platform\.service|restart|systemctl/i.test(action)) return 'service';
  if (/superadmin|platform\.company|platform\.billing/i.test(action)) return 'superadmin_action';
  if (/deploy|migration/i.test(action)) return 'deploy';
  if (/integration/i.test(action)) return 'integration';
  return 'system';
}

function operationalLogService(action = '') {
  if (/abacate|billing|subscription|payment|webhook/i.test(action)) return 'billing';
  if (/backup/i.test(action)) return 'backup';
  if (/trial|job|maintenance/i.test(action)) return 'jobs';
  if (/auth|login|password|session/i.test(action)) return 'auth';
  if (/service|restart|systemctl/i.test(action)) return 'application';
  if (/deploy|migration/i.test(action)) return 'deploy';
  return 'system';
}

function normalizePortuguesePayload(value) {
  if (typeof value === 'string') return normalizePortugueseText(value);
  if (Array.isArray(value)) return value.map(normalizePortuguesePayload);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalizePortuguesePayload(entry)]));
  }
  return value;
}

function normalizePortugueseText(value) {
  return String(value)
    .replaceAll('\u00c3\u0080', 'À')
    .replaceAll('\u00c3\u0081', 'Á')
    .replaceAll('\u00c3\u0082', 'Â')
    .replaceAll('\u00c3\u0083', 'Ã')
    .replaceAll('\u00c3\u0087', 'Ç')
    .replaceAll('\u00c3\u0089', 'É')
    .replaceAll('\u00c3\u008a', 'Ê')
    .replaceAll('\u00c3\u008d', 'Í')
    .replaceAll('\u00c3\u0093', 'Ó')
    .replaceAll('\u00c3\u0094', 'Ô')
    .replaceAll('\u00c3\u0095', 'Õ')
    .replaceAll('\u00c3\u009a', 'Ú')
    .replaceAll('\u00c3\u00a0', 'à')
    .replaceAll('\u00c3\u00a1', 'á')
    .replaceAll('\u00c3\u00a2', 'â')
    .replaceAll('\u00c3\u00a3', 'ã')
    .replaceAll('\u00c3\u00a7', 'ç')
    .replaceAll('\u00c3\u00a9', 'é')
    .replaceAll('\u00c3\u00aa', 'ê')
    .replaceAll('\u00c3\u00ad', 'í')
    .replaceAll('\u00c3\u00b3', 'ó')
    .replaceAll('\u00c3\u00b4', 'ô')
    .replaceAll('\u00c3\u00b5', 'õ')
    .replaceAll('\u00c3\u00ba', 'ú');
}

async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function sanitizeBackupStatus(value) {
  return ['success', 'failed', 'running'].includes(String(value || '')) ? String(value) : 'unknown';
}

function cleanBackupFileName(value) {
  const file = path.basename(cleanText(value || ''));
  return /^postgres-.+\.(dump|sql)$/.test(file) ? file : '';
}

async function listStoreDomains(storeId) {
  const resolvedStoreId = cleanUuid(storeId);
  if (!resolvedStoreId) return [];
  return dbRequest('GET', 'store_domains', {
    select: '*',
    store_id: `eq.${resolvedStoreId}`,
    order: 'created_at.desc'
  });
}

async function createStoreDomain(data, admin) {
  await assertCompanyUsageLimit(admin, 'custom_domain', 'custom_domains');
  const domain = normalizeDomain(data.domain || '');
  if (!isValidDomain(domain)) throw httpError(422, 'Informe um domínio válido.');
  const [created] = await dbRequest('POST', 'store_domains', {}, {
    store_id: admin.store_id,
    domain,
    status: 'pending',
    verification_token: randomBytes(16).toString('hex')
  }, ['Prefer: return=representation']);
  await recordCompanyUsage({ ...admin, entity_type: 'store_domain', entity_id: created.id }, 'custom_domain', 'custom_domains');
  await audit('store_domain.create', {
    company_id: admin.company_id,
    store_id: admin.store_id,
    actor_admin_id: admin.id,
    entity_type: 'store_domain',
    entity_id: created.id,
    after_data: { domain, status: created.status }
  });
  return created;
}

async function verifyStoreDomain(id, admin) {
  const domainId = cleanUuid(id, 'domínio');
  const [domain] = await dbRequest('GET', 'store_domains', {
    select: '*',
    id: `eq.${domainId}`,
    store_id: `eq.${admin.store_id}`,
    limit: '1'
  });
  if (!domain) throw httpError(404, 'Domínio não encontrado nesta loja.');
  const [updated] = await dbRequest('PATCH', 'store_domains', { id: `eq.${domain.id}` }, {
    status: 'verified',
    verified_at: new Date().toISOString()
  }, ['Prefer: return=representation']);
  await audit('store_domain.verify', {
    company_id: admin.company_id,
    store_id: admin.store_id,
    actor_admin_id: admin.id,
    entity_type: 'store_domain',
    entity_id: domain.id,
    after_data: { domain: domain.domain, status: 'verified' }
  });
  return updated;
}

async function deleteStoreDomain(id, admin) {
  const domainId = cleanUuid(id, 'domínio');
  const [domain] = await dbRequest('GET', 'store_domains', {
    select: '*',
    id: `eq.${domainId}`,
    store_id: `eq.${admin.store_id}`,
    limit: '1'
  });
  if (!domain) throw httpError(404, 'Domínio não encontrado nesta loja.');
  await dbRequest('DELETE', 'store_domains', { id: `eq.${domain.id}` }, undefined, ['Prefer: return=minimal']);
  await audit('store_domain.delete', {
    company_id: admin.company_id,
    store_id: admin.store_id,
    actor_admin_id: admin.id,
    entity_type: 'store_domain',
    entity_id: domain.id,
    severity: 'warning',
    before_data: { domain: domain.domain, status: domain.status }
  });
}

async function getCompanyById(id) {
  const companyId = cleanUuid(id, 'empresa');
  const [company] = await dbRequest('GET', 'companies', {
    select: '*',
    id: `eq.${companyId}`,
    limit: '1'
  });
  if (!company) throw httpError(404, 'Empresa não encontrada.');
  return company;
}

async function getStoreById(id) {
  const storeId = cleanUuid(id, 'loja');
  const [store] = await dbRequest('GET', 'stores', {
    select: '*',
    id: `eq.${storeId}`,
    limit: '1'
  });
  if (!store) {
    throw httpError(404, 'Loja não encontrada ou indisponível.', { code: 'STORE_NOT_FOUND' });
  }
  return store;
}

function sanitizeCompanyStatus(status) {
  const value = cleanSlug(status || '');
  if (['onboarding', 'active', 'trial', 'payment_pending', 'grace_period', 'past_due', 'blocked', 'suspended', 'cancelled', 'archived'].includes(value)) return value;
  throw httpError(422, 'Status da empresa inválido.');
}

function sanitizeSubscriptionStatus(status) {
  const value = cleanSlug(status || '');
  if (['trial', 'active', 'payment_pending', 'grace_period', 'past_due', 'blocked', 'cancelled', 'expired', 'suspended'].includes(value)) return value;
  return 'active';
}

async function createDefaultSubscription(companyId, planCode) {
  const plan = (await dbRequest('GET', 'subscription_plans', {
    select: 'id',
    code: `eq.${cleanSlug(planCode || 'trial')}`,
    limit: '1'
  }))[0] || (await dbRequest('GET', 'subscription_plans', {
    select: 'id',
    code: 'eq.trial',
    limit: '1'
  }))[0];
  if (!plan) return null;
  const [subscription] = await dbRequest('POST', 'company_subscriptions', {}, {
    company_id: companyId,
    plan_id: plan.id,
    status: 'trial',
    trial_ends_at: new Date(Date.now() + 14 * 86400000).toISOString(),
    current_period_starts_at: new Date().toISOString(),
    current_period_ends_at: new Date(Date.now() + 14 * 86400000).toISOString(),
    next_renewal_at: new Date(Date.now() + 14 * 86400000).toISOString(),
    metadata: { source: 'platform_api' }
  }, ['Prefer: return=representation']);
  return subscription;
}

async function audit(action, data = {}) {
  const reqMeta = data.req ? requestAuditMeta(data.req) : {};
  await dbRequest('POST', 'audit_logs', {}, {
    company_id: data.company_id || null,
    store_id: data.store_id || null,
    actor_admin_id: data.actor_admin_id || null,
    action,
    entity_type: data.entity_type || null,
    entity_id: data.entity_id || null,
    severity: sanitizeAuditSeverity(data.severity),
    request_id: data.request_id || reqMeta.request_id || null,
    ip_address: data.ip_address || reqMeta.ip_address || null,
    user_agent: data.user_agent || reqMeta.user_agent || null,
    before_data: sanitizeAuditPayload(data.before_data),
    after_data: sanitizeAuditPayload(data.after_data)
  }, ['Prefer: return=minimal']).catch((error) => {
    console.warn('Falha ao registrar auditoria:', error.message || error);
  });
}

function requestAuditMeta(req) {
  const forwarded = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  const remote = req?.socket?.remoteAddress || '';
  return {
    request_id: String(req?.headers?.['x-request-id'] || randomBytes(8).toString('hex')).slice(0, 80),
    ip_address: String(forwarded || remote || '').slice(0, 80),
    user_agent: String(req?.headers?.['user-agent'] || '').slice(0, 300)
  };
}

function sanitizeAuditSeverity(value) {
  const severity = cleanSlug(value || 'info');
  return ['debug', 'info', 'warning', 'critical'].includes(severity) ? severity : 'info';
}

function sanitizeAuditPayload(value, depth = 0) {
  if (value === undefined || value === null) return null;
  if (depth > 5) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 50).map((entry) => sanitizeAuditPayload(entry, depth + 1));
  if (typeof value !== 'object') return value;
  const blocked = new Set([
    'password',
    'password_hash',
    'current_password',
    'new_password',
    'token',
    'access_token',
    'refresh_token',
    'api_key',
    'apikey',
    'secret',
    'webhook_secret',
    'service_role',
    'authorization'
  ]);
  const output = {};
  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if ([...blocked].some((blockedKey) => normalizedKey.includes(blockedKey))) {
      output[key] = '[redacted]';
      continue;
    }
    output[key] = sanitizeAuditPayload(entry, depth + 1);
  }
  return output;
}

async function requireAdmin(req, res) {
  const cookies = parseCookies(req);
  const token = cookies[ADMIN_COOKIE];
  const session = await readPersistentSession(token, 'admin');
  if (!session) {
    json(res, 401, { error: 'Faça login para acessar o admin.' });
    return null;
  }
  if (isSupportModeExpired(session.data)) {
    await audit('platform.support.impersonate.expired', {
      req,
      actor_admin_id: session.data?.support_mode?.original_admin_id || session.data?.id || null,
      company_id: session.data?.company_id || null,
      store_id: session.data?.store_id || null,
      entity_type: 'support_session',
      severity: 'warning',
      after_data: {
        target_store_id: session.data?.store_id || null,
        original_admin_email: session.data?.support_mode?.original_admin_email || null
      }
    }).catch(() => {});
    await deleteSession(token);
    json(res, 401, { error: 'Sessão de suporte expirada. Entre novamente.' }, { 'Set-Cookie': clearCookie(ADMIN_COOKIE) });
    return null;
  }
  if (session.data?.session_version !== 2 || !session.data?.store_id) {
    session.data = await enrichAdminSessionData(session.data);
    if (token) {
      await dbRequest('PATCH', 'app_sessions', { token: `eq.${token}`, type: 'eq.admin' }, {
        company_id: session.data.company_id ? cleanUuid(session.data.company_id) : null,
        store_id: session.data.store_id ? cleanUuid(session.data.store_id) : null,
        data: session.data
      }, ['Prefer: return=minimal']).catch(() => {});
      clearSessionCacheToken(token);
    }
  }
  return session.data;
}

async function enrichAdminSessionData(admin) {
  const access = await getAdminStoreAccess(admin);
  const selectedAccess = access.find((entry) => entry.store_id === admin.store_id) || access[0] || null;
  const activeStore = selectedAccess?.store || null;
  const companyId = activeStore?.company_id || admin.company_id || selectedAccess?.company_id || null;
  return {
    ...admin,
    session_version: 2,
    company_id: companyId,
    store_id: activeStore?.id || null,
    active_store: activeStore ? publicStoreRef(activeStore) : null,
    stores: access.map((entry) => publicStoreRef(entry.store)).filter(Boolean),
    plan_access: companyId ? await getCompanyPlanAccess(companyId) : {}
  };
}

async function requireAdminPermission(req, res, permission) {
  const admin = await requireAdmin(req, res);
  if (!admin) return null;
  if (!adminCan(admin, permission)) {
    json(res, 403, { error: 'Sua conta não tem permissão para acessar esta área.' });
    return null;
  }
  if (isSupportModeAdmin(admin) && supportModeRestrictedPermission(permission)) {
    json(res, 403, { error: 'Modo suporte não permite executar esta ação sensível.' });
    return null;
  }
  if (isSupportModeAdmin(admin) && !['account', 'plan', 'platform'].includes(permission)) {
    if (!admin.store_id || cleanUuid(admin.store_id) !== cleanUuid(admin.support_mode?.target_store_id)) {
      json(res, 403, { error: 'Sessão de suporte sem loja alvo válida.' });
      return null;
    }
    return admin;
  }
  if (!['account', 'plan', 'platform'].includes(permission)) {
    if (!admin.store_id) {
      json(res, 403, { error: 'Sua conta não possui uma loja ativa vinculada.' });
      return null;
    }
    const access = await getAdminStoreAccess(admin);
    const activeAccess = access.find((entry) => entry.store_id === admin.store_id);
    if (!activeAccess) {
      json(res, 403, { error: 'Sua sessão não possui acesso ativo a esta loja. Entre novamente.' });
      return null;
    }
    admin.company_id = activeAccess.company_id;
    admin.active_store = publicStoreRef(activeAccess.store);
    admin.stores = access.map((entry) => publicStoreRef(entry.store)).filter(Boolean);
  }
  if (!['account', 'plan'].includes(permission)) {
    const commercial = await companyCommercialStatus(admin.company_id);
    if (!commercial.canOperate) {
      json(res, 402, { error: commercial.message, commercial_status: commercial.status });
      return null;
    }
  }
  const featureCode = featureForPermission(permission);
  if (featureCode && !(await canUseFeature(admin.company_id, featureCode))) {
    json(res, 403, planErrorPayload('FEATURE_NOT_AVAILABLE', featureBlockedMessage(featureCode), { feature: featureCode }));
    return null;
  }
  return admin;
}

async function requirePlatformAdmin(req, res, permission = 'platform.view') {
  const admin = await requireAdmin(req, res);
  if (!admin) return null;
  if (!isPlatformAdmin(admin) || !platformAdminCan(admin, permission)) {
    json(res, 403, { error: 'Sua conta não tem acesso ao painel da plataforma.' });
    return null;
  }
  return admin;
}

const PLATFORM_PERMISSION_GROUPS = Object.freeze({
  view: ['platform.view', 'platform.audit.view', 'platform.services.view'],
  billing: ['platform.billing.manage'],
  customer: ['platform.customer.suspend'],
  services: ['platform.services.manage']
});

function platformPermissions(admin) {
  if (normalizeAdminRole(admin?.role) !== 'superadmin') return [];
  return [
    'platform.view',
    'platform.audit.view',
    'platform.billing.manage',
    'platform.customer.suspend',
    'platform.services.view',
    'platform.services.manage'
  ];
}

function platformAdminCan(admin, permission) {
  if (!permission) return isPlatformAdmin(admin);
  return platformPermissions(admin).includes(permission);
}

function adminPermissions(admin) {
  if (isSupportModeAdmin(admin)) {
    return ['operation', 'orders', 'menu', 'reports', 'tables', 'promotions', 'customers', 'store', 'integrations'];
  }
  const role = normalizeAdminRole(admin?.role);
  if (role === 'superadmin') {
    return ['platform', ...platformPermissions(admin), 'operation', 'orders', 'menu', 'reports', 'tables', 'promotions', 'customers', 'store', 'integrations', 'plan', 'account', 'admin_users'];
  }
  if (role === 'admin') {
    return ['operation', 'orders', 'menu', 'reports', 'tables', 'promotions', 'customers', 'store', 'integrations', 'plan', 'account', 'admin_users'];
  }
  if (role === 'waiter' || role === 'attendant') return ['orders', 'tables', 'customers', 'account'];
  if (role === 'delivery') return ['orders', 'account'];
  if (role === 'kitchen') return ['orders', 'account'];
  return ['account'];
}

function adminCan(admin, permission) {
  return adminPermissions(admin).includes(permission);
}

function featureForPermission(permission) {
  return ({
    operation: 'orders',
    orders: 'orders',
    menu: 'digital_menu',
    reports: 'basic_reports',
    tables: 'tables',
    promotions: 'promotions',
    customers: 'customers',
    store: 'store_settings',
    integrations: 'store_settings'
  })[permission] || null;
}

function adminPlanFeatureCodes() {
  return [
    'orders',
    'digital_menu',
    'menu_categories',
    'basic_reports',
    'tables',
    'promotions',
    'customers',
    'store_settings',
    'admin_users',
    'manual_whatsapp',
    'automatic_whatsapp',
    'print_kitchen',
    'loyalty',
    'reorder',
    'cart_suggestions',
    'custom_domain',
    'priority_support'
  ];
}

function featureBlockedMessage(featureCode) {
  return ({
    tables: 'Mesas e comandas avançadas estão disponíveis a partir do Profissional.',
    promotions: 'Cupons e campanhas estão disponíveis a partir do Profissional.',
    customers: 'Clientes não estão disponíveis no plano atual.',
    basic_reports: 'Relatórios não estão disponíveis no plano atual.',
    digital_menu: 'Cardápio não está disponível no plano atual.',
    menu_categories: 'Novas categorias não estão disponíveis no plano atual.',
    orders: 'Pedidos não estão disponíveis no plano atual.',
    store_settings: 'Configurações da loja não estão disponíveis no plano atual.',
    admin_users: 'Usuários da equipe não estão disponíveis no plano atual.',
    manual_whatsapp: 'WhatsApp manual não está disponível no plano atual.',
    automatic_whatsapp: 'Automação de WhatsApp está disponível no Premium.',
    print_kitchen: 'KDS, impressão e reimpressão estão disponíveis a partir do Profissional.',
    loyalty: 'Fidelidade e recompensas estão disponíveis no Premium.',
    reorder: 'Peça novamente está disponível a partir do Profissional.',
    cart_suggestions: 'Sugestões no carrinho estão disponíveis no Premium.',
    custom_domain: 'Domínio personalizado está disponível no Premium.',
    priority_support: 'Suporte prioritário está disponível no Premium.'
  })[featureCode] || 'Recurso não disponível no plano atual.';
}

async function getCurrentPlan(companyId) {
  const subscription = await getCurrentSubscription(companyId);
  if (!subscription?.plan_id) return { subscription, plan: null };
  const [plan] = await dbRequest('GET', 'subscription_plans', {
    select: '*',
    id: `eq.${subscription.plan_id}`,
    limit: '1'
  }).catch(() => []);
  return { subscription, plan: plan || null };
}

async function canUseFeature(companyId, featureCode) {
  const access = await getCompanyFeatureAccess(companyId, featureCode);
  return access.enabled;
}

async function companyCanUseFeature(companyId, featureCode) {
  return canUseFeature(companyId, featureCode);
}

async function assertFeatureEnabled(companyId, featureCode) {
  const access = await getCompanyFeatureAccess(companyId, featureCode);
  if (!access.enabled) {
    throw httpError(403, featureBlockedMessage(featureCode), planErrorPayload('FEATURE_NOT_AVAILABLE', featureBlockedMessage(featureCode), { feature: featureCode, source: access.source }));
  }
  return access;
}

async function assertPlanLimit(admin, featureCode, usageKey, nextAmount = 1) {
  return assertCompanyUsageLimit(admin, featureCode, usageKey, nextAmount);
}

function planErrorPayload(code, message, extra = {}) {
  return { code, error_code: code, message, ...extra };
}

async function getCompanyFeatureAccess(companyId, featureCode) {
  const resolvedCompanyId = cleanUuid(companyId);
  if (!resolvedCompanyId || !featureCode) return { enabled: true, limit_value: null, source: 'none' };
  const [feature] = await dbRequest('GET', 'platform_features', {
    select: 'id,code',
    code: `eq.${featureCode}`,
    is_active: 'eq.true',
    limit: '1'
  });
  if (!feature) return { enabled: true, limit_value: null, source: 'missing_feature' };
  const [company] = await dbRequest('GET', 'companies', {
    select: 'id,status',
    id: `eq.${resolvedCompanyId}`,
    limit: '1'
  });
  if (!company || ['suspended', 'cancelled', 'archived'].includes(company.status)) {
    return { enabled: false, limit_value: null, source: 'company_status' };
  }
  const overrides = await dbRequest('GET', 'company_feature_overrides', {
    select: 'override_type,limit_value,ends_at,feature_id',
    company_id: `eq.${resolvedCompanyId}`,
    feature_id: `eq.${feature.id}`,
    order: 'created_at.desc',
    limit: '5'
  }).catch(() => []);
  const activeOverride = overrides.find((entry) => !entry.ends_at || new Date(entry.ends_at).getTime() >= Date.now());
  if (activeOverride?.override_type === 'block') return { enabled: false, limit_value: null, source: 'override' };
  if (activeOverride?.override_type === 'allow') return { enabled: true, limit_value: null, source: 'override' };
  if (activeOverride?.override_type === 'limit') {
    return { enabled: true, limit_value: activeOverride.limit_value, source: 'override' };
  }
  const subscription = await getCurrentSubscription(resolvedCompanyId);
  if (!subscription || ['cancelled', 'expired', 'suspended'].includes(subscription.status)) {
    return { enabled: false, limit_value: null, source: 'subscription' };
  }
  const [planFeature] = await dbRequest('GET', 'plan_features', {
    select: 'id,is_enabled,limit_value',
    plan_id: `eq.${subscription.plan_id}`,
    feature_id: `eq.${feature.id}`,
    limit: '1'
  });
  return {
    enabled: planFeature?.is_enabled !== false && Boolean(planFeature),
    limit_value: planFeature?.limit_value ?? null,
    source: 'plan'
  };
}

async function getCompanyPlanAccess(companyId) {
  const entries = await Promise.all(adminPlanFeatureCodes().map(async (featureCode) => {
    const access = await getCompanyFeatureAccess(companyId, featureCode).catch(() => ({ enabled: true, limit_value: null, source: 'error' }));
    return [featureCode, access];
  }));
  return Object.fromEntries(entries);
}

async function getCurrentSubscription(companyId) {
  const resolvedCompanyId = cleanUuid(companyId);
  if (!resolvedCompanyId) return null;
  const subscriptions = await listCompanySubscriptions(resolvedCompanyId, 100);
  return pickCurrentCompanySubscription(subscriptions);
}

async function assertCompanyUsageLimit(admin, featureCode, usageKey, nextAmount = 1) {
  if (!admin?.company_id) return;
  const access = await getCompanyFeatureAccess(admin.company_id, featureCode);
  if (!access.enabled) {
    const message = featureBlockedMessage(featureCode);
    throw httpError(403, message, planErrorPayload('FEATURE_NOT_AVAILABLE', message, { feature: featureCode, usage_key: usageKey, source: access.source }));
  }
  const limit = Number(access.limit_value);
  if (!Number.isFinite(limit) || limit <= 0) return;
  const used = await currentUsageForKey(admin, usageKey);
  if (used + nextAmount > limit) {
    const message = `Limite do plano atingido para ${usageLabel(usageKey)}. Uso atual: ${used}/${limit}.`;
    throw httpError(403, message, planErrorPayload('PLAN_LIMIT_REACHED', message, { feature: featureCode, usage_key: usageKey, used, limit, next_amount: nextAmount }));
  }
}

async function currentUsageForKey(admin, usageKey) {
  const storeId = cleanUuid(admin?.store_id);
  const companyId = cleanUuid(admin?.company_id);
  if (!companyId && !storeId) return 0;
  const scopedStoreIds = storeId ? [storeId] : await listCompanyStoreIds(companyId);
  const scopedFilter = scopedStoreIds.length ? uuidInFilter(scopedStoreIds) : null;
  if (usageKey === 'stores') {
    return (await dbRequest('GET', 'stores', { select: 'id', company_id: `eq.${companyId}`, limit: '1000' }).catch(() => [])).length;
  }
  if (usageKey === 'admin_users') {
    const rows = await dbRequest('GET', 'admin_user_store_access', {
      select: 'admin_user_id',
      company_id: `eq.${companyId}`,
      is_active: 'eq.true',
      limit: '1000'
    }).catch(() => []);
    return new Set(rows.map((row) => row.admin_user_id)).size;
  }
  if (usageKey === 'custom_domains') {
    if (!scopedFilter) return 0;
    return (await dbRequest('GET', 'store_domains', {
      select: 'id',
      store_id: scopedFilter,
      status: 'neq.disabled',
      limit: '1000'
    }).catch(() => [])).length;
  }
  const tableByUsage = {
    menu_categories: 'menu_categories',
    menu_items: 'menu_items',
    dining_tables: 'dining_tables',
    promotions: 'promotions',
    customers: 'customers',
    orders: 'orders',
    print_jobs: 'order_print_logs',
    whatsapp_messages: 'order_whatsapp_logs',
    payment_transactions: 'order_payment_events'
  };
  const table = tableByUsage[usageKey];
  if (!table || !scopedFilter) return 0;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  return (await dbRequest('GET', table, {
    select: 'id',
    store_id: scopedFilter,
    ...(usageKey === 'orders' ? { created_at: `gte.${monthStart.toISOString()}` } : {}),
    limit: '1000'
  }).catch(() => [])).length;
}

async function listCompanyStoreIds(companyId) {
  const resolvedCompanyId = cleanUuid(companyId);
  if (!resolvedCompanyId) return [];
  const rows = await dbRequest('GET', 'stores', {
    select: 'id',
    company_id: `eq.${resolvedCompanyId}`,
    limit: '1000'
  }).catch(() => []);
  return cleanUuidArray(rows.map((row) => row.id));
}

async function recordCompanyUsage(admin, featureCode, usageKey) {
  const companyId = cleanUuid(admin?.company_id);
  if (!companyId) return;
  const [feature] = await dbRequest('GET', 'platform_features', {
    select: 'id',
    code: `eq.${featureCode}`,
    limit: '1'
  }).catch(() => []);
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const payload = {
    company_id: companyId,
    feature_id: feature?.id || null,
    usage_key: usageKey,
    period_start: periodStart.toISOString().slice(0, 10),
    period_end: periodEnd.toISOString().slice(0, 10),
    used_value: await currentUsageForKey(admin, usageKey),
    metadata: { store_id: admin.store_id || null, updated_by: admin.id || null }
  };
  const existing = await dbRequest('GET', 'company_usage_counters', {
    select: 'id',
    company_id: `eq.${payload.company_id}`,
    usage_key: `eq.${payload.usage_key}`,
    period_start: `eq.${payload.period_start}`,
    period_end: `eq.${payload.period_end}`,
    limit: '1'
  }).catch(() => []);
  if (existing[0]) {
    await dbRequest('PATCH', 'company_usage_counters', { id: `eq.${existing[0].id}` }, payload, ['Prefer: return=minimal']).catch(() => {});
  } else {
    await dbRequest('POST', 'company_usage_counters', {}, payload, ['Prefer: return=minimal']).catch(() => {});
  }
  await recordUsageEvent({
    company_id: companyId,
    store_id: admin.store_id || null,
    feature_id: feature?.id || null,
    usage_key: usageKey,
    entity_type: admin.entity_type || null,
    entity_id: admin.entity_id || null,
    metadata: { updated_by: admin.id || null }
  });
}

async function assertPublicUsageLimitByStore(storeId, featureCode, usageKey, nextAmount = 1) {
  const companyId = await companyIdForStore(storeId);
  if (!companyId) return;
  await assertCompanyUsageLimit({ company_id: companyId, store_id: storeId }, featureCode, usageKey, nextAmount);
}

async function storeHasFeature(storeId, featureCode) {
  const companyId = await companyIdForStore(storeId);
  if (!companyId) return false;
  return canUseFeature(companyId, featureCode).catch(() => false);
}

async function recordUsageByStore(storeId, featureCode, usageKey, options = {}) {
  const companyId = await companyIdForStore(storeId);
  if (!companyId) return;
  await recordCompanyUsage({
    company_id: companyId,
    store_id: storeId,
    entity_type: options.entity_type || null,
    entity_id: options.entity_id || null
  }, featureCode, usageKey);
}

async function companyIdForStore(storeId) {
  const resolvedStoreId = cleanUuid(storeId);
  if (!resolvedStoreId) return null;
  const [store] = await dbRequest('GET', 'stores', {
    select: 'company_id',
    id: `eq.${resolvedStoreId}`,
    limit: '1'
  }).catch(() => []);
  return cleanUuid(store?.company_id) || null;
}

async function recordUsageEvent(data) {
  const companyId = data.company_id ? cleanUuid(data.company_id) : null;
  if (!companyId) return;
  await dbRequest('POST', 'usage_events', {}, {
    company_id: companyId,
    store_id: data.store_id ? cleanUuid(data.store_id) : null,
    feature_id: data.feature_id ? cleanUuid(data.feature_id) : null,
    usage_key: cleanText(data.usage_key || ''),
    quantity: Math.max(1, Number(data.quantity || 1)),
    entity_type: cleanText(data.entity_type || '') || null,
    entity_id: data.entity_id ? String(data.entity_id).slice(0, 80) : null,
    metadata: isPlainObject(data.metadata) ? data.metadata : {}
  }, ['Prefer: return=minimal']).catch(() => {});
}

function usageLabel(usageKey) {
  return ({
    stores: 'lojas',
    admin_users: 'usuários',
    menu_categories: 'categorias',
    menu_items: 'produtos',
    dining_tables: 'mesas',
    promotions: 'promoções',
    customers: 'clientes',
    orders: 'pedidos no mês'
  })[usageKey] || usageKey;
}

function normalizeAdminRole(role) {
  if (role === 'superadmin') return 'superadmin';
  if (role === 'owner' || role === 'manager') return 'admin';
  if (role === 'waiter' || role === 'attendant' || role === 'delivery' || role === 'kitchen' || role === 'admin') return role;
  return 'admin';
}

function isFullAdminRole(role) {
  return ['admin', 'superadmin'].includes(normalizeAdminRole(role));
}

function isPlatformAdmin(admin) {
  return normalizeAdminRole(admin?.role) === 'superadmin';
}

async function registerCustomer(data, storeId, options = {}) {
  const db = options.db || dbRequest;
  const resolvedStoreId = cleanUuid(storeId) || (await getDefaultStore())?.id || null;
  if (data.accept_terms !== true && data.acceptTerms !== true) {
    throw httpError(422, 'Aceite o EULA, os Termos de Uso e a Política de Privacidade para continuar.');
  }
  const customer = sanitizeCustomer(data.customer || data);
  const password = validatePassword(data.password);
  const address = data.address && data.address.street ? sanitizeAddress(data.address) : null;

  const existing = await db('GET', 'customers', {
    select: '*',
    ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
    phone: `eq.${customer.phone}`,
    limit: '1'
  });

  let row;
  if (existing[0]) {
    if (existing[0].password_hash) {
      throw httpError(409, 'Este telefone já possui cadastro. Entre com sua senha.');
    }
    [row] = await db('PATCH', 'customers', { id: `eq.${existing[0].id}` }, {
      ...customer,
      password_hash: hashPassword(password)
    }, ['Prefer: return=representation']);
  } else {
    [row] = await db('POST', 'customers', {}, {
      ...customer,
      store_id: resolvedStoreId,
      password_hash: hashPassword(password)
    }, ['Prefer: return=representation']);
  }

  if (address) await upsertAddress(row.id, address, resolvedStoreId, options);
  clearAdminCustomersCache();

  return createCustomerSession(row);
}

async function loginCustomer(data, storeId, options = {}) {
  const db = options.db || dbRequest;
  const resolvedStoreId = cleanUuid(storeId) || (await getDefaultStore())?.id || null;
  const phone = onlyDigits(data.phone);
  const password = String(data.password || '');
  if (!phone || !password) throw httpError(422, 'Informe telefone e senha.');

  const rows = await db('GET', 'customers', {
    select: '*',
    ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
    phone: `eq.${phone}`,
    limit: '1'
  });

  const customer = rows[0];
  if (!customer || !customer.password_hash || !verifyPassword(password, customer.password_hash)) {
    throw httpError(401, 'Telefone ou senha inválidos.');
  }

  await db('PATCH', 'customers', { id: `eq.${customer.id}` }, {
    last_login_at: new Date().toISOString()
  }, ['Prefer: return=representation']);
  clearAdminCustomersCache();

  return createCustomerSession(customer);
}

async function resetCustomerPassword(data, storeId = null, options = {}) {
  const db = options.db || dbRequest;
  const resolvedStoreId = cleanUuid(storeId);
  const phone = onlyDigits(data.phone);
  const orderCode = cleanPublicCode(String(data.order_code || '').replace(/^#/, ''));
  const orderTotal = parseMoneyInput(data.order_total);
  const newPassword = validatePassword(data.new_password);
  if (!phone || !orderCode || orderTotal === null) {
    throw httpError(422, 'Informe telefone, código e total de um pedido.');
  }

  const customers = await db('GET', 'customers', {
    select: 'id,phone',
    ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
    phone: `eq.${phone}`,
    limit: '1'
  });
  const customer = customers[0];
  if (!customer) throw httpError(401, 'Não foi possível validar os dados informados.');

  const orders = await db('GET', 'orders', {
    select: 'id,customer_id,public_code,total',
    ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
    customer_id: `eq.${customer.id}`,
    public_code: `eq.${orderCode}`,
    limit: '1'
  });
  if (!orders[0] || Math.abs(moneyNumber(orders[0].total) - orderTotal) > 0.01) {
    throw httpError(401, 'Não foi possível validar os dados informados.');
  }

  await db('PATCH', 'customers', { id: `eq.${customer.id}` }, {
    password_hash: hashPassword(newPassword)
  }, ['Prefer: return=minimal']);
}

async function createCustomerSession(customer) {
  const sessionId = await createPersistentSession('customer', customer.id, {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    store_id: customer.store_id || null
  });
  return { sessionId, body: { customer: publicCustomer(customer) } };
}

async function requireCustomer(req, res) {
  const session = await readPersistentSession(parseCookies(req)[CUSTOMER_COOKIE], 'customer');
  if (!session) {
    json(res, 401, { error: 'Faça login para acessar sua conta.' });
    return null;
  }
  return session.data;
}

async function getCustomerProfile(customerId, storeId = null, options = {}) {
  const db = options.db || dbRequest;
  const resolvedStoreId = cleanUuid(storeId);
  const [rows, addresses, loyalty] = await Promise.all([
    db('GET', 'customers', {
    select: 'id,store_id,name,phone,email,birth_date,notes,created_at,updated_at',
    id: `eq.${customerId}`,
    ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
    limit: '1'
    }),
    listCustomerAddresses(customerId, resolvedStoreId, options),
    customerLoyaltyProgress(customerId, options)
  ]);
  if (!rows[0]) throw httpError(404, 'Cliente não encontrado.');
  return { ...rows[0], address: addresses[0] || null, addresses, loyalty };
}

async function customerLoyaltyProgress(customerId, options = {}) {
  const db = options.db || dbRequest;
  const storeId = await getCustomerStoreId(customerId, options);
  const store = await getStoreSettings(storeId, options);
  const program = sanitizeLoyaltyProgram(store.loyalty_program || {});
  const orders = await db('GET', 'orders', {
    select: 'id,total,status,created_at',
    ...(storeId ? { store_id: `eq.${storeId}` } : {}),
    customer_id: `eq.${customerId}`,
    status: 'eq.completed'
  });
  const completedOrders = orders.length;
  const completedRevenue = roundMoney(orders.reduce((sum, order) => sum + moneyNumber(order.total), 0));

  if (!program.is_active) {
    return {
      is_active: false,
      mode: program.mode,
      reward: program.reward,
      completed_orders: completedOrders,
      points: 0,
      target: program.mode === 'points' ? program.points_target : program.orders_required,
      progress: 0,
      remaining: program.mode === 'points' ? program.points_target : program.orders_required
    };
  }

  if (program.mode === 'points') {
    const points = Math.floor(completedRevenue * program.points_per_currency);
    const target = Math.max(1, program.points_target);
    return {
      is_active: true,
      mode: 'points',
      reward: program.reward,
      completed_orders: completedOrders,
      points,
      target,
      progress: Math.min(100, Math.round((points / target) * 100)),
      remaining: Math.max(0, target - points)
    };
  }

  const target = Math.max(1, program.orders_required);
  const currentCycle = completedOrders % target;
  const cycleProgress = currentCycle === 0 && completedOrders > 0 ? target : currentCycle;
  return {
    is_active: true,
    mode: 'orders_reward',
    reward: program.reward,
    completed_orders: completedOrders,
    points: 0,
    target,
    progress: Math.min(100, Math.round((cycleProgress / target) * 100)),
    remaining: cycleProgress >= target ? 0 : target - cycleProgress
  };
}

async function updateCustomerProfile(customerId, data, storeId = null, options = {}) {
  const db = options.db || dbRequest;
  const resolvedStoreId = cleanUuid(storeId);
  const customer = sanitizeCustomer(data.customer || data);
  const payload = { ...customer };
  if (data.password) payload.password_hash = hashPassword(validatePassword(data.password));

  const [updated] = await db('PATCH', 'customers', {
    id: `eq.${customerId}`,
    ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {})
  }, payload, ['Prefer: return=representation']);
  if (!updated) throw httpError(404, 'Cliente não encontrado nesta loja.');
  clearSessionCacheByOwner('customer', customerId);
  if (data.address?.street) {
    await upsertAddress(customerId, sanitizeAddress(data.address), updated.store_id, options);
  }
  return getCustomerProfile(updated.id, updated.store_id, options);
}

async function updateCustomerAddressByOwner(customerId, addressId, data, storeId = null, options = {}) {
  return updateCustomerAddressByAdmin(customerId, addressId, data, storeId, options);
}

async function createCustomerAddressByOwner(customerId, data, storeId = null, options = {}) {
  return createCustomerAddressByAdmin(customerId, data, storeId, options);
}

async function deleteCustomerAddressByOwner(customerId, addressId, storeId = null, options = {}) {
  return deleteCustomerAddressByAdmin(customerId, addressId, storeId, options);
}

async function updateCustomerByAdmin(customerId, data, storeId = null, options = {}) {
  const db = options.db || dbRequest;
  const resolvedStoreId = cleanUuid(storeId);
  const customer = sanitizeCustomer(data.customer || data);
  const payload = { ...customer };
  if (data.password) payload.password_hash = hashPassword(validatePassword(data.password));
  const [updated] = await db('PATCH', 'customers', {
    id: `eq.${customerId}`,
    ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {})
  }, payload, ['Prefer: return=representation']);
  if (!updated) throw httpError(404, 'Cliente não encontrado nesta loja.');
  clearSessionCacheByOwner('customer', customerId);
  return getCustomerProfile(customerId, resolvedStoreId, options);
}

async function deleteCustomerByAdmin(customerId, storeId = null, options = {}) {
  const db = options.db || dbRequest;
  const resolvedStoreId = cleanUuid(storeId);
  await assertCustomerBelongsToStore(customerId, resolvedStoreId, options);
  await dbRequest('DELETE', 'app_sessions', {
    type: 'eq.customer',
    owner_id: `eq.${customerId}`
  }, undefined, ['Prefer: return=minimal']);
  await db('DELETE', 'customers', {
    id: `eq.${customerId}`,
    ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {})
  }, undefined, ['Prefer: return=minimal']);
}

async function createCustomerAddressByAdmin(customerId, data, storeId = null, options = {}) {
  const resolvedStoreId = cleanUuid(storeId);
  await assertCustomerBelongsToStore(customerId, resolvedStoreId, options);
  const payload = sanitizeAddressWithDefault(data, true);
  await saveCustomerAddress(customerId, payload, resolvedStoreId, options);
  return getCustomerProfile(customerId, resolvedStoreId, options);
}

async function updateCustomerAddressByAdmin(customerId, addressId, data, storeId = null, options = {}) {
  const db = options.db || dbRequest;
  const resolvedStoreId = cleanUuid(storeId);
  await assertCustomerBelongsToStore(customerId, resolvedStoreId, options);
  const payload = sanitizeAddressWithDefault(data, true);
  if (payload.is_default) {
    await db('PATCH', 'customer_addresses', {
      customer_id: `eq.${customerId}`,
      ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {})
    }, {
      is_default: false
    }, ['Prefer: return=minimal']);
  }

  const [updated] = await db('PATCH', 'customer_addresses', {
    id: `eq.${addressId}`,
    customer_id: `eq.${customerId}`,
    ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {})
  }, payload, ['Prefer: return=representation']);
  if (!updated) throw httpError(404, 'Endereço não encontrado nesta loja.');
  return getCustomerProfile(customerId, resolvedStoreId, options);
}

async function deleteCustomerAddressByAdmin(customerId, addressId, storeId = null, options = {}) {
  const db = options.db || dbRequest;
  const resolvedStoreId = cleanUuid(storeId);
  await assertCustomerBelongsToStore(customerId, resolvedStoreId, options);
  await db('DELETE', 'customer_addresses', {
    id: `eq.${addressId}`,
    customer_id: `eq.${customerId}`,
    ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {})
  }, undefined, ['Prefer: return=minimal']);
  const addresses = await listCustomerAddresses(customerId, resolvedStoreId, options);
  if (addresses.length && !addresses.some((address) => address.is_default)) {
    await db('PATCH', 'customer_addresses', { id: `eq.${addresses[0].id}` }, {
      is_default: true
    }, ['Prefer: return=minimal']);
  }
  return getCustomerProfile(customerId, resolvedStoreId, options);
}

async function getDefaultAddress(customerId, options = {}) {
  const rows = await listCustomerAddresses(customerId, null, options);
  return rows[0] || null;
}

async function listCustomerAddresses(customerId, storeId = null, options = {}) {
  const db = options.db || dbRequest;
  const resolvedStoreId = cleanUuid(storeId);
  return db('GET', 'customer_addresses', {
    select: '*',
    customer_id: `eq.${customerId}`,
    ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
    order: 'is_default.desc,created_at.desc'
  });
}

async function assertCustomerBelongsToStore(customerId, storeId = null, options = {}) {
  const db = options.db || dbRequest;
  const resolvedStoreId = cleanUuid(storeId);
  const [customer] = await db('GET', 'customers', {
    select: 'id,store_id',
    id: `eq.${customerId}`,
    ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
    limit: '1'
  });
  if (!customer) throw httpError(404, 'Cliente não encontrado nesta loja.');
  return customer;
}

async function resolvePublicStore(req, url) {
  const hostStore = await getStoreByHost(req);
  const slug = cleanSlug(
    url.searchParams.get('store') ||
    url.searchParams.get('loja') ||
    req.headers['x-store-slug'] ||
    storeSlugFromReferer(req) ||
    ''
  );
  const store = hostStore || (slug ? await getStoreBySlug(slug) : await getDefaultStore());
  if (!store) {
    throw httpError(404, 'Loja não encontrada ou indisponível.', { code: 'STORE_NOT_FOUND' });
  }
  return { store };
}

async function resolveTenant(req, url) {
  const context = await resolvePublicStore(req, url);
  return {
    ...context,
    tenant: null,
    db: dbRequest
  };
}

async function adminOperationalOptions(admin) {
  return {
    db: dbRequest,
    tenant: null
  };
}

async function getStoreByHost(req) {
  const forwardedHost = String(req.headers['x-forwarded-host'] || req.headers['x-original-host'] || '').split(',')[0];
  const rawHost = forwardedHost || req.headers.host || '';
  const host = normalizeDomain(String(rawHost).split(':')[0] || '');
  if (!host || ['localhost', '127.0.0.1', '0.0.0.0'].includes(host)) return null;
  const [domain] = await dbRequest('GET', 'store_domains', {
    select: '*',
    domain: `eq.${host}`,
    status: 'in.(verified,active)',
    limit: '1'
  }).catch(() => []);
  if (!domain) return null;
  const [store] = await dbRequest('GET', 'stores', {
    select: '*',
    id: `eq.${domain.store_id}`,
    is_active: 'eq.true',
    limit: '1'
  });
  return store || null;
}

function storeSlugFromReferer(req) {
  try {
    const referer = String(req.headers.referer || '');
    if (!referer) return '';
    const parsed = new URL(referer);
    return firstPublicPathSegment(parsed.pathname);
  } catch {
    return '';
  }
}

function firstPublicPathSegment(pathname) {
  const segment = String(pathname || '').split('/').filter(Boolean)[0] || '';
  if (!segment || ['admin', 'api', 'payment', 'pedidos', 'conta', 'kitchen'].includes(segment)) return '';
  return segment;
}

async function getStoreBySlug(slug) {
  const clean = cleanSlug(slug);
  if (!clean) return null;
  const rows = await dbRequest('GET', 'stores', {
    select: '*',
    slug: `eq.${clean}`,
    is_active: 'eq.true',
    limit: '1'
  });
  return rows[0] || null;
}

async function getDefaultStore() {
  const bySlug = await getStoreBySlug(DEFAULT_STORE_SLUG);
  if (bySlug) return ensureDefaultStoreContent(bySlug);
  return ensureDefaultStoreStructure();
}

async function ensureDefaultStoreStructure() {
  const [existingCompany] = await dbRequest('GET', 'companies', {
    select: '*',
    name: 'eq.Luske Alimentacao',
    limit: '1'
  }).catch(() => []);
  const company = existingCompany || (await dbRequest('POST', 'companies', {}, {
    name: 'Luske Alimentacao',
    status: 'trial'
  }, ['Prefer: return=representation']).catch(() => []))[0];
  if (!company?.id) return null;
  const [store] = await dbRequest('POST', 'stores', {}, {
    company_id: company.id,
    name: 'LSK Burguer',
    slug: DEFAULT_STORE_SLUG,
    description: 'Loja online da LSK Burguer no TáPronto.',
    public_url: `/${DEFAULT_STORE_SLUG}`,
    is_active: true
  }, ['Prefer: return=representation']).catch(async () => {
    return dbRequest('GET', 'stores', {
      select: '*',
      slug: `eq.${DEFAULT_STORE_SLUG}`,
      limit: '1'
    }).catch(() => []);
  });
  if (!store?.id) return null;
  await dbRequest('POST', 'store_settings', {}, {
    store_id: store.id,
    name: store.name,
    slug: store.slug,
    description: store.description,
    payment_methods: ['Pix', 'Cartao na entrega', 'Dinheiro'],
    business_hours: {},
    theme_settings: {},
    print_settings: {},
    integration_settings: {},
    onboarding_completed: false,
    is_open: false
  }, ['Prefer: return=minimal']).catch(() => {});
  return ensureDefaultStoreContent(store);
}

async function ensureDefaultStoreContent(store) {
  if (!store?.id) return store || null;
  const settings = await dbRequest('GET', 'store_settings', {
    select: 'id',
    store_id: `eq.${store.id}`,
    limit: '1'
  }).catch(() => []);
  if (!settings.length) {
    await dbRequest('POST', 'store_settings', {}, {
      store_id: store.id,
      name: store.name || 'LSK Burguer',
      slug: store.slug || DEFAULT_STORE_SLUG,
      description: store.description || 'Loja de demonstração do TáPronto.',
      is_open: true,
      accepts_delivery: true,
      accepts_pickup: true,
      delivery_fee: 5,
      minimum_order: 20,
      payment_methods: ['Pix', 'Cartao na entrega', 'Dinheiro'],
      business_hours: defaultBusinessHours(),
      theme_settings: defaultThemeSettings(),
      print_settings: defaultPrintSettings(),
      integration_settings: defaultIntegrationSettings(),
      onboarding_completed: true
    }, ['Prefer: return=minimal']).catch(() => {});
  }

  const existingItems = await dbRequest('GET', 'menu_items', {
    select: 'id',
    store_id: `eq.${store.id}`,
    limit: '1'
  }).catch(() => []);
  if (existingItems.length) return store;

  const demoCategories = [
    { name: 'Hamburgueres', description: 'Burgers artesanais com pao macio, queijo e molhos da casa.', sort_order: 10 },
    { name: 'Porcoes', description: 'Entradas e acompanhamentos para compartilhar.', sort_order: 20 },
    { name: 'Bebidas', description: 'Opcoes geladas para acompanhar o pedido.', sort_order: 30 }
  ];
  const categoriesByName = new Map();
  for (const category of demoCategories) {
    const [existingCategory] = await dbRequest('GET', 'menu_categories', {
      select: '*',
      store_id: `eq.${store.id}`,
      name: `eq.${category.name}`,
      limit: '1'
    }).catch(() => []);
    const [created] = existingCategory ? [existingCategory] : await dbRequest('POST', 'menu_categories', {}, {
      store_id: store.id,
      name: category.name,
      description: category.description,
      sort_order: category.sort_order,
      is_active: true
    }, ['Prefer: return=representation']).catch(async () => dbRequest('GET', 'menu_categories', {
      select: '*',
      store_id: `eq.${store.id}`,
      name: `eq.${category.name}`,
      limit: '1'
    }).catch(() => []));
    if (created?.id) categoriesByName.set(category.name, created);
  }

  const demoItems = [
    {
      category: 'Hamburgueres',
      name: 'Luske Smash',
      description: 'Dois smash burgers, cheddar cremoso, cebola caramelizada e molho da casa.',
      price: 34.9,
      image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80',
      tags: ['smash', 'cheddar'],
      is_featured: true,
      sort_order: 10
    },
    {
      category: 'Hamburgueres',
      name: 'Bacon Supreme',
      description: 'Burger artesanal, bacon crocante, queijo prato, alface, tomate e maionese temperada.',
      price: 39.9,
      image_url: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?auto=format&fit=crop&w=900&q=80',
      tags: ['bacon', 'artesanal'],
      is_featured: true,
      sort_order: 20
    },
    {
      category: 'Porcoes',
      name: 'Batata da Casa',
      description: 'Batata crocante com cheddar, bacon e molho especial.',
      price: 24.9,
      image_url: 'https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?auto=format&fit=crop&w=900&q=80',
      tags: ['porcao'],
      is_featured: false,
      sort_order: 10
    },
    {
      category: 'Bebidas',
      name: 'Refrigerante Lata',
      description: 'Escolha o sabor nas observacoes do pedido.',
      price: 7.9,
      image_url: '',
      tags: ['bebida'],
      is_featured: false,
      sort_order: 10
    }
  ];
  for (const item of demoItems) {
    const category = categoriesByName.get(item.category);
    if (!category?.id) continue;
    await dbRequest('POST', 'menu_items', {}, {
      store_id: store.id,
      category_id: category.id,
      name: item.name,
      description: item.description,
      price: item.price,
      image_url: item.image_url || null,
      tags: item.tags,
      is_featured: item.is_featured,
      is_available: true,
      sort_order: item.sort_order
    }, ['Prefer: return=minimal']).catch(() => {});
  }
  clearMenuCache();
  clearStoreSettingsCache();
  return store;
}

async function getStoreSettings(storeId, options = {}) {
  const db = options.db || dbRequest;
  const resolvedStoreId = (storeId ? cleanUuid(storeId) : '') || (await getDefaultStore())?.id || '';
  const cacheKey = `${resolvedStoreId || 'default'}:${options.tenant?.id || 'central'}`;
  const now = Date.now();
  const cached = storeSettingsCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }
  const query = {
    select: '*',
    order: 'created_at.asc',
    limit: '1'
  };
  if (resolvedStoreId) query.store_id = `eq.${resolvedStoreId}`;
  const [rows, storeRows] = await Promise.all([
    db('GET', 'store_settings', query),
    resolvedStoreId
      ? db('GET', 'stores', { select: '*', id: `eq.${resolvedStoreId}`, limit: '1' }).catch(() => [])
      : Promise.resolve([])
  ]);
  const canonicalStore = storeRows[0] || null;

  const store = rows[0] || {
    store_id: resolvedStoreId || null,
    name: 'Menu da Casa',
    page_title: 'TáPronto',
    description: 'Pedido rápido pelo TáPronto.',
    whatsapp_number: STORE_WHATSAPP_NUMBER,
    is_open: true,
    accepts_delivery: true,
    accepts_pickup: true,
    delivery_fee: 0,
    delivery_neighborhood_fees: defaultNeighborhoodFees(),
    minimum_order: 0,
    payment_methods: ['Pix', 'Cartão', 'Dinheiro'],
    business_hours: defaultBusinessHours(),
    loyalty_program: defaultLoyaltyProgram(),
    theme_settings: defaultThemeSettings(),
    print_settings: defaultPrintSettings(),
    onboarding_completed: false
  };
  const normalized = {
    ...store,
    name: store.name || canonicalStore?.name || 'Menu da Casa',
    slug: canonicalStore?.slug || store.slug || '',
    public_url: canonicalStore?.public_url || (canonicalStore?.slug ? `/${canonicalStore.slug}` : store.public_url || ''),
    store_is_active: canonicalStore?.is_active !== false,
    company_id: canonicalStore?.company_id || store.company_id || null,
    delivery_neighborhood_fees: isPlainObject(store.delivery_neighborhood_fees) ? store.delivery_neighborhood_fees : defaultNeighborhoodFees(),
    business_hours: isPlainObject(store.business_hours) ? store.business_hours : defaultBusinessHours(),
    loyalty_program: sanitizeLoyaltyProgram(store.loyalty_program || {}),
    theme_settings: sanitizeThemeSettings(store.theme_settings || {}),
    print_settings: sanitizePrintSettings(store.print_settings || {}),
    integration_settings: sanitizeIntegrationSettings(store.integration_settings || {})
  };
  storeSettingsCache.set(cacheKey, {
    data: normalized,
    expiresAt: now + STORE_SETTINGS_CACHE_MS
  });
  return normalized;
}

async function getPublicBootstrap(storeId, options = {}) {
  const cacheKey = cleanUuid(storeId) || 'default';
  const now = Date.now();
  const cacheKeyWithTenant = options.tenant?.id ? `${cacheKey}:tenant:${options.tenant.id}` : cacheKey;
  const cached = publicBootstrapCache.get(cacheKeyWithTenant);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const [store, categories] = await Promise.all([
    getStoreSettings(storeId, options),
    getMenu(false, storeId, options)
  ]);
  const data = { store: publicStore(store), categories };
  publicBootstrapCache.set(cacheKeyWithTenant, {
    data,
    expiresAt: now + PUBLIC_BOOTSTRAP_CACHE_MS
  });
  return data;
}

function clearPublicBootstrapCache() {
  publicBootstrapCache.clear();
}

function clearStoreSettingsCache() {
  storeSettingsCache.clear();
  clearPublicBootstrapCache();
}

function clearMenuCache() {
  menuCache.clear();
  clearPublicBootstrapCache();
}

function clearAdminCustomersCache() {
  adminCustomersCache = null;
}

function clearAdminPromotionsCache() {
  adminPromotionsCache = null;
}

function clearAdminTablesCache() {
  adminTablesCache = null;
}

function clearAdminUsersCache() {
  adminUsersCache = null;
}

async function updateStoreSettings(data, storeId, options = {}) {
  const db = options.db || dbRequest;
  const current = await getStoreSettings(storeId, options);
  const resolvedStoreId = cleanUuid(storeId) || current.store_id || null;
  const payload = sanitizeStore(data);
  const nextSlug = cleanSlug(payload.slug || current.slug || payload.name || '');
  if (!nextSlug) throw httpError(422, 'Informe o caminho público da loja.');
  if (reservedPublicSlugs().has(nextSlug)) {
    throw httpError(422, 'Este caminho público é reservado. Escolha outro.');
  }
  const existingStore = await getStoreBySlug(nextSlug);
  if (existingStore && existingStore.id !== resolvedStoreId) {
    throw httpError(409, 'Este caminho público já está sendo usado por outra loja.');
  }
  payload.slug = nextSlug;

  if (resolvedStoreId) {
    const storePayload = {
      ...(payload.name ? { name: payload.name } : {}),
      slug: nextSlug,
      public_url: `/${nextSlug}`,
      ...(payload.description !== undefined ? { description: payload.description || null } : {})
    };
    await dbRequest('PATCH', 'stores', { id: `eq.${resolvedStoreId}` }, storePayload, ['Prefer: return=minimal']);
    if (options.tenant) {
      await db('PATCH', 'stores', { id: `eq.${resolvedStoreId}` }, storePayload, ['Prefer: return=minimal']).catch(() => {});
    }
  }

  let result;
  if (current.id) {
    result = await db('PATCH', 'store_settings', { id: `eq.${current.id}` }, payload, ['Prefer: return=representation']);
  } else {
    result = await db('POST', 'store_settings', {}, { ...payload, store_id: resolvedStoreId }, ['Prefer: return=representation']);
  }
  storeSettingsCache.delete(resolvedStoreId || 'default');
  publicBootstrapCache.clear();
  return result;
}

async function updateLoyaltyProgram(data, storeId, options = {}) {
  const db = options.db || dbRequest;
  const current = await getStoreSettings(storeId, options);
  const resolvedStoreId = cleanUuid(storeId) || current.store_id || null;
  const payload = {
    loyalty_program: sanitizeLoyaltyProgram(data.loyalty_program || data)
  };

  if (current.id) {
    const [updated] = await db('PATCH', 'store_settings', { id: `eq.${current.id}` }, payload, ['Prefer: return=representation']);
    return {
      ...updated,
      loyalty_program: sanitizeLoyaltyProgram(updated.loyalty_program || {})
    };
  }

  const [created] = await db('POST', 'store_settings', {}, {
    store_id: resolvedStoreId,
    name: current.name || 'Menu da Casa',
    slug: current.slug || 'menu-da-casa',
    description: current.description || 'Pedido rápido pelo TáPronto.',
    whatsapp_number: current.whatsapp_number || STORE_WHATSAPP_NUMBER,
    loyalty_program: payload.loyalty_program
  }, ['Prefer: return=representation']);
  return {
    ...created,
    loyalty_program: sanitizeLoyaltyProgram(created.loyalty_program || {})
  };
}

async function updatePrintSettings(data, storeId, options = {}) {
  const db = options.db || dbRequest;
  const current = await getStoreSettings(storeId, options);
  const resolvedStoreId = cleanUuid(storeId) || current.store_id || null;
  const payload = {
    print_settings: sanitizePrintSettings(data.print_settings || data)
  };

  if (current.id) {
    const [updated] = await db('PATCH', 'store_settings', { id: `eq.${current.id}` }, payload, ['Prefer: return=representation']);
    return {
      ...updated,
      print_settings: sanitizePrintSettings(updated.print_settings || {})
    };
  }

  const [created] = await db('POST', 'store_settings', {}, {
    store_id: resolvedStoreId,
    name: current.name || 'Menu da Casa',
    slug: current.slug || 'menu-da-casa',
    description: current.description || 'Pedido rápido pelo TáPronto.',
    whatsapp_number: current.whatsapp_number || STORE_WHATSAPP_NUMBER,
    print_settings: payload.print_settings
  }, ['Prefer: return=representation']);
  return {
    ...created,
    print_settings: sanitizePrintSettings(created.print_settings || {})
  };
}

async function updateIntegrationSettings(data, storeId, options = {}) {
  const db = options.db || dbRequest;
  const current = await getStoreSettings(storeId, options);
  const resolvedStoreId = cleanUuid(storeId) || current.store_id || null;
  const nextSettings = mergeIntegrationSettings(current.integration_settings || {}, data.integration_settings || data);
  const payload = {
    integration_settings: nextSettings
  };

  if (current.id) {
    const [updated] = await db('PATCH', 'store_settings', { id: `eq.${current.id}` }, payload, ['Prefer: return=representation']);
    return {
      ...updated,
      integration_settings: sanitizeIntegrationSettings(updated.integration_settings || {})
    };
  }

  const [created] = await db('POST', 'store_settings', {}, {
    store_id: resolvedStoreId,
    name: current.name || 'Menu da Casa',
    slug: current.slug || 'menu-da-casa',
    description: current.description || 'Pedido rápido pelo TáPronto.',
    whatsapp_number: current.whatsapp_number || STORE_WHATSAPP_NUMBER,
    integration_settings: payload.integration_settings
  }, ['Prefer: return=representation']);
  return {
    ...created,
    integration_settings: sanitizeIntegrationSettings(created.integration_settings || {})
  };
}

async function testIntegrations(data = {}, storeId, options = {}) {
  const store = await getStoreSettings(storeId, options);
  const settings = data.integration_settings
    ? mergeIntegrationSettings(store.integration_settings || {}, data.integration_settings)
    : sanitizeIntegrationSettings(store.integration_settings || {});
  const whatsappCheck = await testWhatsappIntegration(settings.whatsapp).catch((error) => ({
    ok: false,
    message: error.message || 'Não foi possível testar o WhatsApp.'
  }));
  return {
    whatsapp: {
      enabled: settings.whatsapp.enabled,
      provider: settings.whatsapp.provider,
      ok: whatsappCheck.ok,
      message: whatsappCheck.message
    },
    pix: {
      enabled: settings.pix.enabled,
      provider: settings.pix.provider,
      ok: settings.pix.enabled ? Boolean(settings.pix.apiKey) : true,
      message: settings.pix.enabled
        ? (settings.pix.apiKey ? 'Abacate Pay pronta para gerar Pix online.' : 'Informe a API key da Abacate Pay.')
        : 'Pix online desativado.'
    }
  };
}

async function testWhatsappIntegration(settings) {
  if (!settings.enabled) return { ok: true, message: 'WhatsApp automático desativado.' };
  if (settings.provider === 'whatsevolution' || isWhatsEvolutionUrl(settings.apiUrl)) {
    if (!settings.apiUrl || !settings.accessToken) {
      return { ok: false, message: 'Informe URL da API e API key da WhatsEvolution.' };
    }
    if (!settings.phoneNumberId) {
      if (isWhatsEvolutionManagedUrl(settings.apiUrl)) {
        return { ok: true, message: 'WhatsEvolution configurada em modo gerenciado. Envio usará /send-message.' };
      }
      return { ok: false, message: 'Informe a instância da WhatsEvolution/Evolution API.' };
    }
    const response = await fetchWithTimeout(`${settings.apiUrl.replace(/\/$/, '')}/instance/connectionState/${encodeURIComponent(settings.phoneNumberId)}`, {
      headers: {
        apikey: settings.accessToken,
        'Content-Type': 'application/json'
      }
    }, 7000);
    const payload = await safeResponse(response);
    if (!response.ok) {
      return { ok: false, message: whatsappProviderError('Falha ao verificar instância WhatsEvolution.', payload) };
    }
    const state = payload?.instance?.state || payload?.state || 'desconhecido';
    return { ok: String(state).toLowerCase() === 'open', message: `WhatsEvolution: instância ${state}.` };
  }
  const hasConfig = Boolean(settings.phoneNumberId || settings.apiUrl || settings.accessToken);
  return {
    ok: hasConfig,
    message: hasConfig ? 'Configuração de WhatsApp pronta para envio via provedor.' : 'Preencha a configuração do WhatsApp.'
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw httpError(504, 'Tempo esgotado ao testar o provedor. Verifique URL, instância e conexão da API.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function setStoreOpen(isOpen, storeId, options = {}) {
  const db = options.db || dbRequest;
  const current = await getStoreSettings(storeId, options);
  const resolvedStoreId = cleanUuid(storeId) || current.store_id || null;
  const payload = { is_open: Boolean(isOpen) };

  if (current.id) {
    const [updated] = await db('PATCH', 'store_settings', { id: `eq.${current.id}` }, payload, ['Prefer: return=representation']);
    return updated;
  }

  const [created] = await db('POST', 'store_settings', {}, {
    store_id: resolvedStoreId,
    name: current.name || 'Menu da Casa',
    slug: current.slug || 'menu-da-casa',
    description: current.description || 'Pedido rápido pelo TáPronto.',
    whatsapp_number: current.whatsapp_number || STORE_WHATSAPP_NUMBER,
    accepts_delivery: current.accepts_delivery !== false,
    accepts_pickup: current.accepts_pickup !== false,
    delivery_fee: current.delivery_fee || 0,
    delivery_neighborhood_fees: current.delivery_neighborhood_fees || defaultNeighborhoodFees(),
    minimum_order: current.minimum_order || 0,
    payment_methods: current.payment_methods || ['Pix', 'Cartão', 'Dinheiro'],
    business_hours: current.business_hours || defaultBusinessHours(),
    ...payload
  }, ['Prefer: return=representation']);
  return created;
}

async function getMenu(admin, storeId, options = {}) {
  const db = options.db || dbRequest;
  const resolvedStoreId = cleanUuid(storeId) || (await getDefaultStore())?.id || '';
  const cacheKey = `${admin ? 'admin' : 'public'}:${resolvedStoreId || 'default'}:${options.tenant?.id || 'central'}`;
  const now = Date.now();
  const cached = menuCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }
  const [categories, items, groups, modifiers] = await Promise.all([
    db('GET', 'menu_categories', {
      select: admin ? '*' : 'id,name,description,sort_order',
      ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
      ...(admin ? {} : { is_active: 'eq.true' }),
      order: 'sort_order.asc,name.asc'
    }),
    db('GET', 'menu_items', {
      select: admin ? '*' : 'id,category_id,name,description,price,image_url,tags,is_featured,is_available,sort_order',
      ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
      ...(admin ? {} : { is_available: 'eq.true' }),
      order: 'sort_order.asc,name.asc'
    }),
    db('GET', 'menu_modifier_groups', {
      select: '*',
      ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
      order: 'sort_order.asc,name.asc'
    }),
    db('GET', 'menu_modifiers', {
      select: '*',
      ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
      ...(admin ? {} : { is_available: 'eq.true' }),
      order: 'sort_order.asc,name.asc'
    })
  ]);

  const modifiersByGroup = new Map(groups.map((group) => [group.id, []]));
  for (const modifier of modifiers) {
    modifiersByGroup.get(modifier.group_id)?.push(modifier);
  }

  const groupsByItem = new Map();
  for (const group of groups) {
    if (!groupsByItem.has(group.menu_item_id)) groupsByItem.set(group.menu_item_id, []);
    groupsByItem.get(group.menu_item_id).push({
      ...group,
      modifiers: modifiersByGroup.get(group.id) || []
    });
  }

  const byCategory = new Map(categories.map((category) => [category.id, { ...category, items: [] }]));
  for (const item of items) {
    byCategory.get(item.category_id)?.items.push({
      ...item,
      modifier_groups: groupsByItem.get(item.id) || []
    });
  }

  const menu = [...byCategory.values()];
  menuCache.set(cacheKey, {
    data: menu,
    expiresAt: now + MENU_CACHE_MS
  });
  return menu;
}

async function createOrder(req, data, options = {}) {
  const db = options.db || dbRequest;
  const storeId = cleanUuid(options.storeId) || (await getDefaultStore())?.id || null;
  const commercial = await companyCommercialStatusByStore(storeId);
  if (!commercial.canOperate) throw httpError(402, commercial.message);
  await assertPublicUsageLimitByStore(storeId, 'orders', 'orders');
  const session = await readPersistentSession(parseCookies(req)[CUSTOMER_COOKIE], 'customer');
  let fulfillmentMethod = ['delivery', 'pickup', 'counter', 'table', 'tab'].includes(data.fulfillment_method)
    ? data.fulfillment_method
    : 'delivery';
  const customer = sanitizeOrderCustomer(data.customer || {}, fulfillmentMethod);
  const address = fulfillmentMethod === 'delivery' ? sanitizeAddress(data.address || {}) : null;
  const paymentMethod = cleanText(data.payment_method || '');
  const paymentDetails = sanitizePaymentDetails(data.payment_details || {}, paymentMethod);
  const notes = cleanText(data.notes || '');
  const couponCode = cleanText(data.coupon_code || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const requestedItems = Array.isArray(data.items) ? data.items : [];

  if (!paymentMethod) throw httpError(422, 'Informe a forma de pagamento.');
  if (requestedItems.length === 0) throw httpError(422, 'Inclua ao menos um item no pedido.');

  const itemIds = cleanUuidArray(requestedItems.map((item) => item.id));
  if (itemIds.length === 0) throw httpError(422, 'Itens do pedido inválidos.');

  const menuItems = await db('GET', 'menu_items', {
    select: '*',
    ...(storeId ? { store_id: `eq.${storeId}` } : {}),
    id: uuidInFilter(itemIds),
    is_available: 'eq.true'
  });

  const menuById = new Map(menuItems.map((item) => [item.id, item]));
  const modifierCatalog = await loadModifierCatalog(itemIds, storeId, options);
  const orderItems = requestedItems.map((requested) => {
    const menuItem = menuById.get(cleanUuid(requested.id));
    if (!menuItem) throw httpError(422, 'Um item escolhido não está mais disponível.');

    const quantity = clampInteger(requested.quantity, 1, 99);
    const selectedModifiers = options.skipModifierValidation
      ? validateExistingSelectedModifiers(menuItem.id, requested.modifier_ids, modifierCatalog)
      : validateSelectedModifiers(menuItem.id, requested.modifier_ids, modifierCatalog);
    const basePrice = moneyNumber(menuItem.price);
    const modifiersTotal = selectedModifiers.reduce((sum, modifier) => sum + moneyNumber(modifier.price_delta), 0);
    const unitPrice = roundMoney(basePrice + modifiersTotal);
    return {
      menu_item_id: menuItem.id,
      item_snapshot: {
        id: menuItem.id,
        name: menuItem.name,
        description: menuItem.description,
        price: basePrice,
        category_id: menuItem.category_id,
        modifiers: selectedModifiers.map((modifier) => ({
          id: modifier.id,
          group_id: modifier.group_id,
          group_name: modifier.group_name,
          name: modifier.name,
          price_delta: moneyNumber(modifier.price_delta)
        })),
        image_url: menuItem.image_url,
        tags: menuItem.tags || []
      },
      quantity,
      unit_price: unitPrice,
      total: roundMoney(unitPrice * quantity),
      notes: cleanText(requested.notes || '')
    };
  });

  const store = await getStoreSettings(storeId, options);
  if (store.is_open === false && !options.allowClosedStore) {
    throw httpError(423, 'A loja está fechada no momento e não está aceitando pedidos.');
  }
  const integrationSettings = sanitizeIntegrationSettings(store.integration_settings || {});
  if (isOnlinePixPayment(paymentMethod) && !integrationSettings.pix.enabled) {
    throw httpError(422, 'Pix online não está ativo nesta loja.');
  }
  if (isOnlineCardPayment(paymentMethod) && !integrationSettings.card.enabled) {
    throw httpError(422, 'Cartão online não está ativo nesta loja.');
  }
  const subtotal = roundMoney(orderItems.reduce((sum, item) => sum + item.total, 0));
  const deliveryFee = fulfillmentMethod === 'delivery' ? deliveryFeeForAddress(store, address) : 0;
  const table = ['table', 'tab'].includes(fulfillmentMethod) ? await requireActiveDiningTable(data.dining_table_id || data.table_code, storeId, options) : null;
  let tab = null;
  if (fulfillmentMethod === 'tab') {
    tab = await requireOpenTab(data.customer_tab_id, table?.id, storeId, options);
  } else if (fulfillmentMethod === 'table' && table?.id) {
    tab = await findOpenTabForTable(table.id, storeId, options);
    if (tab) fulfillmentMethod = 'tab';
  }
  let customerRow = null;
  if (session?.data?.id) {
    customerRow = await getCustomerProfile(session.data.id, storeId, options).catch((error) => {
      if (options.tenant && error.status === 404) return null;
      throw error;
    });
  }
  if (!customerRow && customer.phone) {
    customerRow = await upsertCustomer(customer, storeId, options);
  }
  const coupon = couponCode ? await findActivePromotion(couponCode, {
    db,
    storeId,
    subtotal,
    deliveryFee,
    customer: customerRow,
    items: orderItems
  }) : null;
  const discount = coupon ? couponDiscountAmount(coupon, subtotal, deliveryFee) : 0;
  const total = roundMoney(Math.max(0, subtotal + deliveryFee - discount));
  validatePaymentDetails(paymentDetails, paymentMethod, total);
  validateOnlinePaymentAmount(paymentMethod, integrationSettings, total);

  if (fulfillmentMethod === 'delivery') {
    await upsertAddress(customerRow.id, address, storeId, options);
  }

  const orderPayload = {
    store_id: storeId,
    public_code: createPublicCode(),
    customer_id: customerRow?.id || null,
    status: 'new',
    fulfillment_method: fulfillmentMethod,
    payment_method: paymentMethod,
    customer_snapshot: customer,
    address_snapshot: address,
    dining_table_id: table?.id || null,
    customer_tab_id: tab?.id || null,
    table_snapshot: table ? { id: table.id, name: table.name, code: table.code } : null,
    tab_snapshot: tab ? { id: tab.id, name: tab.name, customer_name: tab.customer_name } : null,
    subtotal,
    delivery_fee: deliveryFee,
    discount,
    total,
    notes,
    payment_details: paymentDetails,
    financial_status: isOnlinePixPayment(paymentMethod) ? 'pending' : 'pending',
    payment_provider: onlinePaymentProviderFor(paymentMethod, integrationSettings),
    promotion_code: coupon?.code || null
  };

  const [order] = await db('POST', 'orders', {}, orderPayload, ['Prefer: return=representation']);
  clearAdminOrdersCache(storeId);
  await recordUsageByStore(storeId, 'orders', 'orders', { entity_type: 'order', entity_id: order.id });
  const itemsWithOrder = orderItems.map((item) => ({ ...item, order_id: order.id, store_id: storeId }));
  await db('POST', 'order_items', {}, itemsWithOrder, ['Prefer: return=representation']);
  if (coupon) {
    await db('PATCH', 'promotions', { id: `eq.${coupon.id}` }, {
      used_count: Number(coupon.used_count || 0) + 1
    }, ['Prefer: return=minimal']);
    clearAdminPromotionsCache();
  }

  const whatsappMessage = buildWhatsappMessage(store, order, itemsWithOrder, customer, address);
  const [updatedOrder] = await db('PATCH', 'orders', { id: `eq.${order.id}` }, {
    whatsapp_message: whatsappMessage
  }, ['Prefer: return=representation']);

  let payment = null;
  let finalOrder = updatedOrder;
  if (isOnlinePixPayment(paymentMethod)) {
    payment = await createPixPayment(updatedOrder, options);
    finalOrder = payment.order;
  } else if (isOnlineCardPayment(paymentMethod)) {
    payment = await createCardPayment(updatedOrder, options);
    finalOrder = payment.order;
  }
  const hasOnlinePayment = isOnlinePaymentMethod(paymentMethod);
  if (!hasOnlinePayment) {
    await sendOrderStatusWhatsapp(order.id, 'new', { manual: false, db, tenant: options.tenant }).catch(() => null);
  }
  if (['table', 'tab'].includes(fulfillmentMethod)) clearAdminTablesCache();
  if (customerRow?.id) clearAdminCustomersCache();

  const whatsappNumber = whatsappRecipientPhone(store.whatsapp_number || STORE_WHATSAPP_NUMBER);
  const whatsappUrl = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`
    : null;

  return {
    order: { ...finalOrder, items: itemsWithOrder },
    payment,
    whatsapp_url: hasOnlinePayment ? null : whatsappUrl,
    whatsapp_message: whatsappMessage
  };
}

async function loadModifierCatalog(itemIds, storeId, options = {}) {
  const db = options.db || dbRequest;
  const cleanItemIds = cleanUuidArray(itemIds);
  const resolvedStoreId = cleanUuid(storeId);
  if (cleanItemIds.length === 0) return { groupsByItem: new Map(), modifiersById: new Map() };
  const groups = await db('GET', 'menu_modifier_groups', {
    select: '*',
    ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
    menu_item_id: uuidInFilter(cleanItemIds),
    order: 'sort_order.asc,name.asc'
  });

  if (groups.length === 0) {
    return { groupsByItem: new Map(), modifiersById: new Map() };
  }

  const groupIds = cleanUuidArray(groups.map((group) => group.id));
  const modifiers = await db('GET', 'menu_modifiers', {
    select: '*',
    ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
    group_id: uuidInFilter(groupIds),
    is_available: 'eq.true',
    order: 'sort_order.asc,name.asc'
  });

  const groupsByItem = new Map();
  const groupsById = new Map();
  for (const group of groups) {
    groupsById.set(group.id, group);
    if (!groupsByItem.has(group.menu_item_id)) groupsByItem.set(group.menu_item_id, []);
    groupsByItem.get(group.menu_item_id).push(group);
  }

  const modifiersById = new Map();
  for (const modifier of modifiers) {
    const group = groupsById.get(modifier.group_id);
    if (!group) continue;
    modifiersById.set(modifier.id, {
      ...modifier,
      menu_item_id: group.menu_item_id,
      group_name: group.name,
      min_choices: group.min_choices,
      max_choices: group.max_choices,
      is_required: group.is_required
    });
  }

  return { groupsByItem, modifiersById };
}

function validateSelectedModifiers(menuItemId, selectedIds, catalog) {
  const ids = cleanUuidArray(selectedIds || []);
  const selected = ids.map((id) => {
    const modifier = catalog.modifiersById.get(id);
    if (!modifier || modifier.menu_item_id !== menuItemId) {
      throw httpError(422, 'Adicional inválido para um item escolhido.');
    }
    return modifier;
  });

  const selectedByGroup = new Map();
  for (const modifier of selected) {
    if (!selectedByGroup.has(modifier.group_id)) selectedByGroup.set(modifier.group_id, []);
    selectedByGroup.get(modifier.group_id).push(modifier);
  }

  const groups = catalog.groupsByItem.get(menuItemId) || [];
  for (const group of groups) {
    const count = selectedByGroup.get(group.id)?.length || 0;
    if (group.is_required && count < Number(group.min_choices || 1)) {
      throw httpError(422, `Escolha ${group.name}.`);
    }
    if (count < Number(group.min_choices || 0)) {
      throw httpError(422, `Escolha ao menos ${group.min_choices} opção(ões) em ${group.name}.`);
    }
    if (Number(group.max_choices || 0) > 0 && count > Number(group.max_choices)) {
      throw httpError(422, `Escolha no máximo ${group.max_choices} opção(ões) em ${group.name}.`);
    }
  }

  return selected;
}

function validateExistingSelectedModifiers(menuItemId, selectedIds, catalog) {
  const ids = cleanUuidArray(selectedIds || []);
  return ids.map((id) => {
    const modifier = catalog.modifiersById.get(id);
    if (!modifier || modifier.menu_item_id !== menuItemId) {
      throw httpError(422, 'Adicional inválido para um item escolhido.');
    }
    return modifier;
  });
}

async function ensureUniqueModifierGroupName(menuItemId, name, options = {}) {
  const db = options.db || dbRequest;
  const existing = await db('GET', 'menu_modifier_groups', {
    select: 'id,name',
    menu_item_id: `eq.${menuItemId}`
  });
  const normalized = normalizeName(name);
  if (existing.some((group) => normalizeName(group.name) === normalized)) {
    throw httpError(409, 'Já existe um grupo com esse nome neste produto.');
  }
}

async function ensureUniqueModifierName(groupId, name, options = {}) {
  const db = options.db || dbRequest;
  const existing = await db('GET', 'menu_modifiers', {
    select: 'id,name',
    group_id: `eq.${groupId}`
  });
  const normalized = normalizeName(name);
  if (existing.some((modifier) => normalizeName(modifier.name) === normalized)) {
    throw httpError(409, 'Já existe uma opção com esse nome neste grupo.');
  }
}

async function upsertCustomer(customer, storeId, options = {}) {
  const db = options.db || dbRequest;
  const resolvedStoreId = cleanUuid(storeId) || null;
  const existing = await db('GET', 'customers', {
    select: '*',
    ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
    phone: `eq.${customer.phone}`,
    limit: '1'
  });

  if (existing[0]) {
    const [updated] = await db('PATCH', 'customers', { id: `eq.${existing[0].id}` }, customer, ['Prefer: return=representation']);
    return updated;
  }

  const [created] = await db('POST', 'customers', {}, {
    ...customer,
    store_id: resolvedStoreId
  }, ['Prefer: return=representation']);
  return created;
}

async function upsertAddress(customerId, address, storeId, options = {}) {
  if (!address) return null;
  const db = options.db || dbRequest;
  const resolvedStoreId = cleanUuid(storeId) || null;

  const existing = await db('GET', 'customer_addresses', {
    select: '*',
    ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
    customer_id: `eq.${customerId}`
  });

  const payload = { ...address, store_id: resolvedStoreId, customer_id: customerId, is_default: true };
  const sameAddress = existing.find((row) => addressKey(row) === addressKey(address));

  if (existing.length > 0) {
    await db('PATCH', 'customer_addresses', { customer_id: `eq.${customerId}` }, {
      is_default: false
    }, ['Prefer: return=minimal']);
  }

  if (sameAddress) {
    const [updated] = await db('PATCH', 'customer_addresses', { id: `eq.${sameAddress.id}` }, {
      ...payload,
      label: sameAddress.label || payload.label || 'Principal'
    }, ['Prefer: return=representation']);
    return updated;
  }

  const [created] = await db('POST', 'customer_addresses', {}, payload, ['Prefer: return=representation']);
  return created;
}

async function saveCustomerAddress(customerId, address, storeId = null, options = {}) {
  const db = options.db || dbRequest;
  const resolvedStoreId = cleanUuid(storeId) || cleanUuid(address.store_id) || await getCustomerStoreId(customerId, options);
  if (address.is_default) {
    await db('PATCH', 'customer_addresses', {
      customer_id: `eq.${customerId}`,
      ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {})
    }, {
      is_default: false
    }, ['Prefer: return=minimal']);
  }
  const [created] = await db('POST', 'customer_addresses', {}, {
    ...address,
    store_id: resolvedStoreId,
    customer_id: customerId
  }, ['Prefer: return=representation']);
  return created;
}

async function getCustomerStoreId(customerId, options = {}) {
  const db = options.db || dbRequest;
  const rows = await db('GET', 'customers', {
    select: 'store_id',
    id: `eq.${customerId}`,
    limit: '1'
  });
  return cleanUuid(rows[0]?.store_id) || null;
}

async function createPersistentSession(type, ownerId, data) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString();
  await dbRequest('POST', 'app_sessions', {}, {
    token,
    type,
    owner_id: ownerId,
    company_id: data.company_id ? cleanUuid(data.company_id) : null,
    store_id: data.store_id ? cleanUuid(data.store_id) : null,
    data,
    expires_at: expiresAt
  }, ['Prefer: return=minimal']);
  sessionCache.set(`${type}:${token}`, {
    session: { token, type, owner_id: ownerId, data, expires_at: expiresAt },
    expiresAt: Date.now() + SESSION_CACHE_MS
  });
  return token;
}

async function readPersistentSession(token, expectedType) {
  if (!token) return null;
  const cacheKey = `${expectedType}:${token}`;
  const cached = sessionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.session;
  }
  const rows = await dbRequest('GET', 'app_sessions', {
    select: '*',
    token: `eq.${token}`,
    type: `eq.${expectedType}`,
    limit: '1'
  });
  const session = rows[0];
  if (!session) return null;

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await deleteSession(token);
    return null;
  }

  if (new Date(session.expires_at).getTime() - Date.now() < SESSION_RENEW_MS) {
    await dbRequest('PATCH', 'app_sessions', { token: `eq.${token}` }, {
      expires_at: new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString()
    }, ['Prefer: return=minimal']);
  }

  sessionCache.set(cacheKey, {
    session,
    expiresAt: Date.now() + SESSION_CACHE_MS
  });
  return session;
}

async function deleteSession(token) {
  if (!token) return;
  clearSessionCacheToken(token);
  await dbRequest('DELETE', 'app_sessions', { token: `eq.${token}` }, undefined, ['Prefer: return=minimal']);
}

async function startPlatformSupportImpersonation(req, admin, data = {}) {
  await assertPlatformDangerConfirmation(req, admin, data, 'CONFIRMAR');
  const storeId = cleanUuid(data.store_id || data.storeId, 'loja');
  const [store] = await dbRequest('GET', 'stores', {
    select: '*',
    id: `eq.${storeId}`,
    limit: '1'
  });
  if (!store) throw httpError(404, 'Loja alvo não encontrada.');
  const company = await getCompanyById(store.company_id);
  const ttlSeconds = clampNumber(Number(data.ttl_seconds || data.ttlSeconds || 30 * 60), 1, 60 * 60);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  const originalToken = parseCookies(req)[ADMIN_COOKIE] || '';
  const accessStore = publicStoreRef(store);
  const supportSession = {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: 'admin',
    company_id: company.id,
    store_id: store.id,
    session_version: 2,
    active_store: accessStore,
    stores: [accessStore],
    plan_access: await getCompanyPlanAccess(company.id).catch(() => ({})),
    support_mode: {
      active: true,
      started_at: new Date().toISOString(),
      expires_at: expiresAt,
      original_admin_id: admin.id,
      original_admin_email: admin.email,
      original_session_token: originalToken,
      target_company_id: company.id,
      target_company_name: company.name,
      target_store_id: store.id,
      target_store_name: store.name,
      target_store_slug: store.slug
    }
  };
  const token = await createPersistentSession('admin', admin.id, supportSession);
  await audit('platform.support.impersonate.start', {
    req,
    actor_admin_id: admin.id,
    company_id: company.id,
    store_id: store.id,
    entity_type: 'support_session',
    severity: 'warning',
    after_data: {
      target_company_id: company.id,
      target_company_name: company.name,
      target_store_id: store.id,
      target_store_slug: store.slug,
      expires_at: expiresAt
    }
  });
  return { token, admin: supportSession, expires_at: expiresAt };
}

async function endPlatformSupportImpersonation(req, admin) {
  if (!isSupportModeAdmin(admin)) {
    throw httpError(422, 'Nenhum modo suporte ativo nesta sessão.');
  }
  const cookies = parseCookies(req);
  const supportToken = cookies[ADMIN_COOKIE] || '';
  const restoreToken = admin.support_mode?.original_session_token || '';
  const restoreSession = restoreToken ? await readPersistentSession(restoreToken, 'admin').catch(() => null) : null;
  await audit('platform.support.impersonate.end', {
    req,
    actor_admin_id: admin.support_mode?.original_admin_id || admin.id,
    company_id: admin.company_id || null,
    store_id: admin.store_id || null,
    entity_type: 'support_session',
    severity: 'info',
    after_data: {
      target_company_id: admin.support_mode?.target_company_id || admin.company_id || null,
      target_store_id: admin.support_mode?.target_store_id || admin.store_id || null,
      original_admin_email: admin.support_mode?.original_admin_email || null,
      ended_at: new Date().toISOString()
    }
  });
  await deleteSession(supportToken);
  return { restore_token: restoreSession ? restoreToken : '' };
}

function clearSessionCacheToken(token) {
  for (const key of sessionCache.keys()) {
    if (key.endsWith(`:${token}`)) sessionCache.delete(key);
  }
}

function clearSessionCacheByOwner(type, ownerId) {
  for (const [key, entry] of sessionCache.entries()) {
    if (key.startsWith(`${type}:`) && entry.session?.owner_id === ownerId) {
      sessionCache.delete(key);
    }
  }
}

function clearAdminStoreAccessCache(adminId) {
  const cleanAdminId = cleanUuid(adminId);
  if (!cleanAdminId) {
    adminStoreAccessCache.clear();
    return;
  }
  for (const key of adminStoreAccessCache.keys()) {
    if (key.startsWith(`${cleanAdminId}:`)) adminStoreAccessCache.delete(key);
  }
}

async function cleanExpiredSessions() {
  if (!DATABASE_URL) return;
  try {
    await dbRequest('DELETE', 'app_sessions', {
      expires_at: `lte.${new Date().toISOString()}`
    }, undefined, ['Prefer: return=minimal']);
  } catch (error) {
    console.warn('Não foi possível limpar sessões expiradas:', error.message);
  }
}

function enforceRateLimit(req, method, pathname) {
  const rule = rateLimitRule(method, pathname);
  if (!rule) return;

  const now = Date.now();
  const client = clientKey(req);
  const key = `${rule.name}:${client}`;
  const bucket = rateLimitBuckets.get(key) || { count: 0, resetAt: now + rule.windowMs };

  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + rule.windowMs;
  }

  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);

  if (bucket.count > rule.max) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    throw httpError(429, `Muitas tentativas. Tente novamente em ${retryAfter} segundos.`);
  }

  if (rateLimitBuckets.size > 1000) {
    for (const [entryKey, entry] of rateLimitBuckets.entries()) {
      if (entry.resetAt <= now) rateLimitBuckets.delete(entryKey);
    }
  }
}

function rateLimitRule(method, pathname) {
  if (method === 'POST' && pathname === '/api/admin/login') return limitRule('admin-login', 8, 120 * 1000);
  if (method === 'POST' && pathname === '/api/customer/login') return limitRule('customer-login', 10, 15 * 60 * 1000);
  if (method === 'POST' && pathname === '/api/customer/reset-password') return limitRule('customer-reset', 5, 30 * 60 * 1000);
  if (method === 'POST' && pathname === '/api/portal/recover-password') return limitRule('admin-recover', 5, 30 * 60 * 1000);
  if (method === 'POST' && pathname === '/api/orders') return limitRule('order-create', 20, 10 * 60 * 1000);
  if (method === 'POST' && pathname === '/api/admin/setup') return limitRule('admin-setup', 3, 120 * 1000);
  if (method === 'POST' && pathname === '/api/portal/signup') return limitRule('portal-signup', 5, 120 * 1000);
  if (method === 'POST' && pathname === '/api/admin/uploads') return limitRule('admin-upload', 30, 10 * 60 * 1000);
  return null;
}

function limitRule(name, max, windowMs) {
  return { name, max, windowMs };
}

function clientKey(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket.remoteAddress || 'local';
}

function absoluteUrl(req, relativePath) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0] || (COOKIE_SECURE ? 'https' : 'http');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0] || `${HOST}:${PORT}`;
  return `${proto}://${host}${relativePath}`;
}

function absoluteFromBase(base, relativePath = '/') {
  const normalizedPath = String(relativePath || '/').startsWith('/') ? String(relativePath || '/') : `/${relativePath}`;
  return `${String(base || '').replace(/\/+$/, '')}${normalizedPath}`;
}

function absoluteAppUrl(req, relativePath = '/') {
  const base = process.env.APP_URL || process.env.PUBLIC_APP_URL || absoluteUrl(req, '/');
  return absoluteFromBase(base, relativePath);
}

function absolutePublicUrl(relativePath = '/') {
  const base = process.env.PUBLIC_APP_URL || process.env.APP_URL || `http://${HOST}:${PORT}`;
  return absoluteFromBase(base, relativePath);
}

function formatDateTimePt(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function listCustomerOrders(customerId, storeId, options = {}) {
  const db = options.db || dbRequest;
  const resolvedStoreId = cleanUuid(storeId);
  const orders = await db('GET', 'orders', {
    select: '*',
    customer_id: `eq.${customerId}`,
    ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
    order: 'created_at.desc',
    limit: '30'
  });

  return attachOrderItems(orders, options);
}

async function listOrders(storeId, options = {}) {
  const db = options.db || dbRequest;
  const resolvedStoreId = cleanUuid(storeId);
  const cacheKey = `${resolvedStoreId || 'default'}:${options.tenant?.id || 'central'}`;
  const cached = adminOrdersCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const orders = await db('GET', 'orders', {
    select: '*',
    ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
    archived_at: 'is.null',
    order: 'created_at.desc',
    limit: '100'
  });

  const withItems = await attachOrderItems(orders, options);
  const data = (await attachOrderIntegrationLogs(withItems, options))
    .filter((order) => !isOnlineOrderAwaitingRelease(order));
  adminOrdersCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + ADMIN_ORDERS_CACHE_MS
  });
  return data;
}

function clearAdminOrdersCache(storeId) {
  const resolvedStoreId = cleanUuid(storeId);
  if (!resolvedStoreId) {
    adminOrdersCache.clear();
    return;
  }
  for (const key of adminOrdersCache.keys()) {
    if (key === resolvedStoreId || key.startsWith(`${resolvedStoreId}:`)) {
      adminOrdersCache.delete(key);
    }
  }
}

async function attachOrderIntegrationLogs(orders, options = {}) {
  const db = options.db || dbRequest;
  if (!orders.length) return orders;
  const ids = cleanUuidArray(orders.map((order) => order.id));
  if (!ids.length) return orders;
  const [whatsappLogs, paymentEvents] = await Promise.all([
    db('GET', 'order_whatsapp_logs', {
      select: 'id,order_id,order_status,delivery_status,provider,error_message,created_at',
      order_id: uuidInFilter(ids),
      order: 'created_at.desc',
      limit: String(Math.min(ids.length * 3, 180))
    }),
    db('GET', 'order_payment_events', {
      select: 'id,order_id,provider,financial_status,amount,created_at',
      order_id: uuidInFilter(ids),
      order: 'created_at.desc',
      limit: String(Math.min(ids.length * 3, 180))
    })
  ]);
  const whatsByOrder = new Map();
  const paymentsByOrder = new Map();
  for (const log of whatsappLogs) {
    if ((whatsByOrder.get(log.order_id) || []).length >= 2) continue;
    if (!whatsByOrder.has(log.order_id)) whatsByOrder.set(log.order_id, []);
    whatsByOrder.get(log.order_id).push(log);
  }
  for (const event of paymentEvents) {
    if ((paymentsByOrder.get(event.order_id) || []).length >= 2) continue;
    if (!paymentsByOrder.has(event.order_id)) paymentsByOrder.set(event.order_id, []);
    paymentsByOrder.get(event.order_id).push(event);
  }
  return orders.map((order) => ({
    ...order,
    whatsapp_logs: whatsByOrder.get(order.id) || [],
    payment_events: paymentsByOrder.get(order.id) || []
  }));
}

async function createPrintLog(data, options = {}) {
  const db = options.db || dbRequest;
  const payload = sanitizePrintLog(data);
  const [log] = await db('POST', 'order_print_logs', {}, payload, ['Prefer: return=representation']);
  return log;
}

async function sendOrderStatusWhatsapp(orderId, status, options = {}) {
  const db = options.db || dbRequest;
  const manual = Boolean(options.manual);
  const [order] = await db('GET', 'orders', {
    select: '*',
    id: `eq.${orderId}`,
    limit: '1'
  });
  if (!order) throw httpError(404, 'Pedido não encontrado.');
  const targetStatus = cleanText(status || order.status);
  const featureCode = manual ? 'manual_whatsapp' : 'automatic_whatsapp';
  if (manual && await storeHasFeature(order.store_id, 'automatic_whatsapp')) {
    throw httpError(403, 'Este plano usa WhatsApp automático. O envio manual fica disponível apenas no Teste grátis e no Essencial.', planErrorPayload('FEATURE_NOT_AVAILABLE', 'WhatsApp manual não disponível neste plano.', { feature: 'manual_whatsapp' }));
  }
  await assertPublicUsageLimitByStore(order.store_id, featureCode, 'whatsapp_messages');
  if (!manual) {
    const existing = await db('GET', 'order_whatsapp_logs', {
      select: 'id,delivery_status,created_at,error_message',
      order_id: `eq.${order.id}`,
      order_status: `eq.${targetStatus}`,
      is_manual: 'eq.false',
      limit: '1'
    });
    if (existing[0] && existing[0].delivery_status !== 'failed') return existing[0];
  }
  const store = await getStoreSettings(order.store_id, options);
  const integrations = sanitizeIntegrationSettings(store.integration_settings || {});
  const phone = whatsappRecipientPhone(order.customer_snapshot?.phone || '');
  const message = orderStatusWhatsappMessage(store, order, targetStatus);
  if (!phone) {
    return createWhatsappLogWithUsage(order, targetStatus, message, featureCode, {
      recipient_phone: '',
      delivery_status: 'skipped',
      error_message: 'Pedido sem telefone do cliente.',
      is_manual: manual,
      provider: integrations.whatsapp.provider
    }, options);
  }
  if (manual) {
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    const log = await createWhatsappLogWithUsage(order, targetStatus, message, featureCode, {
      recipient_phone: phone,
      delivery_status: 'manual',
      provider: 'wa.me',
      provider_message_id: `manual_${Date.now()}`,
      is_manual: true
    }, options);
    return { ...log, whatsapp_url: whatsappUrl };
  }
  if (!integrations.whatsapp.enabled) {
    return createWhatsappLogWithUsage(order, targetStatus, message, featureCode, {
      recipient_phone: phone,
      delivery_status: 'skipped',
      error_message: 'WhatsApp automático desativado.',
      is_manual: manual,
      provider: integrations.whatsapp.provider
    }, options);
  }

  try {
    const providerResult = await sendWhatsappViaProvider(integrations.whatsapp, phone, message);
    return createWhatsappLogWithUsage(order, targetStatus, message, featureCode, {
      recipient_phone: phone,
      delivery_status: 'sent',
      provider: integrations.whatsapp.provider,
      provider_message_id: providerResult.id,
      is_manual: manual
    }, options);
  } catch (error) {
    return createWhatsappLogWithUsage(order, targetStatus, message, featureCode, {
      recipient_phone: phone,
      delivery_status: 'failed',
      error_message: error.message || 'Falha no provedor de WhatsApp.',
      is_manual: manual,
      provider: integrations.whatsapp.provider
    }, options);
  }
}

async function createWhatsappLog(order, status, message, data, options = {}) {
  const db = options.db || dbRequest;
  const payload = {
    store_id: order.store_id || null,
    order_id: order.id,
    order_status: status,
    recipient_phone: data.recipient_phone || null,
    message,
    delivery_status: data.delivery_status || 'pending',
    provider: data.provider || null,
    provider_message_id: data.provider_message_id || null,
    error_message: data.error_message || null,
    is_manual: Boolean(data.is_manual)
  };
  const [log] = await db('POST', 'order_whatsapp_logs', {}, payload, ['Prefer: return=representation']);
  return log;
}

async function createWhatsappLogWithUsage(order, status, message, featureCode, data, options = {}) {
  const log = await createWhatsappLog(order, status, message, data, options);
  await recordUsageByStore(order.store_id, featureCode, 'whatsapp_messages', { entity_type: 'order', entity_id: order.id });
  return log;
}

async function sendWhatsappViaProvider(settings, phone, message) {
  if (settings.provider === 'whatsevolution' || isWhatsEvolutionUrl(settings.apiUrl)) {
    return sendWhatsappViaWhatsEvolution(settings, phone, message);
  }
  if (settings.provider === 'mock' || !settings.apiUrl) {
    return { id: `mock_${Date.now()}` };
  }
  if (settings.provider === 'official') {
    const url = settings.apiUrl || `https://graph.facebook.com/v19.0/${settings.phoneNumberId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: message }
      })
    });
    const data = await safeResponse(response);
    if (!response.ok) throw httpError(response.status, whatsappProviderError('Erro no provedor de WhatsApp.', data), data);
    return { id: data?.messages?.[0]?.id || data?.id || `wa_${Date.now()}` };
  }
  const response = await fetch(settings.apiUrl, {
    method: 'POST',
    headers: {
      Authorization: settings.accessToken ? `Bearer ${settings.accessToken}` : '',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ phone, message })
  });
  const data = await safeResponse(response);
  if (!response.ok) throw httpError(response.status, whatsappProviderError('Erro no webhook de WhatsApp.', data), data);
  return { id: data?.id || `webhook_${Date.now()}` };
}

async function sendWhatsappViaWhatsEvolution(settings, phone, message) {
  if (!settings.apiUrl || !settings.accessToken) {
    throw httpError(422, 'Configure URL da API e API key da WhatsEvolution.');
  }
  const baseUrl = settings.apiUrl.replace(/\/$/, '');
  const instance = cleanText(settings.phoneNumberId || '');
  const managedMode = isWhatsEvolutionManagedUrl(baseUrl);
  if (!instance && !managedMode) {
    throw httpError(422, 'Informe a instância da WhatsEvolution/Evolution API no campo "Instância / ID do número".');
  }
  if (managedMode && !instance) {
    const endpoint = baseUrl.endsWith('/send-message') ? baseUrl : `${baseUrl}/send-message`;
    return postWhatsEvolutionMessage(endpoint, {
      Authorization: `Bearer ${settings.accessToken}`,
      'Content-Type': 'application/json'
    }, {
      api_key: settings.accessToken,
      number: phone,
      message
    });
  }

  const encodedInstance = encodeURIComponent(instance);
  const headers = {
    apikey: settings.accessToken,
    'Content-Type': 'application/json'
  };
  const attempts = [
    {
      endpoint: `${baseUrl}/message/sendText/${encodedInstance}`,
      body: {
        number: phone,
        text: message,
        delay: 1200,
        linkPreview: false
      }
    },
    {
      endpoint: `${baseUrl}/message/text/${encodedInstance}`,
      body: { number: phone, message }
    }
  ];

  let lastError = null;
  for (const attempt of attempts) {
    try {
      return await postWhatsEvolutionMessage(attempt.endpoint, headers, attempt.body);
    } catch (error) {
      lastError = error;
      if (![404, 405].includes(Number(error.status))) break;
    }
  }
  throw lastError || httpError(502, 'Erro na WhatsEvolution.');
}

async function postWhatsEvolutionMessage(endpoint, headers, body) {
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  }, 10000);
  const data = await safeResponse(response);
  if (!response.ok) throw httpError(response.status, whatsappProviderError('Erro na WhatsEvolution.', data), data);
  if (data?.success === false) throw httpError(422, whatsappProviderError('WhatsEvolution recusou a mensagem.', data), data);
  return { id: data?.key?.id || data?.key || data?.message_id || data?.id || `whatsevolution_${Date.now()}` };
}

function isWhatsEvolutionUrl(url = '') {
  const value = String(url || '').toLowerCase();
  return value.includes('whatsevolution') || value.includes('relaxsolucoes');
}

function isWhatsEvolutionManagedUrl(url = '') {
  const value = String(url || '').toLowerCase();
  return value.includes('/functions/v1/send-message') || value.endsWith('/send-message');
}

function whatsappProviderError(fallback, data) {
  const message = data?.message || data?.error || data?.response?.message || data?.details || data?.detail;
  if (Array.isArray(message)) return `${fallback} ${message.join(' ')}`.slice(0, 500);
  if (message && typeof message === 'object') return `${fallback} ${JSON.stringify(message)}`.slice(0, 500);
  return message ? `${fallback} ${String(message)}`.slice(0, 500) : fallback;
}

function whatsappRecipientPhone(value) {
  const digits = onlyDigits(value);
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function orderStatusWhatsappMessage(store, order, status) {
  const name = firstName(order.customer_snapshot?.name || 'cliente');
  const code = order.public_code;
  const storeName = cleanText(store.name || 'Nossa loja') || 'Nossa loja';
  const origin = whatsappOrderOrigin(order);
  const total = formatMoney(order.total);
  const header = `Olá, ${name}! ${storeName} informa sobre seu pedido #${code}.`;
  const footer = `\n\nPedido: #${code}\nTipo: ${origin}\nTotal: ${total}`;
  const messages = {
    new: `${header}\n\nRecebemos seu pedido e ele está aguardando confirmação da loja.${footer}`,
    accepted: `${header}\n\nSeu pedido foi aceito e já entrou na fila de preparo.${footer}`,
    preparing: `${header}\n\nSeu pedido está sendo preparado agora.${footer}`,
    ready: `${header}\n\n${whatsappReadyText(order)}${footer}`,
    out_for_delivery: `${header}\n\n${whatsappOutForDeliveryText(order)}${footer}`,
    completed: `${header}\n\nSeu pedido foi concluído. Obrigado pela preferência!${footer}`,
    cancelled: `${header}\n\nSeu pedido foi cancelado. Entre em contato com a loja em caso de dúvida.${footer}`
  };
  return messages[status] || `${header}\n\nStatus atualizado: ${status}.${footer}`;
}

function firstName(value) {
  return cleanText(value || '').split(/\s+/)[0] || 'cliente';
}

function whatsappOrderOrigin(order) {
  const method = order.fulfillment_method || 'delivery';
  if (method === 'delivery') return 'Delivery';
  if (method === 'pickup') return 'Retirada no balcão';
  if (method === 'counter') return 'Pedido no balcão';
  if (method === 'table') return order.table_snapshot?.name ? `Mesa ${order.table_snapshot.name}` : 'Pedido na mesa';
  if (method === 'tab') {
    const table = order.table_snapshot?.name ? `Mesa ${order.table_snapshot.name}` : 'Mesa não informada';
    const tab = order.tab_snapshot?.name ? ` - ${order.tab_snapshot.name}` : '';
    return `Comanda ${table}${tab}`;
  }
  return 'Pedido';
}

function whatsappReadyText(order) {
  const method = order.fulfillment_method || 'delivery';
  if (method === 'delivery') return 'Seu pedido está pronto e será enviado para entrega em instantes.';
  if (method === 'pickup') return 'Seu pedido está pronto para retirada no estabelecimento.';
  if (method === 'counter') return 'Seu pedido está pronto para retirada no balcão.';
  if (method === 'table' || method === 'tab') return 'Seu pedido está pronto e será levado até sua mesa.';
  return 'Seu pedido está pronto.';
}

function whatsappOutForDeliveryText(order) {
  const method = order.fulfillment_method || 'delivery';
  if (method === 'delivery') return 'Seu pedido saiu para entrega.';
  if (method === 'pickup') return 'Seu pedido está aguardando retirada no estabelecimento.';
  if (method === 'counter') return 'Seu pedido está aguardando retirada no balcão.';
  if (method === 'table' || method === 'tab') return 'Seu pedido saiu da cozinha e será entregue na mesa.';
  return 'Seu pedido saiu para entrega.';
}

async function createPixPayment(order, options = {}) {
  const db = options.db || dbRequest;
  const store = await getStoreSettings(order.store_id, options);
  const integrations = sanitizeIntegrationSettings(store.integration_settings || {});
  if (!integrations.pix.enabled) throw httpError(422, 'Pix online não está ativo nesta loja.');
  if (order.status === 'cancelled') throw httpError(422, 'Pedido cancelado não aceita pagamento.');
  await assertPublicUsageLimitByStore(order.store_id, 'payment_transactions', 'payment_transactions');
  const expiresAt = new Date(Date.now() + integrations.pix.expirationMinutes * 60000).toISOString();
  const providerPayment = await createProviderPayment({ store, order, type: 'pix', integrations });
  const transactionId = providerPayment.transactionId || `pix_${order.public_code}_${Date.now()}`;
  const pixCode = providerPayment.pixCode || (providerPayment.checkoutUrl ? '' : buildMockPixCode(store, order, transactionId));
  const pixQrUrl = providerPayment.pixQrUrl || (pixCode
    ? `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(pixCode)}`
    : null);
  const [updated] = await db('PATCH', 'orders', { id: `eq.${order.id}` }, {
    financial_status: 'pending',
    payment_provider: integrations.pix.provider,
    payment_transaction_id: transactionId,
    payment_expires_at: expiresAt,
    payment_details: {
      ...(order.payment_details || {}),
      pix_code: pixCode,
      pix_qr_url: pixQrUrl,
      checkout_url: providerPayment.checkoutUrl || null
    }
  }, ['Prefer: return=representation']);
  await registerPaymentTransactionIndex(updated, integrations.pix.provider, transactionId, options);
  clearAdminOrdersCache(order.store_id);
  await recordUsageByStore(order.store_id, 'payment_transactions', 'payment_transactions', { entity_type: 'order', entity_id: order.id });
  return { order: updated, pix: publicPaymentPayload(updated) };
}

async function createCardPayment(order, options = {}) {
  const db = options.db || dbRequest;
  const store = await getStoreSettings(order.store_id, options);
  const integrations = sanitizeIntegrationSettings(store.integration_settings || {});
  if (!integrations.card.enabled) throw httpError(422, 'Cartão online não está ativo nesta loja.');
  if (order.status === 'cancelled') throw httpError(422, 'Pedido cancelado não aceita pagamento.');
  const providerPayment = await createProviderPayment({ store, order, type: 'card', integrations });
  const transactionId = providerPayment.transactionId || `card_${order.public_code}_${Date.now()}`;
  const [updated] = await db('PATCH', 'orders', { id: `eq.${order.id}` }, {
    financial_status: 'pending',
    payment_provider: integrations.card.provider,
    payment_transaction_id: transactionId,
    payment_details: {
      ...(order.payment_details || {}),
      checkout_url: providerPayment.checkoutUrl || null,
      split: providerPayment.split || null
    }
  }, ['Prefer: return=representation']);
  await registerPaymentTransactionIndex(updated, integrations.card.provider, transactionId, options);
  return { order: updated, card: publicPaymentPayload(updated) };
}

async function registerPaymentTransactionIndex(order, provider, transactionId, options = {}) {
  const cleanProviderName = cleanProvider(provider || order.payment_provider || '');
  const cleanTransactionId = cleanExternalId(transactionId || order.payment_transaction_id || '');
  if (!cleanProviderName || !cleanTransactionId) return null;
  const store = await getCentralStoreRef(order.store_id).catch(() => null);
  const body = {
    provider: cleanProviderName,
    transaction_id: cleanTransactionId,
    order_id: order.id || null,
    order_public_code: cleanPublicCode(order.public_code || ''),
    company_id: store?.company_id || null,
    store_id: cleanUuid(order.store_id) || null,
    financial_status: sanitizeFinancialStatus(order.financial_status || 'pending'),
    amount: roundMoney(Number.parseFloat(order.total || order.paid_amount || 0) || 0),
    metadata: {
      payment_method: order.payment_method || null
    }
  };
  const existing = await dbRequest('GET', 'payment_transaction_index', {
    select: 'id',
    provider: `eq.${body.provider}`,
    transaction_id: `eq.${body.transaction_id}`,
    limit: '1'
  }).catch(() => []);
  if (existing[0]?.id) {
    const [updated] = await dbRequest('PATCH', 'payment_transaction_index', {
      id: `eq.${existing[0].id}`
    }, body, ['Prefer: return=representation']);
    return updated || null;
  }
  const [created] = await dbRequest('POST', 'payment_transaction_index', {}, body, ['Prefer: return=representation']);
  return created || null;
}

async function updatePaymentTransactionIndexStatus(index, status, amount) {
  if (!index?.id) return;
  await dbRequest('PATCH', 'payment_transaction_index', { id: `eq.${index.id}` }, {
    financial_status: sanitizeFinancialStatus(status),
    amount: roundMoney(Number.parseFloat(amount || index.amount || 0) || 0)
  }, ['Prefer: return=minimal']).catch((error) => {
    console.warn('Falha ao atualizar índice de pagamento:', error.message || error);
  });
}

async function getCentralStoreRef(storeId) {
  const resolvedStoreId = cleanUuid(storeId);
  if (!resolvedStoreId) return null;
  const [store] = await dbRequest('GET', 'stores', {
    select: 'id,company_id,name,slug,is_active',
    id: `eq.${resolvedStoreId}`,
    limit: '1'
  });
  return store || null;
}

async function createProviderPayment({ store, order, type, integrations }) {
  const provider = type === 'card' ? integrations.card.provider : integrations.pix.provider;
  if (provider === 'abacatepay') return createAbacatePayPayment({ store, order, type, integrations });
  if (provider === 'mercadopago') return createMercadoPagoPayment({ store, order, type, integrations });
  if (provider === 'asaas') return createAsaasPayment({ store, order, type, integrations });
  if (provider === 'efi') return createEfiPixPayment({ store, order, integrations });
  return {
    transactionId: `${provider}_${type}_${order.public_code}_${Date.now()}`,
    pixCode: type === 'pix' ? buildMockPixCode(store, order, `${provider}_${Date.now()}`) : '',
    checkoutUrl: null
  };
}

async function createAbacatePayPayment({ store, order, type, integrations }) {
  const token = type === 'card' ? integrations.card.apiKey || integrations.pix.apiKey : integrations.pix.apiKey;
  if (!token) throw httpError(422, 'Configure a chave da Abacate Pay.');
  if (isMaskedSecretValue(token)) {
    throw httpError(422, 'A chave da Abacate Pay desta loja está salva apenas como máscara. Reconfigure a API key real em Integrações > Pagamento online.');
  }
  const customer = abacatePayCustomer(order);
  const amount = moneyCents(order.total);

  if (type === 'pix') {
    return createAbacateOrderCheckout({ store, order, token, amount, methods: ['PIX'], customer });
  }

  return createAbacateOrderCheckout({ store, order, token, amount, methods: ['CARD'], customer });
}

async function createAbacateOrderCheckout({ store, order, token, amount, methods, customer }) {
  const productId = await ensureAbacateOrderProduct({ store, order, amount, token });
  const origin = cleanText(process.env.PUBLIC_APP_URL || process.env.APP_URL || '').replace(/\/+$/, '');
  const storeSlug = cleanSlug(store.slug || '');
  const paymentPath = `${storeSlug ? `/${storeSlug}` : ''}/pagamento?pedido=${encodeURIComponent(order.public_code)}`;
  const fallbackUrl = origin ? `${origin}${paymentPath}` : '';
  const externalId = cleanExternalId(`tapronto-order-${order.public_code}-${Date.now()}`);
  const body = {
    items: [{ id: productId, quantity: 1 }],
    methods,
    externalId,
    metadata: { orderCode: order.public_code, storeId: order.store_id || null, kind: 'store_order' }
  };
  if (fallbackUrl) {
    body.returnUrl = fallbackUrl;
    body.completionUrl = fallbackUrl;
  }
  const customerId = await createAbacateOrderCustomer({ customer, order, token }).catch(() => '');
  if (customerId) body.customerId = customerId;

  const data = await providerFetch(`${ABACATEPAY_API_BASE}/checkouts/create`, {
    method: 'POST',
    token,
    body
  });
  const payload = data.data || data;
  const checkoutUrl = payload.url || payload.checkoutUrl || payload.paymentUrl || '';
  if (!checkoutUrl) throw httpError(502, 'A Abacate Pay criou o pagamento, mas não retornou a URL de checkout.');
  return {
    transactionId: String(payload.id || payload.checkoutId || externalId),
    checkoutUrl
  };
}

async function ensureAbacateOrderProduct({ store, order, amount, token }) {
  const externalId = cleanExternalId(`tapronto-order-${order.public_code}-${amount}`);
  const existing = await findAbacateProductByExternalId(externalId, token).catch(() => null);
  if (existing?.id) return String(existing.id);
  const data = await providerFetch(`${ABACATEPAY_API_BASE}/products/create`, {
    method: 'POST',
    token,
    body: {
      externalId,
      name: `Pedido #${order.public_code}`,
      description: `Pedido realizado em ${store.name || 'Cardápio'}`,
      price: amount,
      currency: 'BRL'
    }
  });
  const payload = data.data || data;
  const productId = payload.id || payload.product?.id || '';
  if (!productId) throw httpError(502, 'A Abacate Pay não retornou o identificador do produto do pedido.');
  return String(productId);
}

async function createAbacateOrderCustomer({ customer, order, token }) {
  const email = cleanText(order.customer_snapshot?.email || '');
  if (!email) return '';
  const data = await providerFetch(`${ABACATEPAY_API_BASE}/customers/create`, {
    method: 'POST',
    token,
    body: {
      name: cleanText(customer?.name || order.customer_snapshot?.name || 'Cliente TáPronto'),
      email,
      cellphone: onlyDigits(customer?.phone || order.customer_snapshot?.phone || ''),
      metadata: { orderCode: order.public_code, storeId: order.store_id || null, kind: 'store_order' }
    }
  });
  const payload = data.data || data;
  return String(payload.id || payload.customer?.id || '');
}

async function createMercadoPagoPayment({ order, type, integrations }) {
  const token = type === 'card' ? integrations.card.apiKey || integrations.pix.apiKey : integrations.pix.apiKey;
  if (!token) throw httpError(422, 'Configure a chave do Mercado Pago.');
  if (type === 'pix') {
    const data = await providerFetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      token,
      body: {
        transaction_amount: moneyNumber(order.total),
        description: `Pedido #${order.public_code}`,
        payment_method_id: 'pix',
        external_reference: order.public_code,
        payer: { email: order.customer_snapshot?.email || `pedido-${order.public_code}@local.test` },
        ...(providerSplitPayload(integrations, 'mercadopago'))
      }
    });
    return {
      transactionId: String(data.id || ''),
      pixCode: data.point_of_interaction?.transaction_data?.qr_code || '',
      pixQrUrl: data.point_of_interaction?.transaction_data?.qr_code_base64
        ? `data:image/png;base64,${data.point_of_interaction.transaction_data.qr_code_base64}`
        : null
    };
  }
  const data = await providerFetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    token,
    body: {
      external_reference: order.public_code,
      items: [{ title: `Pedido #${order.public_code}`, quantity: 1, unit_price: moneyNumber(order.total), currency_id: 'BRL' }],
      back_urls: { success: integrations.card.returnUrl || '', pending: integrations.card.returnUrl || '', failure: integrations.card.returnUrl || '' },
      ...(providerSplitPayload(integrations, 'mercadopago'))
    }
  });
  return { transactionId: String(data.id || ''), checkoutUrl: data.init_point || data.sandbox_init_point || '' };
}

async function createAsaasPayment({ order, type, integrations }) {
  const token = type === 'card' ? integrations.card.apiKey || integrations.pix.apiKey : integrations.pix.apiKey;
  if (!token) throw httpError(422, 'Configure a chave do Asaas.');
  const data = await providerFetch('https://www.asaas.com/api/v3/payments', {
    method: 'POST',
    token,
    body: {
      billingType: type === 'pix' ? 'PIX' : 'CREDIT_CARD',
      value: moneyNumber(order.total),
      description: `Pedido #${order.public_code}`,
      externalReference: order.public_code,
      dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      customer: order.customer_snapshot?.provider_customer_id || undefined,
      ...(providerSplitPayload(integrations, 'asaas'))
    }
  });
  return {
    transactionId: String(data.id || ''),
    pixCode: data.pixPayload || '',
    checkoutUrl: data.invoiceUrl || data.bankSlipUrl || ''
  };
}

async function createEfiPixPayment({ store, order }) {
  return {
    transactionId: `efi_pix_${order.public_code}_${Date.now()}`,
    pixCode: buildMockPixCode(store, order, `efi_${Date.now()}`)
  };
}

async function providerFetch(url, { method = 'GET', token, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      access_token: token,
      'Content-Type': 'application/json'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await safeResponse(response);
  if (!response.ok) throw httpError(response.status, providerErrorMessage(data), sanitizeProviderErrorDetail(data));
  return data;
}

function providerErrorMessage(data) {
  const detail = sanitizeProviderErrorDetail(data);
  const raw = detail?.message || detail?.error || detail?.code || '';
  return raw ? `Erro no provedor de pagamento: ${String(raw).slice(0, 180)}` : 'Erro no provedor de pagamento.';
}

function sanitizeProviderErrorDetail(data) {
  if (!data || typeof data !== 'object') return data;
  const error = data.error && typeof data.error === 'object' ? data.error : {};
  return {
    code: cleanText(data.code || error.code || ''),
    message: cleanText(data.message || error.message || (typeof data.error === 'string' ? data.error : '') || ''),
    status: cleanText(data.status || error.status || ''),
    success: data.success === true ? true : (data.success === false ? false : undefined)
  };
}

function providerSplitPayload(integrations, provider) {
  if (!integrations.split.enabled || !integrations.split.recipientId || !integrations.split.percentage) return {};
  if (provider === 'mercadopago') {
    return { marketplace_fee: 0, application_fee: 0, metadata: { split_recipient_id: integrations.split.recipientId, split_percentage: integrations.split.percentage } };
  }
  if (provider === 'asaas') {
    return { split: [{ walletId: integrations.split.recipientId, percentualValue: integrations.split.percentage }] };
  }
  return {};
}

async function publicPaymentStatus(code, options = {}) {
  const db = options.db || dbRequest;
  let order = await getOrderByPublicCode(code, options);
  if (!order) throw httpError(404, 'Pedido não encontrado.');
  if (
    order.payment_provider === 'abacatepay'
    && order.payment_transaction_id
    && ['pending', 'failed', 'expired'].includes(sanitizeFinancialStatus(order.financial_status))
  ) {
    order = await reconcileOrderPaymentWithProvider(order, options).catch((error) => {
      console.warn('Falha ao consultar pagamento na Abacate Pay:', error.message || error);
      return order;
    });
  }
  if (order.financial_status === 'pending' && order.payment_expires_at && new Date(order.payment_expires_at).getTime() < Date.now()) {
    const [updated] = await db('PATCH', 'orders', { id: `eq.${order.id}`, financial_status: 'eq.pending' }, {
      financial_status: 'expired'
    }, ['Prefer: return=representation']);
    return { order: publicPaymentOrder(updated || order), payment: publicPaymentPayload(updated || order) };
  }
  const store = order.financial_status === 'paid'
    ? await getStoreSettings(order.store_id, options).catch(() => null)
    : null;
  return { order: publicPaymentOrder(order), payment: publicPaymentPayload(order, { store }) };
}

async function reconcileOrderPaymentWithProvider(order, options = {}) {
  if (!order?.payment_provider || !order.payment_transaction_id) return order;
  const db = options.db || dbRequest;
  const store = await getStoreSettings(order.store_id, options);
  const integrations = sanitizeIntegrationSettings(store.integration_settings || {});
  const providerStatus = await fetchProviderPaymentStatus(order, integrations);
  const expected = sanitizeFinancialStatus(providerStatus?.status || order.financial_status);
  const current = sanitizeFinancialStatus(order.financial_status);
  if (!expected || expected === current || expected === 'pending') return order;

  const amount = roundMoney(Number.parseFloat(providerStatus.amount || order.total) || 0);
  const eventId = cleanExternalId(providerStatus.provider_event_id || `reconcile_${order.payment_provider}_${order.payment_transaction_id}_${expected}`);
  if (eventId) {
    const existing = await db('GET', 'order_payment_events', {
      select: 'id',
      provider: `eq.${cleanProvider(order.payment_provider)}`,
      provider_event_id: `eq.${eventId}`,
      limit: '1'
    }).catch(() => []);
    if (!existing[0]) {
      await db('POST', 'order_payment_events', {}, {
        order_id: order.id,
        store_id: order.store_id || null,
        provider: cleanProvider(order.payment_provider),
        provider_event_id: eventId,
        transaction_id: order.payment_transaction_id,
        financial_status: expected,
        amount,
        raw_payload: sanitizeProviderStatusPayload(providerStatus.raw || providerStatus)
      }, ['Prefer: return=minimal']).catch((error) => {
        console.warn('Falha ao registrar conciliação de pagamento:', error.message || error);
      });
    }
  }

  const patch = {
    financial_status: expected,
    paid_amount: expected === 'paid' ? amount : order.paid_amount,
    paid_at: expected === 'paid' ? (order.paid_at || new Date().toISOString()) : order.paid_at,
    ...(expected === 'paid' && isOnlinePaymentMethod(order.payment_method) ? { status: 'new' } : {})
  };
  const [updated] = await db('PATCH', 'orders', { id: `eq.${order.id}` }, patch, ['Prefer: return=representation']);
  await registerPaymentTransactionIndex(updated || { ...order, ...patch }, order.payment_provider, order.payment_transaction_id, options).catch(() => null);
  clearAdminOrdersCache(order.store_id);
  if (expected === 'paid' && updated?.id) {
    await sendOrderStatusWhatsapp(updated.id, 'new', { manual: false, db, tenant: options.tenant }).catch(() => null);
  }
  return updated || { ...order, ...patch };
}

function sanitizeProviderStatusPayload(payload) {
  if (!payload || typeof payload !== 'object') return {};
  return {
    id: cleanExternalId(payload.id || payload.checkoutId || payload.transactionId || ''),
    status: cleanText(payload.status || ''),
    amount: payload.amount || payload.value || payload.paidAmount || null,
    externalId: cleanExternalId(payload.externalId || '')
  };
}

async function regeneratePixPayment(data, options = {}) {
  const order = await getOrderByPublicCode(data.code || data.order, options);
  if (!order) throw httpError(404, 'Pedido não encontrado.');
  if (order.status === 'cancelled') throw httpError(422, 'Pedido cancelado não aceita pagamento.');
  if (order.financial_status === 'paid') throw httpError(422, 'Pedido já pago.');
  const payment = await createPixPayment(order, options);
  return { order: publicPaymentOrder(payment.order), payment: payment.pix };
}

async function receivePaymentWebhook(data, options = {}) {
  const incoming = {
    ...data,
    provider: cleanText(options.provider || data.provider || '')
  };
  const normalized = await normalizeProviderWebhook(incoming);
  const provider = normalized.provider;
  const eventId = normalized.eventId;
  if (!eventId) throw httpError(422, 'Evento sem identificador.');
  const webhookContext = await resolvePaymentWebhookContext(normalized);
  await assertPaymentWebhookSecret(provider, options.webhookSecret, webhookContext);
  const db = webhookContext.db || dbRequest;
  const existing = await db('GET', 'order_payment_events', {
    select: 'id',
    provider: `eq.${provider}`,
    provider_event_id: `eq.${eventId}`,
    limit: '1'
  });
  if (existing[0]) return { ok: true, duplicate: true };
  const transactionId = normalized.transactionId;
  const status = normalized.status;
  const order = transactionId
    ? (await db('GET', 'orders', { select: '*', payment_transaction_id: `eq.${transactionId}`, limit: '1' }))[0]
    : await getOrderByPublicCode(normalized.orderCode, webhookContext);
  if (!order) throw httpError(404, 'Pedido do pagamento não encontrado.');
  if (order.status === 'cancelled' && status === 'paid') throw httpError(422, 'Pedido cancelado não pode receber pagamento.');
  const amount = roundMoney(Number.parseFloat(normalized.amount || order.total) || 0);
  await db('POST', 'order_payment_events', {}, {
    order_id: order.id,
    store_id: order.store_id || webhookContext.storeId || null,
    provider,
    provider_event_id: eventId,
    transaction_id: transactionId || order.payment_transaction_id,
    financial_status: status,
    amount,
    raw_payload: data
  }, ['Prefer: return=minimal']);
  const patch = {
    financial_status: status,
    payment_provider: provider,
    payment_transaction_id: transactionId || order.payment_transaction_id,
    paid_amount: status === 'paid' ? amount : order.paid_amount,
    paid_at: status === 'paid' ? new Date().toISOString() : order.paid_at,
    ...(status === 'paid' && isOnlinePaymentMethod(order.payment_method) ? { status: 'new' } : {})
  };
  const [updated] = await db('PATCH', 'orders', { id: `eq.${order.id}` }, patch, ['Prefer: return=representation']);
  await updatePaymentTransactionIndexStatus(webhookContext.index, status, amount);
  if (status === 'paid' && updated?.id) {
    await sendOrderStatusWhatsapp(updated.id, 'new', { manual: false, db, tenant: webhookContext.tenant }).catch(() => null);
  }
  clearAdminOrdersCache(order.store_id);
  return { ok: true, order: publicPaymentOrder(updated) };
}

async function resolvePaymentWebhookContext(normalized) {
  const provider = cleanProvider(normalized.provider || '');
  const transactionId = cleanExternalId(normalized.transactionId || '');
  const orderCode = cleanPublicCode(normalized.orderCode || '');
  let index = null;
  if (provider && transactionId) {
    [index] = await dbRequest('GET', 'payment_transaction_index', {
      select: '*',
      provider: `eq.${provider}`,
      transaction_id: `eq.${transactionId}`,
      limit: '1'
    }).catch(() => []);
  }
  if (!index && orderCode) {
    [index] = await dbRequest('GET', 'payment_transaction_index', {
      select: '*',
      order_public_code: `eq.${orderCode}`,
      order: 'created_at.desc',
      limit: '1'
    }).catch(() => []);
  }
  return {
    db: dbRequest,
    tenant: null,
    index: index || null,
    storeId: index?.store_id || null
  };
}

async function assertPaymentWebhookSecret(provider, incomingSecret, context = {}) {
  if (provider !== 'abacatepay') return;
  const store = await getStoreSettings(context.storeId, context);
  const settings = sanitizeIntegrationSettings(store.integration_settings || {});
  const expected = settings.pix.webhookSecret;
  if (!expected) return;
  if (!incomingSecret || incomingSecret !== expected) {
    throw httpError(401, 'Webhook da Abacate Pay não autorizado.');
  }
}

async function normalizeProviderWebhook(data) {
  const provider = cleanProvider(data.provider || inferWebhookProvider(data) || 'mock');
  if (provider === 'abacatepay') {
    const payload = data.data || data.payment || data.pixQrCode || data.billing || data;
    return {
      provider,
      eventId: cleanExternalId(data.id || data.eventId || data.event || payload.id || `abacatepay_${Date.now()}`),
      transactionId: cleanExternalId(payload.id || data.paymentId || data.transaction_id || ''),
      orderCode: cleanPublicCode(payload.metadata?.orderCode || payload.externalId || payload.externalReference || data.order_code || data.code || ''),
      status: abacatePayStatusToFinancial(payload.status || data.status || data.event),
      amount: centsToMoney(payload.amount || payload.value || data.amount || data.value)
    };
  }
  if (provider === 'mercadopago') {
    const paymentId = cleanExternalId(data.data?.id || data.id || data.resource || data.transaction_id || '');
    let detail = data.payment || data;
    const store = await getStoreSettings();
    const settings = sanitizeIntegrationSettings(store.integration_settings || {});
    const token = settings.pix.apiKey || settings.card.apiKey;
    if (paymentId && token && !data.payment) {
      detail = await providerFetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, { token }).catch(() => detail);
    }
    return {
      provider,
      eventId: cleanExternalId(data.id || data.action || paymentId || `mp_${Date.now()}`),
      transactionId: cleanExternalId(detail.id || paymentId),
      orderCode: cleanPublicCode(detail.external_reference || data.external_reference || ''),
      status: mercadoPagoStatusToFinancial(detail.status || data.status),
      amount: detail.transaction_amount || data.amount
    };
  }
  if (provider === 'asaas') {
    const payment = data.payment || data;
    return {
      provider,
      eventId: cleanExternalId(data.id || data.event || payment.id || `asaas_${Date.now()}`),
      transactionId: cleanExternalId(payment.id || data.paymentId || ''),
      orderCode: cleanPublicCode(payment.externalReference || data.externalReference || ''),
      status: asaasStatusToFinancial(payment.status || data.status || data.event),
      amount: payment.value || data.value || data.amount
    };
  }
  if (provider === 'efi') {
    const pix = Array.isArray(data.pix) ? data.pix[0] : data.pix || data;
    return {
      provider,
      eventId: cleanExternalId(pix.endToEndId || pix.txid || data.id || `efi_${Date.now()}`),
      transactionId: cleanExternalId(pix.txid || data.txid || ''),
      orderCode: cleanPublicCode(data.order_code || data.code || pix.txid || ''),
      status: 'paid',
      amount: pix.valor || data.valor || data.amount
    };
  }
  return {
    provider,
    eventId: cleanExternalId(data.event_id || data.id || `${provider}_${Date.now()}`),
    transactionId: cleanExternalId(data.transaction_id || data.payment_transaction_id || ''),
    orderCode: cleanPublicCode(data.order_code || data.code || ''),
    status: sanitizeFinancialStatus(data.status || data.financial_status || 'paid'),
    amount: data.amount
  };
}

function inferWebhookProvider(data) {
  const event = String(data.event || '').toLowerCase();
  if (
    event.includes('abacate')
    || event.startsWith('billing.')
    || event.startsWith('pixqrcode.')
    || event.startsWith('checkout.')
    || event.startsWith('transparent.')
    || data.pixQrCode
    || data.billing
  ) return 'abacatepay';
  if (data.action || data.type === 'payment' || data.data?.id) return 'mercadopago';
  if (String(data.event || '').startsWith('PAYMENT_') || data.payment) return 'asaas';
  if (data.pix || data.txid) return 'efi';
  return '';
}

function abacatePayStatusToFinancial(status) {
  const value = String(status || '').toUpperCase();
  if (['PAID', 'APPROVED', 'COMPLETED', 'BILLING_PAID', 'PIXQRCODE_PAID'].includes(value)) return 'paid';
  if (['EXPIRED', 'PIXQRCODE_EXPIRED'].includes(value)) return 'expired';
  if (['CANCELLED', 'CANCELED', 'CANCELLED_BY_CUSTOMER'].includes(value)) return 'cancelled';
  if (['REFUNDED', 'CHARGEBACK'].includes(value)) return 'refunded';
  if (['FAILED', 'REJECTED'].includes(value)) return 'failed';
  if (value.includes('PAID')) return 'paid';
  if (value.includes('EXPIRED')) return 'expired';
  if (value.includes('CANCEL')) return 'cancelled';
  if (value.includes('REFUND')) return 'refunded';
  return 'pending';
}

function mercadoPagoStatusToFinancial(status) {
  return ({
    approved: 'paid',
    authorized: 'pending',
    in_process: 'pending',
    pending: 'pending',
    rejected: 'failed',
    cancelled: 'cancelled',
    refunded: 'refunded',
    charged_back: 'refunded'
  })[String(status || '').toLowerCase()] || 'pending';
}

function asaasStatusToFinancial(status) {
  const value = String(status || '').toUpperCase();
  if (['PAYMENT_RECEIVED', 'RECEIVED', 'CONFIRMED'].includes(value)) return 'paid';
  if (['PAYMENT_DELETED', 'DELETED', 'CANCELED', 'CANCELLED'].includes(value)) return 'cancelled';
  if (['PAYMENT_REFUNDED', 'REFUNDED'].includes(value)) return 'refunded';
  if (['OVERDUE'].includes(value)) return 'expired';
  return 'pending';
}

async function refundOrderPayment(orderId, data = {}, options = {}) {
  const db = options.db || dbRequest;
  const [order] = await db('GET', 'orders', { select: '*', id: `eq.${orderId}`, limit: '1' });
  if (!order) throw httpError(404, 'Pedido não encontrado.');
  if (order.financial_status !== 'paid') throw httpError(422, 'Apenas pedidos pagos podem ser estornados.');
  const amount = roundMoney(Number.parseFloat(data.amount || order.paid_amount || order.total) || 0);
  const store = await getStoreSettings(order.store_id, options);
  const integrations = sanitizeIntegrationSettings(store.integration_settings || {});
  await refundProviderPayment(order, amount, integrations);
  const [updated] = await db('PATCH', 'orders', { id: `eq.${order.id}` }, {
    financial_status: 'refunded',
    refunded_amount: amount,
    refunded_at: new Date().toISOString()
  }, ['Prefer: return=representation']);
  await db('POST', 'order_payment_events', {}, {
    order_id: order.id,
    provider: order.payment_provider || 'manual',
    provider_event_id: `refund_${order.id}_${Date.now()}`,
    transaction_id: order.payment_transaction_id,
    financial_status: 'refunded',
    amount,
    raw_payload: { reason: cleanText(data.reason || 'Estorno manual') }
  }, ['Prefer: return=minimal']);
  clearAdminOrdersCache(order.store_id);
  return updated;
}

async function refundProviderPayment(order, amount, integrations) {
  if (!order.payment_provider || order.payment_provider === 'mock') return { ok: true };
  if (order.payment_provider === 'abacatepay') {
    const token = integrations.pix.apiKey || integrations.card.apiKey;
    if (!token) throw httpError(422, 'Chave da Abacate Pay não configurada.');
    const endpoint = isOnlinePixPayment(order.payment_method) ? 'pixQrCode/refund' : 'billing/refund';
    return providerFetch(`https://api.abacatepay.com/v1/${endpoint}`, {
      method: 'POST',
      token,
      body: { id: order.payment_transaction_id, amount: moneyCents(amount) }
    }).catch((error) => {
      throw httpError(error.status || 422, 'Estorno automático não disponível para este pagamento na Abacate Pay. Faça o estorno no painel do provedor e depois concilie o pedido.', error.detail);
    });
  }
  if (order.payment_provider === 'mercadopago') {
    const token = integrations.pix.apiKey || integrations.card.apiKey;
    if (!token) throw httpError(422, 'Chave do Mercado Pago não configurada.');
    return providerFetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(order.payment_transaction_id)}/refunds`, {
      method: 'POST',
      token,
      body: { amount }
    });
  }
  if (order.payment_provider === 'asaas') {
    const token = integrations.pix.apiKey || integrations.card.apiKey;
    if (!token) throw httpError(422, 'Chave do Asaas não configurada.');
    return providerFetch(`https://www.asaas.com/api/v3/payments/${encodeURIComponent(order.payment_transaction_id)}/refund`, {
      method: 'POST',
      token,
      body: { value: amount }
    });
  }
  return { ok: true };
}

async function reconcileOnlinePayments(data = {}, options = {}) {
  const db = options.db || dbRequest;
  const store = await getStoreSettings(data.storeId, options);
  const integrations = sanitizeIntegrationSettings(store.integration_settings || {});
  const days = clampInteger(data.days || integrations.reconciliation.days || 7, 1, 30);
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const orders = await db('GET', 'orders', {
    select: '*',
    created_at: `gte.${since}`,
    payment_transaction_id: 'not.is.null',
    ...(store.id ? { store_id: `eq.${store.id}` } : {}),
    order: 'created_at.desc',
    limit: '300'
  });
  let matched = 0;
  let divergent = 0;
  for (const order of orders) {
    const providerStatus = await fetchProviderPaymentStatus(order, integrations).catch(() => null);
    const expected = providerStatus?.status || order.financial_status;
    const isMatch = expected === order.financial_status;
    await db('PATCH', 'orders', { id: `eq.${order.id}` }, {
      reconciliation_status: isMatch ? 'matched' : 'divergent',
      reconciled_at: new Date().toISOString(),
      ...(isMatch ? {} : { financial_status: expected })
    }, ['Prefer: return=minimal']);
    if (isMatch) matched += 1;
    else divergent += 1;
  }
  return { checked: orders.length, matched, divergent };
}

async function fetchProviderPaymentStatus(order, integrations) {
  if (order.payment_provider === 'abacatepay') {
    const token = integrations.pix.apiKey || integrations.card.apiKey;
    if (!token) throw httpError(422, 'Chave da Abacate Pay não configurada.');
    const details = order.payment_details || {};
    const transactionId = cleanExternalId(order.payment_transaction_id || '');
    const checkoutUrl = String(details.checkout_url || '');
    const isHostedCheckout = transactionId.startsWith('bill_') || checkoutUrl.includes('app.abacatepay.com/pay/');
    const endpoint = isHostedCheckout ? 'checkouts/get' : 'transparents/check';
    const data = await providerFetch(`${ABACATEPAY_API_BASE}/${endpoint}?id=${encodeURIComponent(transactionId)}`, { token });
    const payload = data.data || data;
    return {
      status: abacatePayStatusToFinancial(payload.status),
      amount: centsToMoney(payload.paidAmount || payload.amount || payload.value || order.total),
      provider_event_id: cleanExternalId(`abacatepay_${payload.id || transactionId}_${payload.status || 'status'}`),
      raw: payload
    };
  }
  if (order.payment_provider === 'mercadopago') {
    const token = integrations.pix.apiKey || integrations.card.apiKey;
    const data = await providerFetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(order.payment_transaction_id)}`, { token });
    return { status: mercadoPagoStatusToFinancial(data.status), amount: data.transaction_amount };
  }
  if (order.payment_provider === 'asaas') {
    const token = integrations.pix.apiKey || integrations.card.apiKey;
    const data = await providerFetch(`https://www.asaas.com/api/v3/payments/${encodeURIComponent(order.payment_transaction_id)}`, { token });
    return { status: asaasStatusToFinancial(data.status), amount: data.value };
  }
  return { status: order.financial_status, amount: order.total };
}

async function getOrderByPublicCode(code, options = {}) {
  const db = options.db || dbRequest;
  const cleanCode = cleanPublicCode(String(code || '').replace(/^#/, ''));
  if (!cleanCode) return null;
  const rows = await db('GET', 'orders', {
    select: '*',
    public_code: `eq.${cleanCode}`,
    limit: '1'
  });
  return rows[0] || null;
}

function publicPaymentOrder(order) {
  return {
    public_code: order.public_code,
    total: moneyNumber(order.total),
    status: order.status,
    financial_status: order.financial_status || 'pending',
    payment_method: order.payment_method,
    payment_transaction_id: order.payment_transaction_id || null,
    paid_amount: order.paid_amount || null,
    paid_at: order.paid_at || null,
    payment_expires_at: order.payment_expires_at || null
  };
}

function publicPaymentPayload(order, options = {}) {
  const details = order.payment_details || {};
  return {
    status: order.financial_status || 'pending',
    provider: order.payment_provider || null,
    transaction_id: order.payment_transaction_id || null,
    expires_at: order.payment_expires_at || null,
    pix_code: details.pix_code || '',
    pix_qr_url: details.pix_qr_url || '',
    checkout_url: details.checkout_url || '',
    whatsapp_url: order.financial_status === 'paid' ? publicOrderStoreWhatsappUrl(order, options) : ''
  };
}

function publicOrderStoreWhatsappUrl(order, options = {}) {
  if (!order || !isOnlinePaymentMethod(order.payment_method)) return '';
  const message = cleanText(order.whatsapp_message || '');
  if (!message) return '';
  return whatsappStoreUrlForOrder(order, message, options.store) || '';
}

function whatsappStoreUrlForOrder(order, message, store = null) {
  const storePhone = whatsappRecipientPhone(store?.whatsapp_number || STORE_WHATSAPP_NUMBER);
  return storePhone ? `https://wa.me/${storePhone}?text=${encodeURIComponent(message)}` : '';
}

function buildMockPixCode(store, order, transactionId) {
  return `PIXONLINE|${store.slug || 'loja'}|${order.public_code}|${formatMoney(order.total)}|${transactionId}`;
}

function abacatePayCustomer(order) {
  const customer = order.customer_snapshot || {};
  const payload = {
    name: customer.name || `Cliente ${order.public_code}`,
    email: customer.email || `pedido-${order.public_code}@cardapio.local`,
    cellphone: onlyDigits(customer.phone || '')
  };
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value));
}

function moneyCents(value) {
  return Math.round(moneyNumber(value) * 100);
}

function centsToMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return numeric > 999 ? roundMoney(numeric / 100) : roundMoney(numeric);
}

function normalizeQrImage(value) {
  const data = String(value || '').trim();
  if (!data) return '';
  if (data.startsWith('data:image')) return data;
  return `data:image/png;base64,${data}`;
}

function sanitizeFinancialStatus(status) {
  const value = String(status || '').toLowerCase();
  if (['pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded'].includes(value)) return value;
  return 'pending';
}

function sanitizePrintLog(data) {
  return {
    order_id: cleanText(data.order_id || '') || null,
    print_type: ['kitchen', 'customer', 'both'].includes(data.print_type) ? data.print_type : 'kitchen',
    paper_width: ['58', '80'].includes(String(data.paper_width)) ? String(data.paper_width) : '80',
    copies: clampInteger(data.copies, 1, 10),
    reason: ['manual', 'auto', 'retry', 'preview'].includes(data.reason) ? data.reason : 'manual',
    status: ['attempted', 'blocked', 'completed'].includes(data.status) ? data.status : 'attempted'
  };
}

async function listDiningTables(existingTabs = null) {
  const tables = await dbRequest('GET', 'dining_tables', {
    select: '*',
    order: 'name.asc'
  });
  const tabs = existingTabs || await listCustomerTabs();
  return enrichDiningTables(tables, tabs);
}

function enrichDiningTables(tables, tabs) {
  return tables.map((table) => ({
    ...table,
    open_tabs: tabs.filter((tab) => tab.status === 'open' && tab.dining_table_id === table.id),
    open_tab: tabs.find((tab) => tab.status === 'open' && tab.dining_table_id === table.id) || null
  }));
}

async function listAdminTablesData(storeId, options = {}) {
  const db = options.db || dbRequest;
  const resolvedStoreId = cleanUuid(storeId);
  const now = Date.now();
  const cacheKey = `${resolvedStoreId || 'default'}:${options.tenant?.id || 'central'}`;
  if (adminTablesCache?.[cacheKey] && adminTablesCache[cacheKey].expiresAt > now) return adminTablesCache[cacheKey].data;
  const [tables, tabs] = await Promise.all([
    db('GET', 'dining_tables', {
      select: '*',
      ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
      order: 'name.asc'
    }),
    listCustomerTabs(resolvedStoreId, options)
  ]);
  const data = { tables: enrichDiningTables(tables, tabs), tabs };
  adminTablesCache = adminTablesCache || {};
  adminTablesCache[cacheKey] = {
    data,
    expiresAt: now + ADMIN_LIST_CACHE_MS
  };
  return data;
}

async function listCustomerTabs(storeId, options = {}) {
  const db = options.db || dbRequest;
  const resolvedStoreId = cleanUuid(storeId);
  const tabs = await db('GET', 'customer_tabs', {
    select: '*',
    ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
    order: 'opened_at.desc',
    limit: '200'
  });
  const openTabIds = cleanUuidArray(tabs.filter((tab) => tab.status === 'open').map((tab) => tab.id));
  let ordersByTab = new Map();
  if (openTabIds.length) {
    const orders = await db('GET', 'orders', {
      select: 'id,customer_tab_id,total,status,created_at',
      ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
      customer_tab_id: uuidInFilter(openTabIds),
      order: 'created_at.desc',
      limit: '500'
    });
    ordersByTab = orders.reduce((map, order) => {
      const list = map.get(order.customer_tab_id) || [];
      list.push(order);
      map.set(order.customer_tab_id, list);
      return map;
    }, new Map());
  }
  return tabs.map((tab) => {
    const orders = ordersByTab.get(tab.id) || [];
    const total = roundMoney(orders
      .filter((order) => order.status !== 'cancelled')
      .reduce((sum, order) => sum + moneyNumber(order.total), 0));
    return {
      ...tab,
      order_count: orders.length,
      current_total: total
    };
  });
}

async function resolveDiningTable(code, storeId, options = {}) {
  const db = options.db || dbRequest;
  const cleanCode = cleanSlug(code || '');
  const resolvedStoreId = cleanUuid(storeId);
  if (!cleanCode) throw httpError(404, 'Mesa não informada.');
  const rows = await db('GET', 'dining_tables', {
    select: '*',
    ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
    code: `eq.${cleanCode}`,
    is_active: 'eq.true',
    limit: '1'
  });
  const table = rows[0];
  if (!table) throw httpError(404, 'Mesa não encontrada ou inativa.');
  const tabs = await db('GET', 'customer_tabs', {
    select: '*',
    ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
    dining_table_id: `eq.${table.id}`,
    status: 'eq.open',
    order: 'opened_at.asc',
    limit: '50'
  });
  let enrichedTabs = tabs;
  if (tabs.length) {
    const tabIds = cleanUuidArray(tabs.map((tab) => tab.id));
    const orders = tabIds.length
      ? await db('GET', 'orders', {
        select: '*',
        ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
        customer_tab_id: uuidInFilter(tabIds),
        order: 'created_at.desc',
        limit: '500'
      })
      : [];
    const ordersByTab = orders.reduce((map, order) => {
      const list = map.get(order.customer_tab_id) || [];
      list.push(order);
      map.set(order.customer_tab_id, list);
      return map;
    }, new Map());
    enrichedTabs = tabs.map((tab) => {
      const tabOrders = ordersByTab.get(tab.id) || [];
      return {
        ...tab,
        current_total: roundMoney(tabOrders
          .filter((order) => order.status !== 'cancelled')
          .reduce((sum, order) => sum + moneyNumber(order.total), 0)),
        order_count: tabOrders.length
      };
    });
  }
  const openTab = enrichedTabs.length === 1 ? enrichedTabs[0] : null;
  return { ...table, open_tab: openTab, open_tabs: enrichedTabs };
}

async function createDiningTable(data, storeId, options = {}) {
  const db = options.db || dbRequest;
  const resolvedStoreId = cleanUuid(storeId);
  if (!resolvedStoreId) throw httpError(422, 'Loja ativa não encontrada.');
  const payload = sanitizeDiningTable(data, true);
  const basePayload = {
    ...payload,
    store_id: resolvedStoreId
  };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = payload.code || await nextDiningTableCode(resolvedStoreId, options);
    try {
      const [table] = await db('POST', 'dining_tables', {}, {
        ...basePayload,
        code
      }, ['Prefer: return=representation']);
      return table;
    } catch (error) {
      if (!isUniqueViolation(error) || payload.code || attempt === 4) {
        throw httpError(409, 'Já existe uma mesa com este código nesta loja.', error.detail || error);
      }
    }
  }
  throw httpError(409, 'Não foi possível gerar um código único para a mesa. Tente novamente.');
}

async function nextDiningTableCode(storeId, options = {}) {
  const db = options.db || dbRequest;
  const resolvedStoreId = cleanUuid(storeId);
  const rows = await db('GET', 'dining_tables', {
    select: 'code',
    store_id: `eq.${resolvedStoreId}`,
    order: 'created_at.desc',
    limit: '10000'
  });
  const highest = rows.reduce((max, table) => {
    const match = String(table.code || '').match(/^mesa-(\d+)$/);
    return match ? Math.max(max, Number.parseInt(match[1], 10) || 0) : max;
  }, 0);
  return `mesa-${highest + 1}`;
}

async function updateDiningTable(id, data, storeId, options = {}) {
  const db = options.db || dbRequest;
  let table;
  try {
    [table] = await db('PATCH', 'dining_tables', {
      id: `eq.${id}`,
      ...(cleanUuid(storeId) ? { store_id: `eq.${cleanUuid(storeId)}` } : {})
    }, sanitizeDiningTable(data, false), ['Prefer: return=representation']);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw httpError(409, 'Já existe uma mesa com este código nesta loja.', error.detail || error);
    }
    throw error;
  }
  if (!table) throw httpError(404, 'Mesa não encontrada nesta loja.');
  return table;
}

async function deleteDiningTable(id, storeId, options = {}) {
  const db = options.db || dbRequest;
  const removed = await db('DELETE', 'dining_tables', {
    id: `eq.${id}`,
    ...(cleanUuid(storeId) ? { store_id: `eq.${cleanUuid(storeId)}` } : {})
  }, undefined, ['Prefer: return=representation']);
  if (Array.isArray(removed) && removed.length === 0) throw httpError(404, 'Mesa não encontrada nesta loja.');
}

async function openCustomerTab(data, storeId, options = {}) {
  const db = options.db || dbRequest;
  const tableId = cleanText(data.dining_table_id || '');
  if (tableId) await requireActiveDiningTable(tableId, storeId, options);
  const payload = {
    store_id: cleanUuid(storeId) || null,
    name: cleanText(data.name || `Comanda ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`),
    customer_name: cleanText(data.customer_name || '') || null,
    dining_table_id: tableId || null,
    status: 'open'
  };
  const [tab] = await db('POST', 'customer_tabs', {}, payload, ['Prefer: return=representation']);
  return tab;
}

async function closeCustomerTab(id, data = {}, storeId, options = {}) {
  const db = options.db || dbRequest;
  const resolvedStoreId = cleanUuid(storeId);
  const orders = await db('GET', 'orders', {
    select: '*',
    ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
    customer_tab_id: `eq.${id}`,
    order: 'created_at.asc',
    limit: '500'
  });
  const total = roundMoney(orders
    .filter((order) => order.status !== 'cancelled')
    .reduce((sum, order) => sum + moneyNumber(order.total), 0));
  const discount = roundMoney(Number.parseFloat(data.discount) || 0);
  const [tab] = await db('PATCH', 'customer_tabs', {
    id: `eq.${id}`,
    status: 'eq.open',
    ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {})
  }, {
    status: 'closed',
    closed_at: new Date().toISOString(),
    payment_method: cleanText(data.payment_method || ''),
    discount,
    total: roundMoney(Math.max(0, total - discount))
  }, ['Prefer: return=representation']);
  if (!tab) throw httpError(409, 'Comanda não encontrada ou já fechada.');
  return tab;
}

async function transferCustomerTab(id, data = {}, storeId, options = {}) {
  const db = options.db || dbRequest;
  const resolvedStoreId = cleanUuid(storeId);
  const tableId = cleanText(data.dining_table_id || '');
  if (!tableId) throw httpError(422, 'Informe a mesa de destino.');
  if (resolvedStoreId) {
    const [table] = await db('GET', 'dining_tables', {
      select: 'id',
      id: `eq.${tableId}`,
      store_id: `eq.${resolvedStoreId}`,
      limit: '1'
    });
    if (!table) throw httpError(404, 'Mesa de destino não encontrada nesta loja.');
  }
  const [tab] = await db('PATCH', 'customer_tabs', {
    id: `eq.${id}`,
    status: 'eq.open',
    ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {})
  }, {
    dining_table_id: tableId
  }, ['Prefer: return=representation']);
  if (!tab) throw httpError(409, 'Comanda não encontrada ou já fechada.');
  return tab;
}

async function addItemToCustomerTab(req, tabId, data = {}, storeId, options = {}) {
  const tab = await requireOpenTab(tabId, null, storeId, options);
  if (!tab.dining_table_id) throw httpError(422, 'Vincule a comanda a uma mesa antes de adicionar itens pelo admin.');
  const itemId = cleanText(data.item_id || '');
  if (!itemId) throw httpError(422, 'Selecione um item do cardápio.');
  const quantity = clampInteger(data.quantity, 1, 99);
  const result = await createOrder(req, {
    fulfillment_method: 'tab',
    dining_table_id: tab.dining_table_id,
    customer_tab_id: tab.id,
    customer: {
      name: tab.customer_name || tab.name || 'Cliente da mesa',
      phone: ''
    },
    payment_method: 'Pagamento no fechamento',
    payment_details: {},
    notes: cleanText(data.notes || 'Lançado pelo admin na comanda.'),
    items: [{
      id: itemId,
      quantity,
      modifier_ids: [],
      notes: cleanText(data.item_notes || '')
    }]
  }, {
    storeId,
    db: options.db,
    tenant: options.tenant,
    allowClosedStore: true,
    skipModifierValidation: true
  });
  return { order: result.order };
}

async function clearOrderQueue(data = {}, options = {}) {
  const db = options.db || dbRequest;
  const mode = ['close_open', 'archive_closed'].includes(data.mode) ? data.mode : 'close_open';
  const storeId = cleanUuid(data.storeId || data.store_id);
  const openStatuses = ['new', 'accepted', 'preparing', 'ready', 'out_for_delivery'];
  const archivedAt = new Date().toISOString();
  let openArchived = [];
  if (mode === 'close_open') {
    openArchived = await db('PATCH', 'orders', {
      ...(storeId ? { store_id: `eq.${storeId}` } : {}),
      status: `in.(${openStatuses.join(',')})`,
      archived_at: 'is.null'
    }, {
      status: 'completed',
      archived_at: archivedAt
    }, ['Prefer: return=representation']);
  }
  const closedArchived = await db('PATCH', 'orders', {
    ...(storeId ? { store_id: `eq.${storeId}` } : {}),
    status: 'in.(completed,cancelled)',
    archived_at: 'is.null'
  }, {
    archived_at: archivedAt
  }, ['Prefer: return=representation']);
  clearAdminOrdersCache(storeId);
  return {
    archived: openArchived.length + closedArchived.length,
    closed: openArchived.length,
    hidden: closedArchived.length,
    mode
  };
}

async function dailyOrderReport(dateValue, storeId, options = {}) {
  const day = validReportDate(dateValue);
  const start = reportDateStart(day);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return orderReportBetween(start, end, {
    date: day,
    label: `Dia ${formatReportDate(day)}`,
    start: day,
    end: day
  }, storeId, options);
}

async function rangeOrderReport({ days, start, end, storeId, db, tenant } = {}) {
  const options = { db, tenant };
  const today = validReportDate(new Date().toISOString().slice(0, 10));
  const parsedDays = Number.parseInt(days, 10);

  if ([7, 15, 30].includes(parsedDays)) {
    const endDay = today;
    const startDate = reportDateStart(endDay);
    startDate.setDate(startDate.getDate() - parsedDays + 1);
    const startDay = localReportDate(startDate);
    const endExclusive = reportDateStart(endDay);
    endExclusive.setDate(endExclusive.getDate() + 1);
    return orderReportBetween(reportDateStart(startDay), endExclusive, {
      label: `Últimos ${parsedDays} dias`,
      start: startDay,
      end: endDay,
      days: parsedDays
    }, storeId, options);
  }

  const startDay = validReportDate(start || today);
  const endDay = validReportDate(end || today);
  const startDate = reportDateStart(startDay);
  const endExclusive = reportDateStart(endDay);
  endExclusive.setDate(endExclusive.getDate() + 1);
  const label = startDay === endDay
    ? `Dia ${formatReportDate(startDay)}`
    : `${formatReportDate(startDay)} a ${formatReportDate(endDay)}`;
  return orderReportBetween(startDate, endExclusive, {
    label,
    start: startDay,
    end: endDay
  }, storeId, options);
}

async function orderReportBetween(start, end, period, storeId, options = {}) {
  const db = options.db || dbRequest;
  const spanMs = end.getTime() - start.getTime();
  const previousStart = new Date(start.getTime() - spanMs);
  const resolvedStoreId = cleanUuid(storeId);
  const orders = await db('GET', 'orders', {
    select: '*',
    ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
    and: `(created_at.gte.${previousStart.toISOString()},created_at.lt.${end.toISOString()})`,
    order: 'created_at.desc',
    limit: '5000'
  });
  const currentOrders = orders.filter((order) => {
    const createdAt = new Date(order.created_at);
    return createdAt >= start && createdAt < end;
  });
  const previousOrders = orders.filter((order) => {
    const createdAt = new Date(order.created_at);
    return createdAt >= previousStart && createdAt < start;
  });
  const withItems = await attachOrderItems(currentOrders, options);
  const totals = reportTotals(withItems);
  const previousTotals = reportTotals(previousOrders);

  return {
    date: period.start,
    period,
    totals,
    comparison: {
      label: 'Período anterior',
      totals: previousTotals,
      revenue_delta: roundMoney(totals.gross_revenue - previousTotals.gross_revenue),
      orders_delta: totals.orders - previousTotals.orders
    },
    by_status: groupOrderTotals(withItems, 'status'),
    by_payment: groupOrderTotals(withItems.filter((order) => order.status !== 'cancelled'), 'payment_method'),
    by_origin: groupOrderTotals(withItems.filter((order) => order.status !== 'cancelled'), 'fulfillment_method'),
    by_hour: hourlyOrderTotals(withItems.filter((order) => order.status !== 'cancelled')),
    cash_closing: cashClosingTotals(withItems),
    top_products: topProductTotals(withItems.filter((order) => order.status !== 'cancelled')),
    orders: withItems
  };
}

function reportTotals(orders) {
  const billable = orders.filter((order) => order.status !== 'cancelled');
  const completed = orders.filter((order) => order.status === 'completed');
  const grossRevenue = roundMoney(billable.reduce((sum, order) => sum + moneyNumber(order.total), 0));
  return {
    orders: orders.length,
    billable_orders: billable.length,
    completed_orders: completed.length,
    cancelled_orders: orders.filter((order) => order.status === 'cancelled').length,
    gross_revenue: grossRevenue,
    completed_revenue: roundMoney(completed.reduce((sum, order) => sum + moneyNumber(order.total), 0)),
    average_ticket: billable.length ? roundMoney(grossRevenue / billable.length) : 0
  };
}

function reportDateStart(value) {
  return new Date(`${validReportDate(value)}T00:00:00.000-03:00`);
}

function localReportDate(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function formatReportDate(value) {
  const [year, month, day] = validReportDate(value).split('-');
  return `${day}/${month}/${year}`;
}

function groupOrderTotals(orders, field) {
  const grouped = new Map();
  for (const order of orders) {
    const key = order[field] || 'Não informado';
    const current = grouped.get(key) || { key, count: 0, total: 0, average_ticket: 0 };
    current.count += 1;
    current.total = roundMoney(current.total + moneyNumber(order.total));
    current.average_ticket = roundMoney(current.total / current.count);
    grouped.set(key, current);
  }
  return [...grouped.values()];
}

function cashClosingTotals(orders) {
  const billable = orders.filter((order) => order.status !== 'cancelled');
  const completed = orders.filter((order) => order.status === 'completed');
  const expectedRevenue = roundMoney(billable.reduce((sum, order) => sum + moneyNumber(order.total), 0));
  const completedRevenue = roundMoney(completed.reduce((sum, order) => sum + moneyNumber(order.total), 0));
  return {
    expected_revenue: expectedRevenue,
    completed_revenue: completedRevenue,
    pending_revenue: roundMoney(billable
      .filter((order) => order.status !== 'completed')
      .reduce((sum, order) => sum + moneyNumber(order.total), 0)),
    delivery_fees: roundMoney(billable.reduce((sum, order) => sum + moneyNumber(order.delivery_fee), 0)),
    discounts: roundMoney(billable.reduce((sum, order) => sum + moneyNumber(order.discount), 0)),
    coupons: billable.filter((order) => order.promotion_code).length,
    divergence: roundMoney(expectedRevenue - completedRevenue),
    by_payment: groupOrderTotals(completed, 'payment_method'),
    order_count: billable.length
  };
}

function hourlyOrderTotals(orders) {
  const grouped = new Map();
  for (const order of orders) {
    const hour = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      hour12: false
    }).format(new Date(order.created_at));
    const key = `${hour}:00`;
    const current = grouped.get(key) || { key, count: 0, total: 0 };
    current.count += 1;
    current.total = roundMoney(current.total + moneyNumber(order.total));
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function topProductTotals(orders) {
  const grouped = new Map();
  for (const order of orders) {
    for (const item of order.items || []) {
      const name = item.item_snapshot?.name || 'Item removido';
      const current = grouped.get(name) || { name, quantity: 0, total: 0 };
      current.quantity += Number(item.quantity || 0);
      current.total = roundMoney(current.total + moneyNumber(item.total));
      grouped.set(name, current);
    }
  }
  return [...grouped.values()]
    .sort((a, b) => b.quantity - a.quantity || b.total - a.total)
    .slice(0, 8);
}

function validReportDate(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return localReportDate(new Date());
}

async function attachOrderItems(orders, options = {}) {
  const db = options.db || dbRequest;
  if (orders.length === 0) return [];

  const ids = cleanUuidArray(orders.map((order) => order.id));
  if (ids.length === 0) return orders.map((order) => ({ ...order, items: [] }));
  const items = await db('GET', 'order_items', {
    select: '*',
    order_id: uuidInFilter(ids),
    order: 'created_at.asc'
  });

  const byOrder = new Map(orders.map((order) => [order.id, { ...order, items: [] }]));
  for (const item of items) {
    byOrder.get(item.order_id)?.items.push(item);
  }

  return [...byOrder.values()];
}

async function assertOrderBelongsToStore(orderId, storeId, options = {}) {
  const db = options.db || dbRequest;
  const resolvedOrderId = cleanUuid(orderId, 'pedido');
  const resolvedStoreId = cleanUuid(storeId);
  const [order] = await db('GET', 'orders', {
    select: 'id,store_id',
    id: `eq.${resolvedOrderId}`,
    ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
    limit: '1'
  });
  if (!order) throw httpError(404, 'Pedido não encontrado nesta loja.');
  return order;
}

async function listCustomers(storeId, options = {}) {
  const db = options.db || dbRequest;
  const resolvedStoreId = cleanUuid(storeId);
  const cacheKey = `${resolvedStoreId || 'default'}:${options.tenant?.id || 'central'}`;
  const now = Date.now();
  if (adminCustomersCache?.[cacheKey] && adminCustomersCache[cacheKey].expiresAt > now) return adminCustomersCache[cacheKey].data;
  const customers = await db('GET', 'customers', {
    select: 'id,store_id,name,phone,email,birth_date,notes,created_at,updated_at,last_login_at',
    ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
    order: 'created_at.desc',
    limit: '100'
  });
  if (!customers.length) {
    adminCustomersCache = adminCustomersCache || {};
    adminCustomersCache[cacheKey] = {
      data: [],
      expiresAt: now + ADMIN_LIST_CACHE_MS
    };
    return [];
  }
  const ids = cleanUuidArray(customers.map((customer) => customer.id));
  const addresses = ids.length
    ? await db('GET', 'customer_addresses', {
      select: '*',
      ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
      customer_id: uuidInFilter(ids),
      order: 'is_default.desc,created_at.desc'
    })
    : [];
  const byCustomer = new Map();
  for (const address of addresses) {
    if (!byCustomer.has(address.customer_id)) byCustomer.set(address.customer_id, []);
    byCustomer.get(address.customer_id).push(address);
  }
  const data = customers.map((customer) => ({
    ...customer,
    addresses: byCustomer.get(customer.id) || []
  }));
  adminCustomersCache = adminCustomersCache || {};
  adminCustomersCache[cacheKey] = {
    data,
    expiresAt: now + ADMIN_LIST_CACHE_MS
  };
  return data;
}

async function listPromotions(storeId, options = {}) {
  const db = options.db || dbRequest;
  const resolvedStoreId = cleanUuid(storeId);
  const cacheKey = `${resolvedStoreId || 'default'}:${options.tenant?.id || 'central'}`;
  const now = Date.now();
  if (adminPromotionsCache?.[cacheKey] && adminPromotionsCache[cacheKey].expiresAt > now) return adminPromotionsCache[cacheKey].data;
  try {
    const data = await db('GET', 'promotions', {
      select: '*',
      ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
      order: 'created_at.desc'
    });
    adminPromotionsCache = adminPromotionsCache || {};
    adminPromotionsCache[cacheKey] = {
      data,
      expiresAt: now + ADMIN_LIST_CACHE_MS
    };
    return data;
  } catch (error) {
    const detail = JSON.stringify(error.detail || '');
    if (error.status === 404 || detail.includes('promotions')) return [];
    throw error;
  }
}

async function previewCoupon(req, data, storeId, options = {}) {
  const db = options.db || dbRequest;
  const code = cleanText(data.code || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const subtotal = roundMoney(Number.parseFloat(data.subtotal) || 0);
  const deliveryFee = roundMoney(Number.parseFloat(data.delivery_fee) || 0);
  if (!code) throw httpError(422, 'Informe o cupom.');
  const coupon = await findActivePromotion(code, {
    db,
    storeId,
    subtotal,
    deliveryFee,
    customer: await promotionCustomerContext(req, data, storeId, options),
    items: await promotionItemsContext(data.items || [], storeId, options)
  });
  const discount = couponDiscountAmount(coupon, subtotal, deliveryFee);
  return {
    code: coupon.code,
    name: coupon.name,
    description: coupon.description || null,
    discount,
    discount_type: coupon.discount_type,
    promotion_type: coupon.promotion_type || 'general'
  };
}

async function promotionCustomerContext(req, data, storeId, options = {}) {
  const db = options.db || dbRequest;
  const resolvedStoreId = cleanUuid(storeId);
  const session = await readPersistentSession(parseCookies(req)[CUSTOMER_COOKIE], 'customer');
  if (session?.data?.id) return getCustomerProfile(session.data.id, resolvedStoreId, options);

  const phone = onlyDigits(data.phone || data.customer?.phone || '');
  if (!phone) return null;
  const rows = await db('GET', 'customers', {
    select: 'id,store_id,name,phone,email,birth_date,notes,created_at,updated_at',
    ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
    phone: `eq.${phone}`,
    limit: '1'
  });
  return rows[0] || null;
}

async function promotionItemsContext(rawItems, storeId, options = {}) {
  const db = options.db || dbRequest;
  const resolvedStoreId = cleanUuid(storeId);
  const requestedItems = Array.isArray(rawItems) ? rawItems : [];
  const itemIds = cleanUuidArray(requestedItems.map((item) => item.id));
  if (itemIds.length === 0) return [];
  const items = await db('GET', 'menu_items', {
    select: 'id,name,category_id,price',
    ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
    id: uuidInFilter(itemIds)
  });
  const byId = new Map(items.map((item) => [item.id, item]));
  return requestedItems.map((requested) => {
    const item = byId.get(cleanUuid(requested.id));
    if (!item) return null;
    return {
      menu_item_id: item.id,
      quantity: clampInteger(requested.quantity, 1, 99),
      item_snapshot: {
        id: item.id,
        name: item.name,
        category_id: item.category_id,
        price: moneyNumber(item.price)
      }
    };
  }).filter(Boolean);
}

async function findActivePromotion(code, context) {
  const db = context.db || dbRequest;
  const subtotal = roundMoney(Number(context.subtotal || 0));
  const deliveryFee = roundMoney(Number(context.deliveryFee || 0));
  const resolvedStoreId = cleanUuid(context.storeId);
  const rows = await db('GET', 'promotions', {
    select: '*',
    ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
    code: `eq.${code}`,
    is_active: 'eq.true',
    limit: '1'
  });
  const coupon = rows[0];
  if (!coupon) throw httpError(404, 'Cupom não encontrado ou inativo.');
  const now = Date.now();
  if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) throw httpError(422, 'Cupom ainda não começou.');
  if (coupon.ends_at && new Date(coupon.ends_at).getTime() < now) throw httpError(422, 'Cupom expirado.');
  if (coupon.max_uses && Number(coupon.used_count || 0) >= Number(coupon.max_uses)) throw httpError(422, 'Cupom esgotado.');
  if (subtotal < moneyNumber(coupon.minimum_order)) {
    throw httpError(422, `Pedido mínimo para este cupom: ${formatMoney(coupon.minimum_order)}.`);
  }
  if ((coupon.discount_type === 'free_delivery' || coupon.promotion_type === 'free_delivery') && deliveryFee <= 0) {
    throw httpError(422, 'Este cupom é para pedidos com entrega.');
  }
  await assertPromotionAudience(coupon, { ...context, db, subtotal, deliveryFee });
  return coupon;
}

async function assertPromotionAudience(coupon, context) {
  const promotionType = coupon.promotion_type || 'general';
  const items = Array.isArray(context.items) ? context.items : [];
  const itemIds = new Set(items.map((item) => item.menu_item_id || item.item_snapshot?.id).filter(Boolean));
  const categoryIds = new Set(items.map((item) => item.item_snapshot?.category_id).filter(Boolean));
  const allowedCategoryIds = cleanIdArray(coupon.allowed_category_ids);
  const comboItemIds = cleanIdArray(coupon.combo_item_ids);

  if (allowedCategoryIds.length && !allowedCategoryIds.some((categoryId) => categoryIds.has(categoryId))) {
    throw httpError(422, 'Este cupom não vale para as categorias escolhidas.');
  }

  if (promotionType === 'combo' && comboItemIds.length && !comboItemIds.every((itemId) => itemIds.has(itemId))) {
    throw httpError(422, 'Este combo precisa dos produtos configurados na promoção.');
  }

  const customer = context.customer || null;
  await assertPromotionUseLimitPerCustomer(coupon, customer, context);

  if (!['first_order', 'recurring', 'birthday'].includes(promotionType)) return;

  const orderCount = customer?.id ? await customerOrderCount(customer.id, context) : 0;

  if (promotionType === 'first_order' && orderCount > 0) {
    throw httpError(422, 'Este cupom é válido apenas para a primeira compra.');
  }

  if (promotionType === 'recurring') {
    const minOrders = Math.max(1, Number(coupon.recurring_min_orders || 2));
    if (!customer?.id || orderCount < minOrders) {
      throw httpError(422, `Este cupom é para clientes com pelo menos ${minOrders} pedido(s).`);
    }
  }

  if (promotionType === 'birthday') {
    if (!customer?.birth_date) throw httpError(422, 'Informe a data de aniversário no cadastro para usar este cupom.');
    const windowDays = Math.max(0, Number(coupon.birthday_window_days || 7));
    if (!isBirthdayWithinWindow(customer.birth_date, windowDays)) {
      throw httpError(422, 'Este cupom só vale perto da data de aniversário.');
    }
  }
}

async function assertPromotionUseLimitPerCustomer(coupon, customer, context = {}) {
  const db = context.db || dbRequest;
  const limit = Math.max(1, Number(coupon.max_uses_per_customer || 1));
  if (!customer?.id) return;
  const uses = await db('GET', 'orders', {
    select: 'id',
    customer_id: `eq.${customer.id}`,
    promotion_code: `eq.${coupon.code}`
  });
  if (uses.length >= limit) {
    throw httpError(422, `Este cupom já atingiu o limite de ${limit} uso(s) para sua conta.`);
  }
}

async function customerOrderCount(customerId, context = {}) {
  const db = context.db || dbRequest;
  const orders = await db('GET', 'orders', {
    select: 'id',
    customer_id: `eq.${customerId}`
  });
  return orders.length;
}

function isBirthdayWithinWindow(birthDate, windowDays) {
  const birthday = new Date(`${String(birthDate).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(birthday.getTime())) return false;
  const now = new Date();
  const thisYear = new Date(now.getFullYear(), birthday.getMonth(), birthday.getDate(), 12, 0, 0);
  const nextYear = new Date(now.getFullYear() + 1, birthday.getMonth(), birthday.getDate(), 12, 0, 0);
  const previousYear = new Date(now.getFullYear() - 1, birthday.getMonth(), birthday.getDate(), 12, 0, 0);
  const diffDays = Math.min(
    Math.abs(thisYear.getTime() - now.getTime()),
    Math.abs(nextYear.getTime() - now.getTime()),
    Math.abs(previousYear.getTime() - now.getTime())
  ) / 86400000;
  return diffDays <= windowDays;
}

function cleanIdArray(value) {
  if (!Array.isArray(value)) return [];
  return cleanUuidArray(value);
}

function couponDiscountAmount(coupon, subtotal, deliveryFee) {
  if (!coupon) return 0;
  if (coupon.discount_type === 'free_delivery' || coupon.promotion_type === 'free_delivery') return roundMoney(deliveryFee);
  if (coupon.discount_type === 'percent') return roundMoney(subtotal * Math.min(100, moneyNumber(coupon.discount_value)) / 100);
  return roundMoney(Math.min(subtotal, moneyNumber(coupon.discount_value)));
}

function defaultBusinessHours() {
  return {
    monday: { open: '18:00', close: '23:00', closed: false },
    tuesday: { open: '18:00', close: '23:00', closed: false },
    wednesday: { open: '18:00', close: '23:00', closed: false },
    thursday: { open: '18:00', close: '23:00', closed: false },
    friday: { open: '18:00', close: '23:30', closed: false },
    saturday: { open: '18:00', close: '23:30', closed: false },
    sunday: { open: '18:00', close: '23:00', closed: false }
  };
}

function defaultNeighborhoodFees() {
  return {
    Centro: 5,
    'Bela Vista': 8,
    Interior: 12
  };
}

function defaultLoyaltyProgram() {
  return {
    is_active: false,
    mode: 'orders_reward',
    reward: 'Item grátis',
    orders_required: 5,
    points_per_currency: 1,
    points_target: 500
  };
}

function defaultThemeSettings() {
  return {
    primaryColor: '#d71920',
    secondaryColor: '#18181b',
    backgroundColor: '#f5f5f4',
    buttonColor: '#d71920',
    buttonTextColor: '#ffffff',
    selectionColor: '#d71920',
    selectionTextColor: '#ffffff'
  };
}

function defaultPrintSettings() {
  return {
    paperWidth: '80',
    kitchenCopies: 1,
    customerCopies: 1,
    autoPrintKitchen: false,
    autoPrintKitchenStatus: 'accepted',
    showKitchenPrices: false,
    highlightNotes: true
  };
}

function defaultIntegrationSettings() {
  return {
    whatsapp: {
      enabled: false,
      provider: 'official',
      phoneNumberId: '',
      accessToken: '',
      apiUrl: ''
    },
    pix: {
      enabled: false,
      provider: 'abacatepay',
      apiKey: '',
      webhookSecret: '',
      expirationMinutes: 15
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

function sanitizePrintSettings(value) {
  const defaults = defaultPrintSettings();
  const data = isPlainObject(value) ? value : {};
  return {
    paperWidth: ['58', '80'].includes(String(data.paperWidth)) ? String(data.paperWidth) : defaults.paperWidth,
    kitchenCopies: clampInteger(data.kitchenCopies, 1, 5),
    customerCopies: clampInteger(data.customerCopies, 1, 5),
    autoPrintKitchen: Boolean(data.autoPrintKitchen),
    autoPrintKitchenStatus: ['new', 'accepted', 'preparing'].includes(String(data.autoPrintKitchenStatus))
      ? String(data.autoPrintKitchenStatus)
      : defaults.autoPrintKitchenStatus,
    showKitchenPrices: Boolean(data.showKitchenPrices),
    highlightNotes: data.highlightNotes === undefined ? defaults.highlightNotes : Boolean(data.highlightNotes)
  };
}

function sanitizeIntegrationSettings(value) {
  const defaults = defaultIntegrationSettings();
  const data = isPlainObject(value) ? value : {};
  const whatsapp = isPlainObject(data.whatsapp) ? data.whatsapp : {};
  const pix = isPlainObject(data.pix) ? data.pix : {};
  const card = isPlainObject(data.card) ? data.card : {};
  const split = isPlainObject(data.split) ? data.split : {};
  const reconciliation = isPlainObject(data.reconciliation) ? data.reconciliation : {};
  return {
    whatsapp: {
      enabled: Boolean(whatsapp.enabled),
      provider: ['official', 'webhook', 'whatsevolution', 'mock'].includes(String(whatsapp.provider)) ? String(whatsapp.provider) : defaults.whatsapp.provider,
      phoneNumberId: cleanText(whatsapp.phoneNumberId || '').slice(0, 120),
      accessToken: cleanText(whatsapp.accessToken || '').slice(0, 500),
      apiUrl: cleanText(whatsapp.apiUrl || '').slice(0, 500)
    },
    pix: {
      enabled: Boolean(pix.enabled),
      provider: pix.enabled === false ? defaults.pix.provider : 'abacatepay',
      apiKey: cleanText(pix.apiKey || '').slice(0, 500),
      webhookSecret: cleanText(pix.webhookSecret || '').slice(0, 500),
      expirationMinutes: clampInteger(pix.expirationMinutes || defaults.pix.expirationMinutes, 5, 120)
    },
    card: {
      enabled: false,
      provider: defaults.card.provider,
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
      days: clampInteger(reconciliation.days || defaults.reconciliation.days, 1, 30)
    }
  };
}

function mergeIntegrationSettings(currentValue, nextValue) {
  const current = sanitizeIntegrationSettings(currentValue || {});
  const next = sanitizeIntegrationSettings(nextValue || {});
  const rawNext = isPlainObject(nextValue) ? nextValue : {};
  const rawWhatsapp = isPlainObject(rawNext.whatsapp) ? rawNext.whatsapp : {};
  const rawPix = isPlainObject(rawNext.pix) ? rawNext.pix : {};

  if (shouldKeepExistingSecret(rawWhatsapp.accessToken)) {
    next.whatsapp.accessToken = current.whatsapp.accessToken;
  }
  if (shouldKeepExistingSecret(rawPix.apiKey)) {
    next.pix.apiKey = current.pix.apiKey;
  }
  if (shouldKeepExistingSecret(rawPix.webhookSecret)) {
    next.pix.webhookSecret = current.pix.webhookSecret;
  }

  return next;
}

function shouldKeepExistingSecret(value) {
  const text = String(value || '').trim();
  return !text || isMaskedSecretValue(text);
}

function isMaskedSecretValue(value) {
  return /^\*{4,}/.test(String(value || '').trim());
}

function maskedSecret(value) {
  const text = String(value || '');
  if (!text) return '';
  const tail = text.slice(-4);
  return `****${tail}`;
}

function adminStore(store) {
  const copy = {
    ...store,
    loyalty_program: sanitizeLoyaltyProgram(store.loyalty_program || {}),
    theme_settings: sanitizeThemeSettings(store.theme_settings || {}),
    print_settings: sanitizePrintSettings(store.print_settings || {})
  };
  const integrations = sanitizeIntegrationSettings(store.integration_settings || {});
  copy.integration_settings = {
    ...integrations,
    whatsapp: {
      ...integrations.whatsapp,
      accessToken: maskedSecret(integrations.whatsapp.accessToken),
      hasAccessToken: Boolean(integrations.whatsapp.accessToken)
    },
    pix: {
      ...integrations.pix,
      apiKey: maskedSecret(integrations.pix.apiKey),
      webhookSecret: maskedSecret(integrations.pix.webhookSecret),
      hasApiKey: Boolean(integrations.pix.apiKey),
      hasWebhookSecret: Boolean(integrations.pix.webhookSecret)
    }
  };
  return copy;
}

function publicStore(store) {
  const copy = { ...store };
  const integrations = sanitizeIntegrationSettings(store.integration_settings || {});
  copy.integration_settings = {
    whatsapp: { enabled: integrations.whatsapp.enabled },
    pix: {
      enabled: integrations.pix.enabled,
      provider: integrations.pix.enabled ? integrations.pix.provider : 'mock',
      expirationMinutes: integrations.pix.expirationMinutes
    },
    card: { enabled: false },
    split: { enabled: false },
    reconciliation: { enabled: false }
  };
  return copy;
}

function sanitizeThemeSettings(value) {
  const defaults = defaultThemeSettings();
  const data = isPlainObject(value) ? value : {};
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => {
    const color = String(data[key] || '').trim();
    return [key, /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : fallback];
  }));
}

function sanitizeLoyaltyProgram(value) {
  const defaults = defaultLoyaltyProgram();
  const data = isPlainObject(value) ? value : {};
  const mode = data.mode === 'points' ? 'points' : 'orders_reward';
  return {
    is_active: data.is_active === true || data.is_active === 'true' || data.is_active === 'on' || data.is_active === '1',
    mode,
    reward: cleanText(data.reward || defaults.reward) || defaults.reward,
    orders_required: clampInteger(data.orders_required, 1, 999),
    points_per_currency: Math.max(0.01, roundMoney(Number.parseFloat(data.points_per_currency) || defaults.points_per_currency)),
    points_target: clampInteger(data.points_target, 1, 999999)
  };
}

function deliveryFeeForAddress(store, address) {
  const fallback = moneyNumber(store.delivery_fee);
  const rules = isPlainObject(store.delivery_neighborhood_fees) ? store.delivery_neighborhood_fees : {};
  const neighborhood = normalizeName(address?.neighborhood || '');
  if (!neighborhood) return fallback;
  for (const [name, value] of Object.entries(rules)) {
    if (normalizeName(name) === neighborhood) return moneyNumber(value);
  }
  return fallback;
}

async function uploadImage(data) {
  const fileName = cleanFileName(data.fileName || 'produto.jpg');
  const contentType = cleanText(data.contentType || 'image/jpeg').split(';')[0].toLowerCase();
  const base64 = String(data.dataBase64 || '').replace(/^data:[^;]+;base64,/, '');
  const folder = uploadFolder(data.usage);

  if (!base64) throw httpError(422, 'Arquivo de imagem ausente.');
  if (!allowedUploadTypes.has(contentType)) {
    throw httpError(422, 'Envie apenas imagens JPG, PNG ou WebP.');
  }

  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > 5 * 1024 * 1024) throw httpError(422, 'Imagem muito grande. Limite de 5 MB.');
  if (detectImageContentType(buffer) !== contentType) {
    throw httpError(422, 'O conteúdo do arquivo não corresponde ao tipo de imagem informado.');
  }

  const objectPath = `${folder}/${Date.now()}-${randomBytes(6).toString('hex')}-${fileName}`;
  const fullPath = path.join(UPLOAD_DIR, objectPath);
  if (!fullPath.startsWith(UPLOAD_DIR)) throw httpError(400, 'Caminho de upload inválido.');
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer, { flag: 'wx' });

  return {
    path: objectPath,
    url: `/uploads/${objectPath.replaceAll(path.sep, '/')}`
  };
}
function uploadFolder(usage) {
  return ({
    logo: 'store/logo',
    favicon: 'store/favicon',
    cover: 'store/cover',
    product: 'products'
  })[cleanText(usage || '').toLowerCase()] || 'products';
}

async function dbRequest(method, table, query = {}, payload, extraHeaders = []) {
  return localDbRequest({
    scope: 'local-postgres'
  }, method, table, query, payload, extraHeaders);
}

async function localDbRequest(config, method, table, query = {}, payload, extraHeaders = []) {
  try {
    return await localPostgrestRequest(method, table, query, payload, extraHeaders);
  } catch (error) {
    console.error(JSON.stringify({
      scope: config.scope || 'local-postgres',
      method,
      table,
      status: error.status || 500,
      message: error.message,
      code: error.code,
      details: error.detail || undefined
    }));
    throw httpError(error.status || 500, `Banco local: ${error.message}`, error.detail || error);
  }
}
async function serveStatic(res, requestPath, hostHeader = '') {
  if (requestPath.startsWith('/uploads/')) {
    await serveUpload(res, requestPath);
    return;
  }

  const routedPath = routePath(requestPath, hostHeader);
  const filePath = path.normalize(path.join(publicDir, routedPath));

  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
    await sendFile(res, path.join(publicDir, 'app.html'));
    return;
  }

  await sendFile(res, filePath);
}

async function serveUpload(res, requestPath) {
  const relative = decodeURIComponent(requestPath.replace(/^\/uploads\//, ''));
  const filePath = path.normalize(path.join(UPLOAD_DIR, relative));
  if (!filePath.startsWith(UPLOAD_DIR) || !existsSync(filePath)) {
    json(res, 404, { error: 'Arquivo não encontrado.' });
    return;
  }
  await sendFile(res, filePath);
}

function routePath(requestPath, hostHeader = '') {
  const hostname = String(hostHeader || '').split(':')[0].toLowerCase();
  const panelHosts = csvEnv('PANEL_HOSTS');
  const platformHosts = csvEnv('PLATFORM_HOSTS');
  const isPanelHost = panelHosts.includes(hostname) || hostname.startsWith('painel.');
  const isPlatformHost = platformHosts.includes(hostname) || hostname.startsWith('platform.');

  if (requestPath === '/' && isPanelHost) return '/admin.html';
  if (requestPath === '/' && isPlatformHost) return '/platform.html';
  if (requestPath === '/') return '/home.html';
  if (requestPath === '/cardapio') return '/app.html';
  if (requestPath === '/planos') return '/plans.html';
  if (['/recursos', '/demonstracao'].includes(requestPath)) return '/home.html';
  if (requestPath === '/termos') return '/terms.html';
  if (requestPath === '/privacidade') return '/privacy.html';
  if (requestPath === '/entrar') return '/admin.html';
  if (requestPath === '/criar-conta' || requestPath === '/cadastro') return '/signup.html';
  if (requestPath === '/ativar-conta') return '/activate-account.html';
  if (requestPath === '/redefinir-senha') return '/reset-password.html';
  if (requestPath === '/onboarding') return '/admin.html';
  if (requestPath === '/convite') return '/invite.html';
  if (requestPath === '/painel' || requestPath === '/admin') return '/admin.html';
  if (requestPath === '/platform' || requestPath === '/plataform') return '/platform.html';
  if (requestPath === '/cozinha') return '/kitchen.html';
  if (requestPath === '/pagamento') return '/payment.html';
  if (requestPath === '/conta' || requestPath === '/cliente') return '/account.html';
  if (requestPath === '/pedidos') return '/orders.html';
  if (path.extname(requestPath)) return decodeURIComponent(requestPath);
  const parts = String(requestPath || '').split('/').filter(Boolean);
  if (parts.length === 1 && cleanSlug(parts[0])) return '/app.html';
  if (parts.length === 2 && cleanSlug(parts[0])) {
    if (parts[1] === 'pedidos') return '/orders.html';
    if (parts[1] === 'conta' || parts[1] === 'cliente') return '/account.html';
    if (parts[1] === 'pagamento') return '/payment.html';
  }
  return decodeURIComponent(requestPath);
}

function csvEnv(name) {
  return String(process.env[name] || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

async function sendFile(res, filePath) {
  const ext = path.extname(filePath);
  const content = await readFile(filePath);
  const cacheHeaders = {
    'Cache-Control': 'no-store',
    ...(ext === '.html' ? { 'Clear-Site-Data': '"cache"' } : {})
  };
  res.writeHead(200, {
    ...securityHeaders({ allowSameOriginFrame: ext === '.html' }),
    ...cacheHeaders,
    'Content-Type': mimeTypes.get(ext) || 'application/octet-stream'
  });
  res.end(content);
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_JSON_BYTES) throw httpError(413, 'Payload muito grande.');
  }

  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw httpError(400, 'JSON inválido.');
  }
}

function sanitizeAdminUser(data) {
  const admin = sanitize(data, {
    name: 'string',
    email: 'email'
  }, ['name', 'email']);
  return admin;
}

function sanitizeAdminRole(role) {
  const value = String(role || '').trim();
  if (['superadmin', 'admin', 'waiter', 'attendant', 'delivery', 'kitchen'].includes(value)) return value;
  return 'admin';
}

function sanitizeStore(data) {
  const store = sanitize(data, {
    name: 'string',
    slug: 'string',
    description: 'nullable_string',
    whatsapp_number: 'phone',
    address: 'nullable_string',
    page_title: 'nullable_string',
    favicon_url: 'nullable_string',
    logo_url: 'nullable_string',
    cover_url: 'nullable_string',
    is_open: 'boolean',
    accepts_delivery: 'boolean',
    accepts_pickup: 'boolean',
    delivery_fee: 'float',
    delivery_neighborhood_fees: 'object',
    minimum_order: 'float',
    payment_methods: 'array',
    business_hours: 'object',
    loyalty_program: 'object',
    theme_settings: 'object',
    print_settings: 'object',
    integration_settings: 'object',
    onboarding_completed: 'boolean'
  }, ['name']);
  if ('whatsapp_number' in store) store.whatsapp_number = normalizeBrazilLocalPhone(store.whatsapp_number);
  if ('whatsapp_number' in store && store.whatsapp_number && !isBrazilLocalPhone(store.whatsapp_number)) {
    throw httpError(422, 'Informe o WhatsApp dos pedidos com DDD + telefone, sem +55. Ex: 55936191201.');
  }
  if ('delivery_neighborhood_fees' in store) {
    store.delivery_neighborhood_fees = sanitizeNeighborhoodFees(store.delivery_neighborhood_fees);
  }
  if ('loyalty_program' in store) {
    store.loyalty_program = sanitizeLoyaltyProgram(store.loyalty_program);
  }
  if ('theme_settings' in store) {
    store.theme_settings = sanitizeThemeSettings(store.theme_settings);
  }
  if ('print_settings' in store) {
    store.print_settings = sanitizePrintSettings(store.print_settings);
  }
  if ('integration_settings' in store) {
    store.integration_settings = sanitizeIntegrationSettings(store.integration_settings);
  }
  return store;
}

function sanitizeDiningTable(data, creating) {
  const table = sanitize(data, {
    name: 'string',
    code: 'string',
    is_active: 'boolean'
  }, creating ? ['name'] : []);
  if ('code' in table) table.code = cleanSlug(table.code || table.name);
  return table;
}

function sanitizeNeighborhoodFees(value) {
  if (!isPlainObject(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .map(([name, price]) => [cleanText(name), roundMoney(Number.parseFloat(price) || 0)])
    .filter(([name, price]) => name && price >= 0));
}

function sanitizeCategory(data, creating) {
  return sanitize(data, {
    name: 'string',
    description: 'nullable_string',
    sort_order: 'integer',
    is_active: 'boolean'
  }, creating ? ['name'] : []);
}

function sanitizeItem(data, creating) {
  return sanitize(data, {
    category_id: 'string',
    name: 'string',
    description: 'nullable_string',
    price: 'float',
    image_url: 'nullable_string',
    tags: 'array',
    is_featured: 'boolean',
    is_available: 'boolean',
    sort_order: 'integer'
  }, creating ? ['category_id', 'name', 'price'] : []);
}

function sanitizeModifierGroup(data, creating) {
  const clean = sanitize(data, {
    name: 'string',
    description: 'nullable_string',
    min_choices: 'integer',
    max_choices: 'integer',
    is_required: 'boolean',
    sort_order: 'integer'
  }, creating ? ['name'] : []);
  if ('min_choices' in clean) clean.min_choices = Math.max(0, clean.min_choices);
  if ('max_choices' in clean) clean.max_choices = Math.max(1, clean.max_choices);
  if (clean.is_required && (!('min_choices' in clean) || clean.min_choices < 1)) {
    clean.min_choices = 1;
  }
  if ('min_choices' in clean && 'max_choices' in clean && clean.max_choices < clean.min_choices) {
    clean.max_choices = clean.min_choices || 1;
  }
  return clean;
}

function sanitizeModifier(data, creating) {
  return sanitize(data, {
    name: 'string',
    price_delta: 'float',
    is_available: 'boolean',
    sort_order: 'integer'
  }, creating ? ['name'] : []);
}

function sanitizePromotion(data, creating) {
  const promotion = sanitize(data, {
    name: 'string',
    code: 'string',
    description: 'nullable_string',
    promotion_type: 'string',
    discount_type: 'string',
    discount_value: 'float',
    minimum_order: 'float',
    starts_at: 'nullable_string',
    ends_at: 'nullable_string',
    max_uses: 'nullable_integer',
    max_uses_per_customer: 'integer',
    allowed_category_ids: 'array',
    combo_item_ids: 'array',
    recurring_min_orders: 'integer',
    birthday_window_days: 'integer',
    is_active: 'boolean'
  }, creating ? ['name', 'code'] : []);

  if ('code' in promotion) {
    promotion.code = promotion.code.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!promotion.code) throw httpError(422, 'Informe um código de cupom válido.');
  }
  if ('discount_type' in promotion && !['fixed', 'percent', 'free_delivery'].includes(promotion.discount_type)) {
    throw httpError(422, 'Tipo de desconto inválido.');
  }
  if ('promotion_type' in promotion && !['general', 'first_order', 'free_delivery', 'fixed', 'percent', 'combo', 'birthday', 'recurring'].includes(promotion.promotion_type)) {
    throw httpError(422, 'Tipo de promoção inválido.');
  }
  if (promotion.promotion_type === 'free_delivery') promotion.discount_type = 'free_delivery';
  if (promotion.promotion_type === 'fixed') promotion.discount_type = 'fixed';
  if (promotion.promotion_type === 'percent') promotion.discount_type = 'percent';
  if (promotion.discount_type === 'percent' && promotion.discount_value > 100) promotion.discount_value = 100;
  if ('discount_value' in promotion) promotion.discount_value = Math.max(0, promotion.discount_value);
  if ('minimum_order' in promotion) promotion.minimum_order = Math.max(0, promotion.minimum_order);
  if ('max_uses' in promotion && promotion.max_uses !== null) promotion.max_uses = Math.max(1, promotion.max_uses);
  if ('max_uses_per_customer' in promotion) promotion.max_uses_per_customer = Math.max(1, promotion.max_uses_per_customer);
  if ('allowed_category_ids' in promotion) promotion.allowed_category_ids = cleanIdArray(promotion.allowed_category_ids);
  if ('combo_item_ids' in promotion) promotion.combo_item_ids = cleanIdArray(promotion.combo_item_ids);
  if ('recurring_min_orders' in promotion) promotion.recurring_min_orders = Math.max(1, promotion.recurring_min_orders);
  if ('birthday_window_days' in promotion) promotion.birthday_window_days = Math.max(0, promotion.birthday_window_days);
  if ('starts_at' in promotion) promotion.starts_at = cleanOptionalDate(promotion.starts_at);
  if ('ends_at' in promotion) promotion.ends_at = cleanOptionalDate(promotion.ends_at);
  return promotion;
}

function sanitizeCustomer(data) {
  const customer = sanitize(data, {
    name: 'string',
    phone: 'phone',
    email: 'nullable_email',
    birth_date: 'nullable_date',
    notes: 'nullable_string'
  }, ['name', 'phone']);

  if (customer.phone.length < 10) throw httpError(422, 'Informe um telefone válido.');
  return customer;
}

function sanitizeOrderCustomer(data, fulfillmentMethod) {
  if (fulfillmentMethod === 'delivery' || fulfillmentMethod === 'pickup') return sanitizeCustomer(data);
  if (fulfillmentMethod === 'table' || fulfillmentMethod === 'tab') {
    const customer = sanitize(data, {
      name: 'nullable_string',
      phone: 'phone',
      email: 'nullable_email'
    }, []);
    if (customer.phone && customer.phone.length < 10) throw httpError(422, 'Informe um telefone válido ou deixe em branco.');
    customer.name = cleanText(customer.name || 'Cliente da mesa');
    return customer;
  }
  const customer = sanitize(data, {
    name: 'string',
    phone: 'phone',
    email: 'nullable_email'
  }, ['name']);
  if (customer.phone && customer.phone.length < 10) throw httpError(422, 'Informe um telefone válido ou deixe em branco.');
  return customer;
}

async function requireActiveDiningTable(idOrCode, storeId, options = {}) {
  const db = options.db || dbRequest;
  const value = cleanText(idOrCode || '');
  const resolvedStoreId = cleanUuid(storeId);
  if (!value) throw httpError(422, 'Mesa não informada.');
  const query = {
    select: '*',
    ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
    is_active: 'eq.true',
    limit: '1'
  };
  if (/^[a-f0-9-]{36}$/i.test(value)) query.id = `eq.${cleanUuid(value, 'mesa')}`;
  else query.code = `eq.${cleanSlug(value)}`;
  const rows = await db('GET', 'dining_tables', query);
  if (!rows[0]) throw httpError(422, 'Mesa não encontrada ou inativa.');
  return rows[0];
}

async function requireOpenTab(tabId, tableId, storeId, options = {}) {
  const db = options.db || dbRequest;
  const id = tabId ? cleanUuid(tabId, 'comanda') : '';
  const resolvedStoreId = cleanUuid(storeId);
  let rows = [];
  if (id) {
    rows = await db('GET', 'customer_tabs', {
      select: '*',
      ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
      id: `eq.${id}`,
      status: 'eq.open',
      limit: '1'
    });
    if (rows[0] && tableId && rows[0].dining_table_id !== tableId) {
      throw httpError(422, 'A comanda selecionada não pertence a esta mesa.');
    }
  } else if (tableId) {
    rows = await db('GET', 'customer_tabs', {
      select: '*',
      ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
      dining_table_id: `eq.${tableId}`,
      status: 'eq.open',
      order: 'opened_at.asc',
      limit: '2'
    });
    if (rows.length > 1) throw httpError(422, 'Escolha qual comanda desta mesa receberá o pedido.');
  }
  if (!rows[0]) throw httpError(422, 'Comanda aberta não encontrada.');
  return rows[0];
}

async function findOpenTabForTable(tableId, storeId, options = {}) {
  const db = options.db || dbRequest;
  const id = cleanText(tableId || '');
  const resolvedStoreId = cleanUuid(storeId);
  if (!id) return null;
  const rows = await db('GET', 'customer_tabs', {
    select: '*',
    ...(resolvedStoreId ? { store_id: `eq.${resolvedStoreId}` } : {}),
    dining_table_id: `eq.${id}`,
    status: 'eq.open',
    order: 'opened_at.asc',
    limit: '2'
  });
  return rows.length === 1 ? rows[0] : null;
}

function sanitizeAddress(data) {
  return sanitize(data, {
    label: 'string',
    postal_code: 'nullable_string',
    street: 'string',
    number: 'string',
    complement: 'nullable_string',
    neighborhood: 'nullable_string',
    city: 'nullable_string',
    reference: 'nullable_string'
  }, ['street', 'number', 'neighborhood', 'city']);
}

function sanitizeAddressWithDefault(data, requireStreet) {
  return sanitize(data, {
    label: 'string',
    postal_code: 'nullable_string',
    street: 'string',
    number: requireStreet ? 'string' : 'nullable_string',
    complement: 'nullable_string',
    neighborhood: 'nullable_string',
    city: 'nullable_string',
    reference: 'nullable_string',
    is_default: 'boolean'
  }, requireStreet ? ['street', 'number', 'neighborhood', 'city'] : []);
}

function sanitizePaymentDetails(data, paymentMethod) {
  const details = {};
  if (isCashPayment(paymentMethod) && 'change_for' in data) {
    details.change_for = roundMoney(Number.parseFloat(String(data.change_for).replace(',', '.')) || 0);
  }
  return details;
}

function validatePaymentDetails(details, paymentMethod, total) {
  if (!isCashPayment(paymentMethod) || !details.change_for) return;
  if (moneyNumber(details.change_for) < moneyNumber(total)) {
    throw httpError(422, 'O valor para troco precisa ser maior ou igual ao total do pedido.');
  }
}

function isCashPayment(paymentMethod) {
  return normalizeName(paymentMethod).includes('dinheiro');
}

function isOnlinePixPayment(paymentMethod) {
  const normalized = normalizeName(paymentMethod);
  return normalized === 'pagamento online' || (normalized.includes('pix') && (normalized.includes('online') || normalized.includes('pagamento online')));
}

function isOnlineCardPayment(paymentMethod) {
  const normalized = normalizeName(paymentMethod);
  return normalized.includes('cartao') && (normalized.includes('online') || normalized.includes('pagamento online'));
}

function isOnlinePaymentMethod(paymentMethod) {
  return isOnlinePixPayment(paymentMethod) || isOnlineCardPayment(paymentMethod);
}

function isOnlineOrderAwaitingRelease(order) {
  if (!order || !isOnlinePaymentMethod(order.payment_method)) return false;
  return !['paid', 'refunded'].includes(String(order.financial_status || 'pending'));
}

function validateOnlinePaymentAmount(paymentMethod, integrations, total) {
  if (!isOnlinePaymentMethod(paymentMethod)) return;
  const provider = onlinePaymentProviderFor(paymentMethod, integrations);
  if (provider === 'abacatepay' && moneyCents(total) < 100) {
    throw httpError(422, 'Pagamento online via Abacate Pay exige valor mínimo de R$ 1,00.');
  }
}

function onlinePaymentProviderFor(paymentMethod, integrations) {
  if (isOnlinePixPayment(paymentMethod)) return integrations.pix.provider;
  if (isOnlineCardPayment(paymentMethod)) return integrations.card.provider;
  return null;
}

function sanitize(data, allowed, required) {
  for (const field of required) {
    if (!(field in data) || data[field] === '') {
      throw httpError(422, `Campo obrigatorio ausente: ${fieldLabel(field)}`);
    }
  }

  const clean = {};
  for (const [field, type] of Object.entries(allowed)) {
    if (!(field in data)) continue;
    const value = data[field];

    if (type === 'string') clean[field] = cleanText(value);
    if (type === 'nullable_string') clean[field] = value === null || value === '' ? null : cleanText(value);
    if (type === 'integer') clean[field] = Number.parseInt(value, 10) || 0;
    if (type === 'nullable_integer') clean[field] = value === null || value === '' ? null : Number.parseInt(value, 10) || null;
    if (type === 'float') clean[field] = roundMoney(Number.parseFloat(value) || 0);
    if (type === 'boolean') clean[field] = value === true || value === 'true' || value === 'on' || value === '1';
    if (type === 'array') clean[field] = Array.isArray(value) ? value.map(cleanText).filter(Boolean) : [];
    if (type === 'object') clean[field] = isPlainObject(value) ? value : {};
    if (type === 'phone') clean[field] = onlyDigits(value);
    if (type === 'email') clean[field] = cleanEmail(value);
    if (type === 'nullable_email') clean[field] = value ? cleanEmail(value) : null;
    if (type === 'nullable_date') clean[field] = value ? cleanOptionalDate(value).slice(0, 10) : null;
  }

  return clean;
}

function cleanOptionalDate(value) {
  if (value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw httpError(422, 'Data inválida.');
  return date.toISOString();
}

function fieldLabel(field) {
  return ({
    name: 'nome',
    phone: 'telefone',
    email: 'e-mail',
    postal_code: 'CEP',
    street: 'rua',
    number: 'número',
    neighborhood: 'bairro',
    city: 'cidade',
    payment_method: 'forma de pagamento',
    id: 'identificador'
  })[field] || field;
}

function buildWhatsappMessage(store, order, items, customer, address) {
  const origin = orderOriginLabel(order);
  const lines = [
    `Novo pedido #${order.public_code}`,
    '',
    `Cliente: ${customer.name}`,
    customer.phone ? `Telefone: ${customer.phone}` : null,
    `Tipo: ${origin}`,
    order.table_snapshot?.name ? `Mesa: ${order.table_snapshot.name}` : null,
    order.tab_snapshot?.name ? `Comanda: ${order.tab_snapshot.name}` : null,
    `Pagamento: ${order.payment_method}`,
    ''
  ].filter(Boolean);

  if (address) {
    lines.push('Endereço:');
    if (address.postal_code) lines.push(`CEP: ${address.postal_code}`);
    lines.push(`${address.street}${address.number ? `, ${address.number}` : ''}`);
    if (address.neighborhood) lines.push(`Bairro: ${address.neighborhood}`);
    if (address.city) lines.push(`Cidade: ${address.city}`);
    if (address.complement) lines.push(`Complemento: ${address.complement}`);
    if (address.reference) lines.push(`Referência: ${address.reference}`);
    lines.push('');
  }

  lines.push('Itens:');
  for (const item of items) {
    lines.push(`${item.quantity}x ${item.item_snapshot.name} - ${formatMoney(item.total)}`);
    for (const modifier of item.item_snapshot.modifiers || []) {
      lines.push(`  - ${modifierWhatsappLine(modifier)}`);
    }
    if (item.notes) lines.push(`Obs: ${item.notes}`);
  }

  lines.push('');
  lines.push(`Subtotal: ${formatMoney(order.subtotal)}`);
  if (Number(order.delivery_fee) > 0) lines.push(`Entrega: ${formatMoney(order.delivery_fee)}`);
  if (Number(order.discount) > 0) {
    lines.push(`Desconto${order.promotion_code ? ` (${order.promotion_code})` : ''}: -${formatMoney(order.discount)}`);
  }
  lines.push(`Total: ${formatMoney(order.total)}`);
  if (isCashPayment(order.payment_method) && order.payment_details?.change_for) {
    lines.push(`Troco para: ${formatMoney(order.payment_details.change_for)}`);
  }
  if (order.notes) lines.push(`Observações: ${order.notes}`);
  if (store.name) lines.push('', store.name);

  return lines.join('\n');
}

function orderOriginLabel(order) {
  return ({
    delivery: 'Delivery',
    pickup: 'Retirada',
    counter: 'Balcão',
    table: 'Mesa',
    tab: 'Comanda'
  })[order.fulfillment_method] || order.fulfillment_method || 'Pedido';
}

function modifierWhatsappLine(modifier) {
  const delta = moneyNumber(modifier.price_delta);
  const group = modifier.group_name ? `${modifier.group_name}: ` : '';
  return `${group}${modifier.name}${delta > 0 ? ` (+ ${formatMoney(delta)})` : ''}`;
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const iterations = 310000;
  const digest = pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
  return `pbkdf2_sha256$${iterations}$${salt}$${digest}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const [algorithm, iterations, salt, digest] = String(stored).split('$');
  if (algorithm !== 'pbkdf2_sha256' || !iterations || !salt || !digest) return false;
  const actual = pbkdf2Sync(password, salt, Number(iterations), 32, 'sha256');
  const expected = Buffer.from(digest, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function validatePassword(value) {
  const password = String(value || '');
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw httpError(422, `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`);
  }
  return password;
}

function parseCookies(req) {
  const cookies = {};
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

function sessionCookie(name, value) {
  const secure = COOKIE_SECURE ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${secure}`;
}

function clearCookie(name) {
  const secure = COOKIE_SECURE ? '; Secure' : '';
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function publicAdmin(admin) {
  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: normalizeAdminRole(admin.role),
    role_label: adminRoleLabel(admin.role),
    permissions: adminPermissions(admin),
    company_id: admin.company_id || null,
    store_id: admin.store_id || admin.active_store?.id || null,
    active_store: admin.active_store || null,
    stores: Array.isArray(admin.stores) ? admin.stores : [],
    plan_access: admin.plan_access || {},
    is_active: admin.is_active !== false,
    last_login_at: admin.last_login_at || null,
    created_at: admin.created_at || null,
    support_mode: publicSupportMode(admin.support_mode)
  };
}

function publicSupportMode(supportMode) {
  if (!supportMode?.active) return null;
  return {
    active: true,
    started_at: supportMode.started_at || null,
    expires_at: supportMode.expires_at || null,
    original_admin_id: supportMode.original_admin_id || null,
    original_admin_email: supportMode.original_admin_email || null,
    target_company_id: supportMode.target_company_id || null,
    target_company_name: supportMode.target_company_name || null,
    target_store_id: supportMode.target_store_id || null,
    target_store_name: supportMode.target_store_name || null,
    target_store_slug: supportMode.target_store_slug || null
  };
}

function isSupportModeAdmin(admin) {
  return Boolean(admin?.support_mode?.active);
}

function isSupportModeExpired(admin) {
  if (!isSupportModeAdmin(admin)) return false;
  const expiresAt = new Date(admin.support_mode.expires_at || 0).getTime();
  return !expiresAt || expiresAt <= Date.now();
}

function supportModeRestrictedPermission(permission) {
  return ['account', 'admin_users', 'plan', 'platform'].includes(permission);
}

function publicStoreRef(store) {
  if (!store) return null;
  return {
    id: store.id,
    company_id: store.company_id || null,
    name: store.name,
    slug: store.slug,
    public_url: store.public_url || `/${store.slug}`,
    is_active: store.is_active !== false
  };
}

function adminRoleLabel(role) {
  return ({
    superadmin: 'Superadmin',
    admin: 'Administrador',
    owner: 'Administrador',
    manager: 'Administrador',
    waiter: 'Garcom',
    attendant: 'Atendimento',
    delivery: 'Entrega',
    kitchen: 'Cozinha'
  })[role] || 'Administrador';
}

function publicCustomer(customer) {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email || null
  };
}

function json(res, status, data, headers = {}) {
  res.writeHead(status, { ...securityHeaders(), 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(data));
}

function securityHeaders(options = {}) {
  const frameAncestors = options.allowSameOriginFrame ? "frame-ancestors 'self'" : "frame-ancestors 'none'";
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      frameAncestors,
      "object-src 'none'"
    ].join('; ')
  };
}

async function safeResponse(response) {
  const text = await response.text();
  if (!text) return [];
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function httpError(status, message, detail) {
  const error = new Error(message);
  error.status = status;
  error.detail = detail;
  return error;
}

function isUniqueViolation(error) {
  const detail = error?.detail || {};
  return error?.code === '23505'
    || detail?.code === '23505'
    || /unique|duplicate key/i.test(String(error?.message || ''))
    || /unique|duplicate key/i.test(String(detail?.message || detail?.detail || ''));
}

function localDbErrorMessage(data) {
  if (typeof data === 'string' && data.trim()) return data.trim().slice(0, 500);
  if (isPlainObject(data)) {
    return String(data.message || data.error || data.details || data.hint || 'Erro retornado pelo banco local.').slice(0, 500);
  }
  return 'Erro retornado pelo banco local.';
}

function logServerError(error, req) {
  const status = error.status || 500;
  if (status < 500 && !String(error.message || '').startsWith('Banco local:')) return;
  console.error(JSON.stringify({
    scope: 'server',
    method: req?.method,
    url: req?.url,
    status,
    message: error.message,
    detail: sanitizeErrorDetailForLog(error.detail)
  }));
}

function sanitizeErrorDetailForLog(detail) {
  if (!detail) return undefined;
  if (typeof detail === 'string') return detail.slice(0, 500);
  if (isPlainObject(detail)) {
    const { message, code, details, hint, error } = detail;
    return { message, code, details, hint, error };
  }
  return undefined;
}

function createPublicCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase() + Date.now().toString(36).slice(-4).toUpperCase();
}

function cleanText(value) {
  return String(value ?? '').trim().slice(0, 500);
}

function cleanUuid(value, field = 'id') {
  const text = cleanText(value).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(text)) {
    throw httpError(422, `${fieldLabel(field)} inválido.`);
  }
  return text;
}

function cleanOptionalUuid(value, field = 'id') {
  const text = cleanText(value).toLowerCase();
  return text ? cleanUuid(text, field) : '';
}

function cleanUuidArray(value, field = 'id') {
  if (!Array.isArray(value)) return [];
  const unique = new Set();
  for (const item of value) {
    if (item === null || item === undefined || item === '') continue;
    unique.add(cleanUuid(item, field));
  }
  return [...unique];
}

function uuidInFilter(ids) {
  const cleanIds = cleanUuidArray(ids);
  if (!cleanIds.length) throw httpError(422, 'Lista de identificadores inválida.');
  return `in.(${cleanIds.join(',')})`;
}

function cleanPublicCode(value) {
  return cleanText(value).toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40);
}

function cleanProvider(value) {
  const provider = cleanText(value).toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return ['abacatepay', 'mercadopago', 'asaas', 'efi', 'mock'].includes(provider) ? provider : 'mock';
}

function cleanExternalId(value) {
  return cleanText(value).replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 180);
}

function cleanSlug(value) {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b([a-z0-9])[\s._-]+(?=[a-z0-9]\b)/g, '$1')
    .replace(/\b([a-z0-9])[\s._-]+(?=[a-z0-9]\b)/g, '$1')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function normalizeDomain(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .replace(/^www\./, '');
}

function normalizeServiceUrl(value) {
  const text = String(value || '').trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
  if (!text) return '';
  try {
    const parsed = new URL(text);
    const isLocal = ['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !(isLocal && parsed.protocol === 'http:')) return '';
    return parsed.origin;
  } catch {
    return '';
  }
}

function isValidDomain(value) {
  const domain = normalizeDomain(value);
  return /^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(domain) && !domain.includes('..');
}

function normalizeName(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function addressKey(address) {
  return [
    address.street,
    address.number,
    address.complement,
    address.neighborhood,
    address.city
  ].map((value) => cleanText(value).toLowerCase()).join('|');
}

function cleanEmail(value) {
  const email = cleanText(value).toLowerCase();
  if (!email || !email.includes('@')) throw httpError(422, 'Informe um e-mail válido.');
  return email;
}

function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function isBrazilLocalPhone(value) {
  const digits = onlyDigits(value);
  return digits.length === 10 || digits.length === 11;
}

function normalizeBrazilLocalPhone(value) {
  const digits = onlyDigits(value);
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return digits.slice(2);
  return digits;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'sim', 'on'].includes(String(value).trim().toLowerCase());
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function clampInteger(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function moneyNumber(value) {
  return roundMoney(Number(value || 0));
}

function moneyToCents(value) {
  return Math.round(moneyNumber(value) * 100);
}

function parseMoneyInput(value) {
  const normalized = String(value ?? '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  if (!normalized) return null;
  const number = Number.parseFloat(normalized);
  return Number.isFinite(number) ? roundMoney(number) : null;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function formatMoney(value) {
  return moneyNumber(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function cleanFileName(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 90) || 'imagem.jpg';
}

function detectImageContentType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
    && buffer[4] === 0x0d
    && buffer[5] === 0x0a
    && buffer[6] === 0x1a
    && buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12
    && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function loadEnv(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    const value = rest.join('=').trim().replace(/^["']|["']$/g, '');
    if (!process.env[key.trim()]) process.env[key.trim()] = value;
  }
}




