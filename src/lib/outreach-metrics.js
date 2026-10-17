export function buildOutreachMetrics(input = {}) {
  const leads = Array.isArray(input.leads) ? input.leads : [];
  const messages = Array.isArray(input.messages) ? input.messages : [];
  const events = Array.isArray(input.events) ? input.events : [];
  const runs = Array.isArray(input.runs) ? input.runs : [];
  const quotas = Array.isArray(input.quotas) ? input.quotas : [];
  const suppressions = Array.isArray(input.suppressions) ? input.suppressions : [];
  const companies = Array.isArray(input.companies) ? input.companies : [];
  const period = normalizePeriod(input.period);
  const leadById = new Map(leads.map((lead) => [String(lead.id), lead]));
  const outreachMessages = messages.filter((message) => leadById.has(String(message.lead_id || '')));
  const allPeriodEvents = events.filter((event) => inPeriod(event.created_at, period));
  const periodEvents = allPeriodEvents.filter((event) => (event.result || 'success') === 'success');
  const periodMessages = outreachMessages.filter((message) => inPeriod(messageDate(message), period));

  const found = eventLeadIds(periodEvents, ['lead_discovered']);
  const qualified = eventLeadIds(periodEvents, ['lead_photos_ready']);
  const discarded = eventLeadIds(periodEvents, ['lead_discarded']);
  const previewsReady = eventLeadIds(periodEvents, ['lead_preview_ready']);
  const failed = new Set([
    ...eventLeadIds(allPeriodEvents, ['outreach_failed']),
    ...leads.filter((lead) => lead.stage === 'send_failed' && inPeriod(lead.updated_at, period)).map((lead) => String(lead.id))
  ]);

  const firstSentHistory = firstMessagesByLead(outreachMessages.filter((message) => (
    message.direction === 'outbound' && message.status === 'sent' && message.sent_at
  )), 'sent_at');
  const firstSentByLead = new Map([...firstSentHistory].filter(([, message]) => inPeriod(message.sent_at, period)));
  const contacted = new Set(firstSentByLead.keys());
  const firstReplyByLead = firstInboundAfterContact(periodMessages, firstSentHistory);
  const respondents = new Set(firstReplyByLead.keys());

  const interested = new Set(eventLeadIds(periodEvents, ['interest_detected']));
  for (const [leadId, message] of firstReplyByLead) {
    if (['interested', 'demo_request', 'price_question'].includes(message.intent)) interested.add(leadId);
  }

  const optedOut = new Set(eventLeadIds(periodEvents, ['opt_out']));
  for (const [leadId, message] of firstReplyByLead) {
    if (message.intent === 'opt_out') optedOut.add(leadId);
  }
  const leadIdByPhone = new Map(leads.filter((lead) => lead.normalized_phone).map((lead) => [String(lead.normalized_phone), String(lead.id)]));
  for (const suppression of suppressions) {
    if (!inPeriod(suppression.created_at, period)) continue;
    const leadId = leadIdByPhone.get(String(suppression.normalized_phone || ''));
    if (leadId) optedOut.add(leadId);
  }

  const converted = new Set();
  for (const company of companies) {
    if (!inPeriod(company.created_at, period)) continue;
    const attribution = company.attribution || company.metadata?.attribution || {};
    const source = company.acquisition_source || attribution.source;
    if (String(source || '').toLowerCase() !== 'outreach') continue;
    const identity = company.outreach_lead_id || attribution.lead_id || attribution.leadId || company.id;
    if (identity) converted.add(String(identity));
  }

  const summary = {
    found: found.size,
    qualified: qualified.size,
    discarded: discarded.size,
    previews_ready: previewsReady.size,
    contacts_sent: contacted.size,
    respondents: respondents.size,
    interested: interested.size,
    opt_outs: optedOut.size,
    failures: failed.size,
    conversions: converted.size
  };

  return {
    summary,
    rates: {
      qualification: rate(summary.qualified, summary.found),
      preparation: rate(summary.previews_ready, summary.qualified),
      send_completion: rate(summary.contacts_sent, summary.previews_ready),
      response: rate(summary.respondents, summary.contacts_sent),
      interest_per_contact: rate(summary.interested, summary.contacts_sent),
      interest_per_response: rate(summary.interested, summary.respondents),
      opt_out: rate(summary.opt_outs, summary.contacts_sent),
      conversion: rate(summary.conversions, summary.contacts_sent)
    },
    daily: buildDaily(periodEvents, firstSentByLead, firstReplyByLead),
    discard_reasons: discardReasons(periodEvents, leadById),
    locations: groupedPerformance(leads, 'location', { found, qualified, discarded, previewsReady, contacted, respondents, interested }),
    segments: groupedPerformance(leads, 'segment', { found, qualified, discarded, previewsReady, contacted, respondents, interested }),
    runs: runs.filter((run) => inPeriod(run.scheduled_for || run.created_at, period)).sort(descendingDate).slice(0, 20).map(normalizeRun),
    quotas: quotas.map(normalizeQuota).sort((a, b) => a.sku.localeCompare(b.sku)),
    health: latestHealth(allPeriodEvents),
    recent_leads: recentLeads(leads, events, messages)
  };
}

