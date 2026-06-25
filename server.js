import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');

loadEnv(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const STORE_WHATSAPP_NUMBER = onlyDigits(process.env.STORE_WHATSAPP_NUMBER || '');
const SUPABASE_IMAGE_BUCKET = process.env.SUPABASE_IMAGE_BUCKET || 'menu-images';
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
const PUBLIC_BOOTSTRAP_CACHE_MS = 1000 * 20;
let publicBootstrapCache = null;
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

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    json(res, 500, {
      error: 'Supabase não configurado.',
      detail: 'Preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no arquivo .env.'
    });
    return;
  }

  enforceRateLimit(req, method, url.pathname);

  if (method === 'GET' && url.pathname === '/api/bootstrap') {
    json(res, 200, await getPublicBootstrap(), {
      'Cache-Control': 'public, max-age=15, stale-while-revalidate=45'
    });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/coupons/preview') {
    json(res, 200, { coupon: await previewCoupon(req, await readJson(req)) });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/menu') {
    json(res, 200, { categories: await getMenu(false) });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/store') {
    json(res, 200, { store: await getStoreSettings() });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/tables/resolve') {
    json(res, 200, { table: await resolveDiningTable(url.searchParams.get('table') || url.searchParams.get('mesa')) });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/orders') {
    json(res, 201, await createOrder(req, await readJson(req)));
    return;
  }

  if (method === 'POST' && url.pathname === '/api/customer/register') {
    const result = await registerCustomer(await readJson(req));
    json(res, 201, result.body, { 'Set-Cookie': sessionCookie(CUSTOMER_COOKIE, result.sessionId) });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/customer/login') {
    const result = await loginCustomer(await readJson(req));
    json(res, 200, result.body, { 'Set-Cookie': sessionCookie(CUSTOMER_COOKIE, result.sessionId) });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/customer/reset-password') {
    await resetCustomerPassword(await readJson(req));
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
    json(res, 200, { customer: await getCustomerProfile(customer.id) });
    return;
  }

  if (method === 'PUT' && url.pathname === '/api/customer/me') {
    const customer = await requireCustomer(req, res);
    if (!customer) return;
    json(res, 200, { customer: await updateCustomerProfile(customer.id, await readJson(req)) });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/customer/orders') {
    const customer = await requireCustomer(req, res);
    if (!customer) return;
    json(res, 200, { orders: await listCustomerOrders(customer.id) });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/customer/addresses') {
    const customer = await requireCustomer(req, res);
    if (!customer) return;
    json(res, 201, { customer: await createCustomerAddressByOwner(customer.id, await readJson(req)) });
    return;
  }

  const customerAddressMatch = url.pathname.match(/^\/api\/customer\/addresses\/([a-f0-9-]+)$/i);
  if (customerAddressMatch) {
    const customer = await requireCustomer(req, res);
    if (!customer) return;
    if (method === 'PUT' || method === 'PATCH') {
      json(res, 200, { customer: await updateCustomerAddressByOwner(customer.id, customerAddressMatch[1], await readJson(req)) });
      return;
    }
    if (method === 'DELETE') {
      json(res, 200, { customer: await deleteCustomerAddressByOwner(customer.id, customerAddressMatch[1]) });
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
    json(res, 201, result.body, { 'Set-Cookie': sessionCookie(ADMIN_COOKIE, result.sessionId) });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/admin/login') {
    const result = await loginAdmin(await readJson(req));
    json(res, 200, result.body, { 'Set-Cookie': sessionCookie(ADMIN_COOKIE, result.sessionId) });
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
    json(res, 200, { admin: publicAdmin(admin) });
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

  if (method === 'GET' && url.pathname === '/api/admin/summary') {
    if (!(await requireAdmin(req, res))) return;
    json(res, 200, {
      store: await getStoreSettings(),
      categories: await getMenu(true),
      orders: await listOrders(),
      customers: await listCustomers(),
      promotions: await listPromotions(),
      dining_tables: await listDiningTables(),
      customer_tabs: await listCustomerTabs()
    });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/admin/tables') {
    if (!(await requireAdmin(req, res))) return;
    json(res, 200, { tables: await listDiningTables(), tabs: await listCustomerTabs() });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/admin/tables') {
    if (!(await requireAdmin(req, res))) return;
    json(res, 201, { table: await createDiningTable(await readJson(req)) });
    return;
  }

  const tableMatch = url.pathname.match(/^\/api\/admin\/tables\/([a-f0-9-]+)$/i);
  if (tableMatch) {
    if (!(await requireAdmin(req, res))) return;
    if (method === 'PATCH' || method === 'PUT') {
      json(res, 200, { table: await updateDiningTable(tableMatch[1], await readJson(req)) });
      return;
    }
    if (method === 'DELETE') {
      await deleteDiningTable(tableMatch[1]);
      json(res, 200, { ok: true });
      return;
    }
  }

  if (method === 'POST' && url.pathname === '/api/admin/tabs') {
    if (!(await requireAdmin(req, res))) return;
    json(res, 201, { tab: await openCustomerTab(await readJson(req)) });
    return;
  }

  const tabItemMatch = url.pathname.match(/^\/api\/admin\/tabs\/([a-f0-9-]+)\/items$/i);
  if (tabItemMatch && method === 'POST') {
    if (!(await requireAdmin(req, res))) return;
    json(res, 201, await addItemToCustomerTab(req, tabItemMatch[1], await readJson(req)));
    return;
  }

  const tabMatch = url.pathname.match(/^\/api\/admin\/tabs\/([a-f0-9-]+)\/(close|transfer)$/i);
  if (tabMatch) {
    if (!(await requireAdmin(req, res))) return;
    const body = await readJson(req);
    const tab = tabMatch[2] === 'close'
      ? await closeCustomerTab(tabMatch[1], body)
      : await transferCustomerTab(tabMatch[1], body);
    json(res, 200, { tab });
    return;
  }

  if (method === 'PUT' && url.pathname === '/api/admin/store') {
    if (!(await requireAdmin(req, res))) return;
    const result = await updateStoreSettings(await readJson(req));
    clearPublicBootstrapCache();
    json(res, 200, result);
    return;
  }

  if (method === 'PUT' && url.pathname === '/api/admin/loyalty') {
    if (!(await requireAdmin(req, res))) return;
    const store = await updateLoyaltyProgram(await readJson(req));
    clearPublicBootstrapCache();
    json(res, 200, { store });
    return;
  }

  if (method === 'PUT' && url.pathname === '/api/admin/print-settings') {
    if (!(await requireAdmin(req, res))) return;
    const store = await updatePrintSettings(await readJson(req));
    clearPublicBootstrapCache();
    json(res, 200, { store });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/admin/operation/start') {
    if (!(await requireAdmin(req, res))) return;
    const queue = await clearOrderQueue({ mode: 'close_open' });
    const store = await setStoreOpen(true);
    clearPublicBootstrapCache();
    json(res, 200, { store, queue });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/admin/operation/stop') {
    if (!(await requireAdmin(req, res))) return;
    const store = await setStoreOpen(false);
    clearPublicBootstrapCache();
    json(res, 200, { store });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/admin/orders') {
    if (!(await requireAdmin(req, res))) return;
    json(res, 200, { orders: await listOrders() });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/admin/print-logs') {
    if (!(await requireAdmin(req, res))) return;
    json(res, 201, { log: await createPrintLog(await readJson(req)) });
    return;
  }

  const orderStatusMatch = url.pathname.match(/^\/api\/admin\/orders\/([a-f0-9-]+)\/status$/i);
  if (orderStatusMatch && method === 'PATCH') {
    if (!(await requireAdmin(req, res))) return;
    const body = await readJson(req);
    if (!orderStatuses.has(body.status)) {
      throw httpError(422, 'Status de pedido inválido.');
    }
    json(res, 200, await supabase('PATCH', 'orders', { id: `eq.${orderStatusMatch[1]}` }, {
      status: body.status
    }, ['Prefer: return=representation']));
    return;
  }

  if (method === 'POST' && url.pathname === '/api/admin/orders/clear-queue') {
    if (!(await requireAdmin(req, res))) return;
    const result = await clearOrderQueue(await readJson(req));
    json(res, 200, result);
    return;
  }

  if (method === 'GET' && url.pathname === '/api/admin/reports/daily') {
    if (!(await requireAdmin(req, res))) return;
    const date = cleanText(url.searchParams.get('date') || '');
    json(res, 200, { report: await dailyOrderReport(date) });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/admin/reports/range') {
    if (!(await requireAdmin(req, res))) return;
    json(res, 200, {
      report: await rangeOrderReport({
        days: url.searchParams.get('days'),
        start: url.searchParams.get('start'),
        end: url.searchParams.get('end')
      })
    });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/admin/customers') {
    if (!(await requireAdmin(req, res))) return;
    json(res, 200, { customers: await listCustomers() });
    return;
  }

  const adminCustomerMatch = url.pathname.match(/^\/api\/admin\/customers\/([a-f0-9-]+)$/i);
  if (adminCustomerMatch && (method === 'PUT' || method === 'PATCH')) {
    if (!(await requireAdmin(req, res))) return;
    json(res, 200, { customer: await updateCustomerByAdmin(adminCustomerMatch[1], await readJson(req)) });
    return;
  }

  if (adminCustomerMatch && method === 'DELETE') {
    if (!(await requireAdmin(req, res))) return;
    await deleteCustomerByAdmin(adminCustomerMatch[1]);
    json(res, 200, { ok: true });
    return;
  }

  const adminCustomerAddressCreateMatch = url.pathname.match(/^\/api\/admin\/customers\/([a-f0-9-]+)\/addresses$/i);
  if (adminCustomerAddressCreateMatch && method === 'POST') {
    if (!(await requireAdmin(req, res))) return;
    json(res, 201, { customer: await createCustomerAddressByAdmin(adminCustomerAddressCreateMatch[1], await readJson(req)) });
    return;
  }

  const adminCustomerAddressMatch = url.pathname.match(/^\/api\/admin\/customers\/([a-f0-9-]+)\/addresses\/([a-f0-9-]+)$/i);
  if (adminCustomerAddressMatch) {
    if (!(await requireAdmin(req, res))) return;
    if (method === 'PUT' || method === 'PATCH') {
      json(res, 200, { customer: await updateCustomerAddressByAdmin(adminCustomerAddressMatch[1], adminCustomerAddressMatch[2], await readJson(req)) });
      return;
    }
    if (method === 'DELETE') {
      json(res, 200, { customer: await deleteCustomerAddressByAdmin(adminCustomerAddressMatch[1], adminCustomerAddressMatch[2]) });
      return;
    }
  }

  if (method === 'GET' && url.pathname === '/api/admin/promotions') {
    if (!(await requireAdmin(req, res))) return;
    json(res, 200, { promotions: await listPromotions() });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/admin/promotions') {
    if (!(await requireAdmin(req, res))) return;
    const [promotion] = await supabase('POST', 'promotions', {}, sanitizePromotion(await readJson(req), true), ['Prefer: return=representation']);
    json(res, 201, { promotion });
    return;
  }

  const promotionMatch = url.pathname.match(/^\/api\/admin\/promotions\/([a-f0-9-]+)$/i);
  if (promotionMatch) {
    if (!(await requireAdmin(req, res))) return;
    if (method === 'PUT' || method === 'PATCH') {
      const [promotion] = await supabase('PATCH', 'promotions', { id: `eq.${promotionMatch[1]}` }, sanitizePromotion(await readJson(req), false), ['Prefer: return=representation']);
      json(res, 200, { promotion });
      return;
    }
    if (method === 'DELETE') {
      await supabase('DELETE', 'promotions', { id: `eq.${promotionMatch[1]}` }, undefined, ['Prefer: return=minimal']);
      json(res, 200, { ok: true });
      return;
    }
  }

  if (method === 'POST' && url.pathname === '/api/admin/uploads') {
    if (!(await requireAdmin(req, res))) return;
    json(res, 201, await uploadImage(await readJson(req)));
    return;
  }

  if (url.pathname === '/api/categories' && method === 'POST') {
    if (!(await requireAdmin(req, res))) return;
    const result = await supabase('POST', 'menu_categories', {}, sanitizeCategory(await readJson(req), true), ['Prefer: return=representation']);
    clearPublicBootstrapCache();
    json(res, 201, result);
    return;
  }

  const categoryMatch = url.pathname.match(/^\/api\/categories\/([a-f0-9-]+)$/i);
  if (categoryMatch) {
    if (!(await requireAdmin(req, res))) return;
    if (method === 'PUT' || method === 'PATCH') {
      const result = await supabase('PATCH', 'menu_categories', { id: `eq.${categoryMatch[1]}` }, sanitizeCategory(await readJson(req), false), ['Prefer: return=representation']);
      clearPublicBootstrapCache();
      json(res, 200, result);
      return;
    }
    if (method === 'DELETE') {
      const result = await supabase('DELETE', 'menu_categories', { id: `eq.${categoryMatch[1]}` }, undefined, ['Prefer: return=representation']);
      clearPublicBootstrapCache();
      json(res, 200, result);
      return;
    }
  }

  if (url.pathname === '/api/items' && method === 'POST') {
    if (!(await requireAdmin(req, res))) return;
    const result = await supabase('POST', 'menu_items', {}, sanitizeItem(await readJson(req), true), ['Prefer: return=representation']);
    clearPublicBootstrapCache();
    json(res, 201, result);
    return;
  }

  const itemMatch = url.pathname.match(/^\/api\/items\/([a-f0-9-]+)$/i);
  if (itemMatch) {
    if (!(await requireAdmin(req, res))) return;
    if (method === 'PUT' || method === 'PATCH') {
      const result = await supabase('PATCH', 'menu_items', { id: `eq.${itemMatch[1]}` }, sanitizeItem(await readJson(req), false), ['Prefer: return=representation']);
      clearPublicBootstrapCache();
      json(res, 200, result);
      return;
    }
    if (method === 'DELETE') {
      const result = await supabase('DELETE', 'menu_items', { id: `eq.${itemMatch[1]}` }, undefined, ['Prefer: return=representation']);
      clearPublicBootstrapCache();
      json(res, 200, result);
      return;
    }
  }

  const modifierGroupMatch = url.pathname.match(/^\/api\/items\/([a-f0-9-]+)\/modifier-groups$/i);
  if (modifierGroupMatch && method === 'POST') {
    if (!(await requireAdmin(req, res))) return;
    const payload = sanitizeModifierGroup(await readJson(req), true);
    await ensureUniqueModifierGroupName(modifierGroupMatch[1], payload.name);
    const result = await supabase('POST', 'menu_modifier_groups', {}, {
      ...payload,
      menu_item_id: modifierGroupMatch[1]
    }, ['Prefer: return=representation']);
    clearPublicBootstrapCache();
    json(res, 201, result);
    return;
  }

  const modifierGroupIdMatch = url.pathname.match(/^\/api\/modifier-groups\/([a-f0-9-]+)$/i);
  if (modifierGroupIdMatch) {
    if (!(await requireAdmin(req, res))) return;
    if (method === 'PUT' || method === 'PATCH') {
      const result = await supabase('PATCH', 'menu_modifier_groups', { id: `eq.${modifierGroupIdMatch[1]}` }, sanitizeModifierGroup(await readJson(req), false), ['Prefer: return=representation']);
      clearPublicBootstrapCache();
      json(res, 200, result);
      return;
    }
    if (method === 'DELETE') {
      const result = await supabase('DELETE', 'menu_modifier_groups', { id: `eq.${modifierGroupIdMatch[1]}` }, undefined, ['Prefer: return=representation']);
      clearPublicBootstrapCache();
      json(res, 200, result);
      return;
    }
  }

  const modifierCreateMatch = url.pathname.match(/^\/api\/modifier-groups\/([a-f0-9-]+)\/modifiers$/i);
  if (modifierCreateMatch && method === 'POST') {
    if (!(await requireAdmin(req, res))) return;
    const payload = sanitizeModifier(await readJson(req), true);
    await ensureUniqueModifierName(modifierCreateMatch[1], payload.name);
    const result = await supabase('POST', 'menu_modifiers', {}, {
      ...payload,
      group_id: modifierCreateMatch[1]
    }, ['Prefer: return=representation']);
    clearPublicBootstrapCache();
    json(res, 201, result);
    return;
  }

  const modifierMatch = url.pathname.match(/^\/api\/modifiers\/([a-f0-9-]+)$/i);
  if (modifierMatch) {
    if (!(await requireAdmin(req, res))) return;
    if (method === 'PUT' || method === 'PATCH') {
      const result = await supabase('PATCH', 'menu_modifiers', { id: `eq.${modifierMatch[1]}` }, sanitizeModifier(await readJson(req), false), ['Prefer: return=representation']);
      clearPublicBootstrapCache();
      json(res, 200, result);
      return;
    }
    if (method === 'DELETE') {
      const result = await supabase('DELETE', 'menu_modifiers', { id: `eq.${modifierMatch[1]}` }, undefined, ['Prefer: return=representation']);
      clearPublicBootstrapCache();
      json(res, 200, result);
      return;
    }
  }

  json(res, 404, { error: 'Rota não encontrada.' });
}

async function hasAdminUser() {
  const rows = await supabase('GET', 'admin_users', {
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
  const [created] = await supabase('POST', 'admin_users', {}, {
    ...admin,
    password_hash: hashPassword(password),
    role: 'owner',
    is_active: true
  }, ['Prefer: return=representation']);

  return createAdminSession(created);
}

async function loginAdmin(data) {
  const email = cleanEmail(data.email);
  const password = String(data.password || '');

  if (!email || !password) throw httpError(422, 'Informe e-mail e senha.');

  const rows = await supabase('GET', 'admin_users', {
    select: '*',
    email: `eq.${email}`,
    limit: '1'
  });

  const admin = rows[0];
  if (!admin || admin.is_active === false || !verifyPassword(password, admin.password_hash)) {
    throw httpError(401, 'E-mail ou senha inválidos.');
  }

  await supabase('PATCH', 'admin_users', { id: `eq.${admin.id}` }, {
    last_login_at: new Date().toISOString()
  }, ['Prefer: return=representation']);

  return createAdminSession(admin);
}

async function getAdminById(adminId) {
  const rows = await supabase('GET', 'admin_users', {
    select: '*',
    id: `eq.${adminId}`,
    limit: '1'
  });

  if (!rows[0]) throw httpError(404, 'Admin não encontrado.');
  return rows[0];
}

async function updateAdminAccount(session, data) {
  const payload = {};
  if ('name' in data) payload.name = cleanText(data.name);
  if ('email' in data) payload.email = cleanEmail(data.email);

  if (!payload.name && !payload.email) {
    throw httpError(422, 'Informe nome ou e-mail para atualizar.');
  }

  const [updated] = await supabase('PATCH', 'admin_users', { id: `eq.${session.id}` }, payload, ['Prefer: return=representation']);
  session.name = updated.name;
  session.email = updated.email;
  session.role = updated.role;
  return publicAdmin(updated);
}

async function changeAdminPassword(session, data) {
  const currentPassword = String(data.current_password || '');
  const newPassword = validatePassword(data.new_password);
  const admin = await getAdminById(session.id);

  if (!verifyPassword(currentPassword, admin.password_hash)) {
    throw httpError(401, 'Senha atual invalida.');
  }

  await supabase('PATCH', 'admin_users', { id: `eq.${session.id}` }, {
    password_hash: hashPassword(newPassword)
  }, ['Prefer: return=representation']);
}

async function createAdminSession(admin) {
  const sessionId = await createPersistentSession('admin', admin.id, {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role
  });
  return { sessionId, body: { admin: publicAdmin(admin) } };
}

async function requireAdmin(req, res) {
  const session = await readPersistentSession(parseCookies(req)[ADMIN_COOKIE], 'admin');
  if (!session) {
    json(res, 401, { error: 'Faca login para acessar o admin.' });
    return null;
  }
  return session.data;
}

async function registerCustomer(data) {
  const customer = sanitizeCustomer(data.customer || data);
  const password = validatePassword(data.password);
  const address = data.address && data.address.street ? sanitizeAddress(data.address) : null;

  const existing = await supabase('GET', 'customers', {
    select: '*',
    phone: `eq.${customer.phone}`,
    limit: '1'
  });

  let row;
  if (existing[0]) {
    if (existing[0].password_hash) {
      throw httpError(409, 'Este telefone já possui cadastro. Entre com sua senha.');
    }
    [row] = await supabase('PATCH', 'customers', { id: `eq.${existing[0].id}` }, {
      ...customer,
      password_hash: hashPassword(password)
    }, ['Prefer: return=representation']);
  } else {
    [row] = await supabase('POST', 'customers', {}, {
      ...customer,
      password_hash: hashPassword(password)
    }, ['Prefer: return=representation']);
  }

  if (address) await upsertAddress(row.id, address);

  return createCustomerSession(row);
}

async function loginCustomer(data) {
  const phone = onlyDigits(data.phone);
  const password = String(data.password || '');
  if (!phone || !password) throw httpError(422, 'Informe telefone e senha.');

  const rows = await supabase('GET', 'customers', {
    select: '*',
    phone: `eq.${phone}`,
    limit: '1'
  });

  const customer = rows[0];
  if (!customer || !customer.password_hash || !verifyPassword(password, customer.password_hash)) {
    throw httpError(401, 'Telefone ou senha inválidos.');
  }

  await supabase('PATCH', 'customers', { id: `eq.${customer.id}` }, {
    last_login_at: new Date().toISOString()
  }, ['Prefer: return=representation']);

  return createCustomerSession(customer);
}

async function resetCustomerPassword(data) {
  const phone = onlyDigits(data.phone);
  const orderCode = cleanText(data.order_code || '').replace(/^#/, '').toUpperCase();
  const orderTotal = parseMoneyInput(data.order_total);
  const newPassword = validatePassword(data.new_password);
  if (!phone || !orderCode || orderTotal === null) {
    throw httpError(422, 'Informe telefone, código e total de um pedido.');
  }

  const customers = await supabase('GET', 'customers', {
    select: 'id,phone',
    phone: `eq.${phone}`,
    limit: '1'
  });
  const customer = customers[0];
  if (!customer) throw httpError(401, 'Não foi possível validar os dados informados.');

  const orders = await supabase('GET', 'orders', {
    select: 'id,customer_id,public_code,total',
    customer_id: `eq.${customer.id}`,
    public_code: `eq.${orderCode}`,
    limit: '1'
  });
  if (!orders[0] || Math.abs(moneyNumber(orders[0].total) - orderTotal) > 0.01) {
    throw httpError(401, 'Não foi possível validar os dados informados.');
  }

  await supabase('PATCH', 'customers', { id: `eq.${customer.id}` }, {
    password_hash: hashPassword(newPassword)
  }, ['Prefer: return=minimal']);
}

async function createCustomerSession(customer) {
  const sessionId = await createPersistentSession('customer', customer.id, {
    id: customer.id,
    name: customer.name,
    phone: customer.phone
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

async function getCustomerProfile(customerId) {
  const rows = await supabase('GET', 'customers', {
    select: 'id,name,phone,email,birth_date,notes,created_at,updated_at',
    id: `eq.${customerId}`,
    limit: '1'
  });
  if (!rows[0]) throw httpError(404, 'Cliente não encontrado.');
  const addresses = await listCustomerAddresses(customerId);
  const loyalty = await customerLoyaltyProgress(customerId);
  return { ...rows[0], address: addresses[0] || null, addresses, loyalty };
}

async function customerLoyaltyProgress(customerId) {
  const store = await getStoreSettings();
  const program = sanitizeLoyaltyProgram(store.loyalty_program || {});
  const orders = await supabase('GET', 'orders', {
    select: 'id,total,status,created_at',
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

async function updateCustomerProfile(customerId, data) {
  const customer = sanitizeCustomer(data.customer || data);
  const payload = { ...customer };
  if (data.password) payload.password_hash = hashPassword(validatePassword(data.password));

  const [updated] = await supabase('PATCH', 'customers', { id: `eq.${customerId}` }, payload, ['Prefer: return=representation']);
  if (data.address?.street) {
    await upsertAddress(customerId, sanitizeAddress(data.address));
  }
  return getCustomerProfile(updated.id);
}

async function updateCustomerAddressByOwner(customerId, addressId, data) {
  return updateCustomerAddressByAdmin(customerId, addressId, data);
}

async function createCustomerAddressByOwner(customerId, data) {
  return createCustomerAddressByAdmin(customerId, data);
}

async function deleteCustomerAddressByOwner(customerId, addressId) {
  return deleteCustomerAddressByAdmin(customerId, addressId);
}

async function updateCustomerByAdmin(customerId, data) {
  const customer = sanitizeCustomer(data.customer || data);
  const payload = { ...customer };
  if (data.password) payload.password_hash = hashPassword(validatePassword(data.password));
  const [updated] = await supabase('PATCH', 'customers', { id: `eq.${customerId}` }, payload, ['Prefer: return=representation']);
  if (!updated) throw httpError(404, 'Cliente não encontrado.');
  return getCustomerProfile(customerId);
}

async function deleteCustomerByAdmin(customerId) {
  await supabase('DELETE', 'app_sessions', {
    type: 'eq.customer',
    owner_id: `eq.${customerId}`
  }, undefined, ['Prefer: return=minimal']);
  await supabase('DELETE', 'customers', { id: `eq.${customerId}` }, undefined, ['Prefer: return=minimal']);
}

async function createCustomerAddressByAdmin(customerId, data) {
  const payload = sanitizeAddressWithDefault(data, true);
  await saveCustomerAddress(customerId, payload);
  return getCustomerProfile(customerId);
}

async function updateCustomerAddressByAdmin(customerId, addressId, data) {
  const payload = sanitizeAddressWithDefault(data, true);
  if (payload.is_default) {
    await supabase('PATCH', 'customer_addresses', { customer_id: `eq.${customerId}` }, {
      is_default: false
    }, ['Prefer: return=minimal']);
  }

  const [updated] = await supabase('PATCH', 'customer_addresses', {
    id: `eq.${addressId}`,
    customer_id: `eq.${customerId}`
  }, payload, ['Prefer: return=representation']);
  if (!updated) throw httpError(404, 'Endereço não encontrado.');
  return getCustomerProfile(customerId);
}

async function deleteCustomerAddressByAdmin(customerId, addressId) {
  await supabase('DELETE', 'customer_addresses', {
    id: `eq.${addressId}`,
    customer_id: `eq.${customerId}`
  }, undefined, ['Prefer: return=minimal']);
  const addresses = await listCustomerAddresses(customerId);
  if (addresses.length && !addresses.some((address) => address.is_default)) {
    await supabase('PATCH', 'customer_addresses', { id: `eq.${addresses[0].id}` }, {
      is_default: true
    }, ['Prefer: return=minimal']);
  }
  return getCustomerProfile(customerId);
}

async function getDefaultAddress(customerId) {
  const rows = await listCustomerAddresses(customerId);
  return rows[0] || null;
}

async function listCustomerAddresses(customerId) {
  return supabase('GET', 'customer_addresses', {
    select: '*',
    customer_id: `eq.${customerId}`,
    order: 'is_default.desc,created_at.desc'
  });
}

async function getStoreSettings() {
  const rows = await supabase('GET', 'store_settings', {
    select: '*',
    order: 'created_at.asc',
    limit: '1'
  });

  const store = rows[0] || {
    name: 'Menu da Casa',
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
  return {
    ...store,
    delivery_neighborhood_fees: isPlainObject(store.delivery_neighborhood_fees) ? store.delivery_neighborhood_fees : defaultNeighborhoodFees(),
    business_hours: isPlainObject(store.business_hours) ? store.business_hours : defaultBusinessHours(),
    loyalty_program: sanitizeLoyaltyProgram(store.loyalty_program || {}),
    theme_settings: sanitizeThemeSettings(store.theme_settings || {}),
    print_settings: sanitizePrintSettings(store.print_settings || {})
  };
}

async function getPublicBootstrap() {
  const now = Date.now();
  if (publicBootstrapCache && publicBootstrapCache.expiresAt > now) {
    return publicBootstrapCache.data;
  }

  const [store, categories] = await Promise.all([
    getStoreSettings(),
    getMenu(false)
  ]);
  const data = { store, categories };
  publicBootstrapCache = {
    data,
    expiresAt: now + PUBLIC_BOOTSTRAP_CACHE_MS
  };
  return data;
}

function clearPublicBootstrapCache() {
  publicBootstrapCache = null;
}

async function updateStoreSettings(data) {
  const current = await getStoreSettings();
  const payload = sanitizeStore(data);

  if (current.id) {
    return supabase('PATCH', 'store_settings', { id: `eq.${current.id}` }, payload, ['Prefer: return=representation']);
  }

  return supabase('POST', 'store_settings', {}, payload, ['Prefer: return=representation']);
}

async function updateLoyaltyProgram(data) {
  const current = await getStoreSettings();
  const payload = {
    loyalty_program: sanitizeLoyaltyProgram(data.loyalty_program || data)
  };

  if (current.id) {
    const [updated] = await supabase('PATCH', 'store_settings', { id: `eq.${current.id}` }, payload, ['Prefer: return=representation']);
    return {
      ...updated,
      loyalty_program: sanitizeLoyaltyProgram(updated.loyalty_program || {})
    };
  }

  const [created] = await supabase('POST', 'store_settings', {}, {
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

async function updatePrintSettings(data) {
  const current = await getStoreSettings();
  const payload = {
    print_settings: sanitizePrintSettings(data.print_settings || data)
  };

  if (current.id) {
    const [updated] = await supabase('PATCH', 'store_settings', { id: `eq.${current.id}` }, payload, ['Prefer: return=representation']);
    return {
      ...updated,
      print_settings: sanitizePrintSettings(updated.print_settings || {})
    };
  }

  const [created] = await supabase('POST', 'store_settings', {}, {
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

async function setStoreOpen(isOpen) {
  const current = await getStoreSettings();
  const payload = { is_open: Boolean(isOpen) };

  if (current.id) {
    const [updated] = await supabase('PATCH', 'store_settings', { id: `eq.${current.id}` }, payload, ['Prefer: return=representation']);
    return updated;
  }

  const [created] = await supabase('POST', 'store_settings', {}, {
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

async function getMenu(admin) {
  const [categories, items, groups, modifiers] = await Promise.all([
    supabase('GET', 'menu_categories', {
      select: admin ? '*' : 'id,name,description,sort_order',
      ...(admin ? {} : { is_active: 'eq.true' }),
      order: 'sort_order.asc,name.asc'
    }),
    supabase('GET', 'menu_items', {
      select: admin ? '*' : 'id,category_id,name,description,price,image_url,tags,is_featured,is_available,sort_order',
      ...(admin ? {} : { is_available: 'eq.true' }),
      order: 'sort_order.asc,name.asc'
    }),
    supabase('GET', 'menu_modifier_groups', {
      select: '*',
      order: 'sort_order.asc,name.asc'
    }),
    supabase('GET', 'menu_modifiers', {
      select: '*',
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

  return [...byCategory.values()];
}

async function createOrder(req, data, options = {}) {
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

  const itemIds = [...new Set(requestedItems.map((item) => cleanText(item.id)).filter(Boolean))];
  if (itemIds.length === 0) throw httpError(422, 'Itens do pedido inválidos.');

  const menuItems = await supabase('GET', 'menu_items', {
    select: '*',
    id: `in.(${itemIds.join(',')})`,
    is_available: 'eq.true'
  });

  const menuById = new Map(menuItems.map((item) => [item.id, item]));
  const modifierCatalog = await loadModifierCatalog(itemIds);
  const orderItems = requestedItems.map((requested) => {
    const menuItem = menuById.get(cleanText(requested.id));
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

  const store = await getStoreSettings();
  if (store.is_open === false && !options.allowClosedStore) {
    throw httpError(423, 'A loja está fechada no momento e não está aceitando pedidos.');
  }
  const subtotal = roundMoney(orderItems.reduce((sum, item) => sum + item.total, 0));
  const deliveryFee = fulfillmentMethod === 'delivery' ? deliveryFeeForAddress(store, address) : 0;
  const table = ['table', 'tab'].includes(fulfillmentMethod) ? await requireActiveDiningTable(data.dining_table_id || data.table_code) : null;
  let tab = null;
  if (fulfillmentMethod === 'tab') {
    tab = await requireOpenTab(data.customer_tab_id, table?.id);
  } else if (fulfillmentMethod === 'table' && table?.id) {
    tab = await findOpenTabForTable(table.id);
    if (tab) fulfillmentMethod = 'tab';
  }
  const customerRow = session
    ? await getCustomerProfile(session.data.id)
    : customer.phone
      ? await upsertCustomer(customer)
      : null;
  const coupon = couponCode ? await findActivePromotion(couponCode, {
    subtotal,
    deliveryFee,
    customer: customerRow,
    items: orderItems
  }) : null;
  const discount = coupon ? couponDiscountAmount(coupon, subtotal, deliveryFee) : 0;
  const total = roundMoney(Math.max(0, subtotal + deliveryFee - discount));
  validatePaymentDetails(paymentDetails, paymentMethod, total);

  if (fulfillmentMethod === 'delivery') {
    await upsertAddress(customerRow.id, address);
  }

  const orderPayload = {
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
    promotion_code: coupon?.code || null
  };

  const [order] = await supabase('POST', 'orders', {}, orderPayload, ['Prefer: return=representation']);
  const itemsWithOrder = orderItems.map((item) => ({ ...item, order_id: order.id }));
  await supabase('POST', 'order_items', {}, itemsWithOrder, ['Prefer: return=representation']);
  if (coupon) {
    await supabase('PATCH', 'promotions', { id: `eq.${coupon.id}` }, {
      used_count: Number(coupon.used_count || 0) + 1
    }, ['Prefer: return=minimal']);
  }

  const whatsappMessage = buildWhatsappMessage(store, order, itemsWithOrder, customer, address);
  const [updatedOrder] = await supabase('PATCH', 'orders', { id: `eq.${order.id}` }, {
    whatsapp_message: whatsappMessage
  }, ['Prefer: return=representation']);

  const whatsappNumber = onlyDigits(store.whatsapp_number || STORE_WHATSAPP_NUMBER);
  const whatsappUrl = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`
    : null;

  return {
    order: { ...updatedOrder, items: itemsWithOrder },
    whatsapp_url: whatsappUrl,
    whatsapp_message: whatsappMessage
  };
}

async function loadModifierCatalog(itemIds) {
  const groups = await supabase('GET', 'menu_modifier_groups', {
    select: '*',
    menu_item_id: `in.(${itemIds.join(',')})`,
    order: 'sort_order.asc,name.asc'
  });

  if (groups.length === 0) {
    return { groupsByItem: new Map(), modifiersById: new Map() };
  }

  const groupIds = groups.map((group) => group.id);
  const modifiers = await supabase('GET', 'menu_modifiers', {
    select: '*',
    group_id: `in.(${groupIds.join(',')})`,
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
  const ids = Array.isArray(selectedIds) ? [...new Set(selectedIds.map(cleanText).filter(Boolean))] : [];
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
  const ids = Array.isArray(selectedIds) ? [...new Set(selectedIds.map(cleanText).filter(Boolean))] : [];
  return ids.map((id) => {
    const modifier = catalog.modifiersById.get(id);
    if (!modifier || modifier.menu_item_id !== menuItemId) {
      throw httpError(422, 'Adicional inválido para um item escolhido.');
    }
    return modifier;
  });
}

async function ensureUniqueModifierGroupName(menuItemId, name) {
  const existing = await supabase('GET', 'menu_modifier_groups', {
    select: 'id,name',
    menu_item_id: `eq.${menuItemId}`
  });
  const normalized = normalizeName(name);
  if (existing.some((group) => normalizeName(group.name) === normalized)) {
    throw httpError(409, 'Já existe um grupo com esse nome neste produto.');
  }
}

async function ensureUniqueModifierName(groupId, name) {
  const existing = await supabase('GET', 'menu_modifiers', {
    select: 'id,name',
    group_id: `eq.${groupId}`
  });
  const normalized = normalizeName(name);
  if (existing.some((modifier) => normalizeName(modifier.name) === normalized)) {
    throw httpError(409, 'Já existe uma opção com esse nome neste grupo.');
  }
}

async function upsertCustomer(customer) {
  const existing = await supabase('GET', 'customers', {
    select: '*',
    phone: `eq.${customer.phone}`,
    limit: '1'
  });

  if (existing[0]) {
    const [updated] = await supabase('PATCH', 'customers', { id: `eq.${existing[0].id}` }, customer, ['Prefer: return=representation']);
    return updated;
  }

  const [created] = await supabase('POST', 'customers', {}, customer, ['Prefer: return=representation']);
  return created;
}

async function upsertAddress(customerId, address) {
  if (!address) return null;

  const existing = await supabase('GET', 'customer_addresses', {
    select: '*',
    customer_id: `eq.${customerId}`
  });

  const payload = { ...address, customer_id: customerId, is_default: true };
  const sameAddress = existing.find((row) => addressKey(row) === addressKey(address));

  if (existing.length > 0) {
    await supabase('PATCH', 'customer_addresses', { customer_id: `eq.${customerId}` }, {
      is_default: false
    }, ['Prefer: return=minimal']);
  }

  if (sameAddress) {
    const [updated] = await supabase('PATCH', 'customer_addresses', { id: `eq.${sameAddress.id}` }, {
      ...payload,
      label: sameAddress.label || payload.label || 'Principal'
    }, ['Prefer: return=representation']);
    return updated;
  }

  const [created] = await supabase('POST', 'customer_addresses', {}, payload, ['Prefer: return=representation']);
  return created;
}

async function saveCustomerAddress(customerId, address) {
  if (address.is_default) {
    await supabase('PATCH', 'customer_addresses', { customer_id: `eq.${customerId}` }, {
      is_default: false
    }, ['Prefer: return=minimal']);
  }
  const [created] = await supabase('POST', 'customer_addresses', {}, {
    ...address,
    customer_id: customerId
  }, ['Prefer: return=representation']);
  return created;
}

async function createPersistentSession(type, ownerId, data) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString();
  await supabase('POST', 'app_sessions', {}, {
    token,
    type,
    owner_id: ownerId,
    data,
    expires_at: expiresAt
  }, ['Prefer: return=minimal']);
  return token;
}

async function readPersistentSession(token, expectedType) {
  if (!token) return null;
  const rows = await supabase('GET', 'app_sessions', {
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
    await supabase('PATCH', 'app_sessions', { token: `eq.${token}` }, {
      expires_at: new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString()
    }, ['Prefer: return=minimal']);
  }

  return session;
}

async function deleteSession(token) {
  if (!token) return;
  await supabase('DELETE', 'app_sessions', { token: `eq.${token}` }, undefined, ['Prefer: return=minimal']);
}

async function cleanExpiredSessions() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    await supabase('DELETE', 'app_sessions', {
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
  if (method === 'POST' && pathname === '/api/orders') return limitRule('order-create', 20, 10 * 60 * 1000);
  if (method === 'POST' && pathname === '/api/admin/setup') return limitRule('admin-setup', 3, 60 * 60 * 1000);
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

async function listCustomerOrders(customerId) {
  const orders = await supabase('GET', 'orders', {
    select: '*',
    customer_id: `eq.${customerId}`,
    order: 'created_at.desc',
    limit: '30'
  });

  return attachOrderItems(orders);
}

async function listOrders() {
  const orders = await supabase('GET', 'orders', {
    select: '*',
    archived_at: 'is.null',
    order: 'created_at.desc',
    limit: '100'
  });

  return attachOrderItems(orders);
}

async function createPrintLog(data) {
  const payload = sanitizePrintLog(data);
  const [log] = await supabase('POST', 'order_print_logs', {}, payload, ['Prefer: return=representation']);
  return log;
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

async function listDiningTables() {
  const tables = await supabase('GET', 'dining_tables', {
    select: '*',
    order: 'name.asc'
  });
  const tabs = await listCustomerTabs();
  return tables.map((table) => ({
    ...table,
    open_tabs: tabs.filter((tab) => tab.status === 'open' && tab.dining_table_id === table.id),
    open_tab: tabs.find((tab) => tab.status === 'open' && tab.dining_table_id === table.id) || null
  }));
}

async function listCustomerTabs() {
  const tabs = await supabase('GET', 'customer_tabs', {
    select: '*',
    order: 'opened_at.desc',
    limit: '200'
  });
  const openTabIds = tabs.filter((tab) => tab.status === 'open').map((tab) => tab.id);
  let ordersByTab = new Map();
  if (openTabIds.length) {
    const orders = await attachOrderItems(await supabase('GET', 'orders', {
      select: '*',
      customer_tab_id: `in.(${openTabIds.join(',')})`,
      order: 'created_at.desc',
      limit: '500'
    }));
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
    return { ...tab, orders, current_total: total };
  });
}

async function resolveDiningTable(code) {
  const cleanCode = cleanSlug(code || '');
  if (!cleanCode) throw httpError(404, 'Mesa não informada.');
  const rows = await supabase('GET', 'dining_tables', {
    select: '*',
    code: `eq.${cleanCode}`,
    is_active: 'eq.true',
    limit: '1'
  });
  const table = rows[0];
  if (!table) throw httpError(404, 'Mesa não encontrada ou inativa.');
  const tabs = await supabase('GET', 'customer_tabs', {
    select: '*',
    dining_table_id: `eq.${table.id}`,
    status: 'eq.open',
    order: 'opened_at.asc',
    limit: '50'
  });
  let openTab = tabs.length === 1 ? tabs[0] : null;
  if (openTab) {
    const orders = await supabase('GET', 'orders', {
      select: '*',
      customer_tab_id: `eq.${openTab.id}`,
      order: 'created_at.desc',
      limit: '200'
    });
    openTab = {
      ...openTab,
      current_total: roundMoney(orders
        .filter((order) => order.status !== 'cancelled')
        .reduce((sum, order) => sum + moneyNumber(order.total), 0)),
      order_count: orders.length
    };
  }
  return { ...table, open_tab: openTab, open_tabs: tabs };
}

async function createDiningTable(data) {
  const payload = sanitizeDiningTable(data, true);
  const [table] = await supabase('POST', 'dining_tables', {}, payload, ['Prefer: return=representation']);
  return table;
}

async function updateDiningTable(id, data) {
  const [table] = await supabase('PATCH', 'dining_tables', { id: `eq.${id}` }, sanitizeDiningTable(data, false), ['Prefer: return=representation']);
  return table;
}

async function deleteDiningTable(id) {
  await supabase('DELETE', 'dining_tables', { id: `eq.${id}` }, undefined, ['Prefer: return=minimal']);
}

async function openCustomerTab(data) {
  const tableId = cleanText(data.dining_table_id || '');
  const payload = {
    name: cleanText(data.name || `Comanda ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`),
    customer_name: cleanText(data.customer_name || '') || null,
    dining_table_id: tableId || null,
    status: 'open'
  };
  const [tab] = await supabase('POST', 'customer_tabs', {}, payload, ['Prefer: return=representation']);
  return tab;
}

async function closeCustomerTab(id, data = {}) {
  const orders = await supabase('GET', 'orders', {
    select: '*',
    customer_tab_id: `eq.${id}`,
    order: 'created_at.asc',
    limit: '500'
  });
  const total = roundMoney(orders
    .filter((order) => order.status !== 'cancelled')
    .reduce((sum, order) => sum + moneyNumber(order.total), 0));
  const discount = roundMoney(Number.parseFloat(data.discount) || 0);
  const [tab] = await supabase('PATCH', 'customer_tabs', { id: `eq.${id}`, status: 'eq.open' }, {
    status: 'closed',
    closed_at: new Date().toISOString(),
    payment_method: cleanText(data.payment_method || ''),
    discount,
    total: roundMoney(Math.max(0, total - discount))
  }, ['Prefer: return=representation']);
  if (!tab) throw httpError(409, 'Comanda não encontrada ou já fechada.');
  return tab;
}

async function transferCustomerTab(id, data = {}) {
  const tableId = cleanText(data.dining_table_id || '');
  if (!tableId) throw httpError(422, 'Informe a mesa de destino.');
  const [tab] = await supabase('PATCH', 'customer_tabs', { id: `eq.${id}`, status: 'eq.open' }, {
    dining_table_id: tableId
  }, ['Prefer: return=representation']);
  if (!tab) throw httpError(409, 'Comanda não encontrada ou já fechada.');
  return tab;
}

async function addItemToCustomerTab(req, tabId, data = {}) {
  const tab = await requireOpenTab(tabId);
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
    allowClosedStore: true,
    skipModifierValidation: true
  });
  return { order: result.order };
}

async function clearOrderQueue(data = {}) {
  const mode = ['close_open', 'archive_closed'].includes(data.mode) ? data.mode : 'close_open';
  const openStatuses = ['new', 'accepted', 'preparing', 'ready', 'out_for_delivery'];
  const archivedAt = new Date().toISOString();
  let openArchived = [];
  if (mode === 'close_open') {
    openArchived = await supabase('PATCH', 'orders', {
      status: `in.(${openStatuses.join(',')})`,
      archived_at: 'is.null'
    }, {
      status: 'completed',
      archived_at: archivedAt
    }, ['Prefer: return=representation']);
  }
  const closedArchived = await supabase('PATCH', 'orders', {
    status: 'in.(completed,cancelled)',
    archived_at: 'is.null'
  }, {
    archived_at: archivedAt
  }, ['Prefer: return=representation']);
  return {
    archived: openArchived.length + closedArchived.length,
    closed: openArchived.length,
    hidden: closedArchived.length,
    mode
  };
}

async function dailyOrderReport(dateValue) {
  const day = validReportDate(dateValue);
  const start = reportDateStart(day);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return orderReportBetween(start, end, {
    date: day,
    label: `Dia ${formatReportDate(day)}`,
    start: day,
    end: day
  });
}

async function rangeOrderReport({ days, start, end } = {}) {
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
    });
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
  });
}

async function orderReportBetween(start, end, period) {
  const spanMs = end.getTime() - start.getTime();
  const previousStart = new Date(start.getTime() - spanMs);
  const orders = await supabase('GET', 'orders', {
    select: '*',
    created_at: `gte.${previousStart.toISOString()}`,
    order: 'created_at.desc',
    limit: '5000'
  });
  const periodOrders = orders.filter((order) => new Date(order.created_at) < end);
  const currentOrders = periodOrders.filter((order) => new Date(order.created_at) >= start);
  const previousOrders = periodOrders.filter((order) => {
    const createdAt = new Date(order.created_at);
    return createdAt >= previousStart && createdAt < start;
  });
  const withItems = await attachOrderItems(currentOrders);
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
  return date.toISOString().slice(0, 10);
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
  return new Date().toISOString().slice(0, 10);
}

async function attachOrderItems(orders) {
  if (orders.length === 0) return [];

  const ids = orders.map((order) => order.id);
  const items = await supabase('GET', 'order_items', {
    select: '*',
    order_id: `in.(${ids.join(',')})`,
    order: 'created_at.asc'
  });

  const byOrder = new Map(orders.map((order) => [order.id, { ...order, items: [] }]));
  for (const item of items) {
    byOrder.get(item.order_id)?.items.push(item);
  }

  return [...byOrder.values()];
}

async function listCustomers() {
  const customers = await supabase('GET', 'customers', {
    select: 'id,name,phone,email,birth_date,notes,created_at,updated_at,last_login_at',
    order: 'created_at.desc',
    limit: '100'
  });
  return Promise.all(customers.map(async (customer) => ({
    ...customer,
    addresses: await listCustomerAddresses(customer.id)
  })));
}

async function listPromotions() {
  try {
    return await supabase('GET', 'promotions', {
      select: '*',
      order: 'created_at.desc'
    });
  } catch (error) {
    const detail = JSON.stringify(error.detail || '');
    if (error.status === 404 || detail.includes('promotions')) return [];
    throw error;
  }
}

async function previewCoupon(req, data) {
  const code = cleanText(data.code || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const subtotal = roundMoney(Number.parseFloat(data.subtotal) || 0);
  const deliveryFee = roundMoney(Number.parseFloat(data.delivery_fee) || 0);
  if (!code) throw httpError(422, 'Informe o cupom.');
  const coupon = await findActivePromotion(code, {
    subtotal,
    deliveryFee,
    customer: await promotionCustomerContext(req, data),
    items: await promotionItemsContext(data.items || [])
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

async function promotionCustomerContext(req, data) {
  const session = await readPersistentSession(parseCookies(req)[CUSTOMER_COOKIE], 'customer');
  if (session?.data?.id) return getCustomerProfile(session.data.id);

  const phone = onlyDigits(data.phone || data.customer?.phone || '');
  if (!phone) return null;
  const rows = await supabase('GET', 'customers', {
    select: 'id,name,phone,email,birth_date,notes,created_at,updated_at',
    phone: `eq.${phone}`,
    limit: '1'
  });
  return rows[0] || null;
}

async function promotionItemsContext(rawItems) {
  const requestedItems = Array.isArray(rawItems) ? rawItems : [];
  const itemIds = [...new Set(requestedItems.map((item) => cleanText(item.id)).filter(Boolean))];
  if (itemIds.length === 0) return [];
  const items = await supabase('GET', 'menu_items', {
    select: 'id,name,category_id,price',
    id: `in.(${itemIds.join(',')})`
  });
  const byId = new Map(items.map((item) => [item.id, item]));
  return requestedItems.map((requested) => {
    const item = byId.get(cleanText(requested.id));
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
  const subtotal = roundMoney(Number(context.subtotal || 0));
  const deliveryFee = roundMoney(Number(context.deliveryFee || 0));
  const rows = await supabase('GET', 'promotions', {
    select: '*',
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
  await assertPromotionAudience(coupon, { ...context, subtotal, deliveryFee });
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
  await assertPromotionUseLimitPerCustomer(coupon, customer);

  if (!['first_order', 'recurring', 'birthday'].includes(promotionType)) return;

  const orderCount = customer?.id ? await customerOrderCount(customer.id) : 0;

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

async function assertPromotionUseLimitPerCustomer(coupon, customer) {
  const limit = Math.max(1, Number(coupon.max_uses_per_customer || 1));
  if (!customer?.id) return;
  const uses = await supabase('GET', 'orders', {
    select: 'id',
    customer_id: `eq.${customer.id}`,
    promotion_code: `eq.${coupon.code}`
  });
  if (uses.length >= limit) {
    throw httpError(422, `Este cupom já atingiu o limite de ${limit} uso(s) para sua conta.`);
  }
}

async function customerOrderCount(customerId) {
  const orders = await supabase('GET', 'orders', {
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
  return value.map(cleanText).filter(Boolean);
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
    showKitchenPrices: false,
    highlightNotes: true
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
    showKitchenPrices: Boolean(data.showKitchenPrices),
    highlightNotes: data.highlightNotes === undefined ? defaults.highlightNotes : Boolean(data.highlightNotes)
  };
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

  if (!base64) throw httpError(422, 'Arquivo de imagem ausente.');
  if (!allowedUploadTypes.has(contentType)) {
    throw httpError(422, 'Envie apenas imagens JPG, PNG ou WebP.');
  }

  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > 5 * 1024 * 1024) throw httpError(422, 'Imagem muito grande. Limite de 5 MB.');
  if (detectImageContentType(buffer) !== contentType) {
    throw httpError(422, 'O conteúdo do arquivo não corresponde ao tipo de imagem informado.');
  }

  const objectPath = `products/${Date.now()}-${fileName}`;
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${SUPABASE_IMAGE_BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'true'
    },
    body: buffer
  });

  if (!response.ok) {
    throw httpError(response.status, 'Falha ao enviar imagem para o Supabase Storage.', await safeResponse(response));
  }

  return {
    path: objectPath,
    url: `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_IMAGE_BUCKET}/${objectPath}`
  };
}

async function supabase(method, table, query = {}, payload, extraHeaders = []) {
  const endpoint = new URL(`${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}`);
  for (const [key, value] of Object.entries(query)) {
    endpoint.searchParams.set(key, value);
  }

  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json'
  };

  for (const header of extraHeaders) {
    const index = header.indexOf(':');
    headers[header.slice(0, index)] = header.slice(index + 1).trim();
  }

  const response = await fetch(endpoint, {
    method,
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload)
  });

  const data = await safeResponse(response);

  if (!response.ok) {
    throw httpError(response.status, 'Erro retornado pelo Supabase.', data);
  }

  return Array.isArray(data) || isPlainObject(data) ? data : [];
}

async function serveStatic(res, requestPath) {
  const routedPath = routePath(requestPath);
  const filePath = path.normalize(path.join(publicDir, routedPath));

  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
    await sendFile(res, path.join(publicDir, 'app.html'));
    return;
  }

  await sendFile(res, filePath);
}

function routePath(requestPath) {
  if (requestPath === '/') return '/app.html';
  if (requestPath === '/admin') return '/admin.html';
  if (requestPath === '/cozinha') return '/kitchen.html';
  if (requestPath === '/conta' || requestPath === '/cliente') return '/account.html';
  if (requestPath === '/pedidos') return '/orders.html';
  return decodeURIComponent(requestPath);
}

async function sendFile(res, filePath) {
  const ext = path.extname(filePath);
  const content = await readFile(filePath);
  res.writeHead(200, { 'Content-Type': mimeTypes.get(ext) || 'application/octet-stream' });
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

function sanitizeStore(data) {
  const store = sanitize(data, {
    name: 'string',
    slug: 'string',
    description: 'nullable_string',
    whatsapp_number: 'phone',
    address: 'nullable_string',
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
  return store;
}

function sanitizeDiningTable(data, creating) {
  const table = sanitize(data, {
    name: 'string',
    code: 'string',
    is_active: 'boolean'
  }, creating ? ['name'] : []);
  if ('code' in table) table.code = cleanSlug(table.code || table.name);
  if (!table.code && table.name) table.code = cleanSlug(table.name);
  if (creating && !table.code) throw httpError(422, 'Informe o código da mesa.');
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

async function requireActiveDiningTable(idOrCode) {
  const value = cleanText(idOrCode || '');
  if (!value) throw httpError(422, 'Mesa não informada.');
  const query = {
    select: '*',
    is_active: 'eq.true',
    limit: '1'
  };
  if (/^[a-f0-9-]{36}$/i.test(value)) query.id = `eq.${value}`;
  else query.code = `eq.${cleanSlug(value)}`;
  const rows = await supabase('GET', 'dining_tables', query);
  if (!rows[0]) throw httpError(422, 'Mesa não encontrada ou inativa.');
  return rows[0];
}

async function requireOpenTab(tabId, tableId) {
  const id = cleanText(tabId || '');
  let rows = [];
  if (id) {
    rows = await supabase('GET', 'customer_tabs', {
      select: '*',
      id: `eq.${id}`,
      status: 'eq.open',
      limit: '1'
    });
  } else if (tableId) {
    rows = await supabase('GET', 'customer_tabs', {
      select: '*',
      dining_table_id: `eq.${tableId}`,
      status: 'eq.open',
      limit: '1'
    });
  }
  if (!rows[0]) throw httpError(422, 'Comanda aberta não encontrada.');
  return rows[0];
}

async function findOpenTabForTable(tableId) {
  const id = cleanText(tableId || '');
  if (!id) return null;
  const rows = await supabase('GET', 'customer_tabs', {
    select: '*',
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
    payment_method: 'forma de pagamento'
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
    role: admin.role
  };
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
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(data));
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

function createPublicCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase() + Date.now().toString(36).slice(-4).toUpperCase();
}

function cleanText(value) {
  return String(value ?? '').trim().slice(0, 500);
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



