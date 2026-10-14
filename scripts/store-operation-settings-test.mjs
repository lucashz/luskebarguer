import assert from 'node:assert/strict';
import {
  BUSINESS_DAY_KEYS,
  PAYMENT_METHOD_PRESETS,
  sanitizeBusinessHours,
  sanitizeFulfillmentMethods,
  sanitizePaymentMethods
} from '../src/lib/store-operation-settings.js';

assert.deepEqual(PAYMENT_METHOD_PRESETS, ['Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito', 'Pagamento online', 'Vale refeição']);
assert.deepEqual(BUSINESS_DAY_KEYS, ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
assert.deepEqual(sanitizePaymentMethods([' pix ', 'Pix', 'cartao de credito', 'Alelo', 'alelo', '<script>']), ['Pix', 'Cartão de crédito', 'Alelo']);
assert.deepEqual(sanitizeFulfillmentMethods(['pickup', 'delivery', 'pickup', 'invalid', 'counter']), ['pickup', 'delivery', 'counter']);

const hours = sanitizeBusinessHours({
  monday: { open: '18:00', close: '23:30', closed: false },
  tuesday: { open: '', close: '', closed: true },
  wednesday: { open: '25:00', close: '22:00', closed: false },
  thursday: { open: '18:00', close: '', closed: false }
});
assert.deepEqual(Object.keys(hours), BUSINESS_DAY_KEYS);
assert.deepEqual(hours.monday, { open: '18:00', close: '23:30', closed: false });
assert.deepEqual(hours.tuesday, { open: '', close: '', closed: true });
assert.deepEqual(hours.wednesday, { open: '', close: '', closed: true });
assert.deepEqual(hours.thursday, { open: '', close: '', closed: true });
assert.deepEqual(hours.sunday, { open: '', close: '', closed: true });

console.log('Store operation settings: OK');
