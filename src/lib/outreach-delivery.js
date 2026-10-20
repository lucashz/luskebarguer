import { basename } from 'node:path';
import { readFile as readFileFromDisk } from 'node:fs/promises';
import { isOutreachWebhookHealthy } from './sales-automation.js';
import { OUTREACH_DEMO_URL } from './outreach-message.js';

const CAPTIONS = Object.freeze({
  desktop: 'Assim ficaria o cardápio de vocês no computador.',
  mobile: 'E esta é a visualização rápida no celular, direto para o cliente fazer pedidos pelo WhatsApp.'
});

export async function sendOutreachSequence({ lead = {}, message = '', previews = {}, dependencies = {}, now = new Date() } = {}) {
  const deps = resolveDependencies(dependencies);
  assertInput(lead, message, previews);

  if (await deps.isSuppressed(lead)) {
    await deps.recordEvent(eventFor(lead, 'opt_out', 'blocked', { reason: 'suppressed' }));
    return { completed: false, blocked: true, reason: 'suppressed', contactCount: 0 };
  }
  const connection = await deps.getConnection();
  if (!connection?.connected) return block(deps, lead, 'connection_unavailable');
  const webhookHealth = await deps.getWebhookHealth();
  if (!isOutreachWebhookHealthy(webhookHealth, now)) return block(deps, lead, 'webhook_unhealthy');

  const progress = await deps.loadProgress(lead) || {};
  try {
    if (!progress.text) {
      assertNoAmbiguousAttempt(progress, 'text', 'texto');
      progress.text_attempt = { at: now.toISOString() };
      await deps.saveStep('text_attempt', progress.text_attempt, lead);
      const sent = await deps.sendText({ phone: lead.normalized_phone || lead.phone, text: message, lead });
      progress.text = stepResult(sent, now);
      await deps.saveStep('text', progress.text, lead);
      await deps.recordEvent(eventFor(lead, 'outreach_text_sent', 'success', { provider_message_id: progress.text.providerMessageId }));
    }
    if (!progress.desktop) {
      assertNoAmbiguousAttempt(progress, 'desktop', 'imagem de computador');
      progress.desktop_attempt = { at: now.toISOString() };
      await deps.saveStep('desktop_attempt', progress.desktop_attempt, lead);
      progress.desktop = await sendPreview('desktop', previews.desktopPath, lead, deps, now);
      await deps.saveStep('desktop', progress.desktop, lead);
      await deps.recordEvent(eventFor(lead, 'outreach_desktop_sent', 'success', { provider_message_id: progress.desktop.providerMessageId }));
    }
    if (!progress.mobile) {
      assertNoAmbiguousAttempt(progress, 'mobile', 'imagem de celular');
      progress.mobile_attempt = { at: now.toISOString() };
      await deps.saveStep('mobile_attempt', progress.mobile_attempt, lead);
      progress.mobile = await sendPreview('mobile', previews.mobilePath, lead, deps, now);
      await deps.saveStep('mobile', progress.mobile, lead);
      await deps.recordEvent(eventFor(lead, 'outreach_mobile_sent', 'success', { provider_message_id: progress.mobile.providerMessageId }));
    }
    if (!progress.completed) {
      progress.completed = { at: now.toISOString() };
      await deps.saveStep('completed', progress.completed, lead);
      await deps.recordEvent(eventFor(lead, 'outreach_completed', 'success', { contact_count: 1 }));
    }
    return { completed: true, blocked: false, contactCount: 1, progress };
  } catch (error) {
    const failure = error.code === 'OUTREACH_AMBIGUOUS_DELIVERY'
      ? { consecutiveFailures: 0 }
      : await deps.recordFailure({ lead, error, progress });
    await deps.recordEvent(eventFor(lead, 'outreach_failed', 'failure', {
      message: clean(error?.message).slice(0, 500),
      consecutive_failures: Number(failure?.consecutiveFailures || 1)
    }));
    if (Number(failure?.consecutiveFailures || 0) >= 3) error.circuitOpen = true;
    throw error;
  }
}

function assertNoAmbiguousAttempt(progress, step, label) {
  if (progress[`${step}_attempt`] && !progress[step]) {
    const error = new Error(`Envio sem confirmação do provedor para ${label}; revisão manual obrigatória para evitar duplicidade.`);
    error.code = 'OUTREACH_AMBIGUOUS_DELIVERY';
    throw error;
  }
}

async function sendPreview(kind, path, lead, deps, now) {
  const bytes = await deps.readFile(path);
  const menuUrl = clean(lead.metadata?.menu_url || lead.menu_url || OUTREACH_DEMO_URL);
  const caption = kind === 'desktop'
    ? 'Assim ficaria o cardápio de vocês no computador.'
    : 'E esta é a visualização rápida no celular, direto para o cliente fazer pedidos pelo WhatsApp.';
  const sent = await deps.sendMedia({
    phone: lead.normalized_phone || lead.phone,
    media: Buffer.from(bytes).toString('base64'),
    mimeType: 'image/png',
    fileName: basename(path),
    caption,
    lead
  });
  return stepResult(sent, now);
}

async function block(deps, lead, reason) {
  await deps.recordEvent(eventFor(lead, 'health_changed', 'blocked', { reason }));
  return { completed: false, blocked: true, reason, contactCount: 0 };
}

function eventFor(lead, eventType, result, details) {
  return {
    event_type: eventType,
    run_id: clean(lead.outreach_run_id || lead.metadata?.outreach_run_id || `lead:${lead.id}`),
    lead_id: lead.id || null,
    place_id: lead.google_place_id || null,
    stage: eventType === 'outreach_completed' ? 'awaiting_reply' : undefined,
    result,
    details
  };
}

function stepResult(sent, now) {
  return { providerMessageId: clean(sent?.id || sent?.providerMessageId), at: now.toISOString() };
}

function assertInput(lead, message, previews) {
  if (!lead?.id) throw new Error('Lead é obrigatório para o envio.');
  if (!clean(lead.normalized_phone || lead.phone)) throw new Error('Telefone do lead é obrigatório para o envio.');
  if (!clean(message)) throw new Error('Mensagem de prospecção é obrigatória.');
  if (!previews?.desktopPath || !previews?.mobilePath) throw new Error('As prévias desktop e celular são obrigatórias.');
}

function resolveDependencies(dependencies) {
  const required = ['getConnection', 'isSuppressed', 'getWebhookHealth', 'loadProgress', 'sendText', 'sendMedia', 'saveStep', 'recordEvent', 'recordFailure'];
  for (const key of required) if (typeof dependencies[key] !== 'function') throw new Error(`Dependência de envio ausente: ${key}.`);
  return { readFile: readFileFromDisk, ...dependencies };
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
