import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
const start = source.indexOf('async function listPlatformCompanies(');
const end = source.indexOf('\nasync function ', start + 1);
const implementation = source.slice(start, end);

assert.match(implementation, /dbRequest\('GET', 'company_subscriptions',[\s\S]*?order: 'created_at\.desc'/);
assert.match(implementation, /dbRequest\('GET', 'company_feature_overrides',[\s\S]*?order: 'created_at\.desc'/);
assert.match(implementation, /dbRequest\('GET', 'menu_items',[\s\S]*?select: 'id,store_id,is_available'/);
assert.match(implementation, /active_products_count: companyProducts\.filter\(\(item\) => item\.is_available !== false\)\.length/);

const loginStart = source.indexOf('async function loginAdmin(');
const twoFactorEnd = source.indexOf('\nasync function ', source.indexOf('async function verifyAdminTwoFactorLogin(') + 1);
const loginImplementation = source.slice(loginStart, twoFactorEnd);
assert.match(loginImplementation, /await markDirectCustomerLogin\(admin\.id\)/, 'Login direto precisa marcar acesso real do cliente.');
assert.match(loginImplementation, /safeSecretEquals[\s\S]*await markDirectCustomerLogin\(admin\.id\)/, '2FA so pode marcar acesso depois de validar o codigo.');

const impersonationStart = source.indexOf('async function startPlatformSupportImpersonation(');
const impersonationEnd = source.indexOf('\nasync function ', impersonationStart + 1);
const impersonationImplementation = source.slice(impersonationStart, impersonationEnd);
assert.doesNotMatch(impersonationImplementation, /markDirectCustomerLogin|last_customer_login_at/, 'Impersonacao nao pode contar como acesso do cliente.');

console.log('Consultas da lista de clientes usam colunas existentes.');
