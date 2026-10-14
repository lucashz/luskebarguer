import assert from 'node:assert/strict';
import { buildOutreachSchedule, runDailyOutreach } from '../src/lib/outreach-orchestrator.js';
import { evaluateOutreachSendGate } from '../src/lib/outreach-send-policy.js';

const mondayMorning = new Date('2026-10-12T13:00:00.000Z'); // 10:00 em São Paulo
const saturdayAfternoon = new Date('2026-10-17T18:00:00.000Z'); // 15:00
const sunday = new Date('2026-10-18T13:00:00.000Z');

function harness({ count = 50, paused = false, quotaAvailable = true, webhookHealthy = true, failAt = null } = {}) {
  const qualified = [];
  const scheduled = [];
  const events = [];
  const candidates = Array.from({ length: count }, (_, index) => ({ id: `place-${index}`, business_name: `Loja ${index}` }));
  return {
    qualified, scheduled, events,
    dependencies: {
      getState: async () => ({ paused, quotaAvailable, webhookHealthy }),
      findExistingRun: async () => null,
      startRun: async ({ runKey }) => ({ id: runKey, run_key: runKey }),
      discoverCandidates: async ({ targetCount }) => candidates.slice(0, targetCount),
      qualifyCandidate: async (candidate, context) => {
        qualified.push([candidate.id, context.now.toISOString()]);
        if (candidate.id === failAt) throw new Error('falha isolada do candidato');
        return Number(candidate.id.split('-')[1]) % 2 === 0
          ? { qualified: true, lead: { ...candidate, id: `lead-${candidate.id}` }, photos: ['a', 'b'] }
          : { qualified: false, code: 'online_menu' };
      },
      buildPreview: async ({ lead }) => ({ desktopPath: `${lead.id}-desktop.png`, mobilePath: `${lead.id}-mobile.png` }),
      scheduleContact: async (item) => { scheduled.push(item); },
      completeRun: async () => {},
      recordEvent: async (event) => { events.push(event); }
    }
  };
}

const slots = buildOutreachSchedule(mondayMorning, 15);
assert.equal(slots.length, 15);
for (const slot of slots) {
  const local = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(slot);
  assert.ok((local >= '09:30' && local <= '11:30') || (local >= '14:00' && local <= '17:30'), local);
}

for (const now of [mondayMorning, saturdayAfternoon]) {
  const test = harness();
  const result = await runDailyOutreach({ now, maxContacts: 15, dependencies: test.dependencies });
  assert.equal(result.status, 'completed');
  assert.equal(result.scheduled, 15);
  assert.equal(test.scheduled.length, 15);
}

for (const now of [sunday]) {
  const test = harness();
  const result = await runDailyOutreach({ now, dependencies: test.dependencies });
  assert.equal(result.status, 'outside_window');
  assert.equal(test.qualified.length, 0);
}

const fewer = harness({ count: 7 });
assert.equal((await runDailyOutreach({ now: mondayMorning, dependencies: fewer.dependencies })).scheduled, 4);

const resilient = harness({ count: 5, failAt: 'place-0' });
assert.equal((await runDailyOutreach({ now: mondayMorning, dependencies: resilient.dependencies })).scheduled, 2);
assert.equal(resilient.events.filter((event) => event.event_type === 'outreach_failed').length, 1);

const capped = harness({ count: 50 });
assert.equal((await runDailyOutreach({ now: mondayMorning, maxContacts: 99, dependencies: capped.dependencies })).scheduled, 15);
assert.equal(capped.qualified.length, 29); // para ao encontrar os 15 aprovados

for (const state of [{ paused: true }, { quotaAvailable: false }, { webhookHealthy: false }]) {
  const test = harness(state);
  const result = await runDailyOutreach({ now: mondayMorning, dependencies: test.dependencies });
  assert.equal(result.status, state.paused ? 'paused' : state.quotaAvailable === false ? 'quota_blocked' : 'webhook_unhealthy');
  assert.equal(test.qualified.length, 0);
}

const dry = harness();
const dryResult = await runDailyOutreach({ now: mondayMorning, dryRun: true, dependencies: dry.dependencies });
assert.equal(dryResult.status, 'dry_run');
assert.equal(dry.scheduled.length, 0);

const nextDay = harness({ count: 2 });
await runDailyOutreach({ now: mondayMorning, dependencies: nextDay.dependencies });
await runDailyOutreach({ now: new Date('2026-10-13T13:00:00.000Z'), dependencies: nextDay.dependencies });
assert.equal(nextDay.qualified.length, 4); // revalida todos no dia seguinte

const existing = harness();
existing.dependencies.findExistingRun = async () => ({ id: 'existing', status: 'completed', sent_count: 9 });
const resumed = await runDailyOutreach({ now: mondayMorning, dependencies: existing.dependencies });
assert.equal(resumed.status, 'already_completed');
assert.equal(existing.qualified.length, 0);

const interrupted = harness();
interrupted.dependencies.findExistingRun = async () => ({ id: 'running', status: 'running', scheduled_count: 10 });
const recovered = await runDailyOutreach({ now: mondayMorning, maxContacts: 15, dependencies: interrupted.dependencies });
assert.equal(recovered.scheduled, 15);
assert.equal(interrupted.scheduled.length, 5);

const freshValidation = '2026-10-12T11:00:00.000Z';
assert.equal(evaluateOutreachSendGate({ now: mondayMorning, lastValidatedAt: freshValidation, dailyClaimed: 14, dailyLimit: 15 }).allowed, true);
for (const gate of [
  { now: sunday, lastValidatedAt: freshValidation },
  { now: new Date('2026-10-12T15:30:00.000Z'), lastValidatedAt: freshValidation }, // 12:30
  { now: mondayMorning, lastValidatedAt: freshValidation, paused: true },
  { now: mondayMorning, lastValidatedAt: '2026-10-11T12:00:00.000Z' },
  { now: mondayMorning, lastValidatedAt: freshValidation, dailyClaimed: 15, dailyLimit: 15 },
  { now: mondayMorning, lastValidatedAt: freshValidation, webhookHealthy: false },
  { now: mondayMorning, lastValidatedAt: freshValidation, providerConnected: false }
]) assert.equal(evaluateOutreachSendGate(gate).allowed, false, JSON.stringify(gate));

console.log('Outreach orchestrator smoke: OK');
