import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const totalRes = await pool.query(`SELECT count(*)::int as total FROM sales_leads WHERE stage = 'discovered' AND phone IS NOT NULL`);
  console.log('TOTAL DISCOVERED LEADS WITH PHONE:', totalRes.rows[0].total);

  const result = await pool.query(`
    SELECT id, business_name, city, state, phone, segment, stage, automation_status, metadata
    FROM sales_leads
    WHERE stage NOT IN ('awaiting_reply', 'opted_out', 'send_failed', 'human_handoff')
    ORDER BY created_at DESC
    LIMIT 40
  `);
  console.log('CANDIDATES COUNT:', result.rowCount);
  console.table(result.rows.map(r => ({
    id: r.id.slice(0, 8),
    name: r.business_name,
    city: r.city,
    phone: r.phone,
    segment: r.segment,
    stage: r.stage,
    has_menu: Boolean(r.metadata?.menu_url)
  })));
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
