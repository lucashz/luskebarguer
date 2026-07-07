import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { localPostgrestRequest } from './src/lib/local-postgrest-adapter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');

loadEnv(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const DATABASE_URL = process.env.DATABASE_URL || '';
const UPLOAD_DIR = path.resolve(__dirname, process.env.UPLOAD_DIR || 'uploads');
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
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || HOST}`);

    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }

    await serveStatic(res, url.pathname);
  } catch (error) {
    logServerError(error, req);
    json(res, error.status || 500, {
      error: error.message || 'Erro interno do servidor.',
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
      error: 'Banco local nao configurado.',
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
    json(res, 201, result.body, { 'Set-Cookie': sessionCookie(ADMIN_COOKIE, result.sessionId) });
    return;
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

  if (method === 'POST' && url.pathname === '/api/orders') {
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
    json(res, 200, await receiveBillingWebhook(payload, {
      provider: url.searchParams.get('provider') || PLATFORM_BILLING_PROVIDER,
      webhookSecret: req.headers['x-webhook-secret'] || req.headers['x-abacatepay-secret'] || url.searchParams.get('webhookSecret') || ''
    }));
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

  if (method === 'GET' && url.pathname === '/api/platform/plans') {
    const admin = await requirePlatformAdmin(req, res);
    if (!admin) return;
    json(res, 200, await listPlatformPlans());
    return;
  }

  if (method === 'GET' && url.pathname === '/api/platform/companies') {
    const admin = await requirePlatformAdmin(req, res);
    if (!admin) return;
    json(res, 200, await listPlatformCompanies());
    return;
  }

  if (method === 'POST' && url.pathname === '/api/platform/companies') {
    const admin = await requirePlatformAdmin(req, res);
    if (!admin) return;
    json(res, 201, { company: await createPlatformCompany(await readJson(req), admin) });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/platform/stores') {
    const admin = await requirePlatformAdmin(req, res);
    if (!admin) return;
    json(res, 201, { store: await createPlatformStore(await readJson(req), admin) });
    return;
  }

  const platformCompanyMatch = url.pathname.match(/^\/api\/platform\/companies\/([a-f0-9-]+)$/i);
  if (platformCompanyMatch && (method === 'PUT' || method === 'PATCH')) {
    const admin = await requirePlatformAdmin(req, res);
    if (!admin) return;
    json(res, 200, { company: await updatePlatformCompany(platformCompanyMatch[1], await readJson(req), admin) });
    return;
  }

  const platformCompanyStatusMatch = url.pathname.match(/^\/api\/platform\/companies\/([a-f0-9-]+)\/status$/i);
  if (platformCompanyStatusMatch && method === 'POST') {
    const admin = await requirePlatformAdmin(req, res);
    if (!admin) return;
    json(res, 200, { company: await setPlatformCompanyStatus(platformCompanyStatusMatch[1], await readJson(req), admin) });
    return;
  }

  const platformCompanyPlanMatch = url.pathname.match(/^\/api\/platform\/companies\/([a-f0-9-]+)\/plan$/i);
  if (platformCompanyPlanMatch && method === 'POST') {
    const admin = await requirePlatformAdmin(req, res);
    if (!admin) return;
    json(res, 200, { subscription: await changePlatformCompanyPlan(platformCompanyPlanMatch[1], await readJson(req), admin) });
    return;
  }

  const platformCompanyOverrideMatch = url.pathname.match(/^\/api\/platform\/companies\/([a-f0-9-]+)\/overrides$/i);
  if (platformCompanyOverrideMatch && method === 'POST') {
    const admin = await requirePlatformAdmin(req, res);
    if (!admin) return;
    json(res, 201, { override: await createCompanyFeatureOverride(platformCompanyOverrideMatch[1], await readJson(req), admin) });
    return;
  }

  const platformOverrideMatch = url.pathname.match(/^\/api\/platform\/overrides\/([a-f0-9-]+)$/i);
  if (platformOverrideMatch && method === 'DELETE') {
    const admin = await requirePlatformAdmin(req, res);
    if (!admin) return;
    await deleteCompanyFeatureOverride(platformOverrideMatch[1], admin);
    json(res, 200, { ok: true });
    return;
  }

  const platformStoreMatch = url.pathname.match(/^\/api\/platform\/stores\/([a-f0-9-]+)$/i);
  if (platformStoreMatch && (method === 'PUT' || method === 'PATCH')) {
    const admin = await requirePlatformAdmin(req, res);
    if (!admin) return;
    json(res, 200, { store: await updatePlatformStore(platformStoreMatch[1], await readJson(req), admin) });
    return;
  }

  const platformStoreStatusMatch = url.pathname.match(/^\/api\/platform\/stores\/([a-f0-9-]+)\/status$/i);
  if (platformStoreStatusMatch && method === 'POST') {
    const admin = await requirePlatformAdmin(req, res);
    if (!admin) return;
    json(res, 200, { store: await setPlatformStoreStatus(platformStoreStatusMatch[1], await readJson(req), admin) });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/platform/audit') {
    const admin = await requirePlatformAdmin(req, res);
    if (!admin) return;
    json(res, 200, await listAuditLogs(url.searchParams));
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
      permissions
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
    await assertCompanyUsageLimit(admin, 'thermal_printing', 'print_jobs');
    const log = await createPrintLog({ ...body, store_id: admin.store_id }, op);
    await recordCompanyUsage({ ...admin, entity_type: 'order', entity_id: body.order_id || null }, 'thermal_printing', 'print_jobs');
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
  if (!admin || admin.is_active === false || !verifyPassword(password, admin.password_hash)) {
    throw httpError(401, 'E-mail ou senha inválidos.');
  }

  await dbRequest('PATCH', 'admin_users', { id: `eq.${admin.id}` }, {
    last_login_at: new Date().toISOString()
  }, ['Prefer: return=representation']);

  return createAdminSession(admin);
}

async function requestAdminPasswordRecovery(req, data = {}) {
  const email = cleanEmail(data.email || '');
  if (!email) throw httpError(422, 'Informe um e-mail válido.');
  const [admin] = await dbRequest('GET', 'admin_users', {
    select: 'id,company_id,email,is_active',
    email: `eq.${email}`,
    limit: '1'
  });
  if (admin?.id && admin.is_active !== false) {
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
  const cacheKey = isPlatformAdmin(session) ? 'platform' : cleanUuid(session?.company_id) || 'default';
  if (adminUsersCache?.[cacheKey]?.expiresAt > now) return adminUsersCache[cacheKey].data;
  const rows = await dbRequest('GET', 'admin_users', {
    select: 'id,name,email,role,is_active,last_login_at,created_at',
    ...(!isPlatformAdmin(session) && session?.company_id ? { company_id: `eq.${session.company_id}` } : {}),
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
  if (role === 'superadmin' && !isPlatformAdmin(session)) {
    throw httpError(403, 'Apenas a plataforma pode criar contas superadmin.');
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
      console.warn('Falha ao vincular usuario admin a loja:', error.message || error);
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
  if (!session?.company_id || !session?.store_id) throw httpError(422, 'Loja ativa nao encontrada.');
  const existing = await dbRequest('GET', 'admin_users', {
    select: 'id',
    email: `eq.${email}`,
    limit: '1'
  });
  if (existing[0]) throw httpError(409, 'Este e-mail ja possui conta administrativa.');
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
  if (confirmPassword && confirmPassword !== password) throw httpError(422, 'A confirmacao de senha nao confere.');
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
  if (!/^[a-f0-9]{32,128}$/i.test(value)) throw httpError(404, 'Convite invalido.');
  const tokenHash = hashInviteToken(value);
  const [invitation] = await dbRequest('GET', 'admin_invitations', {
    select: '*',
    token_hash: `eq.${tokenHash}`,
    status: 'eq.pending',
    limit: '1'
  });
  if (!invitation) throw httpError(404, 'Convite invalido ou ja utilizado.');
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

async function updateAdminUser(id, data, session) {
  const target = await getAdminById(id);
  if (!isPlatformAdmin(session) && target.company_id !== session.company_id) {
    throw httpError(403, 'Voce nao pode editar uma conta de outra empresa.');
  }
  const payload = {};
  if ('name' in data) payload.name = cleanText(data.name);
  if ('email' in data) payload.email = cleanEmail(data.email);
  if ('role' in data) {
    payload.role = sanitizeAdminRole(data.role);
    if (payload.role === 'superadmin' && !isPlatformAdmin(session)) {
      throw httpError(403, 'Apenas a plataforma pode atribuir superadmin.');
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
  if (!isPlatformAdmin(session) && target.company_id !== session.company_id) {
    throw httpError(403, 'Voce nao pode excluir uma conta de outra empresa.');
  }
  if (target.id === session.id) {
    throw httpError(422, 'Voce nao pode excluir sua propria conta.');
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
    throw httpError(401, 'Senha atual invalida.');
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
    throw httpError(401, 'Senha atual invalida.');
  }
  const companyId = session.company_id ? cleanUuid(session.company_id, 'empresa') : null;
  if (!companyId) throw httpError(422, 'Empresa ativa nao encontrada.');
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
      if (role === 'superadmin') return normalizeAdminRole(entry.role) !== 'superadmin';
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

async function listPlatformCompanies() {
  const [companies, stores, subscriptions, features, overrides] = await Promise.all([
    dbRequest('GET', 'companies', {
      select: '*',
      order: 'created_at.desc',
      limit: '200'
    }),
    dbRequest('GET', 'stores', {
      select: '*',
      order: 'name.asc',
      limit: '500'
    }),
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
    })
  ]);
  const featureById = new Map(features.map((feature) => [feature.id, feature]));
  const storesByCompany = new Map();
  for (const store of stores) {
    if (!storesByCompany.has(store.company_id)) storesByCompany.set(store.company_id, []);
    storesByCompany.get(store.company_id).push(publicStoreRef(store));
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
  return {
    features,
    companies: companies.map((company) => ({
      ...company,
      stores: storesByCompany.get(company.id) || [],
      subscription: subscriptionByCompany.get(company.id) || null,
      overrides: overridesByCompany.get(company.id) || []
    }))
  };
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
    description: cleanText(data.description || 'Pedido rápido pelo cardápio digital.'),
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
      is_active: true
    }, ['Prefer: return=representation']);
    created.admin = admin;

    const [store] = await dbRequest('POST', 'stores', {}, {
      company_id: company.id,
      name: parsed.store.name,
      slug: parsed.store.slug,
      description: parsed.store.description,
      public_url: `/${parsed.store.slug}`,
      is_active: true
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
    const session = await createAdminSession(admin);
    return {
      sessionId: session.sessionId,
      body: {
        ...session.body,
        company: { id: company.id, name: company.name, status: company.status },
        store: publicStoreRef(store),
        redirect: '/onboarding'
      }
    };
  } catch (error) {
    await rollbackPortalSignup(created).catch(() => {});
    throw error;
  }
}

function sanitizePortalSignup(data = {}) {
  const owner = data.owner || {};
  const business = data.business || {};
  const planCode = cleanSlug(data.plan_code || data.planCode || 'essential') || 'essential';
  const ownerName = cleanText(owner.name || data.name || '');
  const ownerEmail = cleanEmail(owner.email || data.email || '');
  const ownerPhone = onlyDigits(owner.phone || data.phone || '');
  const password = validatePassword(owner.password || data.password);
  const confirmPassword = String(owner.confirm_password || owner.confirmPassword || data.confirm_password || data.confirmPassword || '');
  if (confirmPassword && confirmPassword !== password) throw httpError(422, 'A confirmação de senha não confere.');
  if (!ownerName) throw httpError(422, 'Informe seu nome completo.');
  if (!ownerEmail) throw httpError(422, 'Informe um e-mail válido.');
  if (ownerPhone.length < 10) throw httpError(422, 'Informe um WhatsApp válido.');
  if (data.accept_terms !== true && data.acceptTerms !== true) throw httpError(422, 'Aceite o EULA, os Termos de Uso e a Politica de Privacidade para continuar.');

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
      description: cleanText(business.description || `Cardápio digital de ${displayName}.`)
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
    whatsapp_number: parsed.business.phone || parsed.owner.phone,
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

  return {
    progress: {
      ...progress,
      completed_steps: completedSteps,
      is_completed: store.onboarding_completed === true || progress.is_completed === true
    },
    store: publicStore(store),
    steps: computed.steps.map((step) => ({
      ...step,
      completed: completedSteps.includes(step.key)
    })),
    percent,
    can_publish: computed.canPublish,
    blockers: computed.blockers,
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
    is_completed: true,
    current_step: 'published',
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
    completed_steps: ['account', 'business', 'slug'],
    is_completed: false,
    metadata: {}
  }, ['Prefer: return=representation']);
  return created;
}

function computeOnboardingSteps({ store, categories, items }) {
  const steps = [
    {
      key: 'account',
      title: 'Conta criada',
      description: 'Responsável e acesso administrativo configurados.',
      auto_completed: true
    },
    {
      key: 'visual',
      title: 'Logo e visual',
      description: 'Adicione logo ou escolha cores para deixar o cardápio com a cara da loja.',
      auto_completed: Boolean(store.logo_url || Object.keys(store.theme_settings || {}).length)
    },
    {
      key: 'hours',
      title: 'Horário de atendimento',
      description: 'Configure quando a loja pode receber pedidos.',
      auto_completed: Boolean(store.business_hours && Object.keys(store.business_hours).length)
    },
    {
      key: 'fulfillment',
      title: 'Entrega e retirada',
      description: 'Defina entrega, retirada, taxa e pedido mínimo.',
      auto_completed: store.accepts_delivery !== false || store.accepts_pickup !== false
    },
    {
      key: 'payments',
      title: 'Formas de pagamento',
      description: 'Adicione Pix, cartão, dinheiro ou pagamento online.',
      auto_completed: Array.isArray(store.payment_methods) && store.payment_methods.length > 0
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
      key: 'publish',
      title: 'Publicar cardápio',
      description: 'Libere a loja para receber pedidos.',
      auto_completed: store.onboarding_completed === true
    }
  ];
  const blockers = steps
    .filter((step) => !['visual', 'publish'].includes(step.key) && !step.auto_completed)
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
    current_step: 'logo',
    completed_steps: ['account', 'business', 'slug'],
    is_completed: false,
    metadata: {
      business_type: parsed.businessType,
      selected_plan: parsed.planCode,
      marketing_opt_in: parsed.marketingOptIn
    }
  }, ['Prefer: return=minimal']).catch(() => null);
}

async function createStarterMenu(storeId, businessType) {
  const names = starterCategoriesForBusiness(businessType);
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
  if (!company) throw httpError(404, 'Empresa nao encontrada.');
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

async function setPlatformCompanyStatus(id, data, admin) {
  return updatePlatformCompany(id, { status: data.status }, admin);
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
  if (!plan) throw httpError(404, 'Plano nao encontrado.');
  const startsAt = new Date().toISOString();
  const endsAt = data.current_period_ends_at || new Date(Date.now() + 30 * 86400000).toISOString();
  const payload = {
    company_id: companyId,
    plan_id: plan.id,
    status: sanitizeSubscriptionStatus(data.status || company.status || 'active'),
    current_period_starts_at: startsAt,
    current_period_ends_at: endsAt,
    next_renewal_at: endsAt,
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
  if (!payload.slug && 'slug' in payload) throw httpError(422, 'Informe um endereco publico valido.');
  if (payload.slug) payload.public_url = `/${payload.slug}`;
  const [store] = await dbRequest('PATCH', 'stores', { id: `eq.${storeId}` }, payload, ['Prefer: return=representation']);
  if (!store) throw httpError(404, 'Loja nao encontrada.');
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
  if (!['allow', 'block', 'limit'].includes(overrideType)) throw httpError(422, 'Informe o tipo de excecao.');
  const company = await getCompanyById(resolvedCompanyId);
  const [feature] = await dbRequest('GET', 'platform_features', {
    select: '*',
    code: `eq.${featureCode}`,
    limit: '1'
  });
  if (!feature) throw httpError(404, 'Recurso nao encontrado.');
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
  const overrideId = cleanUuid(id, 'excecao');
  const [before] = await dbRequest('GET', 'company_feature_overrides', {
    select: '*',
    id: `eq.${overrideId}`,
    limit: '1'
  });
  if (!before) throw httpError(404, 'Excecao nao encontrada.');
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
    limit: '5'
  }).catch(() => []);
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
  if (!PLATFORM_BILLING_API_KEY && PLATFORM_BILLING_PROVIDER !== 'mock') {
    throw httpError(422, 'Configure PLATFORM_BILLING_API_KEY no .env para cobrar assinaturas.');
  }
  const [company] = await dbRequest('GET', 'companies', {
    select: '*',
    id: `eq.${companyId}`,
    limit: '1'
  });
  if (!company) throw httpError(404, 'Empresa não encontrada.');
  const amount = moneyCents(plan.monthly_price || 0);
  if (amount <= 0) throw httpError(422, 'Este plano não possui mensalidade configurada.');
  const checkout = await createProviderSubscriptionCheckout({ company, plan, admin, amount });
  const [subscription] = await dbRequest('POST', 'company_subscriptions', {}, {
    company_id: companyId,
    plan_id: plan.id,
    status: 'payment_pending',
    billing_provider: PLATFORM_BILLING_PROVIDER,
    external_subscription_id: checkout.subscriptionId || checkout.transactionId || null,
    payment_due_at: new Date(Date.now() + 3 * 86400000).toISOString(),
    metadata: {
      source: 'admin_billing_checkout',
      checkout_url: checkout.checkoutUrl || null
    }
  }, ['Prefer: return=representation']);
  await dbRequest('POST', 'subscription_events', {}, {
    company_id: companyId,
    subscription_id: subscription.id,
    event_type: 'checkout_created',
    provider: PLATFORM_BILLING_PROVIDER,
    provider_event_id: checkout.subscriptionId || checkout.transactionId || `checkout_${Date.now()}`,
    payload: { plan_code: plan.code, checkout_url: checkout.checkoutUrl || null },
    created_by: admin.id
  }, ['Prefer: return=minimal']).catch(() => {});
  await audit('billing.checkout.create', {
    req,
    actor_admin_id: admin.id,
    company_id: companyId,
    store_id: admin.store_id,
    entity_type: 'company_subscription',
    entity_id: subscription.id,
    after_data: { plan_code: plan.code, provider: PLATFORM_BILLING_PROVIDER }
  });
  return {
    subscription,
    plan,
    checkout_url: checkout.checkoutUrl || null,
    provider: PLATFORM_BILLING_PROVIDER
  };
}

async function createProviderSubscriptionCheckout({ company, plan, admin, amount }) {
  if (PLATFORM_BILLING_PROVIDER === 'mock') {
    return {
      subscriptionId: `mock_sub_${company.id}_${Date.now()}`,
      checkoutUrl: `/admin?billing=mock&plan=${encodeURIComponent(plan.code)}`
    };
  }
  if (PLATFORM_BILLING_PROVIDER !== 'abacatepay') throw httpError(422, 'Provedor de assinatura não suportado.');
  const origin = process.env.PUBLIC_APP_URL || process.env.APP_URL || 'http://127.0.0.1:3000';
  const data = await providerFetch('https://api.abacatepay.com/v1/billing/create', {
    method: 'POST',
    token: PLATFORM_BILLING_API_KEY,
    body: {
      frequency: 'MONTHLY',
      methods: ['PIX'],
      products: [{
        externalId: plan.code,
        name: `Assinatura ${plan.name}`,
        description: plan.description || 'Assinatura mensal da plataforma',
        quantity: 1,
        price: amount
      }],
      returnUrl: `${origin}/admin`,
      completionUrl: `${origin}/admin`,
      customer: {
        name: admin.name || company.name,
        email: admin.email || company.billing_email || `empresa-${company.id}@local.test`,
        cellphone: company.phone || ''
      },
      metadata: { companyId: company.id, planCode: plan.code, kind: 'platform_subscription' }
    }
  });
  const payload = data.data || data;
  return {
    subscriptionId: String(payload.id || payload.billingId || ''),
    checkoutUrl: payload.url || payload.checkoutUrl || ''
  };
}

async function receiveBillingWebhook(data, options = {}) {
  const provider = cleanSlug(options.provider || inferPaymentProvider(data) || PLATFORM_BILLING_PROVIDER);
  if (PLATFORM_BILLING_WEBHOOK_SECRET && options.webhookSecret !== PLATFORM_BILLING_WEBHOOK_SECRET) {
    throw httpError(401, 'Webhook de assinatura inválido.');
  }
  const payload = data.data || data.billing || data.subscription || data;
  const eventId = cleanExternalId(data.id || data.eventId || payload.id || `billing_${Date.now()}`);
  const externalId = cleanText(payload.id || payload.billingId || payload.subscriptionId || data.billingId || '');
  const metadata = payload.metadata || data.metadata || {};
  const companyId = cleanUuid(metadata.companyId || metadata.company_id || data.companyId || '');
  const planCode = cleanSlug(metadata.planCode || metadata.plan_code || payload.externalId || '');
  const status = billingProviderStatus(payload.status || data.status || data.event);

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
  const [existingEvent] = await dbRequest('GET', 'subscription_events', {
    select: 'id',
    provider: `eq.${provider}`,
    provider_event_id: `eq.${eventId}`,
    limit: '1'
  }).catch(() => []);
  if (existingEvent) return { ok: true, duplicate: true };

  let planId = subscription.plan_id;
  if (planCode) {
    const [plan] = await dbRequest('GET', 'subscription_plans', { select: 'id', code: `eq.${planCode}`, limit: '1' });
    if (plan?.id) planId = plan.id;
  }
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 86400000).toISOString();
  const [updated] = await dbRequest('PATCH', 'company_subscriptions', { id: `eq.${subscription.id}` }, {
    status,
    plan_id: planId,
    external_subscription_id: externalId || subscription.external_subscription_id || null,
    last_payment_at: status === 'active' ? now.toISOString() : subscription.last_payment_at,
    payment_due_at: status === 'payment_pending' || status === 'past_due' ? subscription.payment_due_at || periodEnd : null,
    current_period_starts_at: status === 'active' ? now.toISOString() : subscription.current_period_starts_at,
    current_period_ends_at: status === 'active' ? periodEnd : subscription.current_period_ends_at,
    next_renewal_at: status === 'active' ? periodEnd : subscription.next_renewal_at,
    metadata: { ...(subscription.metadata || {}), last_webhook: { eventId, status, received_at: now.toISOString() } }
  }, ['Prefer: return=representation']);
  if (status === 'active') {
    await dbRequest('PATCH', 'company_subscriptions', {
      company_id: `eq.${subscription.company_id}`,
      id: `neq.${subscription.id}`,
      status: 'in.(trial,active,payment_pending,grace_period,past_due,suspended)'
    }, { status: 'cancelled' }, ['Prefer: return=minimal']).catch(() => {});
  }
  const companyStatus = status === 'active' ? 'active' : status === 'cancelled' ? 'cancelled' : status === 'suspended' ? 'suspended' : status === 'past_due' ? 'past_due' : 'payment_pending';
  await dbRequest('PATCH', 'companies', { id: `eq.${subscription.company_id}` }, { status: companyStatus }, ['Prefer: return=minimal']);
  await dbRequest('POST', 'subscription_events', {}, {
    company_id: subscription.company_id,
    subscription_id: subscription.id,
    event_type: `billing.${status}`,
    provider,
    provider_event_id: eventId,
    payload: data
  }, ['Prefer: return=minimal']);
  return { ok: true, subscription: updated };
}

function billingProviderStatus(value) {
  const status = cleanSlug(value || '');
  if (['paid', 'active', 'completed', 'approved'].includes(status)) return 'active';
  if (['past_due', 'overdue', 'expired'].includes(status)) return 'past_due';
  if (['cancelled', 'canceled'].includes(status)) return 'cancelled';
  if (['suspended', 'blocked'].includes(status)) return 'suspended';
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
  if (!company || ['suspended', 'cancelled', 'archived'].includes(company.status)) {
    return { canOperate: false, status: company?.status || 'missing', message: 'Empresa sem permissao comercial para operar.' };
  }
  if (['suspended', 'cancelled', 'expired'].includes(status)) {
    return { canOperate: false, status, message: 'Plano indisponivel para operacao. Regularize ou reative a empresa.' };
  }
  if (status === 'trial' && subscription?.trial_ends_at && new Date(subscription.trial_ends_at).getTime() < Date.now()) {
    return { canOperate: false, status: 'trial_expired', message: 'Periodo de teste encerrado. Ative um plano para continuar operando.' };
  }
  if (['payment_pending', 'past_due'].includes(status)) {
    return { canOperate: false, status, message: 'Pagamento pendente. A operacao esta temporariamente bloqueada.' };
  }
  if (status === 'grace_period') {
    const due = subscription?.payment_due_at || subscription?.current_period_ends_at;
    if (due && new Date(due).getTime() < Date.now()) {
      return { canOperate: false, status: 'grace_period_expired', message: 'Prazo de regularizacao encerrado.' };
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
  const resolvedStoreId = cleanUuid(storeId);
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
    const storeScopedTables = ['orders', 'menu_items', 'customers', 'dining_tables', 'customer_tabs', 'order_print_logs', 'order_whatsapp_logs', 'order_payment_events'];
    if (!scopedFilter && storeScopedTables.includes(table)) return 0;
    const rows = await dbRequest('GET', table, {
      select: 'id',
      ...(scopedFilter && storeScopedTables.includes(table) ? { store_id: scopedFilter } : {}),
      ...extra,
      limit: '1000'
    }).catch(() => []);
    return rows.length;
  };
  const [users, products, orders, ordersMonth, customers, tables, tabs, whatsappMessages] = await Promise.all([
    resolvedCompanyId ? dbRequest('GET', 'admin_user_store_access', {
      select: 'admin_user_id',
      company_id: `eq.${resolvedCompanyId}`,
      is_active: 'eq.true',
      limit: '1000'
    }).then((rows) => new Set(rows.map((row) => row.admin_user_id)).size).catch(() => 0) : 0,
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
  const companyId = cleanUuid(params.get?.('company_id') || '');
  const storeId = cleanUuid(params.get?.('store_id') || '');
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
  if (!isValidDomain(domain)) throw httpError(422, 'Informe um dominio valido.');
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
  const domainId = cleanUuid(id, 'dominio');
  const [domain] = await dbRequest('GET', 'store_domains', {
    select: '*',
    id: `eq.${domainId}`,
    store_id: `eq.${admin.store_id}`,
    limit: '1'
  });
  if (!domain) throw httpError(404, 'Dominio nao encontrado nesta loja.');
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
  const domainId = cleanUuid(id, 'dominio');
  const [domain] = await dbRequest('GET', 'store_domains', {
    select: '*',
    id: `eq.${domainId}`,
    store_id: `eq.${admin.store_id}`,
    limit: '1'
  });
  if (!domain) throw httpError(404, 'Dominio nao encontrado nesta loja.');
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
  if (!company) throw httpError(404, 'Empresa nao encontrada.');
  return company;
}

async function getStoreById(id) {
  const storeId = cleanUuid(id, 'loja');
  const [store] = await dbRequest('GET', 'stores', {
    select: '*',
    id: `eq.${storeId}`,
    limit: '1'
  });
  if (!store) throw httpError(404, 'Loja nao encontrada.');
  return store;
}

function sanitizeCompanyStatus(status) {
  const value = cleanSlug(status || '');
  if (['onboarding', 'active', 'trial', 'payment_pending', 'grace_period', 'past_due', 'suspended', 'cancelled', 'archived'].includes(value)) return value;
  throw httpError(422, 'Status da empresa invalido.');
}

function sanitizeSubscriptionStatus(status) {
  const value = cleanSlug(status || '');
  if (['trial', 'active', 'payment_pending', 'grace_period', 'cancelled', 'expired', 'suspended'].includes(value)) return value;
  return 'active';
}

async function createDefaultSubscription(companyId, planCode) {
  const plan = (await dbRequest('GET', 'subscription_plans', {
    select: 'id',
    code: `eq.${cleanSlug(planCode || 'essential')}`,
    limit: '1'
  }))[0] || (await dbRequest('GET', 'subscription_plans', {
    select: 'id',
    code: 'eq.essential',
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
    json(res, 401, { error: 'Faca login para acessar o admin.' });
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
  return {
    ...admin,
    session_version: 2,
    company_id: activeStore?.company_id || admin.company_id || selectedAccess?.company_id || null,
    store_id: activeStore?.id || null,
    active_store: activeStore ? publicStoreRef(activeStore) : null,
    stores: access.map((entry) => publicStoreRef(entry.store)).filter(Boolean)
  };
}

async function requireAdminPermission(req, res, permission) {
  const admin = await requireAdmin(req, res);
  if (!admin) return null;
  if (!adminCan(admin, permission)) {
    json(res, 403, { error: 'Sua conta não tem permissão para acessar esta área.' });
    return null;
  }
  if (!['account', 'plan', 'platform'].includes(permission)) {
    if (!admin.store_id) {
      json(res, 403, { error: 'Sua conta nao possui uma loja ativa vinculada.' });
      return null;
    }
    const access = await getAdminStoreAccess(admin);
    const activeAccess = access.find((entry) => entry.store_id === admin.store_id);
    if (!activeAccess) {
      json(res, 403, { error: 'Sua sessao nao possui acesso ativo a esta loja. Entre novamente.' });
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
  if (featureCode && !(await companyCanUseFeature(admin.company_id, featureCode))) {
    json(res, 402, { error: featureBlockedMessage(featureCode) });
    return null;
  }
  return admin;
}

async function requirePlatformAdmin(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return null;
  if (!isPlatformAdmin(admin)) {
    json(res, 403, { error: 'Sua conta nao tem acesso ao painel da plataforma.' });
    return null;
  }
  return admin;
}

function adminPermissions(admin) {
  const role = normalizeAdminRole(admin?.role);
  if (role === 'superadmin') {
    return ['platform', 'operation', 'orders', 'menu', 'reports', 'tables', 'promotions', 'customers', 'store', 'integrations', 'plan', 'account', 'admin_users'];
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

function featureBlockedMessage(featureCode) {
  return ({
    tables: 'Mesas e comandas não estão disponíveis no plano atual.',
    promotions: 'Promoções e cupons não estão disponíveis no plano atual.',
    customers: 'Clientes não estão disponíveis no plano atual.',
    basic_reports: 'Relatórios não estão disponíveis no plano atual.',
    digital_menu: 'Cardápio não está disponível no plano atual.',
    orders: 'Pedidos não estão disponíveis no plano atual.',
    store_settings: 'Configurações da loja não estão disponíveis no plano atual.'
  })[featureCode] || 'Recurso não disponível no plano atual.';
}

async function companyCanUseFeature(companyId, featureCode) {
  const access = await getCompanyFeatureAccess(companyId, featureCode);
  return access.enabled;
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
  const [subscription] = await dbRequest('GET', 'company_subscriptions', {
    select: 'id,status,plan_id',
    company_id: `eq.${resolvedCompanyId}`,
    order: 'created_at.desc',
    limit: '1'
  }).catch(() => []);
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

async function assertCompanyUsageLimit(admin, featureCode, usageKey, nextAmount = 1) {
  if (!admin?.company_id) return;
  const access = await getCompanyFeatureAccess(admin.company_id, featureCode);
  if (!access.enabled) throw httpError(402, featureBlockedMessage(featureCode));
  const limit = Number(access.limit_value);
  if (!Number.isFinite(limit) || limit <= 0) return;
  const used = await currentUsageForKey(admin, usageKey);
  if (used + nextAmount > limit) {
    throw httpError(402, `Limite do plano atingido para ${usageLabel(usageKey)}. Uso atual: ${used}/${limit}.`);
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
  return (await dbRequest('GET', table, {
    select: 'id',
    store_id: scopedFilter,
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
    admin_users: 'usuarios',
    menu_items: 'produtos',
    dining_tables: 'mesas',
    promotions: 'promocoes',
    customers: 'clientes'
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
  return normalizeAdminRole(admin?.role) === 'superadmin' || adminCan(admin, 'platform');
}

async function registerCustomer(data, storeId, options = {}) {
  const db = options.db || dbRequest;
  const resolvedStoreId = cleanUuid(storeId) || (await getDefaultStore())?.id || null;
  if (data.accept_terms !== true && data.acceptTerms !== true) {
    throw httpError(422, 'Aceite o EULA, os Termos de Uso e a Politica de Privacidade para continuar.');
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
    json(res, 401, { error: 'Faca login para acessar sua conta.' });
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
  if (!updated) throw httpError(404, 'Cliente nao encontrado nesta loja.');
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
  if (!updated) throw httpError(404, 'Cliente nao encontrado nesta loja.');
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
  if (!updated) throw httpError(404, 'Endereco nao encontrado nesta loja.');
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
  if (!customer) throw httpError(404, 'Cliente nao encontrado nesta loja.');
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
  if (!store) throw httpError(404, 'Loja nao encontrada.');
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
    description: 'Cardapio digital da LSK Burguer.',
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
      description: store.description || 'Cardapio digital de demonstracao.',
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
    page_title: 'Cardápio Digital',
    description: 'Pedido rápido pelo cardápio digital.',
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
  if (!nextSlug) throw httpError(422, 'Informe o caminho publico da loja.');
  if (reservedPublicSlugs().has(nextSlug)) {
    throw httpError(422, 'Este caminho publico e reservado. Escolha outro.');
  }
  const existingStore = await getStoreBySlug(nextSlug);
  if (existingStore && existingStore.id !== resolvedStoreId) {
    throw httpError(409, 'Este caminho publico ja esta sendo usado por outra loja.');
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
    description: current.description || 'Pedido rápido pelo cardápio digital.',
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
    description: current.description || 'Pedido rápido pelo cardápio digital.',
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
    description: current.description || 'Pedido rápido pelo cardápio digital.',
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
    description: current.description || 'Pedido rápido pelo cardápio digital.',
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
  await sendOrderStatusWhatsapp(order.id, 'new', { manual: false, db, tenant: options.tenant }).catch(() => null);
  if (['table', 'tab'].includes(fulfillmentMethod)) clearAdminTablesCache();
  if (customerRow?.id) clearAdminCustomersCache();

  const whatsappNumber = onlyDigits(store.whatsapp_number || STORE_WHATSAPP_NUMBER);
  const whatsappUrl = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`
    : null;

  return {
    order: { ...finalOrder, items: itemsWithOrder },
    payment,
    whatsapp_url: whatsappUrl,
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
  if (method === 'POST' && pathname === '/api/admin/login') return limitRule('admin-login', 8, 15 * 60 * 1000);
  if (method === 'POST' && pathname === '/api/customer/login') return limitRule('customer-login', 10, 15 * 60 * 1000);
  if (method === 'POST' && pathname === '/api/customer/reset-password') return limitRule('customer-reset', 5, 30 * 60 * 1000);
  if (method === 'POST' && pathname === '/api/portal/recover-password') return limitRule('admin-recover', 5, 30 * 60 * 1000);
  if (method === 'POST' && pathname === '/api/orders') return limitRule('order-create', 20, 10 * 60 * 1000);
  if (method === 'POST' && pathname === '/api/admin/setup') return limitRule('admin-setup', 3, 60 * 60 * 1000);
  if (method === 'POST' && pathname === '/api/portal/signup') return limitRule('portal-signup', 5, 60 * 60 * 1000);
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
  const data = await attachOrderIntegrationLogs(withItems, options);
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
  const pixCode = providerPayment.pixCode || buildMockPixCode(store, order, transactionId);
  const [updated] = await db('PATCH', 'orders', { id: `eq.${order.id}` }, {
    financial_status: 'pending',
    payment_provider: integrations.pix.provider,
    payment_transaction_id: transactionId,
    payment_expires_at: expiresAt,
    payment_details: {
      ...(order.payment_details || {}),
      pix_code: pixCode,
      pix_qr_url: providerPayment.pixQrUrl || `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(pixCode)}`,
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
    console.warn('Falha ao atualizar indice de pagamento:', error.message || error);
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
  const customer = abacatePayCustomer(order);
  const amount = moneyCents(order.total);

  if (type === 'pix') {
    const data = await providerFetch('https://api.abacatepay.com/v1/pixQrCode/create', {
      method: 'POST',
      token,
      body: {
        amount,
        expiresIn: integrations.pix.expirationMinutes * 60,
        description: `Pedido #${order.public_code} - ${store.name || 'Cardápio'}`,
        customer,
        metadata: { orderCode: order.public_code, storeId: order.store_id || null }
      }
    });
    const payload = data.data || data;
    return {
      transactionId: String(payload.id || ''),
      pixCode: payload.brCode || payload.pixCode || '',
      pixQrUrl: normalizeQrImage(payload.brCodeBase64 || payload.qrCodeBase64 || ''),
      checkoutUrl: payload.url || null
    };
  }

  const returnUrl = integrations.card.returnUrl || integrations.pix.returnUrl || '';
  const data = await providerFetch('https://api.abacatepay.com/v1/billing/create', {
    method: 'POST',
    token,
    body: {
      frequency: 'ONE_TIME',
      methods: ['CREDIT_CARD'],
      products: [{
        externalId: order.public_code,
        name: `Pedido #${order.public_code}`,
        description: `Pedido realizado em ${store.name || 'Cardápio'}`,
        quantity: 1,
        price: amount
      }],
      returnUrl,
      completionUrl: returnUrl,
      customer,
      metadata: { orderCode: order.public_code, storeId: order.store_id || null }
    }
  });
  const payload = data.data || data;
  return {
    transactionId: String(payload.id || ''),
    checkoutUrl: payload.url || payload.checkoutUrl || ''
  };
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
  if (!response.ok) throw httpError(response.status, 'Erro no provedor de pagamento.', data);
  return data;
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
  const order = await getOrderByPublicCode(code, options);
  if (!order) throw httpError(404, 'Pedido não encontrado.');
  if (order.financial_status === 'pending' && order.payment_expires_at && new Date(order.payment_expires_at).getTime() < Date.now()) {
    const [updated] = await db('PATCH', 'orders', { id: `eq.${order.id}`, financial_status: 'eq.pending' }, {
      financial_status: 'expired'
    }, ['Prefer: return=representation']);
    return { order: publicPaymentOrder(updated || order), payment: publicPaymentPayload(updated || order) };
  }
  return { order: publicPaymentOrder(order), payment: publicPaymentPayload(order) };
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
    paid_at: status === 'paid' ? new Date().toISOString() : order.paid_at
  };
  const [updated] = await db('PATCH', 'orders', { id: `eq.${order.id}` }, patch, ['Prefer: return=representation']);
  await updatePaymentTransactionIndexStatus(webhookContext.index, status, amount);
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
  if (event.includes('abacate') || event.startsWith('billing.') || event.startsWith('pixqrcode.') || data.pixQrCode || data.billing) return 'abacatepay';
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
    const endpoint = isOnlinePixPayment(order.payment_method) ? 'pixQrCode/check' : 'billing/check';
    const data = await providerFetch(`https://api.abacatepay.com/v1/${endpoint}?id=${encodeURIComponent(order.payment_transaction_id)}`, { token });
    const payload = data.data || data;
    return { status: abacatePayStatusToFinancial(payload.status), amount: centsToMoney(payload.amount || payload.value || order.total) };
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

function publicPaymentPayload(order) {
  const details = order.payment_details || {};
  return {
    status: order.financial_status || 'pending',
    provider: order.payment_provider || null,
    transaction_id: order.payment_transaction_id || null,
    expires_at: order.payment_expires_at || null,
    pix_code: details.pix_code || '',
    pix_qr_url: details.pix_qr_url || '',
    checkout_url: details.checkout_url || ''
  };
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
  if (!resolvedStoreId) throw httpError(422, 'Loja ativa nao encontrada.');
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
        throw httpError(409, 'Ja existe uma mesa com este codigo nesta loja.', error.detail || error);
      }
    }
  }
  throw httpError(409, 'Nao foi possivel gerar um codigo unico para a mesa. Tente novamente.');
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
  const [table] = await db('PATCH', 'dining_tables', {
    id: `eq.${id}`,
    ...(cleanUuid(storeId) ? { store_id: `eq.${cleanUuid(storeId)}` } : {})
  }, sanitizeDiningTable(data, false), ['Prefer: return=representation']);
  if (!table) throw httpError(404, 'Mesa não encontrada nesta loja.');
  return table;
}

