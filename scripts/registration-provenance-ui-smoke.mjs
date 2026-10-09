import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/platform.html', import.meta.url), 'utf8');
const platformJs = readFileSync(new URL('../public/platform.js', import.meta.url), 'utf8');
const assistedJs = readFileSync(new URL('../public/platform-assisted-registration.js', import.meta.url), 'utf8');

await import('../public/platform-client-list.js');
const helpers = globalThis.PlatformClientList;

for (const field of ['creation_source', 'creation_purpose', 'created_by_admin_id', 'customer_access']) {
  assert.match(html, new RegExp(`name="${field}"`), `Filtro ausente: ${field}`);
}
assert.match(html, /name="creation_purpose"[^>]*required/, 'Finalidade deve ser obrigatória no cadastro assistido.');
assert.match(html, /name="creation_note"[^>]*required/, 'Observação deve ser obrigatória no cadastro assistido.');
assert.match(html, /id="platformCompanyCreateForm"[\s\S]*name="creation_purpose"[^>]*required[\s\S]*name="creation_note"[^>]*required/, 'Criação manual deve exigir finalidade e nota.');
assert.ok(assistedJs.includes('lead_capture') && assistedJs.includes('declared_source'), 'Captação de lead deve exigir um canal conhecido.');
assert.doesNotMatch(assistedJs, /created_by_admin_id\s*:/, 'A interface nunca deve enviar o ID do operador.');

for (const source of ['self_service', 'platform_admin', 'assisted', 'sales_automation', 'import', 'api']) {
  assert.notEqual(helpers.registrationSourceLabel(source), source, `Origem sem rótulo: ${source}`);
}
for (const purpose of ['customer_request', 'lead_capture', 'internal_test', 'migration', 'demo']) {
  assert.notEqual(helpers.registrationPurposeLabel(purpose), purpose, `Finalidade sem rótulo: ${purpose}`);
}
assert.equal(helpers.registrationProvenanceLabel({ state: 'legacy_untracked' }), 'Legado sem rastreamento');
assert.equal(helpers.customerAccessLabel(null), 'Cliente nunca acessou');
assert.match(helpers.customerAccessLabel('2026-01-15T12:00:00.000Z'), /09:00/, 'Datas precisam usar o fuso de São Paulo.');
assert.equal(
  helpers.buildCompanyFilterQuery({ creationSource: 'sales_automation', creationPurpose: 'lead_capture', createdByAdminId: '00000000-0000-4000-8000-000000000001', customerAccess: 'never', page: 2, perPage: 25 }),
  'creation_source=sales_automation&creation_purpose=lead_capture&created_by_admin_id=00000000-0000-4000-8000-000000000001&customer_access=never&page=2&per_page=25'
);
assert.ok(platformJs.includes('registrationProvenanceLabel') && platformJs.includes('customerAccessLabel'), 'Lista e detalhe devem exibir rastreabilidade e último acesso.');
assert.match(html, /platform-client-list\.js\?v=20261008-registration-provenance/);
assert.match(html, /platform\.js\?v=20261008-registration-provenance/);
assert.match(html, /platform\.css\?v=20261008-registration-provenance/);
assert.ok(platformJs.includes('state.creationCreators') && platformJs.includes('Criado por'), 'Filtro e card precisam preservar e exibir o criador.');

console.log('Registration provenance UI smoke: OK');
