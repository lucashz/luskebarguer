export const OUTREACH_QUOTA_LIMITS = Object.freeze({
  places_pro: 4000,
  places_advanced: 800,
  place_photos: 800,
  vision_label: 800
});

export class OutreachQuotaExceededError extends Error {
  constructor(sku, limit, requestedUnits) {
    super(`Cota gratuita de ${sku} esgotada: limite interno ${limit}, solicitação ${requestedUnits}.`);
    this.name = 'OutreachQuotaExceededError';
    this.code = 'OUTREACH_QUOTA_EXCEEDED';
    this.sku = sku;
    this.limit = limit;
    this.requestedUnits = requestedUnits;
  }
}

export async function reserveQuota({ sku, units = 1, month = new Date(), runId, client, limits = OUTREACH_QUOTA_LIMITS }) {
  const normalizedSku = String(sku || '').trim();
  const normalizedRunId = String(runId || '').trim();
  const normalizedUnits = Number(units);
  const limit = Number(limits?.[normalizedSku]);
  const usageMonth = normalizeMonth(month);

  if (!Number.isInteger(normalizedUnits) || normalizedUnits < 1) throw new Error('Unidades de cota inválidas.');
  if (!Number.isInteger(limit) || limit < 1) throw new Error(`SKU de cota inválido: ${normalizedSku || 'vazio'}.`);
  if (!normalizedRunId) throw new Error('runId é obrigatório para reservar cota.');
  if (!client || typeof client.query !== 'function') throw new Error('Cliente PostgreSQL é obrigatório para reservar cota.');

  const result = await client.query(`
    insert into sales_quota_usage (sku, usage_month, reserved_units, consumed_units, limit_units, details)
    values ($1, $2::date, $3, 0, $4, jsonb_build_object('last_run_id', $5::text, 'last_result', 'reserved'))
    on conflict (sku, usage_month) do update
      set reserved_units = sales_quota_usage.reserved_units + excluded.reserved_units,
          limit_units = least(sales_quota_usage.limit_units, excluded.limit_units),
          details = sales_quota_usage.details || jsonb_build_object('last_run_id', $5::text, 'last_result', 'reserved'),
          updated_at = now()
      where sales_quota_usage.reserved_units + excluded.reserved_units <= least(sales_quota_usage.limit_units, excluded.limit_units)
    returning sku, usage_month, reserved_units, consumed_units, limit_units
  `, [normalizedSku, usageMonth, normalizedUnits, limit, normalizedRunId]);

  const row = result.rows?.[0];
  if (!row) throw new OutreachQuotaExceededError(normalizedSku, limit, normalizedUnits);

  let completed = false;
  return {
    sku: normalizedSku,
    month: usageMonth,
    units: normalizedUnits,
    reserved: Number(row.reserved_units || 0),
    limit: Number(row.limit_units || limit),
    async complete(completionResult = 'success') {
      if (completed) return;
      const normalizedResult = ['success', 'failure'].includes(completionResult) ? completionResult : 'failure';
      await client.query(`
        update sales_quota_usage
        set consumed_units = least(limit_units, consumed_units + case when $5::text = 'success' then $3 else 0 end),
            details = details || jsonb_build_object('last_run_id', $4::text, 'last_result', $5::text),
            updated_at = now()
        where sku = $1 and usage_month = $2::date
        returning sku, usage_month, reserved_units, consumed_units, limit_units
      `, [normalizedSku, usageMonth, normalizedUnits, normalizedRunId, normalizedResult]);
      completed = true;
    }
  };
}

function normalizeMonth(value) {
  if (/^\d{4}-\d{2}$/.test(String(value || ''))) return `${value}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return `${String(value).slice(0, 7)}-01`;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Mês de cota inválido.');
  return `${date.toISOString().slice(0, 7)}-01`;
}
