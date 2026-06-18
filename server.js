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
const SESSION_MAX_AGE = 60 * 60 * 24 * 180;
const SESSION_RENEW_MS = 1000 * 60 * 60 * 24 * 30;
const PUBLIC_BOOTSTRAP_CACHE_MS = 1000 * 20;
let publicBootstrapCache = null;

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
      detail: error.detail || undefined
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Servidor Node iniciado em http://${HOST}:${PORT}`);
});

async function handleApi(req, res, url) {
  const method = req.method || 'GET';

  if (method === 'GET' && url.pathname === '/api/health') {
    json(res, 200, { ok: true });
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    json(res, 500, {
      error: 'Supabase nao configurado.',
      detail: 'Preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no arquivo .env.'
    });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/bootstrap') {
    json(res, 200, await getPublicBootstrap(), {
      'Cache-Control': 'public, max-age=15, stale-while-revalidate=45'
    });
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

  if (method === 'GET' && url.pathname === '/api/admin/setup-status') {
    json(res, 200, { has_admin: await hasAdminUser() });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/admin/setup') {
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
      customers: await listCustomers()
    });
    return;
  }

  if (method === 'PUT' && url.pathname === '/api/admin/store') {
    if (!(await requireAdmin(req, res))) return;
    const result = await updateStoreSettings(await readJson(req));
    clearPublicBootstrapCache();
    json(res, 200, result);
    return;
  }

  if (method === 'GET' && url.pathname === '/api/admin/orders') {
    if (!(await requireAdmin(req, res))) return;
    json(res, 200, { orders: await listOrders() });
    return;
  }

  const orderStatusMatch = url.pathname.match(/^\/api\/admin\/orders\/([a-f0-9-]+)\/status$/i);
  if (orderStatusMatch && method === 'PATCH') {
    if (!(await requireAdmin(req, res))) return;
    const body = await readJson(req);
    if (!orderStatuses.has(body.status)) {
      throw httpError(422, 'Status de pedido invalido.');
    }
    json(res, 200, await supabase('PATCH', 'orders', { id: `eq.${orderStatusMatch[1]}` }, {
      status: body.status
    }, ['Prefer: return=representation']));
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

  json(res, 404, { error: 'Rota nao encontrada.' });
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
    throw httpError(409, 'A primeira conta admin ja foi criada.');
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
    throw httpError(401, 'E-mail ou senha invalidos.');
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

  if (!rows[0]) throw httpError(404, 'Admin nao encontrado.');
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
      throw httpError(409, 'Este telefone ja possui cadastro. Entre com sua senha.');
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
    throw httpError(401, 'Telefone ou senha invalidos.');
  }

  await supabase('PATCH', 'customers', { id: `eq.${customer.id}` }, {
    last_login_at: new Date().toISOString()
  }, ['Prefer: return=representation']);

  return createCustomerSession(customer);
}

async function resetCustomerPassword(data) {
  const phone = onlyDigits(data.phone);
  const orderCode = cleanText(data.order_code || '').replace(/^#/, '').toUpperCase();
  const newPassword = validatePassword(data.new_password);
  if (!phone || !orderCode) throw httpError(422, 'Informe telefone e codigo de um pedido.');

  const customers = await supabase('GET', 'customers', {
    select: 'id,phone',
    phone: `eq.${phone}`,
    limit: '1'
  });
  const customer = customers[0];
  if (!customer) throw httpError(401, 'Nao foi possivel validar os dados informados.');

  const orders = await supabase('GET', 'orders', {
    select: 'id,customer_id,public_code',
    customer_id: `eq.${customer.id}`,
    public_code: `eq.${orderCode}`,
    limit: '1'
  });
  if (!orders[0]) throw httpError(401, 'Nao foi possivel validar os dados informados.');

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
    select: 'id,name,phone,email,notes,created_at,updated_at',
    id: `eq.${customerId}`,
    limit: '1'
  });
  if (!rows[0]) throw httpError(404, 'Cliente nao encontrado.');
  const addresses = await listCustomerAddresses(customerId);
  return { ...rows[0], address: addresses[0] || null, addresses };
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