async function deleteDiningTable(id, storeId, options = {}) {
  const db = options.db || dbRequest;
  await db('DELETE', 'dining_tables', {
    id: `eq.${id}`,
    ...(cleanUuid(storeId) ? { store_id: `eq.${cleanUuid(storeId)}` } : {})
  }, undefined, ['Prefer: return=minimal']);
}

async function openCustomerTab(data, storeId, options = {}) {
  const db = options.db || dbRequest;
  const tableId = cleanText(data.dining_table_id || '');
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
  return {
    expected_revenue: roundMoney(billable.reduce((sum, order) => sum + moneyNumber(order.total), 0)),
    completed_revenue: roundMoney(completed.reduce((sum, order) => sum + moneyNumber(order.total), 0)),
    pending_revenue: roundMoney(billable
      .filter((order) => order.status !== 'completed')
      .reduce((sum, order) => sum + moneyNumber(order.total), 0)),
    delivery_fees: roundMoney(billable.reduce((sum, order) => sum + moneyNumber(order.delivery_fee), 0)),
    order_count: billable.length
  };
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
  if (!order) throw httpError(404, 'Pedido nao encontrado nesta loja.');
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
    primaryColor: '#f97316',
    secondaryColor: '#111827',
    backgroundColor: '#fff7ed',
    buttonColor: '#f97316',
    buttonTextColor: '#ffffff',
    selectionColor: '#ffedd5',
    selectionTextColor: '#9a3412'
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
  return !text || /^\*{4,}/.test(text);
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
    throw httpError(422, 'O conteudo do arquivo nao corresponde ao tipo de imagem informado.');
  }

  const objectPath = `${folder}/${Date.now()}-${randomBytes(6).toString('hex')}-${fileName}`;
  const fullPath = path.join(UPLOAD_DIR, objectPath);
  if (!fullPath.startsWith(UPLOAD_DIR)) throw httpError(400, 'Caminho de upload invalido.');
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
async function serveStatic(res, requestPath) {
  if (requestPath.startsWith('/uploads/')) {
    await serveUpload(res, requestPath);
    return;
  }

  const routedPath = routePath(requestPath);
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
    json(res, 404, { error: 'Arquivo nao encontrado.' });
    return;
  }
  await sendFile(res, filePath);
}

