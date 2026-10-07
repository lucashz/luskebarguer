import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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
  { id: '5', event_name: 'whatsapp_click', visitor_key: 'v2', attribution: paid, properties: { tracking_code: 'TP-ABC123' } },
  { id: '6', event_name: 'signup_completed', visitor_key: 'v1', company_id: 'company-1', attribution: paid },
  { id: '7', event_name: 'subscription_created', company_id: 'company-1', attribution: paid },
  { id: '8', event_name: 'landing_view', visitor_key: 'organic', attribution: { utm_source: 'instagram', utm_medium: 'organic' } }
  ,{ id: '9', event_name: 'landing_view', visitor_key: 'test-same-campaign', attribution: { utm_source: 'instagram', utm_medium: 'paid_social', utm_campaign: 'delivery_noroeste_rs' } }
  ,{ id: '10', event_name: 'signup_started', visitor_key: 'test-same-campaign', attribution: { utm_source: 'instagram', utm_medium: 'paid_social', utm_campaign: 'delivery_noroeste_rs' } }
  ,{ id: '11', event_name: 'landing_view', visitor_key: 'test-old-campaign', attribution: { utm_source: 'instagram', utm_medium: 'paid_social', utm_campaign: 'noroeste_gaucho_delivery', utm_content: 'criativo_whatsapp_01' } }
  ,{ id: '12', event_name: 'landing_view', visitor_key: 'test-no-campaign', attribution: { utm_source: 'instagram', utm_medium: 'paid_social' } }
  ,{ id: '13', event_name: 'landing_view', visitor_key: 'v3', attribution: { ...paid, utm_content: 'outro-criativo' } }
  ,{ id: '14', event_name: 'whatsapp_click', visitor_key: 'v3', attribution: { ...paid, utm_content: 'outro-criativo' }, properties: { tracking_code: 'TP-XYZ789' } }
];

assert.deepEqual(instagramPaidFunnel(events), {
  landing_views: 5,
  landing_visitors: 4,
  signup_clicks: 2,
  signup_completed: 1,
  whatsapp_clicks: 2,
  whatsapp_visitors: 2,
  primary_cta_clicks: 2,
  subscriptions: 1,
  assisted_registrations: 0,
  assisted_subscriptions: 0,
  landing_to_signup_click_rate: 40,
  signup_click_to_completed_rate: 50,
  landing_to_whatsapp_rate: 40,
  landing_to_primary_cta_rate: 40,
  landing_to_subscription_rate: 20,
  campaigns: [{ campaign: 'delivery_noroeste_rs', landing_views: 5, landing_visitors: 4, signup_clicks: 2, signup_completed: 1, whatsapp_clicks: 2, whatsapp_visitors: 2, primary_cta_clicks: 2, subscriptions: 1 }]
});

const assistedFunnel = instagramPaidFunnel(events, {
  assistedRegistrations: [
    { id: 'lead-1', status: 'activated', company_id: 'company-1', attribution: { tracking_code: 'TP-ABC123' } },
    { id: 'lead-2', status: 'activated', company_id: 'company-2', attribution: { tracking_code: 'TP-OTHER' } },
    { id: 'lead-cancelled', status: 'cancelled', company_id: null, attribution: { tracking_code: 'TP-XYZ789' } }
  ],
  subscriptions: [
    { company_id: 'company-1', status: 'active' },
    { company_id: 'company-2', status: 'active' },
    { company_id: 'other-company', status: 'active' }
  ]
});
assert.equal(assistedFunnel.assisted_registrations, 1, 'O funil deve contar apenas cadastros ligados a um código de atendimento da campanha.');
assert.equal(assistedFunnel.assisted_subscriptions, 1, 'Assinaturas devem ser relacionadas aos cadastros assistidos pelo company_id.');

const platformSource = await readFile(new URL('../public/platform.js', import.meta.url), 'utf8');
assert.doesNotMatch(platformSource, /Clicaram em Começar grátis/, 'A Central não deve exibir a etapa antiga de cadastro no funil da landing assistida.');
assert.match(platformSource, /Aberturas do WhatsApp/, 'A Central deve apresentar o WhatsApp como CTA principal da campanha.');
assert.match(platformSource, /instagramPaid\.assisted_registrations/, 'A Central deve exibir o cadastro assistido vindo da fonte correta.');

const serverSource = await readFile(new URL('../server.js', import.meta.url), 'utf8');
assert.match(serverSource, /select: 'id,status,company_id,attribution,created_at'/, 'A consulta da Central deve carregar o código de atribuição do cadastro assistido.');

const deliverySource = await readFile(new URL('../public/delivery.js', import.meta.url), 'utf8');
assert.match(deliverySource, /navigator\.sendBeacon/, 'O clique externo do WhatsApp deve usar sendBeacon antes de sair da página.');
assert.match(deliverySource, /Código de atendimento/, 'A mensagem do WhatsApp deve carregar um código anônimo de atendimento.');
assert.match(deliverySource, /tracking_code/, 'O evento do WhatsApp deve salvar o mesmo código de atendimento.');

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
