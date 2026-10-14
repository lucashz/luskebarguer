import assert from 'node:assert/strict';
import { buildOutreachMessage } from '../src/lib/outreach-message.js';
import { sendOutreachSequence } from '../src/lib/outreach-delivery.js';
import { isOutreachWebhookHealthy } from '../src/lib/sales-automation.js';

const lead = {
  id: 'lead-1',
  business_name: 'Padaria Central',
  city: 'Horizontina',
  state: 'RS',
  segment: 'padaria',
  normalized_phone: '5599999999999'
};
const previews = { desktopPath: 'desktop.png', mobilePath: 'mobile.png' };
const message = buildOutreachMessage(lead);

assert.match(message, /Olá, pessoal da Padaria Central! Aqui é o Lucas, da TáPronto\./);
assert.match(message, /padaria.*Horizontina/i);
assert.match(message, /teste gratuitamente/i);
assert.match(message, /https:\/\/taprontomenu\.com\.br\/cardapio/);
assert.ok(message.endsWith('Se tiverem alguma dúvida, estou à disposição.'));

function harness({ progress = {}, failAt = '', suppressed = false, webhookAgeMinutes = 1 } = {}) {
  const calls = [];
  const events = [];
  const saved = { ...progress };
  let failures = 0;
  return {
    calls, events, saved,
    dependencies: {
      getConnection: async () => ({ connected: true }),
      isSuppressed: async () => suppressed,
      getWebhookHealth: async () => ({ lastReceivedAt: new Date(Date.now() - webhookAgeMinutes * 60_000).toISOString() }),
      loadProgress: async () => ({ ...saved }),
      readFile: async (path) => Buffer.from(path),
      sendText: async ({ text }) => {
        calls.push(['text', text]);
        if (failAt === 'text') throw new Error('text failed');
        return { id: 'text-id' };
      },
      sendMedia: async ({ caption, fileName }) => {
        const kind = fileName.includes('mobile') ? 'mobile' : 'desktop';
        calls.push([kind, caption]);
        if (failAt === kind) throw new Error(`${kind} failed`);
        return { id: `${kind}-id` };
      },
      saveStep: async (step, data) => { saved[step] = data; },
      recordEvent: async (event) => { events.push(event); },
      recordFailure: async () => { failures += 1; return { consecutiveFailures: failures }; }
    }
  };
}

const success = harness();
const delivered = await sendOutreachSequence({ lead, message, previews, dependencies: success.dependencies });
assert.deepEqual(success.calls.map(([kind]) => kind), ['text', 'desktop', 'mobile']);
assert.match(success.calls[1][1], /computador/i);
assert.match(success.calls[2][1], /celular/i);
assert.match(success.calls[1][1], /https:\/\/taprontomenu\.com\.br\/cardapio/);
assert.equal(delivered.contactCount, 1);
assert.equal(delivered.completed, true);
assert.equal(success.events.filter((event) => event.event_type === 'outreach_completed').length, 1);

for (const failAt of ['text', 'desktop', 'mobile']) {
  const failed = harness({ failAt });
  await assert.rejects(
    sendOutreachSequence({ lead, message, previews, dependencies: failed.dependencies }),
    new RegExp(`${failAt} failed`)
  );
  assert.equal(failed.events.at(-1).event_type, 'outreach_failed');
}

const resumed = harness({ progress: { text: { providerMessageId: 'old-text' } } });
await sendOutreachSequence({ lead, message, previews, dependencies: resumed.dependencies });
assert.deepEqual(resumed.calls.map(([kind]) => kind), ['desktop', 'mobile']);

const ambiguous = harness();
const originalSaveStep = ambiguous.dependencies.saveStep;
ambiguous.dependencies.saveStep = async (step, data) => {
  if (step === 'text') throw new Error('database unavailable after provider accepted text');
  await originalSaveStep(step, data);
};
await assert.rejects(sendOutreachSequence({ lead, message, previews, dependencies: ambiguous.dependencies }), /database unavailable/);
ambiguous.dependencies.saveStep = originalSaveStep;
await assert.rejects(sendOutreachSequence({ lead, message, previews, dependencies: ambiguous.dependencies }), /confirmação.*texto/i);
assert.equal(ambiguous.calls.filter(([kind]) => kind === 'text').length, 1, 'Texto ambíguo foi reenviado.');

const optedOut = harness({ suppressed: true });
const blocked = await sendOutreachSequence({ lead, message, previews, dependencies: optedOut.dependencies });
assert.equal(blocked.blocked, true);
assert.equal(optedOut.calls.length, 0);

assert.equal(isOutreachWebhookHealthy({ lastReceivedAt: new Date(Date.now() - 9 * 60_000).toISOString() }), true);
assert.equal(isOutreachWebhookHealthy({ lastReceivedAt: new Date(Date.now() - 11 * 60_000).toISOString() }), false);
const staleWebhook = harness({ webhookAgeMinutes: 11 });
assert.equal((await sendOutreachSequence({ lead, message, previews, dependencies: staleWebhook.dependencies })).blocked, true);

let consecutiveFailures = 0;
for (let attempt = 1; attempt <= 3; attempt += 1) {
  const circuit = harness({ failAt: 'text' });
  circuit.dependencies.recordFailure = async () => ({ consecutiveFailures: ++consecutiveFailures });
  await assert.rejects(
    sendOutreachSequence({ lead: { ...lead, id: `lead-circuit-${attempt}` }, message, previews, dependencies: circuit.dependencies }),
    attempt === 3 ? (error) => error.circuitOpen === true : undefined
  );
}

// A provider event is persisted once upstream; duplicate webhook deliveries must not count twice.
const providerIds = new Set();
function recordInbound(providerMessageId) {
  if (providerIds.has(providerMessageId)) return false;
  providerIds.add(providerMessageId);
  return true;
}
assert.equal(recordInbound('wamid-1'), true);
assert.equal(recordInbound('wamid-1'), false);

console.log('Outreach delivery smoke: OK');
