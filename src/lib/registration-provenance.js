export const REGISTRATION_SOURCES = Object.freeze([
  'self_service',
  'assisted',
  'platform_admin',
  'sales_automation',
  'import',
  'api'
]);

export const REGISTRATION_PURPOSES = Object.freeze([
  'customer_request',
  'lead_capture',
  'demo',
  'migration',
  'internal_test'
]);

const HUMAN_SOURCES = new Set(['assisted', 'platform_admin']);
const SYSTEM_SOURCES = new Set(['sales_automation', 'import', 'api']);
const SENSITIVE_KEY = /(password|cookie|token|authorization|secret)/i;

export function normalizeRegistrationProvenance(input = {}, context = {}) {
  const source = clean(input.source || input.creation_source);
  if (!REGISTRATION_SOURCES.includes(source)) throw validationError('Informe uma origem válida para o cadastro.');

  const purpose = source === 'self_service'
    ? 'customer_request'
    : clean(input.purpose || input.creation_purpose);
  if (!REGISTRATION_PURPOSES.includes(purpose)) throw validationError('Informe uma finalidade válida para o cadastro.');

  const note = clean(input.note || input.creation_note);
  if (note.length > 500) throw validationError('A nota de contexto deve ter no máximo 500 caracteres.');

  let actorId = null;
  let actorName = null;
  if (HUMAN_SOURCES.has(source)) {
    actorId = clean(context.actorAdmin?.id);
    actorName = clean(context.actorAdmin?.name || context.actorAdmin?.email);
    if (!actorId || !actorName) throw validationError('Não foi possível identificar o responsável pelo cadastro.');
    if (!note) throw validationError('Informe uma nota de contexto para o cadastro interno.');
  } else if (SYSTEM_SOURCES.has(source)) {
    actorName = clean(context.systemActor);
    if (!actorName) throw validationError('Informe a identidade estável do sistema responsável pelo cadastro.');
    if (!note) throw validationError('Informe uma nota de contexto para o cadastro interno.');
  }

  const attribution = normalizeAttribution(context.attribution || input.attribution || {});
  if (purpose === 'lead_capture' && !hasTrackableChannel(attribution)) {
    throw validationError('Informe o canal de origem do lead antes de criar o cadastro.');
  }

  const metadata = mergeMetadata(sanitizeObject(input.metadata || input.creation_metadata || {}), attribution);
  const companyFields = {
    creation_source: source,
    creation_purpose: purpose,
    created_by_admin_id: actorId,
    created_by_name_snapshot: actorName,
    creation_note: note || null,
    creation_metadata: metadata
  };

  return {
    companyFields,
    auditData: {
      source,
      purpose,
      actor_name: actorName,
      note: note || null,
      attribution: sanitizeObject(attribution),
      metadata: sanitizeObject(metadata)
    }
  };
}

function normalizeAttribution(value) {
  const sanitized = sanitizeObject(value);
  return {
    ...sanitized,
    declared_source: clean(sanitized.declared_source) || 'unknown'
  };
}

function hasTrackableChannel(attribution) {
  return Boolean(
    clean(attribution.utm_source)
    || (clean(attribution.declared_source) && clean(attribution.declared_source).toLowerCase() !== 'unknown')
    || clean(attribution.tracking_code)
    || clean(attribution.referral_code)
  );
}

function mergeMetadata(metadata, attribution) {
  const merged = { ...metadata };
  for (const [key, value] of Object.entries(attribution)) {
    const target = Object.hasOwn(merged, key) ? `${key}_attribution` : key;
    merged[target] = value;
  }
  return merged;
}

function sanitizeObject(value) {
  if (Array.isArray(value)) return value.map(sanitizeObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !SENSITIVE_KEY.test(key))
    .map(([key, nested]) => [key, sanitizeObject(nested)]));
}

function clean(value) {
  return String(value || '').trim();
}

function validationError(message) {
  const error = new Error(message);
  error.status = 422;
  error.code = 'INVALID_REGISTRATION_PROVENANCE';
  return error;
}