async function updateCustomerByAdmin(customerId, data) {
  const customer = sanitizeCustomer(data.customer || data);
  const payload = { ...customer };
  if (data.password) payload.password_hash = hashPassword(validatePassword(data.password));
  const [updated] = await supabase('PATCH', 'customers', { id: `eq.${customerId}` }, payload, ['Prefer: return=representation']);
  if (!updated) throw httpError(404, 'Cliente nao encontrado.');
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
  if (!updated) throw httpError(404, 'Endereco nao encontrado.');
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

  return rows[0] || {
    name: 'Menu da Casa',
    description: 'Pedido rapido pelo cardapio digital.',
    whatsapp_number: STORE_WHATSAPP_NUMBER,
    is_open: true,
    accepts_delivery: true,
    accepts_pickup: true,
    delivery_fee: 0,
    minimum_order: 0,
    payment_methods: ['Pix', 'Cartao', 'Dinheiro']
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

async function getMenu(admin) {
  const [categories, items] = await Promise.all([
    supabase('GET', 'menu_categories', {
      select: admin ? '*' : 'id,name,description,sort_order',
      ...(admin ? {} : { is_active: 'eq.true' }),
      order: 'sort_order.asc,name.asc'
    }),
    supabase('GET', 'menu_items', {
      select: admin ? '*' : 'id,category_id,name,description,price,image_url,tags,is_featured,is_available,sort_order',
      ...(admin ? {} : { is_available: 'eq.true' }),
      order: 'sort_order.asc,name.asc'
    })
  ]);

  const byCategory = new Map(categories.map((category) => [category.id, { ...category, items: [] }]));
  for (const item of items) {
    byCategory.get(item.category_id)?.items.push(item);
  }

  return [...byCategory.values()];
}

async function createOrder(req, data) {
  const session = await readPersistentSession(parseCookies(req)[CUSTOMER_COOKIE], 'customer');
  const customer = sanitizeCustomer(data.customer || {});
  const fulfillmentMethod = data.fulfillment_method === 'pickup' ? 'pickup' : 'delivery';
  const address = fulfillmentMethod === 'delivery' ? sanitizeAddress(data.address || {}) : null;
  const paymentMethod = cleanText(data.payment_method || '');
  const notes = cleanText(data.notes || '');
  const requestedItems = Array.isArray(data.items) ? data.items : [];

  if (!paymentMethod) throw httpError(422, 'Informe a forma de pagamento.');
  if (requestedItems.length === 0) throw httpError(422, 'Inclua ao menos um item no pedido.');

  const itemIds = [...new Set(requestedItems.map((item) => cleanText(item.id)).filter(Boolean))];
  if (itemIds.length === 0) throw httpError(422, 'Itens do pedido invalidos.');

  const menuItems = await supabase('GET', 'menu_items', {
    select: '*',
    id: `in.(${itemIds.join(',')})`,
    is_available: 'eq.true'
  });

  const menuById = new Map(menuItems.map((item) => [item.id, item]));
  const orderItems = requestedItems.map((requested) => {
    const menuItem = menuById.get(cleanText(requested.id));
    if (!menuItem) throw httpError(422, 'Um item escolhido nao esta mais disponivel.');

    const quantity = clampInteger(requested.quantity, 1, 99);
    const unitPrice = moneyNumber(menuItem.price);
    return {
      menu_item_id: menuItem.id,
      item_snapshot: {
        id: menuItem.id,
        name: menuItem.name,
        description: menuItem.description,
        price: unitPrice,
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
  const subtotal = roundMoney(orderItems.reduce((sum, item) => sum + item.total, 0));
  const deliveryFee = fulfillmentMethod === 'delivery' ? moneyNumber(store.delivery_fee) : 0;
  const total = roundMoney(subtotal + deliveryFee);
  const customerRow = session ? await getCustomerProfile(session.data.id) : await upsertCustomer(customer);

  if (fulfillmentMethod === 'delivery') {
    await upsertAddress(customerRow.id, address);
  }

  const orderPayload = {
    public_code: createPublicCode(),
    customer_id: customerRow.id,
    status: 'new',
    fulfillment_method: fulfillmentMethod,
    payment_method: paymentMethod,
    customer_snapshot: customer,
    address_snapshot: address,
    subtotal,
    delivery_fee: deliveryFee,
    discount: 0,
    total,
    notes
  };

  const [order] = await supabase('POST', 'orders', {}, orderPayload, ['Prefer: return=representation']);
  const itemsWithOrder = orderItems.map((item) => ({ ...item, order_id: order.id }));
  await supabase('POST', 'order_items', {}, itemsWithOrder, ['Prefer: return=representation']);

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
    order: 'created_at.desc',
    limit: '100'
  });

  return attachOrderItems(orders);
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
    select: 'id,name,phone,email,notes,created_at,updated_at,last_login_at',
    order: 'created_at.desc',
    limit: '100'
  });
  return Promise.all(customers.map(async (customer) => ({
    ...customer,
    addresses: await listCustomerAddresses(customer.id)
  })));
}

async function uploadImage(data) {
  const fileName = cleanFileName(data.fileName || 'produto.jpg');
  const contentType = cleanText(data.contentType || 'image/jpeg');
  const base64 = String(data.dataBase64 || '').replace(/^data:[^;]+;base64,/, '');

  if (!base64) throw httpError(422, 'Arquivo de imagem ausente.');
  if (!contentType.startsWith('image/')) throw httpError(422, 'Envie apenas imagens.');

  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > 5 * 1024 * 1024) throw httpError(422, 'Imagem muito grande. Limite de 5 MB.');

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
  if (requestPath === '/conta' || requestPath === '/cliente') return '/account.html';
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
    throw httpError(400, 'JSON invalido.');
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
  return sanitize(data, {
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
    minimum_order: 'float',
    payment_methods: 'array'
  }, ['name']);
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

function sanitizeCustomer(data) {
  const customer = sanitize(data, {
    name: 'string',
    phone: 'phone',
    email: 'nullable_email',
    notes: 'nullable_string'
  }, ['name', 'phone']);

  if (customer.phone.length < 10) throw httpError(422, 'Informe um telefone valido.');
  return customer;
}

function sanitizeAddress(data) {
  return sanitize(data, {
    label: 'string',
    street: 'string',
    number: 'nullable_string',
    complement: 'nullable_string',
    neighborhood: 'nullable_string',
    city: 'nullable_string',
    reference: 'nullable_string'
  }, ['street']);
}

function sanitizeAddressWithDefault(data, requireStreet) {
  return sanitize(data, {
    label: 'string',
    street: 'string',
    number: 'nullable_string',
    complement: 'nullable_string',
    neighborhood: 'nullable_string',
    city: 'nullable_string',
    reference: 'nullable_string',
    is_default: 'boolean'
  }, requireStreet ? ['street'] : []);
}

function sanitize(data, allowed, required) {
  for (const field of required) {
    if (!(field in data) || data[field] === '') {
      throw httpError(422, `Campo obrigatorio ausente: ${field}`);
    }
  }

  const clean = {};
  for (const [field, type] of Object.entries(allowed)) {
    if (!(field in data)) continue;
    const value = data[field];

    if (type === 'string') clean[field] = cleanText(value);
    if (type === 'nullable_string') clean[field] = value === null || value === '' ? null : cleanText(value);
    if (type === 'integer') clean[field] = Number.parseInt(value, 10) || 0;
    if (type === 'float') clean[field] = roundMoney(Number.parseFloat(value) || 0);
    if (type === 'boolean') clean[field] = value === true || value === 'true' || value === 'on' || value === '1';
    if (type === 'array') clean[field] = Array.isArray(value) ? value.map(cleanText).filter(Boolean) : [];
    if (type === 'phone') clean[field] = onlyDigits(value);
    if (type === 'email') clean[field] = cleanEmail(value);
    if (type === 'nullable_email') clean[field] = value ? cleanEmail(value) : null;
  }

  return clean;
}

function buildWhatsappMessage(store, order, items, customer, address) {
  const lines = [
    `Novo pedido #${order.public_code}`,
    '',
    `Cliente: ${customer.name}`,
    `Telefone: ${customer.phone}`,
    `Tipo: ${order.fulfillment_method === 'delivery' ? 'Entrega' : 'Retirada'}`,
    `Pagamento: ${order.payment_method}`,
    ''
  ];

  if (address) {
    lines.push('Endereco:');
    lines.push(`${address.street}${address.number ? `, ${address.number}` : ''}`);
    if (address.neighborhood) lines.push(`Bairro: ${address.neighborhood}`);
    if (address.complement) lines.push(`Complemento: ${address.complement}`);
    if (address.reference) lines.push(`Referencia: ${address.reference}`);
    lines.push('');
  }

  lines.push('Itens:');
  for (const item of items) {
    lines.push(`${item.quantity}x ${item.item_snapshot.name} - ${formatMoney(item.total)}`);
    if (item.notes) lines.push(`Obs: ${item.notes}`);
  }

  lines.push('');
  lines.push(`Subtotal: ${formatMoney(order.subtotal)}`);
  if (Number(order.delivery_fee) > 0) lines.push(`Entrega: ${formatMoney(order.delivery_fee)}`);
  lines.push(`Total: ${formatMoney(order.total)}`);
  if (order.notes) lines.push(`Observacoes: ${order.notes}`);
  if (store.name) lines.push('', store.name);

  return lines.join('\n');
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
  if (password.length < 8) throw httpError(422, 'A senha deve ter pelo menos 8 caracteres.');
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
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`;
}

function clearCookie(name) {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
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
  if (!email || !email.includes('@')) throw httpError(422, 'Informe um e-mail valido.');
  return email;
}

function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function clampInteger(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function moneyNumber(value) {
  return roundMoney(Number(value || 0));
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
