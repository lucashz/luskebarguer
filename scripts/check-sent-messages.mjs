import { getLocalPool } from '/app/src/lib/local-postgrest-adapter.js';

const pool = getLocalPool();

async function main() {
  const res = await pool.query(`
    select m.id, m.provider_message_id, l.business_name, m.body
    from sales_messages m
    join sales_leads l on l.id = m.lead_id
    order by m.created_at desc
    limit 6
  `);
  console.table(res.rows);
  await pool.end();
}

main().catch(console.error);

