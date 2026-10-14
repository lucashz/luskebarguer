import assert from 'node:assert/strict';
import {
  ASSISTED_REGISTRATION_STATUSES,
  assertAssistedTransition,
  normalizeDocument,
  publicAssistedRegistration,
  sanitizeAssistedAnswers,
  validateDocument
} from '../src/lib/assisted-registration.js';

assert.deepEqual(ASSISTED_REGISTRATION_STATUSES, [
  'new', 'in_progress', 'awaiting_menu', 'interpreting_menu', 'reviewing_menu',
  'ready_for_preview', 'preview_created', 'preview_reviewed',
  'published', 'activated', 'cancelled'
]);

assert.equal(normalizeDocument('529.982.247-25'), '52998224725');
assert.equal(normalizeDocument('11.222.333/0001-81'), '11222333000181');
assert.equal(validateDocument('529.982.247-25'), '52998224725');
assert.equal(validateDocument('11.222.333/0001-81'), '11222333000181');
assert.throws(() => validateDocument('111.111.111-11'), /CPF inválido/);
assert.throws(() => validateDocument('11.111.111\/1111-11'), /CNPJ inválido/);
assert.throws(() => validateDocument('123'), /CPF ou CNPJ/);

assert.equal(assertAssistedTransition('new', 'in_progress'), 'in_progress');
assert.equal(assertAssistedTransition('in_progress', 'awaiting_menu'), 'awaiting_menu');
assert.equal(assertAssistedTransition('reviewing_menu', 'ready_for_preview'), 'ready_for_preview');
assert.equal(assertAssistedTransition('ready_for_preview', 'preview_created'), 'preview_created');
assert.equal(assertAssistedTransition('preview_created', 'preview_reviewed'), 'preview_reviewed');
assert.equal(assertAssistedTransition('preview_reviewed', 'published'), 'published');
assert.equal(assertAssistedTransition('published', 'activated'), 'activated');
assert.equal(assertAssistedTransition('in_progress', 'cancelled'), 'cancelled');
assert.throws(() => assertAssistedTransition('new', 'published'), /Transição inválida/);
assert.throws(() => assertAssistedTransition('activated', 'in_progress'), /Transição inválida/);

const answers = sanitizeAssistedAnswers({
  discovery: { business_story: 'Lancheria familiar', order_channels: 'WhatsApp', order_pain: 'Mensagens acumuladas', current_menu: 'PDF', organized_orders_value: 'Ajudaria muito', trial_interest: 'yes', ignored: 'x' },
  contact: { name: '  Ana   Silva ', email: ' ANA@EXAMPLE.COM ', phone: '(55) 99999-0000', ignored: 'x' },
  establishment: { name: '  Pizzaria da Ana ', niche: 'Pizzaria', city: 'Horizontina', address: 'Rua A, 10', instagram: '@ana', whatsapp: '55999990000' },
  operation: { fulfillment: ['delivery', 'pickup', 'invalid'], payment_methods: ['Pix', 'Dinheiro'], hours: '18h às 23h', neighborhoods: 'Centro', average_orders: '30' },
  diagnosis: { biggest_pain: 'Pedidos errados', wrong_items: true, updated_prices: false, order_tracking: 'Papel' },
  branding: { notes: 'Usar vermelho', theme_color: '#ff0000', secret: 'não pode' },
  password: 'nunca', token: 'nunca'
});
assert.deepEqual(answers.contact, { name: 'Ana Silva', email: 'ana@example.com', phone: '55999990000' });
assert.deepEqual(answers.operation.fulfillment, ['delivery', 'pickup']);
assert.deepEqual(answers.discovery, { business_story: 'Lancheria familiar', order_channels: 'WhatsApp', order_pain: 'Mensagens acumuladas', current_menu: 'PDF', organized_orders_value: 'Ajudaria muito', trial_interest: 'yes' });
assert.equal(answers.password, undefined);
assert.equal(answers.token, undefined);
assert.equal(answers.contact.ignored, undefined);
assert.equal(answers.branding.secret, undefined);

const dto = publicAssistedRegistration({
  id: '00000000-0000-4000-8000-000000000001',
  status: 'reviewing_menu',
  responsible_name: 'Ana Silva',
  phone: '55999990000',
  email: 'ana@example.com',
  establishment_name: 'Pizzaria da Ana',
  document_normalized: '52998224725',
  answers,
  attribution: { utm_source: 'instagram', utm_campaign: 'delivery' },
  version: 3,
  created_at: '2026-09-28T12:00:00.000Z',
  updated_at: '2026-09-28T13:00:00.000Z',
  publish_key: 'secret-key',
  activation_token: 'secret-token',
  storage_key: 'private/file.pdf'
});
assert.equal(dto.document_masked, '***.***.***-25');
assert.equal(dto.document_normalized, undefined);
assert.equal(dto.publish_key, undefined);
assert.equal(dto.activation_token, undefined);
assert.equal(dto.storage_key, undefined);
assert.equal(JSON.stringify(dto).includes('secret'), false);

console.log('Assisted registration domain: OK');
