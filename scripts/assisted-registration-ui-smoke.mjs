import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/platform.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/platform.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../public/platform-assisted-registration.js', import.meta.url), 'utf8');

assert.match(html, /data-platform-view="assisted"[^>]*>[\s\S]*Cadastros assistidos/i);
assert.match(html, /data-platform-section="assisted"/);
assert.match(html, /<script[^>]+platform-assisted-registration\.js\?v=20260930-review-guard/, 'A Central precisa invalidar o cache do módulo com a correção da revisão.');
for (const step of ['Contato', 'Estabelecimento', 'Operação', 'Diagnóstico', 'Identidade', 'Cardápio']) assert.ok(html.includes(step), `Etapa ausente: ${step}`);
for (const status of ['new', 'in_progress', 'awaiting_menu', 'reviewing_menu', 'ready_to_publish', 'published', 'activated', 'cancelled']) assert.ok(js.includes(status), `Estado ausente: ${status}`);
for (const endpoint of ['/assisted-registrations', '/files', '/import', '/menu-draft', '/review', '/publish', '/resend-activation']) assert.ok(js.includes(endpoint), `Integração ausente: ${endpoint}`);
assert.ok(js.includes('expected_version'), 'Autosave precisa enviar a versão esperada.');
assert.ok(js.includes("expected_version:menuDraft.version"), 'Confirmação da revisão precisa informar a versão vista pelo operador.');
assert.ok(js.includes('update_category') && js.includes('update_item') && js.includes('delete_item'), 'Revisor precisa editar categorias e produtos em linha.');
assert.ok(js.includes('add_category') && js.includes('add_item') && js.includes('duplicate_item'), 'Revisor precisa completar itens ou categorias ausentes.');
assert.ok(js.includes('data_base64') && html.includes('accept="image/jpeg'), 'Upload precisa converter formatos aceitos.');
assert.ok(html.includes('assistedOriginalPanel') && html.includes('assistedInterpretedPanel'), 'Revisor precisa mostrar original e interpretado.');
assert.ok(html.includes('assistedPublishConfirm') && html.includes('Reenviar e-mail'), 'Publicação precisa de confirmação e reenvio.');
assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*\.assisted-review-grid/);
for (const field of ['address','whatsapp','fulfillment','payment_methods','neighborhoods','declared_source']) assert.match(html, new RegExp(`name="${field}"`), `Pergunta operacional ausente: ${field}`);
for (const field of ['business_story','order_channels','order_pain','current_menu','organized_orders_value','trial_interest']) assert.match(html, new RegExp(`name="${field}"`), `Pergunta de descoberta ausente: ${field}`);
assert.ok(html.includes('Conhecer o negócio') && html.includes('Vamos deixar tudo pronto'), 'O diagnóstico precisa aparecer antes do cadastro formal.');
assert.ok(js.includes('discovery') && js.includes('trial_interest') && js.includes('assistedRegistrationFields'), 'As respostas de descoberta precisam ser preservadas e liberar o cadastro.');
assert.match(js, /if\s*\(!active\?\.id\s*\|\|\s*!menuDraft\?\.version\)\s*return alertMessage/, 'A revisão deve orientar o operador quando ainda não há cadastro e rascunho ativos.');
assert.match(js, /if\s*\(!registration\)\s*\{\s*menuDraft\s*=\s*null;\s*renderDraft\(\);\s*\}/, 'Um novo atendimento não pode reutilizar o rascunho do cadastro anterior.');
console.log('Assisted registration UI smoke: OK');
