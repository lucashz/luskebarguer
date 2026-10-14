import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/platform.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/platform.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../public/platform-assisted-registration.js', import.meta.url), 'utf8');

for (const id of ['assistedUploadProgress','assistedImportMode','assistedImportStatus','assistedImportRetry']) assert.ok(html.includes(id), `Feedback de importação ausente: ${id}`);
for (const id of ['assistedProductPhotoInput','assistedStoreLogoInput','assistedStoreCoverInput','assistedMediaReview']) assert.ok(html.includes(id), `Revisão de mídia ausente: ${id}`);
for (const id of ['assistedPreviewActions','assistedOpenPreview','assistedOpenMenu','assistedConfirmPreview']) assert.ok(html.includes(id), `Ação de prévia ausente: ${id}`);
assert.ok(html.includes('assistedCompleteButton') && js.includes('/complete'), 'Conclusão deve ocorrer somente depois da revisão da prévia.');
assert.ok(js.includes('/preview-access') && js.includes('/preview-review'), 'Central precisa abrir e confirmar a revisão da prévia.');
assert.ok(js.includes("||'menu_source'") && js.includes('purpose,data_base64') && js.includes('/retry'), 'Upload precisa informar finalidade e permitir retry.');

assert.match(html, /data-platform-view="assisted"[^>]*>[\s\S]*Cadastros assistidos/i);
assert.match(html, /data-platform-section="assisted"/);
assert.match(html, /<script[^>]+platform-assisted-registration\.js\?v=20261001-guided-questions/, 'A Central precisa invalidar o cache do módulo com o novo cadastro guiado.');
for (const status of ['new', 'in_progress', 'awaiting_menu', 'interpreting_menu', 'reviewing_menu', 'ready_for_preview', 'preview_created', 'preview_reviewed', 'published', 'activated', 'cancelled']) assert.ok(js.includes(status), `Estado ausente: ${status}`);
for (const endpoint of ['/assisted-registrations', '/files', '/import', '/menu-draft', '/review', '/preview', '/resend-activation']) assert.ok(js.includes(endpoint), `Integração ausente: ${endpoint}`);
assert.ok(js.includes('expected_version'), 'Autosave precisa enviar a versão esperada.');
assert.ok(js.includes("expected_version:menuDraft.version"), 'Confirmação da revisão precisa informar a versão vista pelo operador.');
assert.ok(js.includes('update_category') && js.includes('update_item') && js.includes('delete_item'), 'Revisor precisa editar categorias e produtos em linha.');
assert.ok(js.includes('add_category') && js.includes('add_item') && js.includes('duplicate_item'), 'Revisor precisa completar itens ou categorias ausentes.');
assert.ok(js.includes('data_base64') && html.includes('accept="image/jpeg'), 'Upload precisa converter formatos aceitos.');
assert.ok(html.includes('assistedOriginalPanel') && html.includes('assistedInterpretedPanel'), 'Revisor precisa mostrar original e interpretado.');
assert.ok(html.includes('assistedPublishConfirm') && html.includes('Reenviar e-mail'), 'Publicação precisa de confirmação e reenvio.');
assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*\.assisted-review-grid/);
for (const field of ['address','whatsapp','fulfillment','payment_methods','neighborhoods','declared_source']) assert.match(html, new RegExp(`name="${field}"`), `Pergunta operacional ausente: ${field}`);
for (const day of ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']) {
  assert.match(html, new RegExp(`name="${day}_open"`), `Abertura ausente: ${day}`);
  assert.match(html, new RegExp(`name="${day}_close"`), `Fechamento ausente: ${day}`);
  assert.match(html, new RegExp(`name="${day}_closed"`), `Estado fechado ausente: ${day}`);
}
assert.ok(html.includes('assisted-payment-options') && html.includes('assisted-fulfillment-options'), 'Pagamentos e atendimento devem usar botões selecionáveis.');
assert.ok(js.includes('businessHoursFromForm') && js.includes('fillBusinessHours'), 'A Central deve salvar e restaurar horários estruturados.');
assert.match(css, /\.assisted-choice[^}]*min-height:\s*44px/);
for (const field of ['business_story','order_channels','order_pain','current_menu','organized_orders_value','trial_interest']) assert.match(html, new RegExp(`name="${field}"`), `Pergunta de descoberta ausente: ${field}`);
assert.ok(html.includes('Conhecer o negócio') && html.includes('Vamos deixar tudo pronto'), 'O diagnóstico precisa aparecer antes do cadastro formal.');
assert.ok(js.includes('discovery') && js.includes('trial_interest') && js.includes('assistedRegistrationFields'), 'As respostas de descoberta precisam ser preservadas e liberar o cadastro.');
assert.match(js, /if\s*\(!active\?\.id\s*\|\|\s*!menuDraft\?\.version\)\s*return alertMessage/, 'A revisão deve orientar o operador quando ainda não há cadastro e rascunho ativos.');
assert.match(js, /if\s*\(!registration\)\s*\{\s*menuDraft\s*=\s*null;\s*renderDraft\(\);\s*\}/, 'Um novo atendimento não pode reutilizar o rascunho do cadastro anterior.');
for (const step of ['Conhecer o negócio', 'Responsável e estabelecimento', 'Como funciona', 'Montar o cardápio']) assert.ok(html.includes(step), `Nova etapa ausente: ${step}`);
for (const panel of ['discovery','identity','operation','menu']) assert.match(html, new RegExp(`data-assisted-panel="${panel}"`), `Painel guiado ausente: ${panel}`);
assert.ok(js.includes('showWizardStep') && js.includes('data-assisted-next') && js.includes('data-assisted-back'), 'O cadastro precisa navegar progressivamente entre as quatro etapas.');
console.log('Assisted registration UI smoke: OK');
