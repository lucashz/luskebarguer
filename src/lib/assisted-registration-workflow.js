export const ASSISTED_REGISTRATION_STATUSES = Object.freeze([
  'new',
  'in_progress',
  'awaiting_menu',
  'interpreting_menu',
  'reviewing_menu',
  'ready_for_preview',
  'preview_created',
  'preview_reviewed',
  'published',
  'activated',
  'cancelled'
]);

export const ASSISTED_FILE_PURPOSES = Object.freeze([
  'menu_source',
  'product_photo',
  'store_logo',
  'store_cover'
]);

const LEGACY_STATUS_ALIASES = Object.freeze({ ready_to_publish: 'ready_for_preview' });

const TRANSITIONS = Object.freeze({
  new: new Set(['in_progress', 'cancelled']),
  in_progress: new Set(['awaiting_menu', 'interpreting_menu', 'reviewing_menu', 'cancelled']),
  awaiting_menu: new Set(['in_progress', 'interpreting_menu', 'reviewing_menu', 'cancelled']),
  interpreting_menu: new Set(['awaiting_menu', 'reviewing_menu', 'cancelled']),
  reviewing_menu: new Set(['awaiting_menu', 'interpreting_menu', 'ready_for_preview', 'cancelled']),
  ready_for_preview: new Set(['reviewing_menu', 'preview_created', 'cancelled']),
  preview_created: new Set(['reviewing_menu', 'preview_reviewed', 'cancelled']),
  preview_reviewed: new Set(['reviewing_menu', 'published', 'cancelled']),
  published: new Set(['activated']),
  activated: new Set(),
  cancelled: new Set(['in_progress'])
});

export function normalizeAssistedStatus(value) {
  const status = String(value || '');
  return LEGACY_STATUS_ALIASES[status] || status;
}

export function assertAssistedSetupMutable(value) {
  const status = normalizeAssistedStatus(value);
  if (['preview_created', 'preview_reviewed', 'published', 'activated', 'cancelled'].includes(status)) {
    const error = new Error('A prévia já foi criada. Faça os ajustes no painel e confirme uma nova revisão.');
    error.status = 409;
    error.code = 'assisted_setup_locked';
    throw error;
  }
  return status;
}

export function assertAssistedTransition(from, to) {
  const current = normalizeAssistedStatus(from);
  const target = normalizeAssistedStatus(to);
  if (current === target && ASSISTED_REGISTRATION_STATUSES.includes(current)) return target;
  if (!TRANSITIONS[current]?.has(target)) {
    const error = new Error(`Transição inválida de ${current || 'desconhecido'} para ${target || 'desconhecido'}.`);
    error.status = 422;
    throw error;
  }
  return target;
}
