import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function check() {
  const cols = await pool.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'stores'
  `);
  console.log('Stores columns:', cols.rows.map(x => x.column_name).join(', '));

  const stores = await pool.query(`
    SELECT s.id, s.name, s.slug, s.logo_url, s.banner_url,
           sl.city, sl.state, sl.metadata->>'logo_url' as lead_logo,
           sl.metadata->'google_place'->>'photos' as g_photos,
           sl.metadata->'preview_capture' as preview_capture
    FROM stores s
    LEFT JOIN sales_leads sl ON sl.metadata->>'store_id' = s.id::text OR sl.metadata->>'menu_slug' = s.slug
    WHERE (sl.city IS NULL OR lower(sl.city) NOT IN ('horizontina', 'tres de maio', 'três de maio', 'santa rosa', 'crissiumal', 'doutor mauricio cardoso'))
    ORDER BY s.created_at DESC
    LIMIT 40
  `);

  console.log(`\nEncontradas ${stores.rowCount} lojas fora da região:`);
  for (const s of stores.rows) {
    console.log(`Loja: ${s.name} (${s.slug}) | Cidade: ${s.city || 'N/A'}/${s.state || ''} | Logo: ${s.logo_url || s.lead_logo || 'nenhum'}`);
  }

  await pool.end();
}

check().catch(console.error);

