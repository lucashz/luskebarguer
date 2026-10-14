export const OUTREACH_STAGES = Object.freeze([
  'discovered',
  'basic_validated',
  'activity_validated',
  'menu_checked',
  'photos_ready',
  'preview_ready',
  'scheduled',
  'awaiting_reply',
  'discarded',
  'send_failed',
  'opted_out',
  'human_handoff'
]);

export const OUTREACH_EVENT_TYPES = Object.freeze([
  'run_started',
  'run_completed',
  'lead_discovered',
  'lead_basic_validated',
  'lead_activity_validated',
  'lead_menu_checked',
  'lead_photos_ready',
  'lead_preview_desktop_created',
  'lead_preview_mobile_created',
  'lead_preview_ready',
  'lead_scheduled',
  'lead_discarded',
  'outreach_text_sent',
  'outreach_desktop_sent',
  'outreach_mobile_sent',
  'outreach_completed',
  'outreach_failed',
  'inbound_received',
  'interest_detected',
  'opt_out',
  'conversion_attributed',
  'quota_reserved',
  'quota_consumed',
  'quota_blocked',
  'health_changed'
]);

const OUTREACH_RESULTS = new Set(['success', 'failure', 'skipped', 'blocked']);

export function normalizeOutreachEvent(input = {}) {
  const eventType = clean(input.event_type ?? input.eventType);
  const runId = clean(input.run_id ?? input.runId);
  const stage = nullableClean(input.stage);
  const result = nullableClean(input.result) || 'success';
  const attempt = input.attempt === undefined || input.attempt === null ? 0 : Number(input.attempt);

  if (!OUTREACH_EVENT_TYPES.includes(eventType)) {
    throw new Error('Evento de prospecção inválido.');
  }
  if (!runId) throw new Error('run_id é obrigatório.');
  if (stage && !OUTREACH_STAGES.includes(stage)) {
    throw new Error('Estágio de prospecção inválido.');
  }
  if (!Number.isInteger(attempt) || attempt < 0) {
    throw new Error('Tentativa de prospecção inválida.');
  }
  if (!OUTREACH_RESULTS.has(result)) {
    throw new Error('Resultado de prospecção inválido.');
  }
  if (input.details !== undefined && (!input.details || typeof input.details !== 'object' || Array.isArray(input.details))) {
    throw new Error('Detalhes de prospecção inválidos.');
  }

  return {
    event_type: eventType,
    run_id: runId,
    lead_id: nullableClean(input.lead_id ?? input.leadId),
    place_id: nullableClean(input.place_id ?? input.placeId),
    stage,
    attempt,
    result,
    details: input.details ? { ...input.details } : {}
  };
}

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function nullableClean(value) {
  const normalized = clean(value);
  return normalized || null;
}
