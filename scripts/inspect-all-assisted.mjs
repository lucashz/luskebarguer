import { getLocalPool } from './src/lib/local-postgrest-adapter.js';

const pool = getLocalPool();

async function main() {
  const allRegs = await pool.query(`
    SELECT ar.id, ar.establishment_name, ar.status, ar.store_id, ar.company_id,
           ar.attribution->>'lead_id' as lead_id, ar.created_at,
           l.business_name as lead_name, l.stage as lead_stage, l.metadata->>'menu_status' as menu_status
    FROM assisted_registrations ar
    LEFT JOIN sales_leads l ON l.id = (ar.attribution->>'lead_id')::uuid
    ORDER BY ar.created_at DESC
  `);

  console.log('Total assisted_registrations:', allRegs.rowCount);
  console.table(allRegs.rows.map(r => ({
    id: r.id.slice(0, 8),
    nome: r.establishment_name,
    status: r.status,
    store_id: r.store_id ? r.store_id.slice(0, 8) : null,
    lead_nome: r.lead_name,
    lead_stage: r.lead_stage,
    menu_status: r.menu_status
  })));

  await pool.end();
}

main().catch(console.error);

