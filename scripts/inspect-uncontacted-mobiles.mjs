import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
const pool = getLocalPool();

async function main() {
  const localExcludedCities = [
    'Horizontina', 'Três de Maio', 'Santa Rosa', 'Tucunduva', 
    'Crissiumal', 'Santo Ângelo', 'Ijuí', 'Doutor Maurício Cardoso'
  ];

  const res = await pool.query(`
    SELECT id, business_name, phone, city, state, segment, stage, discard_code, discard_details, metadata
    FROM sales_leads
    WHERE last_contact_at IS NULL
      AND attempt_count = 0
      AND phone IS NOT NULL
      AND phone ~ '^55[0-9]{2}9[0-9]{8}$'
      AND city NOT IN (${localExcludedCities.map((_, i) => `$${i + 1}`).join(', ')})
    ORDER BY (metadata->>'menu_url') IS NOT NULL DESC, created_at ASC
  `, localExcludedCities);

  console.log(`Found ${res.rowCount} uncontacted mobile leads outside excluded cities:`);
  for (const r of res.rows) {
    console.log(`- [${r.stage}] ${r.business_name} (${r.city}/${r.state}) ${r.phone} | menu: ${r.metadata?.menu_url || 'none'} | discard: ${r.discard_code || 'none'}`);
  }

  await pool.end();
}

main().catch(console.error);