function normalizePeriod(period = {}) {
  const since = validDate(period.since) || new Date(0);
  const until = validDate(period.until) || new Date('9999-12-31T23:59:59.999Z');
  return { since, until };
}

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function inPeriod(value, period) {
  const date = validDate(value);
  return Boolean(date && date >= period.since && date < period.until);
}

function messageDate(message) {
  return message.sent_at || message.received_at || message.created_at;
}

function eventLeadIds(events, types) {
  const allowed = new Set(types);
  return new Set(events.filter((event) => allowed.has(event.event_type) && event.lead_id).map((event) => String(event.lead_id)));
}

function firstMessagesByLead(messages, dateField) {
  const result = new Map();
  for (const message of [...messages].sort((a, b) => timestamp(a[dateField]) - timestamp(b[dateField]))) {
    const leadId = String(message.lead_id || '');
    if (leadId && !result.has(leadId)) result.set(leadId, message);
  }
  return result;
}

function firstInboundAfterContact(messages, firstSentByLead) {
  const seenProviders = new Set();
  const replies = [];
  for (const message of messages) {
    if (message.direction !== 'inbound') continue;
    const providerKey = message.provider_message_id ? String(message.provider_message_id) : `row:${message.id}`;
    if (seenProviders.has(providerKey)) continue;
    seenProviders.add(providerKey);
    const sent = firstSentByLead.get(String(message.lead_id || ''));
    if (!sent || timestamp(messageDate(message)) <= timestamp(sent.sent_at)) continue;
    replies.push(message);
  }
  return firstMessagesByLead(replies, 'received_at');
}

