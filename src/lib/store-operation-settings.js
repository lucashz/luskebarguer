export const PAYMENT_METHOD_PRESETS = Object.freeze([
  'Pix',
  'Dinheiro',
  'Cartão de débito',
  'Cartão de crédito',
  'Pagamento online',
  'Vale refeição'
]);

export const BUSINESS_DAY_KEYS = Object.freeze([
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
]);

const PAYMENT_ALIASES = new Map([
  ['pix', 'Pix'],
  ['dinheiro', 'Dinheiro'],
  ['cartao de debito', 'Cartão de débito'],
  ['cartao de credito', 'Cartão de crédito'],
  ['pagamento online', 'Pagamento online'],
  ['vale refeicao', 'Vale refeição']
]);

export function sanitizePaymentMethods(input) {
  const values = Array.isArray(input) ? input : [];
  const seen = new Set();
  return values.map((value) => cleanLabel(value, 80)).filter(Boolean).map((value) => {
    const normalized = normalizeName(value);
    return PAYMENT_ALIASES.get(normalized) || value;
  }).filter((value) => {
    const key = normalizeName(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}

export function sanitizeFulfillmentMethods(input) {
  return [...new Set((Array.isArray(input) ? input : []).map(String).filter((value) => ['delivery', 'pickup', 'counter'].includes(value)))];
}

export function sanitizeBusinessHours(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return Object.fromEntries(BUSINESS_DAY_KEYS.map((day) => {
    const entry = source[day] && typeof source[day] === 'object' ? source[day] : {};
    const closed = entry.closed === true;
    const open = validTime(entry.open) ? String(entry.open) : '';
    const close = validTime(entry.close) ? String(entry.close) : '';
    return [day, closed || !open || !close
      ? { open: '', close: '', closed: true }
      : { open, close, closed: false }];
  }));
}

function validTime(value) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
}

function cleanLabel(value, max) {
  return String(value || '').replace(/<[^>]*>/g, '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeName(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
