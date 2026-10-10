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
assert.match(implementation, /creation_source: `eq\.\$\{filters\.creationSource\}`/);
assert.match(implementation, /creation_purpose: `eq\.\$\{filters\.creationPurpose\}`/);
assert.match(implementation, /created_by_admin_id: `eq\.\$\{filters\.createdByAdminId\}`/);
assert.match(implementation, /last_customer_login_at: filters\.customerAccess === 'never' \? 'is\.null' : 'not\.is\.null'/);
assert.match(implementation, /last_access_at: company\.last_customer_login_at \|\| null/);
assert.match(implementation, /customer_access_state: company\.last_customer_login_at \? 'accessed' : 'never'/);
assert.match(implementation, /provenance: platformCompanyProvenance\(company\)/);
assert.match(source, /legacy_untracked/);
assert.match(source, /'company\.created': 'Cadastro criado'/);
assert.match(implementation, /creation_creators:/, 'Lista precisa expor criadores independentemente da pagina filtrada.');
assert.match(source, /action: 'eq\.company\.created'[\s\S]*limit: '1'/, 'Detalhe precisa buscar o evento original separadamente.');
assert.match(source, /source: 'api'[\s\S]*systemActor: 'default-store-bootstrap'/, 'Bootstrap de empresa precisa usar a proveniencia compartilhada.');

const cleanupSource = await readFile(new URL('./cleanup-logs.mjs', import.meta.url), 'utf8');
assert.match(cleanupSource, /action <> 'company\.created'/, 'Limpeza de logs precisa preservar o evento canonico de criacao.');

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
