import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const stores = await pool.query(`
    SELECT s.id, s.name, s.slug, count(mi.id)::int as total_items,
           count(mi.image_url)::int as items_with_image
    FROM stores s
    LEFT JOIN menu_items mi ON mi.store_id = s.id
    WHERE s.slug IN (
      'pizzaria-em-dois-corregos-rodizi',
      'beer-point',
      'fome-flix-hamburgueria',
      'pizzaria-maria-gabriela-braco-do',
      'dalu-pizzaria-braco-do-norte',
      'ze-do-bar',
      'casa-nova-bar',
      'bar-do-mario',
      'cervejaria-2'
    )
    GROUP BY s.id, s.name, s.slug
    ORDER BY s.slug
  `);

  console.log('=== STATUS DAS IMAGENS DAS LOJAS DISPARADAS HOJE À NOITE ===');
  console.table(stores.rows);

  for (const s of stores.rows) {
    const items = await pool.query(`
      SELECT mi.name, mi.image_url
      FROM menu_items mi
      WHERE mi.store_id = $1
      ORDER BY mi.sort_order ASC
      LIMIT 10
    `, [s.id]);
    console.log(`\nLoja: ${s.name} (${s.slug}) [${s.items_with_image}/${s.total_items} com imagem]:`);
    console.table(items.rows);
  }

  await pool.end();
}

main().catch(console.error);
