import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
const pool = getLocalPool();

async function main() {
  const localExcludedCities = [
    'Horizontina', 'Três de Maio', 'Santa Rosa', 'Tucunduva', 
    'Crissiumal', 'Santo Ângelo', 'Ijuí', 'Doutor Maurício Cardoso'
  ];

  const candidates = await pool.query(`
    SELECT l.id, l.business_name, l.phone, l.normalized_phone, l.city, l.state, l.segment, 
           l.stage, l.metadata, l.google_place_id, l.last_contact_at, l.attempt_count
    FROM sales_leads l
    WHERE l.last_contact_at IS NULL
      AND l.attempt_count = 0
      AND l.phone IS NOT NULL
      AND l.phone ~ '^55[0-9]{2}9[0-9]{8}$'
      AND l.city NOT IN (${localExcludedCities.map((_, i) => `$${i + 1}`).join(', ')})
      AND NOT EXISTS (
        SELECT 1 FROM sales_suppressions s 
        WHERE s.normalized_phone = l.normalized_phone
      )
    ORDER BY (l.metadata->>'menu_url') IS NOT NULL DESC, l.created_at ASC
  `, localExcludedCities);

  console.log(`Total de candidatos potenciais encontrados: ${candidates.rowCount}`);
  console.table(candidates.rows.slice(0, 20).map(c => ({
    id: c.id.slice(0, 8),
    business_name: c.business_name,
    cidade: `${c.city}/${c.state}`,
    phone: c.phone,
    has_menu: Boolean(c.metadata?.menu_url),
    stage: c.stage
  })));

  await pool.end();
}

main().catch(console.error);

