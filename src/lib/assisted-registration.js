export const ASSISTED_REGISTRATION_STATUSES = Object.freeze([
  'new',
  'in_progress',
  'awaiting_menu',
  'reviewing_menu',
  'ready_to_publish',
  'published',
  'activated',
  'cancelled'
]);

const TRANSITIONS = Object.freeze({
  new: new Set(['in_progress', 'cancelled']),
  in_progress: new Set(['awaiting_menu', 'reviewing_menu', 'cancelled']),
  awaiting_menu: new Set(['in_progress', 'reviewing_menu', 'cancelled']),
  reviewing_menu: new Set(['awaiting_menu', 'ready_to_publish', 'cancelled']),
  ready_to_publish: new Set(['reviewing_menu', 'published', 'cancelled']),
  published: new Set(['activated']),
  activated: new Set(),
  cancelled: new Set(['in_progress'])
});

export function normalizeDocument(value = '') {
  return String(value || '').replace(/\D/g, '');
}

export function validateDocument(value) {
  const document = normalizeDocument(value);
  if (document.length === 11) {
    if (!isValidCpf(document)) throw validationError('CPF inválido.');
    return document;
  }
  if (document.length === 14) {
    if (!isValidCnpj(document)) throw validationError('CNPJ inválido.');
    return document;
  }
  throw validationError('Informe um CPF ou CNPJ válido.');
}

export function assertAssistedTransition(from, to) {
  const current = String(from || '');
  const target = String(to || '');
  if (current === target && ASSISTED_REGISTRATION_STATUSES.includes(current)) return target;
  if (!TRANSITIONS[current]?.has(target)) throw validationError(`Transição inválida de ${current || 'desconhecido'} para ${target || 'desconhecido'}.`);
  return target;
}

export function assertAssistedIdentityComplete(value = {}) {
  const responsible_name = cleanText(value.responsible_name, 120);
  const establishment_name = cleanText(value.establishment_name, 160);
  const email = cleanEmail(value.email);
  const phone = digits(value.phone, 15);
  if (!responsible_name || !establishment_name || !email || phone.length < 10) throw validationError('Preencha responsável, WhatsApp, e-mail válido e estabelecimento antes de publicar.');
  return { responsible_name, establishment_name, email, phone };
}

export function sanitizeAssistedAnswers(value = {}) {
  const data = isObject(value) ? value : {};
  const discovery = isObject(data.discovery) ? data.discovery : {};
  const contact = isObject(data.contact) ? data.contact : {};
  const establishment = isObject(data.establishment) ? data.establishment : {};
  const operation = isObject(data.operation) ? data.operation : {};
  const diagnosis = isObject(data.diagnosis) ? data.diagnosis : {};
  const branding = isObject(data.branding) ? data.branding : {};
  return {
    discovery: {
      business_story: cleanText(discovery.business_story, 1000),
      order_channels: cleanText(discovery.order_channels, 300),
      order_pain: cleanText(discovery.order_pain, 500),
      current_menu: cleanText(discovery.current_menu, 500),
      organized_orders_value: cleanText(discovery.organized_orders_value, 1000),
      trial_interest: ['yes', 'maybe', 'no'].includes(discovery.trial_interest) ? discovery.trial_interest : ''
    },
    contact: {
      name: cleanText(contact.name, 120),
      email: cleanEmail(contact.email),
      phone: digits(contact.phone, 15)
    },
    establishment: {
      name: cleanText(establishment.name, 160),
      niche: cleanText(establishment.niche, 80),
      city: cleanText(establishment.city, 120),
      address: cleanText(establishment.address, 300),
      instagram: cleanText(establishment.instagram, 120),
      whatsapp: digits(establishment.whatsapp, 15)
    },
    operation: {
      fulfillment: [...new Set((Array.isArray(operation.fulfillment) ? operation.fulfillment : []).map(String).filter((item) => ['delivery', 'pickup', 'counter'].includes(item)))],
      payment_methods: cleanList(operation.payment_methods, 12, 80),
      hours: cleanText(operation.hours, 1000),
      neighborhoods: cleanText(operation.neighborhoods, 2000),
      average_orders: cleanText(operation.average_orders, 40)
    },
    diagnosis: {
      biggest_pain: cleanText(diagnosis.biggest_pain, 1000),
      wrong_items: booleanOrNull(diagnosis.wrong_items),
      updated_prices: booleanOrNull(diagnosis.updated_prices),
      order_tracking: cleanText(diagnosis.order_tracking, 1000)
    },
    branding: {
      notes: cleanText(branding.notes, 2000),
      theme_color: /^#[0-9a-f]{6}$/i.test(String(branding.theme_color || '')) ? String(branding.theme_color).toLowerCase() : ''
    }
  };
}

export function publicAssistedRegistration(row = {}) {
  return {
    id: row.id,
    status: ASSISTED_REGISTRATION_STATUSES.includes(row.status) ? row.status : 'new',
    responsible_name: row.responsible_name || '',
    phone: row.phone || '',
    email: row.email || '',
    establishment_name: row.establishment_name || '',
    document_masked: maskDocument(row.document_normalized),
    answers: sanitizeAssistedAnswers(row.answers),
    attribution: sanitizeAttribution(row.attribution),
    version: Number(row.version || 1),
    company_id: row.company_id || null,
    store_id: row.store_id || null,
    admin_id: row.admin_id || null,
    subscription_id: row.subscription_id || null,
    email_status: row.email_status || 'not_sent',
    published_at: row.published_at || null,
    activated_at: row.activated_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };
}

function isValidCpf(value) {
  if (/^(\d)\1+$/.test(value)) return false;
  return digitMatches(value, 9, 9, (index) => 10 - index) && digitMatches(value, 10, 10, (index) => 11 - index);
}

function isValidCnpj(value) {
  if (/^(\d)\1+$/.test(value)) return false;
  const first = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const second = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  return cnpjDigit(value.slice(0, 12), first) === Number(value[12]) && cnpjDigit(value.slice(0, 13), second) === Number(value[13]);
}

function digitMatches(value, length, position, weight) {
  let total = 0;
  for (let index = 0; index < length; index += 1) total += Number(value[index]) * weight(index);
  const rest = (total * 10) % 11;
  return Number(value[position]) === (rest === 10 ? 0 : rest);
}

function cnpjDigit(value, weights) {
  const rest = value.split('').reduce((total, digit, index) => total + Number(digit) * weights[index], 0) % 11;
  return rest < 2 ? 0 : 11 - rest;
}

function maskDocument(value) {
  const document = normalizeDocument(value);
  if (document.length === 11) return `***.***.***-${document.slice(-2)}`;
  if (document.length === 14) return `**.***.***/****-${document.slice(-2)}`;
  return '';
}

function sanitizeAttribution(value) {
  const data = isObject(value) ? value : {};
  return Object.fromEntries(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'declared_source']
    .map((key) => [key, cleanText(data[key], 160)])
    .filter(([, item]) => item));
}

function cleanText(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.slice(0, 254) : '';
}

function digits(value, max) {
  return String(value || '').replace(/\D/g, '').slice(0, max);
}

function cleanList(value, limit, max) {
  return [...new Set((Array.isArray(value) ? value : []).map((item) => cleanText(item, max)).filter(Boolean))].slice(0, limit);
}

function booleanOrNull(value) {
  return typeof value === 'boolean' ? value : null;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validationError(message) {
  const error = new Error(message);
  error.status = 422;
  return error;
}
