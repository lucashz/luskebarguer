import { getLocalPool } from './src/lib/local-postgrest-adapter.js';

const pool = getLocalPool();

async function main() {
  const result = await pool.query(`
    select id, business_name, phone, city, state, segment, stage, discard_code, discard_details, google_place_id, last_contact_at
    from sales_leads
    where city ilike '%Horizontina%' or city ilike '%Portela%' or city ilike '%Maio%'
    order by created_at desc
  `);

  console.log(`Found ${result.rows.length} leads in target cities:`);
  for (const row of result.rows) {
    console.log(`- [${row.stage}] ${row.business_name} (${row.city}/${row.state}) Phone: ${row.phone} Discard: ${row.discard_code || 'none'}`);
  }

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
