import assert from 'node:assert/strict';

let filterPlatformMetricsData = null;
try {
  ({ filterPlatformMetricsData } = await import('../src/lib/platform-metrics-exclusions.js'));
} catch {}

assert.equal(typeof filterPlatformMetricsData, 'function', 'A Central precisa de uma regra única para excluir contas demo das métricas.');

const demoCompanyId = 'demo-company';
const result = filterPlatformMetricsData({
  companies: [{ id: demoCompanyId }, { id: 'real-company' }],
  stores: [{ id: 'demo-store', company_id: demoCompanyId }, { id: 'real-store', company_id: 'real-company' }],
  subscriptions: [{ id: 'demo-sub', company_id: demoCompanyId }, { id: 'real-sub', company_id: 'real-company' }],
  subscriptionEvents: [{ id: 'demo-event', company_id: demoCompanyId }, { id: 'real-event', company_id: 'real-company' }],
  orders: [{ id: 'demo-order', store_id: 'demo-store' }, { id: 'real-order', store_id: 'real-store' }],
  products: [{ id: 'demo-product', store_id: 'demo-store' }, { id: 'real-product', store_id: 'real-store' }],
  settings: [{ store_id: 'demo-store' }, { store_id: 'real-store' }],
  accessEvents: [
    { id: 'demo-access', store_id: 'demo-store' },
    { id: 'landing-access', store_id: null },
    { id: 'real-access', store_id: 'real-store' }
  ],
  marketingEvents: [
    { id: 'demo-marketing', company_id: demoCompanyId },
    { id: 'anonymous-ad', company_id: null, store_id: null },
    { id: 'real-marketing', company_id: 'real-company' }
  ]
}, { excludedCompanyIds: new Set([demoCompanyId]) });

assert.deepEqual(result.companies.map((row) => row.id), ['real-company'], 'Empresa demo não pode contar como cliente ativo.');
assert.deepEqual(result.stores.map((row) => row.id), ['real-store'], 'Loja demo não pode contar como loja publicada.');
assert.deepEqual(result.subscriptions.map((row) => row.id), ['real-sub'], 'Assinatura demo não pode compor MRR.');
assert.deepEqual(result.orders.map((row) => row.id), ['real-order'], 'Pedidos demo não podem compor receita.');
assert.deepEqual(result.accessEvents.map((row) => row.id), ['landing-access', 'real-access'], 'Acessos anônimos do anúncio devem ser preservados.');
assert.deepEqual(result.marketingEvents.map((row) => row.id), ['anonymous-ad', 'real-marketing'], 'Eventos anônimos do anúncio devem ser preservados.');

console.log('Platform metrics exclusions smoke: OK');
