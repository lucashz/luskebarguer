import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pbkdf2Sync } from 'node:crypto';
import { activationTokenHash, publishAssistedRegistration } from '../src/lib/assisted-registration-publish.js';
import { filterPlatformMetricsData, isPlatformPublishedStore, isPlatformRevenueSubscription } from '../src/lib/platform-metrics-exclusions.js';

assert.equal(typeof publishAssistedRegistration, 'function');
assert.equal(activationTokenHash('fixture-token'), pbkdf2Sync('fixture-token', 'admin_account_activation', 120000, 32, 'sha256').toString('hex'), 'Token assistido precisa usar o mesmo hash da ativação existente.');
const pendingCompany = { id: '44444444-4444-4444-8444-444444444444', status: 'onboarding' };
const filtered = filterPlatformMetricsData({ companies: [pendingCompany], stores: [{ id: '55555555-5555-4555-8555-555555555555', company_id: pendingCompany.id, is_active: false }], subscriptions: [{ company_id: pendingCompany.id, status: 'pending_activation' }] });
assert.equal(filtered.companies.filter((company) => company.status === 'active').length, 0);
assert.equal(filtered.stores.filter((store) => store.is_active).length, 0);
assert.equal(filtered.subscriptions.filter((subscription) => ['active', 'trial'].includes(subscription.status)).length, 0);
assert.equal(isPlatformRevenueSubscription({ status: 'pending_activation' }), false);
assert.equal(isPlatformPublishedStore({ is_active: false }, pendingCompany), false);

const api = spawnSync(process.execPath, ['scripts/assisted-registration-api-smoke.mjs'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
assert.equal(api.status, 0, api.stderr || api.stdout);
assert.match(api.stdout, /Assisted registration API smoke: OK/);
console.log('Assisted registration publish smoke: OK');
