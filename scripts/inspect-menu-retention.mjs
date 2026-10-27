import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function inspect() {
  const r = await pool.query(`
    SELECT id, business_name, city, state, stage, 
           metadata->>'menu_url' as menu_url,
           metadata->>'store_id' as store_id,
           metadata->>'menu_status' as menu_status,
           metadata->>'is_showcase' as is_showcase,
           metadata->>'continuity_confirmed' as continuity_confirmed,
           created_at
    FROM sales_leads
    WHERE metadata->>'store_id' IS NOT NULL OR metadata->>'menu_url' IS NOT NULL
    ORDER BY city ASC, business_name ASC
  `);

  console.log(`Total leads com cardápio: ${r.rowCount}`);
  for (const row of r.rows) {
    console.log(`- [${row.id}] ${row.business_name} | Cidade: ${row.city}/${row.state} | Stage: ${row.stage} | Status: ${row.menu_status || 'ok'} | Showcase: ${row.is_showcase} | Cont: ${row.continuity_confirmed}`);
  }

  // Also inspect stores table
  const storesRes = await pool.query(`
    SELECT s.id, s.name, s.slug, s.company_id,
           (SELECT COUNT(*) FROM menu_items mi WHERE mi.store_id = s.id) AS items_count,
           (SELECT COUNT(*) FROM menu_items mi WHERE mi.store_id = s.id AND mi.image_url IS NOT NULL AND mi.image_url <> '') AS items_with_image
    FROM stores s
    ORDER BY items_count DESC
    LIMIT 30
  `);
  console.log('\n--- Lojas ativas com produtos no banco ---');
  for (const s of storesRes.rows) {
    console.log(`- Store: ${s.name} (${s.slug}) | Itens: ${s.items_count} | Com foto: ${s.items_with_image}`);
  }

  await pool.end();
}

inspect().catch(err => {
  console.error(err);
  process.exit(1);
});
