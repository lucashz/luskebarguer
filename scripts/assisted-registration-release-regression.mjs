import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const publisher = readFileSync(new URL('../src/lib/assisted-registration-publish.js', import.meta.url), 'utf8');
const store = readFileSync(new URL('../src/lib/assisted-registration-store.js', import.meta.url), 'utf8');

assert.match(server, /extractAssistedMenu\(\{[\s\S]{0,400}aiRequest:/, 'A rota de importação precisa ligar a extração visual.');
assert.doesNotMatch(server, /text:\s*cleanText\(body\.text/, 'Cardápio colado não pode usar o limite genérico de 500 caracteres.');
assert.match(server, /recordTrustedMarketingEvent\('signup_completed'/, 'Ativação precisa registrar evento interno confiável.');
assert.match(server, /whatsapp_click/, 'Cliques no WhatsApp precisam permanecer na allowlist pública.');
assert.match(server, /expected_version/, 'Revisão precisa validar a versão esperada.');
assert.match(server, /assistedResendMatch[\s\S]{0,1800}for update[\s\S]{0,500}registration\.status !== 'published'/i, 'Reenvio precisa coordenar estado por bloqueio transacional.');
assert.match(publisher, /onboarding_completed\)[^\n]+true/, 'Loja pronta precisa pular onboarding incompleto.');
assert.match(publisher, /public_url,is_active\)[^\n]+true/, 'Cardápio publicado precisa ficar acessível no link enviado.');
assert.match(store, /admin_users/, 'Duplicidade precisa considerar administradores existentes.');
assert.match(publisher, /assertAssistedIdentityComplete/, 'Publicação precisa exigir identidade completa.');

console.log('Assisted registration release regression: OK');
