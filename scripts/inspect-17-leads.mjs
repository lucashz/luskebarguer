import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const r = await pool.query(`
    SELECT l.id, l.business_name, l.phone, l.city, l.state, l.segment, l.source, l.created_at, l.metadata
    FROM sales_leads l
    JOIN sales_automation_jobs j ON j.lead_id = l.id
    WHERE (j.run_at at time zone 'America/Sao_Paulo')::date = '2026-10-17'
    ORDER BY j.run_at ASC
  `);
  console.table(r.rows.map(x => ({
    name: x.business_name,
    phone: x.phone,
    city: x.city,
    state: x.state,
    segment: x.segment,
    source: x.source,
    has_owner: Boolean(x.metadata?.owner),
    has_cnpj: Boolean(x.metadata?.cnpj)
  })));

  await pool.end();
}

main().catch(console.error);
