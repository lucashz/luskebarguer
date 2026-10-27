import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const storeRes = await client.query("SELECT id, name, slug FROM stores WHERE slug = 'el-shaday-hamburgueria'");
  console.log("Store:", storeRes.rows[0]);

  if (storeRes.rows[0]) {
    const storeId = storeRes.rows[0].id;
    const catRes = await client.query("SELECT id, name, sort_order FROM categories WHERE store_id = $1 ORDER BY sort_order ASC", [storeId]);
    console.log(`Categories (${catRes.rows.length}):`);
    for (const cat of catRes.rows) {
      const itemsRes = await client.query("SELECT id, name, price, image_url FROM menu_items WHERE category_id = $1 ORDER BY sort_order ASC", [cat.id]);
      console.log(`- [${cat.name}] (${itemsRes.rows.length} items):`);
      for (const item of itemsRes.rows.slice(0, 3)) {
        console.log(`    * ${item.name} (R$ ${item.price}) -> img: ${item.image_url ? item.image_url.substring(0, 30) + '...' : 'NULL'}`);
      }
    }
  }

  await client.end();
}

main().catch(console.error);

