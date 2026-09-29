import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/platform.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/platform.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../public/platform-assisted-registration.js', import.meta.url), 'utf8');

assert.match(html, /data-platform-view="assisted"[^>]*>[\s\S]*Cadastros assistidos/i);
assert.match(html, /data-platform-section="assisted"/);
for (const step of ['Contato', 'Estabelecimento', 'Operação', 'Diagnóstico', 'Identidade', 'Cardápio']) assert.ok(html.includes(step), `Etapa ausente: ${step}`);
for (const status of ['new', 'in_progress', 'awaiting_menu', 'reviewing_menu', 'ready_to_publish', 'published', 'activated', 'cancelled']) assert.ok(js.includes(status), `Estado ausente: ${status}`);
for (const endpoint of ['/assisted-registrations', '/files', '/import', '/menu-draft', '/review', '/publish', '/resend-activation']) assert.ok(js.includes(endpoint), `Integração ausente: ${endpoint}`);
assert.ok(js.includes('expected_version'), 'Autosave precisa enviar a versão esperada.');
assert.ok(js.includes('update_category') && js.includes('update_item') && js.includes('delete_item'), 'Revisor precisa editar categorias e produtos em linha.');
assert.ok(js.includes('data_base64') && html.includes('accept="image/jpeg'), 'Upload precisa converter formatos aceitos.');
assert.ok(html.includes('assistedOriginalPanel') && html.includes('assistedInterpretedPanel'), 'Revisor precisa mostrar original e interpretado.');
assert.ok(html.includes('assistedPublishConfirm') && html.includes('Reenviar e-mail'), 'Publicação precisa de confirmação e reenvio.');
assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*\.assisted-review-grid/);
console.log('Assisted registration UI smoke: OK');
