const TIME_ZONE = 'America/Sao_Paulo';

export function evaluateOutreachSendGate({
  now = new Date(),
  paused = false,
  webhookHealthy = true,
  providerConnected = true,
  lastValidatedAt,
  dailyClaimed = 0,
  dailyLimit = 15,
  contactStarted = false
} = {}) {
  const current = validDate(now);
  const local = parts(current);
  const minutes = Number(local.hour) * 60 + Number(local.minute);
  const morning = minutes >= 9 * 60 + 30 && minutes <= 11 * 60 + 30;
  const afternoon = minutes >= 14 * 60 && minutes <= 17 * 60 + 30;
  if (local.weekday === 'Sun' || (!morning && !afternoon)) return denied('outside_send_window');
  if (paused) return denied('paused');
  if (!providerConnected) return denied('provider_disconnected');
  if (!webhookHealthy) return denied('webhook_unhealthy');
  const validated = validDate(lastValidatedAt);
  if (!validated || localDate(validated) !== localDate(current)) return denied('revalidation_required');
  const limit = Math.min(15, Math.max(1, Math.floor(Number(dailyLimit) || 15)));
  if (!contactStarted && Number(dailyClaimed || 0) >= limit) return denied('daily_limit');
  return { allowed: true, reason: '' };
}

export function localOutreachDate(value = new Date()) {
  return localDate(validDate(value));
}

function localDate(date) {
  const value = parts(date);
  return `${value.year}-${value.month}-${value.day}`;
}

function parts(date) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(date).map((part) => [part.type, part.value]));
}

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function denied(reason) { return { allowed: false, reason }; }
