import assert from 'node:assert/strict';

let instagramPaidFunnel = null;
let assistedRegistrationMetrics = null;
try {
  ({ instagramPaidFunnel, assistedRegistrationMetrics } = await import('../src/lib/platform-ad-funnel.js'));
} catch {}

assert.equal(typeof instagramPaidFunnel, 'function', 'A Central precisa calcular o funil pago do Instagram separadamente.');
assert.equal(typeof assistedRegistrationMetrics, 'function', 'A Central precisa calcular a conversão do cadastro assistido.');

const paid = { utm_source: 'instagram', utm_medium: 'paid_social', utm_campaign: 'delivery_noroeste_rs', utm_content: '52582798716168' };
const events = [
  { id: '1', event_name: 'landing_view', visitor_key: 'v1', attribution: paid },
  { id: '2', event_name: 'landing_view', visitor_key: 'v1', attribution: paid },
  { id: '3', event_name: 'landing_view', visitor_key: 'v2', attribution: paid },
  { id: '4', event_name: 'signup_started', visitor_key: 'v1', attribution: paid },
  { id: '5', event_name: 'whatsapp_click', visitor_key: 'v2', attribution: paid },
  { id: '6', event_name: 'signup_completed', visitor_key: 'v1', company_id: 'company-1', attribution: paid },
  { id: '7', event_name: 'subscription_created', company_id: 'company-1', attribution: paid },
  { id: '8', event_name: 'landing_view', visitor_key: 'organic', attribution: { utm_source: 'instagram', utm_medium: 'organic' } }
  ,{ id: '9', event_name: 'landing_view', visitor_key: 'test-same-campaign', attribution: { utm_source: 'instagram', utm_medium: 'paid_social', utm_campaign: 'delivery_noroeste_rs' } }
  ,{ id: '10', event_name: 'signup_started', visitor_key: 'test-same-campaign', attribution: { utm_source: 'instagram', utm_medium: 'paid_social', utm_campaign: 'delivery_noroeste_rs' } }
  ,{ id: '11', event_name: 'landing_view', visitor_key: 'test-old-campaign', attribution: { utm_source: 'instagram', utm_medium: 'paid_social', utm_campaign: 'noroeste_gaucho_delivery', utm_content: 'criativo_whatsapp_01' } }
  ,{ id: '12', event_name: 'landing_view', visitor_key: 'test-no-campaign', attribution: { utm_source: 'instagram', utm_medium: 'paid_social' } }
];

assert.deepEqual(instagramPaidFunnel(events), {
  landing_views: 2,
  signup_clicks: 1,
  signup_completed: 1,
  whatsapp_clicks: 1,
  subscriptions: 1,
  landing_to_signup_click_rate: 50,
  signup_click_to_completed_rate: 100,
  landing_to_whatsapp_rate: 50,
  landing_to_subscription_rate: 50,
  campaigns: [{ campaign: 'delivery_noroeste_rs', landing_views: 2, signup_clicks: 1, signup_completed: 1, whatsapp_clicks: 1, subscriptions: 1 }]
});

const assistedRows = [
  { id: 'lead-1', status: 'activated', declared_source: 'Indicação', email_status: 'sent', published_at: '2026-09-26T12:00:00Z', activated_at: '2026-09-27T12:00:00Z', company_id: 'company-1' },
  { id: 'lead-2', status: 'reviewing_menu', declared_source: 'Instagram', email_status: 'pending', company_id: null },
  { id: 'lead-3', status: 'awaiting_menu', declared_source: 'Instagram', email_status: 'pending', company_id: null }
];
const assistedEvents = [
  { id: 'click-1', event_name: 'whatsapp_click', visitor_key: 'anonymous-1', attribution: paid },
  { id: 'click-2', event_name: 'whatsapp_click', visitor_key: 'anonymous-2', attribution: paid }
];
const assistedSubscriptions = [
  { company_id: 'company-1', status: 'trial', trial_started_at: '2026-09-27T12:00:00Z' },
  { company_id: 'company-1', status: 'active', created_at: '2026-10-04T12:00:00Z' }
];

assert.deepEqual(assistedRegistrationMetrics(assistedRows, assistedEvents, assistedSubscriptions), {
  whatsapp_clicks: 2,
  initiated: 3,
  menus_received: 2,
  menus_in_review: 1,
  published: 1,
  emails_sent: 1,
  activated: 1,
  trials_started: 1,
  subscriptions_created: 1,
  click_to_initiated_rate: 150,
  initiated_to_published_rate: 33.3,
  published_to_activated_rate: 100,
  attribution_notice: 'Cliques são anônimos e não são vinculados individualmente aos contatos.',
  declared_sources: [
    { source: 'Instagram', count: 2 },
    { source: 'Indicação', count: 1 }
  ]
});

console.log('Platform Instagram funnel smoke: OK');
