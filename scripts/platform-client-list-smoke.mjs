import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/platform.html', import.meta.url), 'utf8');

let helpers = null;
try {
  await import('../public/platform-client-list.js');
  helpers = globalThis.PlatformClientList;
} catch {}

assert.ok(helpers, 'A lista compacta de clientes precisa expor seus comportamentos reutilizáveis.');
assert.match(html, /platform-client-list\.js\?v=20260930-attention-filter/, 'A Central precisa invalidar o cache do filtro de clientes com atenção.');
assert.match(html, /platform\.js\?v=20260930-attention-filter/, 'A Central precisa invalidar o cache da renderização dos alertas.');

const ordered = helpers.sortCompaniesAlphabetically([
  { id: '3', name: 'Xis do João' },
  { id: '1', name: 'Água na Boca' },
  { id: '2', name: 'Burger Central' }
]);

assert.deepEqual(
  ordered.map((company) => company.id),
  ['1', '2', '3'],
  'Clientes devem ser ordenados alfabeticamente em português.'
);

assert.deepEqual(
  helpers.companiesEligibleForAttention([
    { id: 'real', status: 'trial' },
    { id: 'demo', status: 'active', excluded_from_metrics: true },
    { id: 'archived', status: 'archived' },
    { id: 'cancelled', status: 'cancelled' }
  ]).map((company) => company.id),
  ['real'],
  'Alertas não devem incluir demonstrações nem clientes em estado final.'
);

assert.equal(
  helpers.compactClientSummary({
    company: { name: 'Burger Central', billing_email: 'financeiro@burger.test', phone: '55999999999', created_at: '2026-09-01T12:00:00.000Z' },
    responsible: { name: 'Maria', email: 'maria@burger.test' },
    store: { name: 'Burger Centro', slug: 'burger-centro' },
    planName: 'Essencial',
    status: 'active',
    ordersMonth: 12,
    revenueLabel: 'R$ 540,00'
  }).length,
  9,
  'O retângulo compacto deve reunir as nove informações principais do cliente.'
);

console.log('Platform client list smoke: OK');
