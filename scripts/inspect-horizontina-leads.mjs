import { getLocalPool } from './src/lib/local-postgrest-adapter.js';

const pool = getLocalPool();

async function main() {
  const result = await pool.query(`
    select id, business_name, phone, city, state, segment, stage, discard_code, discard_details, google_place_id, metadata
    from sales_leads
    where city ilike '%Horizontina%'
  `);

  for (const row of result.rows) {
    console.log('----------------------------------------');
    console.log(`Lead: ${row.business_name} (${row.id})`);
    console.log(`Phone: ${row.phone}`);
    console.log(`Place ID: ${row.google_place_id}`);
    console.log(`Discard details:`, JSON.stringify(row.discard_details));
    console.log(`Metadata:`, JSON.stringify(row.metadata));
  }

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
