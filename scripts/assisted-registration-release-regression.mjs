import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const preview = readFileSync(new URL('../src/lib/assisted-registration-preview.js', import.meta.url), 'utf8');
const store = readFileSync(new URL('../src/lib/assisted-registration-store.js', import.meta.url), 'utf8');
const importRun = readFileSync(new URL('../src/lib/assisted-menu-import-run.js', import.meta.url), 'utf8');

assert.match(server, /function assistedImportDependencies\(\)[\s\S]{0,500}extract:\s*extractAssistedMenu[\s\S]{0,300}aiRequest:/, 'A rota de importação precisa ligar a extração visual.');
assert.doesNotMatch(server, /text:\s*cleanText\(body\.text/, 'Cardápio colado não pode usar o limite genérico de 500 caracteres.');
assert.match(server, /recordTrustedMarketingEvent\('signup_completed'/, 'Ativação precisa registrar evento interno confiável.');
assert.match(server, /whatsapp_click/, 'Cliques no WhatsApp precisam permanecer na allowlist pública.');
assert.match(server, /expected_version/, 'Revisão precisa validar a versão esperada.');
assert.match(preview, /onboarding_completed\)[^\n]+true/, 'Loja pronta precisa pular onboarding incompleto.');
assert.match(preview, /public_url,is_active\)[^\n]+false/, 'Prévia precisa manter a loja fora do público.');
assert.doesNotMatch(preview, /admin_activation_tokens|sendAssistedActivationEmail/, 'Prévia não pode criar token nem enviar e-mail.');
assert.doesNotMatch(server, /assisted-registrations\\\/\(\[0-9a-f-\]\{36\}\)\\\/publish/, 'O endpoint legado não pode permitir publicação antes da revisão da prévia.');
assert.match(store, /admin_users/, 'Duplicidade precisa considerar administradores existentes.');
assert.match(preview, /assertAssistedIdentityComplete/, 'Prévia precisa exigir identidade completa.');
assert.match(server, /activateAssistedAdminAccount[\s\S]{0,3500}status='trial'[\s\S]{0,800}interval '7 days'[\s\S]{0,1200}status='activated'/, 'A senha do cliente deve iniciar exatamente sete dias de trial e ativar o cadastro.');
assert.match(server, /activateAssistedAdminAccount[\s\S]{0,2500}admin_user_store_access set is_active=true/, 'A ativação precisa liberar o vínculo do administrador com a loja.');
assert.match(importRun, /assisted_registrations[\s\S]{0,300}for update/, 'O commit da importação precisa bloquear e validar o estado atual do cadastro.');
assert.match(server, /pending_activation[\s\S]{0,160}suspended/, 'Empresas aguardando ativação não podem receber pedidos na prévia.');
assert.match(server, /resendAdminActivationEmail[\s\S]{0,1800}assisted_registrations/, 'O reenvio público não pode emitir token para cadastro assistido.');
const previewMutationStart = server.indexOf("if (registrationId && method !== 'GET'");
const previewLock = server.indexOf('lockAssistedRegistration', previewMutationStart);
const previewWrite = server.indexOf('return db(method, table', previewLock);
assert.ok(previewMutationStart >= 0 && previewLock > previewMutationStart && previewWrite > previewLock, 'Invalidação e alteração da prévia precisam compartilhar a mesma transação e bloqueio.');

console.log('Assisted registration release regression: OK');
