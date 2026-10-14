import assert from 'node:assert/strict';
import { loadPlatformOutreachMetrics } from '../src/lib/platform-outreach.js';
import '../public/platform-outreach.js';

const calls = [];
const fixtures = {
  sales_leads: [{ id: 'lead-1', business_name: 'Padaria Central', normalized_phone: '5555999990001', city: 'Horizontina', state: 'RS', segment: 'Padaria', stage: 'awaiting_reply', updated_at: '2026-10-11T12:00:00.000Z' }],
  sales_messages: [
    { id: 'sent-1', lead_id: 'lead-1', direction: 'outbound', status: 'sent', sent_at: '2026-10-11T10:00:00.000Z', created_at: '2026-10-11T10:00:00.000Z', metadata: { kind: 'outreach_sequence', step: 'message' } },
    { id: 'reply-1', lead_id: 'lead-1', direction: 'inbound', status: 'received', intent: 'interested', received_at: '2026-10-11T11:00:00.000Z', created_at: '2026-10-11T11:00:00.000Z' }
  ],
  sales_automation_events: [
    { id: 'event-1', event_type: 'lead_discovered', lead_id: 'lead-1', result: 'success', created_at: '2026-10-08T10:00:00.000Z' },
    { id: 'event-2', event_type: 'lead_photos_ready', lead_id: 'lead-1', result: 'success', created_at: '2026-10-09T10:00:00.000Z' },
    { id: 'event-3', event_type: 'lead_preview_ready', lead_id: 'lead-1', result: 'success', created_at: '2026-10-10T10:00:00.000Z' },
    { id: 'event-4', event_type: 'interest_detected', lead_id: 'lead-1', result: 'success', created_at: '2026-10-11T11:05:00.000Z' }
  ],
  sales_discovery_runs: [],
  sales_quota_usage: [{ sku: 'places_pro', usage_month: '2026-10-01', consumed_units: 4, reserved_units: 5, limit_units: 4000 }],
  sales_suppressions: [],
  companies: [{ id: 'company-1', acquisition_source: 'outreach', outreach_lead_id: 'lead-1', created_at: '2026-10-12T12:00:00.000Z' }]
};

const outreach = await loadPlatformOutreachMetrics({
  period: { label: '7d', since: new Date('2026-10-07T00:00:00.000Z'), until: new Date('2026-10-14T00:00:00.000Z') },
  dbRequest: async (method, table, params) => {
    calls.push({ method, table, params });
    return fixtures[table] || [];
  }
});

assert.equal(outreach.summary.contacts_sent, 1);
assert.equal(outreach.summary.respondents, 1);
assert.equal(outreach.summary.interested, 1);
assert.equal(outreach.summary.conversions, 1);
assert.deepEqual(Object.keys(outreach), ['summary', 'rates', 'daily', 'discard_reasons', 'locations', 'segments', 'runs', 'quotas', 'health', 'recent_leads']);
assert(calls.some((call) => call.table === 'sales_automation_events' && call.params.created_at === 'gte.2026-10-07T00:00:00.000Z'));
assert(calls.some((call) => call.table === 'sales_messages' && !Object.hasOwn(call.params, 'created_at')));
assert(calls.some((call) => call.table === 'sales_leads' && call.params.source === 'eq.google_outreach'));
assert(calls.some((call) => call.table === 'sales_quota_usage' && call.params.usage_month === 'eq.2026-10-01'));

const render = globalThis.OutreachDashboard?.renderOutreachMetricsHtml;
assert.equal(typeof render, 'function', 'O renderizador real da Central não foi exposto.');

const filled = render(outreach);
for (const text of ['Prospecção automática', 'Encontrados', 'Qualificados', 'Contatados', 'Responderam', 'Interessados', 'Conversão', 'Motivos de descarte', 'Cidades', 'Segmentos', 'Cotas gratuitas']) {
  assert.match(filled, new RegExp(text, 'i'), `A Central não exibiu ${text}.`);
}
assert(!filled.includes('5555999990001'), 'A Central exibiu telefone sem máscara.');
assert(!filled.toLowerCase().includes('api_key'), 'A Central exibiu nome de segredo.');
assert.match(render(null, { loading: true }), /Carregando métricas de prospecção/i);
assert.match(render(null, { error: 'Falha controlada' }), /Falha controlada/);
assert.match(render({ summary: {}, rates: {}, daily: [], discard_reasons: [], locations: [], segments: [], runs: [], quotas: [], health: {}, recent_leads: [] }), /Nenhuma prospecção registrada/i);

console.log('Platform outreach metrics smoke: OK');
