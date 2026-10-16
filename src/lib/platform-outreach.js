import { buildOutreachMetrics } from './outreach-metrics.js';

export async function loadPlatformOutreachMetrics({ dbRequest, period }) {
  if (typeof dbRequest !== 'function') throw new Error('dbRequest é obrigatório.');
  const since = toIso(period?.since);
  const until = toIso(period?.until || period?.end);
  const month = `${since.slice(0, 7)}-01`;
  const safe = (promise) => Promise.resolve(promise).catch(() => []);

  const [leads, messages, events, runs, quotas, suppressions, companies] = await Promise.all([
    safe(dbRequest('GET', 'sales_leads', {
      select: 'id,business_name,phone,normalized_phone,city,state,segment,stage,discard_code,source,metadata,last_contact_at,created_at,updated_at',
      source: 'eq.google_outreach',
      order: 'updated_at.desc',
      limit: '5000'
    })),
    safe(dbRequest('GET', 'sales_messages', {
      select: 'id,lead_id,provider_message_id,direction,intent,status,sent_at,received_at,metadata,created_at',
      order: 'created_at.asc',
      limit: '20000'
    })),
    safe(dbRequest('GET', 'sales_automation_events', {
      select: 'id,lead_id,run_id,place_id,event_type,stage,attempt,result,details,created_at',
      created_at: `gte.${since}`,
      order: 'created_at.asc',
      limit: '10000'
    })),
    safe(dbRequest('GET', 'sales_discovery_runs', {
      select: 'id,status,scheduled_for,candidates_found,qualified_count,discarded_count,preview_count,sent_count,created_at',
      scheduled_for: `gte.${since.slice(0, 10)}`,
      order: 'scheduled_for.desc',
      limit: '100'
    })),
    safe(dbRequest('GET', 'sales_quota_usage', {
      select: 'sku,usage_month,reserved_units,consumed_units,limit_units,updated_at',
      usage_month: `eq.${month}`,
      order: 'sku.asc',
      limit: '20'
    })),
    safe(dbRequest('GET', 'sales_suppressions', {
      select: 'normalized_phone,reason,source,created_at',
      created_at: `gte.${since}`,
      limit: '5000'
    })),
    safe(dbRequest('GET', 'companies', {
      select: 'id,acquisition_source,outreach_lead_id,created_at',
      created_at: `gte.${since}`,
      limit: '2000'
    }))
  ]);

  return buildOutreachMetrics({
    leads,
    messages,
    events,
    runs,
    quotas,
    suppressions,
    companies,
    period: { label: period?.label, since: new Date(since), until: until ? new Date(until) : undefined }
  });
}

function toIso(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Período de prospecção inválido.');
  return date.toISOString();
}
