import assert from 'node:assert/strict';

let helpers = null;
try {
  await import('../public/platform-client-list.js');
  helpers = globalThis.PlatformClientList;
} catch {}

assert.ok(helpers, 'A lista compacta de clientes precisa expor seus comportamentos reutilizáveis.');

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
