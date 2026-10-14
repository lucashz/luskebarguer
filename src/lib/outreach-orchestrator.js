const TIME_ZONE = 'America/Sao_Paulo';
const DAILY_LIMIT = 15;
const CANDIDATE_TARGET = 50;

export async function runDailyOutreach({ now = new Date(), dryRun = false, maxContacts = DAILY_LIMIT, dependencies = {} } = {}) {
  assertDependencies(dependencies);
  const current = validDate(now);
  const local = localParts(current);
  const localMinutes = Number(local.hour) * 60 + Number(local.minute);
  if (local.weekday === 'Sun' || localMinutes < 7 * 60 + 30 || localMinutes > 17 * 60 + 30) return result('outside_window');

  const state = await dependencies.getState();
  if (state?.paused) return result('paused');
  if (state?.quotaAvailable === false) return result('quota_blocked');
  if (state?.webhookHealthy === false) return result('webhook_unhealthy');

  const limit = Math.min(DAILY_LIMIT, Math.max(1, Math.floor(Number(maxContacts) || DAILY_LIMIT)));
  const runKey = `${local.year}-${local.month}-${local.day}`;
  const existing = await dependencies.findExistingRun({ runKey, dryRun });
  if (existing?.status === 'completed' || existing?.status === 'dry_run') {
    return { ...result('already_completed'), runId: existing.id, scheduled: Number(existing.sent_count || 0) };
  }

  const alreadyScheduled = Math.max(0, Number(existing?.scheduled_count || 0));
  const remaining = Math.max(0, limit - alreadyScheduled);

  const run = existing || await dependencies.startRun({ runKey, scheduledFor: runKey, dryRun, now: current });
  const runId = run.id || run.run_key || runKey;
  await dependencies.recordEvent({ event_type: 'run_started', run_id: runId, result: 'success', details: { dry_run: dryRun } });
  const candidates = remaining ? await dependencies.discoverCandidates({ targetCount: CANDIDATE_TARGET, runId, now: current, dryRun }) : [];
  const approved = [];
  let discarded = 0;
  for (const candidate of candidates.slice(0, CANDIDATE_TARGET)) {
    try {
      const qualification = await dependencies.qualifyCandidate(candidate, { runId, now: current, dryRun });
      if (!qualification?.qualified) {
        discarded += 1;
        continue;
      }
      const preview = await dependencies.buildPreview({ lead: qualification.lead, photos: qualification.photos, runId, dryRun });
      approved.push({ lead: qualification.lead, preview });
      if (approved.length >= remaining) break;
    } catch (error) {
      discarded += 1;
      await dependencies.recordEvent({ event_type: 'outreach_failed', run_id: runId, place_id: candidate.id || candidate.place_id || null, result: 'failure', details: { step: 'candidate_processing', error: safeError(error) } });
    }
  }

  const slots = buildOutreachSchedule(current, approved.length);
  if (!dryRun) {
    for (const [index, item] of approved.entries()) {
      await dependencies.scheduleContact({ ...item, runId, scheduledAt: slots[index], idempotencyKey: `${runKey}:${item.lead.id}` });
    }
  }
  const summary = {
    candidates: candidates.length,
    qualified: approved.length,
    discarded,
    scheduled: alreadyScheduled + approved.length,
    status: dryRun ? 'dry_run' : 'completed',
    runId,
    slots
  };
  await dependencies.completeRun({ run, ...summary, sent: dryRun ? 0 : approved.length });
  await dependencies.recordEvent({ event_type: 'run_completed', run_id: runId, result: 'success', details: summary });
  return summary;
}

export function buildOutreachSchedule(now = new Date(), count = DAILY_LIMIT) {
  const current = validDate(now);
  const local = localParts(current);
  if (local.weekday === 'Sun') return [];
  const windows = [
    [9, 30, 11, 30],
    [14, 0, 17, 30]
  ].map(([startHour, startMinute, endHour, endMinute]) => ({
    start: zonedDate(local, startHour, startMinute),
    end: zonedDate(local, endHour, endMinute)
  })).filter(({ end }) => end >= current)
    .map(({ start, end }) => ({ start: start < current ? current : start, end }));
  const total = windows.reduce((sum, window) => sum + Math.max(0, window.end - window.start), 0);
  const size = Math.min(DAILY_LIMIT, Math.max(0, Math.floor(Number(count) || 0)));
  if (!size || !total) return [];
  const slots = [];
  for (let index = 0; index < size; index += 1) {
    let offset = total * ((index + 0.5) / size);
    for (const window of windows) {
      const duration = window.end - window.start;
      if (offset <= duration) {
        slots.push(new Date(window.start.getTime() + offset));
        break;
      }
      offset -= duration;
    }
  }
  return slots;
}

function localParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function zonedDate(local, hour, minute) {
  const utcGuess = Date.UTC(Number(local.year), Number(local.month) - 1, Number(local.day), hour, minute);
  let candidate = new Date(utcGuess);
  for (let index = 0; index < 2; index += 1) {
    const actual = localParts(candidate);
    const actualAsUtc = Date.UTC(Number(actual.year), Number(actual.month) - 1, Number(actual.day), Number(actual.hour), Number(actual.minute));
    candidate = new Date(candidate.getTime() + utcGuess - actualAsUtc);
  }
  return candidate;
}

function assertDependencies(dependencies) {
  for (const name of ['getState', 'findExistingRun', 'startRun', 'discoverCandidates', 'qualifyCandidate', 'buildPreview', 'scheduleContact', 'completeRun', 'recordEvent']) {
    if (typeof dependencies[name] !== 'function') throw new Error(`Dependência do orquestrador ausente: ${name}.`);
  }
}

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Data inválida para a prospecção.');
  return date;
}

function result(status) {
  return { status, candidates: 0, qualified: 0, discarded: 0, scheduled: 0, slots: [] };
}

function safeError(error) {
  return String(error?.message || 'Falha não identificada.').replace(/\s+/g, ' ').trim().slice(0, 180);
}
