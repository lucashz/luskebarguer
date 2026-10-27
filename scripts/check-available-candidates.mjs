import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

const localExcludedCities = [
  'Horizontina', 'Três de Maio', 'Santa Rosa', 'Tucunduva', 
  'Crissiumal', 'Santo Ângelo', 'Ijuí', 'Doutor Maurício Cardoso'
];

async function main() {
  const res = await pool.query(`
    SELECT l.id, l.business_name, l.phone, l.normalized_phone, l.city, l.state, l.segment, 
           l.stage, l.metadata, l.google_place_id
    FROM sales_leads l
    WHERE (l.last_contact_at IS NULL OR l.attempt_count = 0)
      AND l.phone IS NOT NULL
      AND l.phone ~ '^55[0-9]{2}9[0-9]{8}$'
      AND l.city NOT IN (${localExcludedCities.map((_, i) => `$${i + 1}`).join(', ')})
      AND NOT EXISTS (
        SELECT 1 FROM sales_automation_jobs j 
        WHERE j.lead_id = l.id AND j.status = 'completed'
      )
      AND NOT EXISTS (
        SELECT 1 FROM sales_suppressions s 
        WHERE s.normalized_phone = l.normalized_phone
      )
    ORDER BY l.stage = 'scheduled' DESC, (l.metadata->>'menu_url') IS NOT NULL DESC, l.created_at ASC
    LIMIT 30
  `, localExcludedCities);

  console.log(`Candidatos potenciais encontrados: ${res.rowCount}`);
  console.table(res.rows.map(x => ({
    id: x.id.slice(0, 8),
    name: x.business_name?.slice(0, 30),
    city: x.city,
    phone: x.phone,
    stage: x.stage,
    has_menu: Boolean(x.metadata?.menu_url)
  })));

  await pool.end();
}

main().catch(console.error);