function buildDaily(events, firstSentByLead, firstReplyByLead) {
  const days = new Map();
  const row = (date) => {
    const key = dateKey(date);
    if (!key) return null;
    if (!days.has(key)) days.set(key, { date: key, found: 0, qualified: 0, discarded: 0, previews_ready: 0, contacts_sent: 0, responses: 0, interested: 0 });
    return days.get(key);
  };
  const eventField = {
    lead_discovered: 'found',
    lead_photos_ready: 'qualified',
    lead_discarded: 'discarded',
    lead_preview_ready: 'previews_ready',
    interest_detected: 'interested'
  };
  const counted = new Set();
  for (const event of events) {
    const field = eventField[event.event_type];
    if (!field || !event.lead_id) continue;
    const identity = `${field}:${event.lead_id}`;
    if (counted.has(identity)) continue;
    counted.add(identity);
    const target = row(event.created_at);
    if (target) target[field] += 1;
  }
  for (const message of firstSentByLead.values()) {
    const target = row(message.sent_at);
    if (target) target.contacts_sent += 1;
  }
  for (const message of firstReplyByLead.values()) {
    const target = row(messageDate(message));
    if (target) target.responses += 1;
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function discardReasons(events, leadById) {
  const counts = new Map();
  const seen = new Set();
  for (const event of events.filter((entry) => entry.event_type === 'lead_discarded' && entry.lead_id)) {
    const leadId = String(event.lead_id);
    if (seen.has(leadId)) continue;
    seen.add(leadId);
    const code = String(event.details?.discard_code || leadById.get(leadId)?.discard_code || 'unknown');
    counts.set(code, (counts.get(code) || 0) + 1);
  }
  return [...counts.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

function groupedPerformance(leads, mode, sets) {
  const groups = new Map();
  for (const lead of leads) {
    const leadId = String(lead.id || '');
    if (!leadId) continue;
    const key = mode === 'segment'
      ? String(lead.segment || 'Não informado')
      : `${String(lead.city || 'Não informada')}|${String(lead.state || '')}`;
    if (!groups.has(key)) {
      groups.set(key, mode === 'segment'
        ? { segment: key, found: 0, qualified: 0, discarded: 0, previews_ready: 0, contacts_sent: 0, responses: 0, interested: 0 }
        : { city: String(lead.city || 'Não informada'), state: String(lead.state || ''), found: 0, qualified: 0, discarded: 0, previews_ready: 0, contacts_sent: 0, responses: 0, interested: 0 });
    }
    const group = groups.get(key);
    for (const [field, set] of Object.entries(sets)) {
      const outputField = field === 'previewsReady' ? 'previews_ready' : field === 'contacted' ? 'contacts_sent' : field === 'respondents' ? 'responses' : field;
      if (set.has(leadId)) group[outputField] += 1;
    }
  }
  return [...groups.values()].filter((group) => group.found || group.qualified || group.discarded || group.contacts_sent || group.responses || group.interested)
    .sort((a, b) => b.contacts_sent - a.contacts_sent || b.found - a.found);
}

function normalizeRun(run) {
  return {
    id: run.id,
    status: run.status,
    scheduled_for: dateKey(run.scheduled_for),
    candidates_found: Number(run.candidates_found || 0),
    qualified_count: Number(run.qualified_count || 0),
    discarded_count: Number(run.discarded_count || 0),
    preview_count: Number(run.preview_count || 0),
    sent_count: Number(run.sent_count || 0)
  };
}

function normalizeQuota(quota) {
  const used = Number(quota.consumed_units || 0);
  const reserved = Number(quota.reserved_units || 0);
  const limit = Number(quota.limit_units || 0);
  return {
    sku: String(quota.sku || ''),
    used,
    reserved,
    limit,
    remaining: Math.max(0, limit - Math.max(used, reserved)),
    percent_used: rate(used, limit)
  };
}

function latestHealth(events) {
  const latest = events.filter((event) => event.event_type === 'health_changed').sort(descendingDate)[0];
  return latest ? {
    evolution: String(latest.details?.evolution || 'unknown'),
    webhook: String(latest.details?.webhook || 'unknown'),
    updated_at: new Date(latest.created_at).toISOString()
  } : { evolution: 'unknown', webhook: 'unknown', updated_at: null };
}

function recentLeads(leads, events, messages) {
  const latestByLead = new Map();
  for (const event of events) updateLatest(latestByLead, event.lead_id, event.created_at);
  for (const message of messages) updateLatest(latestByLead, message.lead_id, messageDate(message));
  return leads.map((lead) => {
    const meta = lead.metadata || {};
    const lastContact = lead.last_contact_at ? validDate(lead.last_contact_at) : null;
    const expiresAt = lastContact ? new Date(lastContact.getTime() + 15 * 3600000).toISOString() : null;
    const hoursRemaining = lastContact ? Math.round((new Date(expiresAt).getTime() - Date.now()) / 3600000) : null;
    return {
      id: lead.id,
      business_name: String(lead.business_name || ''),
      phone: maskPhone(lead.normalized_phone || lead.phone),
      raw_phone: lead.normalized_phone || lead.phone || '',
      city: String(lead.city || ''),
      state: String(lead.state || ''),
      segment: String(lead.segment || ''),
      stage: String(lead.stage || ''),
      menu_url: meta.menu_url || null,
      store_id: meta.store_id || null,
      continuity_confirmed: Boolean(meta.continuity_confirmed),
      continuity_confirmed_at: meta.continuity_confirmed_at || null,
      menu_status: meta.menu_status || (meta.store_id || meta.menu_url ? 'active' : null),
      last_contact_at: lead.last_contact_at || null,
      expires_at: expiresAt,
      hours_remaining: hoursRemaining,
      last_event_at: latestByLead.get(String(lead.id)) || lead.updated_at || lead.created_at || null
    };
  }).sort((a, b) => timestamp(b.last_event_at) - timestamp(a.last_event_at)).slice(0, 30);
}

function updateLatest(map, leadId, value) {
  if (!leadId || !value) return;
  const key = String(leadId);
  if (!map.has(key) || timestamp(value) > timestamp(map.get(key))) map.set(key, value);
}

function maskPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 5) return digits ? '•••' : '';
  return `${digits.slice(0, 2)}•••••••${digits.slice(-3)}`;
}

function rate(part, total) {
  return total ? Number(((Number(part || 0) / Number(total)) * 100).toFixed(1)) : 0;
}

function timestamp(value) {
  return validDate(value)?.getTime() || 0;
}

function dateKey(value) {
  const date = validDate(value);
  return date ? date.toISOString().slice(0, 10) : '';
}

function descendingDate(a, b) {
  return timestamp(b.created_at || b.scheduled_for) - timestamp(a.created_at || a.scheduled_for);
}
