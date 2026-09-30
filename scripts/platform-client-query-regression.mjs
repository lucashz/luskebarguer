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

console.log('Consultas da lista de clientes usam colunas existentes.');
