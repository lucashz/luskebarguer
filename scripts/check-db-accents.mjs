import { getLocalPool } from '/app/src/lib/local-postgrest-adapter.js';

const pool = getLocalPool();

async function main() {
  const stores = await pool.query("select id, name, slug from stores where slug in ('altissimo', 'frank')");
  console.log("=== STORES ===");
  console.table(stores.rows);

  const categories = await pool.query("select s.slug, c.name, c.description from menu_categories c join stores s on s.id=c.store_id where s.slug in ('altissimo', 'frank')");
  console.log("=== CATEGORIES ===");
  console.table(categories.rows);

  const items = await pool.query("select s.slug, i.name, i.description from menu_items i join stores s on s.id=i.store_id where s.slug in ('altissimo', 'frank') limit 10");
  console.log("=== ITEMS ===");
  console.table(items.rows);

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
