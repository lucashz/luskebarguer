import assert from 'node:assert/strict';
import { buildOutreachMetrics } from '../src/lib/outreach-metrics.js';

const period = {
  label: '7d',
  since: new Date('2026-10-07T00:00:00.000Z'),
  until: new Date('2026-10-14T00:00:00.000Z')
};

const leads = [
  { id: 'lead-1', business_name: 'Padaria Central', normalized_phone: '5555999990001', city: 'Horizontina', state: 'RS', segment: 'Padaria', stage: 'human_handoff', updated_at: '2026-10-11T12:00:00.000Z' },
  { id: 'lead-2', business_name: 'Lanches Avenida', normalized_phone: '5554999990002', city: 'Torrinha', state: 'SP', segment: 'Lanchonete', stage: 'discarded', discard_code: 'online_menu', updated_at: '2026-10-10T12:00:00.000Z' },
  { id: 'lead-3', business_name: 'Marmitas da Praça', normalized_phone: '5544999990003', city: 'Ivaiporã', state: 'PR', segment: 'Marmitaria', stage: 'awaiting_reply', updated_at: '2026-10-12T12:00:00.000Z' },
  { id: 'lead-4', business_name: 'Café Antigo', normalized_phone: '5555999990004', city: 'Três de Maio', state: 'RS', segment: 'Cafeteria', stage: 'human_handoff', updated_at: '2026-10-13T12:00:00.000Z' }
];

const events = [
  event('found-1', 'lead_discovered', 'lead-1', '2026-10-08T10:00:00.000Z'),
  event('found-2', 'lead_discovered', 'lead-2', '2026-10-08T10:05:00.000Z'),
  event('found-3', 'lead_discovered', 'lead-3', '2026-10-09T10:00:00.000Z'),
  event('qualified-1', 'lead_photos_ready', 'lead-1', '2026-10-08T10:10:00.000Z'),
  event('qualified-3', 'lead_photos_ready', 'lead-3', '2026-10-09T10:10:00.000Z'),
  event('discard-2', 'lead_discarded', 'lead-2', '2026-10-10T10:00:00.000Z', { discard_code: 'online_menu' }),
  event('preview-1', 'lead_preview_ready', 'lead-1', '2026-10-09T11:00:00.000Z'),
  event('preview-3', 'lead_preview_ready', 'lead-3', '2026-10-10T11:00:00.000Z'),
  event('interest-1', 'interest_detected', 'lead-1', '2026-10-11T11:05:00.000Z'),
  event('interest-duplicate', 'interest_detected', 'lead-1', '2026-10-11T11:06:00.000Z'),
  { ...event('failed-3', 'outreach_failed', 'lead-3', '2026-10-12T09:00:00.000Z'), result: 'failure' },
  event('health', 'health_changed', null, '2026-10-12T08:00:00.000Z', { evolution: 'connected', webhook: 'healthy' })
];

const messages = [
  outbound('text-before-period', 'lead-4', '2026-10-06T15:00:00.000Z', 'message'),
  outbound('text-1', 'lead-1', '2026-10-11T10:00:00.000Z', 'message'),
  outbound('desktop-1', 'lead-1', '2026-10-11T10:00:05.000Z', 'desktop'),
  outbound('mobile-1', 'lead-1', '2026-10-11T10:00:10.000Z', 'mobile'),
  { id: 'reply-1', lead_id: 'lead-1', provider_message_id: 'provider-reply-1', direction: 'inbound', status: 'received', intent: 'interested', received_at: '2026-10-11T11:00:00.000Z', created_at: '2026-10-11T11:00:00.000Z' },
  { id: 'reply-duplicate', lead_id: 'lead-1', provider_message_id: 'provider-reply-1', direction: 'inbound', status: 'received', intent: 'interested', received_at: '2026-10-11T11:00:01.000Z', created_at: '2026-10-11T11:00:01.000Z' },
  { id: 'reply-before-send', lead_id: 'lead-3', provider_message_id: 'provider-old', direction: 'inbound', status: 'received', received_at: '2026-10-10T09:00:00.000Z', created_at: '2026-10-10T09:00:00.000Z' },
  { id: 'reply-to-old-contact', lead_id: 'lead-4', provider_message_id: 'provider-old-contact-reply', direction: 'inbound', status: 'received', intent: 'price_question', received_at: '2026-10-13T09:00:00.000Z', created_at: '2026-10-13T09:00:00.000Z' },
  outbound('legacy-other-channel', 'lead-outside-outreach', '2026-10-12T15:00:00.000Z', 'message')
];

