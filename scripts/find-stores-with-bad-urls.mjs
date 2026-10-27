import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

const pool = getLocalPool();

async function run() {
  const BAD_URLS = [
    'https://images.unsplash.com/photo-1608270197495-97e3a9c78d59?auto=format&fit=crop&w=1200&q=85',
    'https://images.unsplash.com/photo-1535141192574-5d4897c13136?auto=format&fit=crop&w=1200&q=85',
    'https://images.unsplash.com/photo-1606755962773-d324e2dabd5f?auto=format&fit=crop&w=1200&q=85'
  ];

  const affected = await pool.query(`
    SELECT DISTINCT s.id, s.name, s.slug, mi.name as item_name, mi.image_url
    FROM menu_items mi
    JOIN stores s ON s.id = mi.store_id
    WHERE mi.image_url = ANY($1) OR mi.image_url LIKE '/uploads/%'
    ORDER BY s.name
  `, [BAD_URLS]);

  console.log(`Itens com URLs problemáticas (404 ou relative /uploads): ${affected.rows.length}`);
  const storeMap = new Map();
  for (const row of affected.rows) {
    if (!storeMap.has(row.slug)) storeMap.set(row.slug, { name: row.name, items: [] });
    storeMap.get(row.slug).items.push({ item: row.item_name, url: row.image_url });
  }

  for (const [slug, data] of storeMap) {
    console.log(`\nLoja: ${data.name} (/${slug}) - ${data.items.length} itens problemáticos:`);
    for (const it of data.items) {
      console.log(`  - ${it.item} -> ${it.url}`);
    }
  }

  await pool.end();
}

run().catch(console.error);