function routePath(requestPath) {
  if (requestPath === '/') return '/marketing.html';
  if (requestPath === '/cardapio') return '/app.html';
  if (['/recursos', '/planos', '/demonstracao'].includes(requestPath)) return '/marketing.html';
  if (requestPath === '/termos') return '/terms.html';
  if (requestPath === '/privacidade') return '/privacy.html';
  if (requestPath === '/entrar') return '/login.html';
  if (requestPath === '/criar-conta' || requestPath === '/cadastro') return '/signup.html';
  if (requestPath === '/onboarding') return '/onboarding.html';
  if (requestPath === '/convite') return '/invite.html';
  if (requestPath === '/admin') return '/admin.html';
  if (requestPath === '/platform') return '/platform.html';
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

async function sendFile(res, filePath) {
  const ext = path.extname(filePath);
  const content = await readFile(filePath);
  const cacheHeaders = {
    'Cache-Control': 'no-store',
    ...(ext === '.html' ? { 'Clear-Site-Data': '"cache"' } : {})
  };
  res.writeHead(200, {
    ...securityHeaders(),
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
  return normalized.includes('pix') && (normalized.includes('online') || normalized.includes('pagamento online'));
}

function isOnlineCardPayment(paymentMethod) {
  const normalized = normalizeName(paymentMethod);
  return normalized.includes('cartao') && (normalized.includes('online') || normalized.includes('pagamento online'));
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
    is_active: admin.is_active !== false,
    last_login_at: admin.last_login_at || null,
    created_at: admin.created_at || null
  };
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

function securityHeaders() {
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
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
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