const metrics = buildOutreachMetrics({
  leads,
  messages,
  events,
  runs: [{ id: 'run-1', status: 'completed', scheduled_for: '2026-10-11', candidates_found: 3, qualified_count: 2, discarded_count: 1, preview_count: 2, sent_count: 1 }],
  quotas: [{ sku: 'places_pro', usage_month: '2026-10-01', reserved_units: 15, consumed_units: 12, limit_units: 4000 }],
  suppressions: [],
  companies: [
    { id: 'company-1', created_at: '2026-10-12T12:00:00.000Z', attribution: { source: 'outreach', lead_id: 'lead-1' } },
    { id: 'company-duplicate', created_at: '2026-10-12T12:05:00.000Z', attribution: { source: 'outreach', lead_id: 'lead-1' } }
  ],
  period
});

assert.deepEqual(metrics.summary, {
  found: 3,
  qualified: 2,
  discarded: 1,
  previews_ready: 2,
  contacts_sent: 1,
  respondents: 2,
  interested: 2,
  opt_outs: 0,
  failures: 1,
  conversions: 1
});

assert.deepEqual(metrics.rates, {
  qualification: 66.7,
  preparation: 100,
  send_completion: 50,
  response: 200,
  interest_per_contact: 200,
  interest_per_response: 100,
  opt_out: 0,
  conversion: 100
});

assert.deepEqual(metrics.discard_reasons, [{ code: 'online_menu', count: 1 }]);
assert.equal(metrics.daily.find((row) => row.date === '2026-10-08').found, 2);
assert.equal(metrics.daily.find((row) => row.date === '2026-10-10').discarded, 1);
assert.equal(metrics.daily.find((row) => row.date === '2026-10-11').contacts_sent, 1);
assert.equal(metrics.daily.find((row) => row.date === '2026-10-11').responses, 1);
assert.equal(metrics.locations.find((row) => row.city === 'Horizontina').contacts_sent, 1);
assert.equal(metrics.segments.find((row) => row.segment === 'Padaria').interested, 1);
assert.equal(metrics.recent_leads.find((lead) => lead.id === 'lead-1').phone, '55•••••••001');
assert.deepEqual(metrics.health, { evolution: 'connected', webhook: 'healthy', updated_at: '2026-10-12T08:00:00.000Z' });
assert.deepEqual(metrics.quotas, [{ sku: 'places_pro', used: 12, reserved: 15, limit: 4000, remaining: 3985, percent_used: 0.3 }]);

const empty = buildOutreachMetrics({ period, leads: [], messages: [], events: [], runs: [], quotas: [], suppressions: [], companies: [] });
assert.deepEqual(empty.rates, {
  qualification: 0,
  preparation: 0,
  send_completion: 0,
  response: 0,
  interest_per_contact: 0,
  interest_per_response: 0,
  opt_out: 0,
  conversion: 0
});

console.log('Outreach metrics smoke: OK');

function event(id, eventType, leadId, createdAt, details = {}) {
  return { id, event_type: eventType, lead_id: leadId, created_at: createdAt, details, result: 'success' };
}

function outbound(id, leadId, sentAt, step) {
  return { id, lead_id: leadId, direction: 'outbound', status: 'sent', sent_at: sentAt, created_at: sentAt, metadata: { kind: 'outreach_sequence', step } };
}
