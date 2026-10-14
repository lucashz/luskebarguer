import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';
import {
  OUTREACH_EVENT_TYPES,
  OUTREACH_STAGES,
  normalizeOutreachEvent
} from '../src/lib/outreach-events.js';

loadEnv(new URL('../.env', import.meta.url));

assert(OUTREACH_EVENT_TYPES.includes('lead_discovered'));
assert(OUTREACH_EVENT_TYPES.includes('outreach_completed'));
assert(OUTREACH_EVENT_TYPES.includes('conversion_attributed'));
assert(OUTREACH_STAGES.includes('basic_validated'));
assert(OUTREACH_STAGES.includes('preview_ready'));
assert(OUTREACH_STAGES.includes('send_failed'));

assert.deepEqual(normalizeOutreachEvent({
  event_type: 'lead_discovered',
  run_id: ' run-2026-10-13 ',
  lead_id: ' lead-1 ',
  place_id: ' place-1 ',
  stage: 'discovered',
  attempt: 1,
  result: 'success',
  details: { city: 'Horizontina' }
}), {
  event_type: 'lead_discovered',
  run_id: 'run-2026-10-13',
  lead_id: 'lead-1',
  place_id: 'place-1',
  stage: 'discovered',
  attempt: 1,
  result: 'success',
  details: { city: 'Horizontina' }
});

assert.throws(
  () => normalizeOutreachEvent({ event_type: 'unknown', run_id: 'run-1' }),
  /evento de prospecção inválido/i
);
assert.throws(
  () => normalizeOutreachEvent({ event_type: 'lead_discovered' }),
  /run_id é obrigatório/i
);
assert.throws(
  () => normalizeOutreachEvent({ event_type: 'lead_discovered', run_id: 'run-1', stage: 'invalid' }),
  /estágio de prospecção inválido/i
);

if (process.env.DATABASE_URL) await databaseSmoke();

console.log('Outreach schema smoke: OK');

async function databaseSmoke() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const relations = await pool.query(`
      select
        to_regclass('public.sales_discovery_runs') discovery_runs,
        to_regclass('public.sales_quota_usage') quota_usage,
        to_regclass('public.sales_search_targets') search_targets
    `);
    assert(relations.rows[0].discovery_runs, 'Tabela sales_discovery_runs ausente.');
    assert(relations.rows[0].quota_usage, 'Tabela sales_quota_usage ausente.');
    assert(relations.rows[0].search_targets, 'Tabela sales_search_targets ausente.');

    const columns = await pool.query(`
      select column_name
      from information_schema.columns
      where table_schema='public' and table_name='sales_leads'
    `);
    const names = new Set(columns.rows.map((row) => row.column_name));
    for (const name of ['google_place_id', 'discard_code', 'discard_details', 'last_validated_at', 'preview_desktop_path', 'preview_mobile_path']) {
      assert(names.has(name), `Coluna sales_leads.${name} ausente.`);
    }

    const indexes = await pool.query(`
      select indexname
      from pg_indexes
      where schemaname='public' and tablename in ('sales_discovery_runs','sales_quota_usage','sales_search_targets')
    `);
    const indexNames = new Set(indexes.rows.map((row) => row.indexname));
    assert(indexNames.has('sales_quota_usage_sku_month_key'), 'Limite único mensal de cotas ausente.');
    assert(indexNames.has('sales_search_targets_city_state_segment_key'), 'Deduplicação de alvos de busca ausente.');
  } finally {
    await pool.end();
  }
}

function loadEnv(url) {
  if (!existsSync(url)) return;
  for (const line of readFileSync(url, 'utf8').split(/\r?\n/)) {
    const value = line.trim();
    if (!value || value.startsWith('#') || !value.includes('=')) continue;
    const index = value.indexOf('=');
    const key = value.slice(0, index).trim();
    process.env[key] ||= value.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
  }
}
