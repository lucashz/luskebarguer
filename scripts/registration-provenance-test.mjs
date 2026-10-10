import assert from 'node:assert/strict';
import {
  REGISTRATION_PURPOSES,
  REGISTRATION_SOURCES,
  normalizeRegistrationProvenance
} from '../src/lib/registration-provenance.js';

assert.deepEqual(REGISTRATION_SOURCES, ['self_service', 'assisted', 'platform_admin', 'sales_automation', 'import', 'api']);
assert.deepEqual(REGISTRATION_PURPOSES, ['customer_request', 'lead_capture', 'demo', 'migration', 'internal_test']);

const selfService = normalizeRegistrationProvenance(
  { source: 'self_service' },
  { attribution: {} }
);
assert.equal(selfService.companyFields.creation_source, 'self_service');
assert.equal(selfService.companyFields.creation_purpose, 'customer_request');
assert.equal(selfService.companyFields.created_by_admin_id, null);
assert.equal(selfService.companyFields.creation_metadata.declared_source, 'unknown');
assert.equal(selfService.auditData.attribution.declared_source, 'unknown');

for (const source of ['assisted', 'platform_admin']) {
  const result = normalizeRegistrationProvenance(
    { source, purpose: 'customer_request', note: 'Cliente solicitou a montagem.' },
    { actorAdmin: { id: '11111111-1111-4111-8111-111111111111', name: 'Lucas', email: 'lucas@example.com' }, attribution: { declared_source: 'whatsapp' } }
  );
  assert.equal(result.companyFields.creation_source, source);
  assert.equal(result.companyFields.created_by_admin_id, '11111111-1111-4111-8111-111111111111');
  assert.equal(result.companyFields.created_by_name_snapshot, 'Lucas');
  assert.equal(result.auditData.actor_name, 'Lucas');
}

for (const source of ['sales_automation', 'import', 'api']) {
  const result = normalizeRegistrationProvenance(
    { source, purpose: source === 'import' ? 'migration' : 'lead_capture', note: 'Criação automatizada.' },
    { systemActor: `${source}:primary`, attribution: { tracking_code: 'TP-123' } }
  );
  assert.equal(result.companyFields.creation_source, source);
  assert.equal(result.companyFields.created_by_admin_id, null);
  assert.equal(result.companyFields.created_by_name_snapshot, `${source}:primary`);
}

assert.throws(
  () => normalizeRegistrationProvenance({ source: 'assisted', purpose: 'customer_request', note: 'Contato válido.' }, { attribution: {} }),
  (error) => error.status === 422 && /responsável/i.test(error.message)
);
assert.throws(
  () => normalizeRegistrationProvenance({ source: 'platform_admin', purpose: 'customer_request' }, { actorAdmin: { id: '11111111-1111-4111-8111-111111111111', name: 'Lucas' } }),
  (error) => error.status === 422 && /contexto/i.test(error.message)
);
assert.throws(
  () => normalizeRegistrationProvenance({ source: 'api', purpose: 'customer_request', note: 'API.' }, { attribution: {} }),
  (error) => error.status === 422 && /sistema/i.test(error.message)
);
assert.throws(
  () => normalizeRegistrationProvenance({ source: 'assisted', purpose: 'customer_request', note: 'x'.repeat(501) }, { actorAdmin: { id: '11111111-1111-4111-8111-111111111111', name: 'Lucas' } }),
  (error) => error.status === 422 && /500/i.test(error.message)
);
assert.throws(
  () => normalizeRegistrationProvenance({ source: 'assisted', purpose: 'lead_capture', note: 'Prospecção.' }, { actorAdmin: { id: '11111111-1111-4111-8111-111111111111', name: 'Lucas' }, attribution: { declared_source: 'unknown' } }),
  (error) => error.status === 422 && /canal/i.test(error.message)
);

const sanitized = normalizeRegistrationProvenance(
  { source: 'api', purpose: 'lead_capture', note: 'Integração.', metadata: { job: 'sync', password: 'nope', nested: { access_token: 'nope', safe: 'ok' } } },
  { systemActor: 'api:crm', attribution: { utm_source: 'partner', authorization: 'nope', nested: { cookie: 'nope', campaign: 'spring' } } }
);
assert.deepEqual(sanitized.companyFields.creation_metadata, {
  job: 'sync',
  nested: { safe: 'ok' },
  utm_source: 'partner',
  declared_source: 'unknown',
  nested_attribution: { campaign: 'spring' }
});
assert.equal(JSON.stringify(sanitized.auditData).includes('nope'), false);

console.log('Registration provenance: OK');
