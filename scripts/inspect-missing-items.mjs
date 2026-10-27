import pg from 'pg';

const client = new pg.Client('postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public');
await client.connect();

const slugs = [
  'cervejaria-enigma-enigma-british',
  'via-daros-padaria-e-confeitaria',
  'cantina-roman',
  'open-house-beer',
  'bar-route-66'
];

for (const slug of slugs) {
  const store = (await client.query('select id, name, slug from stores where slug = $1', [slug])).rows[0];
  console.log(`\n=== STORE: ${store.name} (${slug}) ===`);
  const items = (await client.query(`
    select i.id, i.name, i.price, c.name as category, i.image_url
    from menu_items i
    left join menu_categories c on c.id = i.category_id
    where i.store_id = $1
    order by c.sort_order, i.sort_order, i.id
  `, [store.id])).rows;
  for (const item of items) {
    console.log(`[${item.category || 'Sem Cat'}] ${item.name} -> ${item.image_url ? item.image_url : 'MISSING'}`);
  }
}

await client.end();

